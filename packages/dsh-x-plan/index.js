import { planError } from './src/errors.js'
import { approvalText } from './src/approval-text.js'
import { defineTool } from '@deepseek-ai/dsh-tools'

import { assertFamily, defaultReviewer, resolveLaunch } from './src/agents.js'
import { runAcpPrompt } from './src/acp.js'
import { collectEvidence, renderEvidence } from './src/collect.js'
import { gateDecision } from './src/gate.js'
import { resolveHome } from './src/home.js'
import {
  MAX_CONTEXT_CHARS,
  MAX_REVIEW_FAILURES,
  PLAN_TIMEOUT_MS,
} from './src/limits.js'
import { parseAcceptance, parseVerdict } from './src/plan-text.js'
import { LOOP_SECTION, plannerPrompt, reviewerPrompt } from './src/prompts.js'
import {
  approvePlan,
  discardPlan,
  discardTarget,
  failedReviewPaths,
  latestApproved,
  readApproved,
  reviewLimitReached,
  sessionPlansDir,
  unapprovedDraft,
  writeNewPlan,
  writeReview,
} from './src/store.js'

export const name = 'dsh-x-plan'

export const inject = ['tools', 'workingDirectory', 'subprocess', 'systemPrompt']

const FAMILIES = ['codex', 'claude', 'grok']

export function apply(ctx) {
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'dsh-x-plan',
    order: 8000,
    interpolate: false,
    text: LOOP_SECTION,
  }), 'dsh-x-plan.section()')

  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.signal?.aborted) return next()
    const state = lookupState(exec)
    const decision = gateDecision({
      toolName: exec.name,
      draft: state.draft,
      discard: state.discard,
    })
    if (decision.kind === 'deny') return { kind: 'deny', reason: decision.reason, info: { name: 'DshXPlanError', code: 'DSH_X_PLAN_DRAFT_UNAPPROVED' } }
    if (decision.kind === 'ask') {
      const reason = withRequestedRound(exec, decision.reason)
      return { kind: 'ask', reason, displayReason: approvalText({ toolName: exec.name, ...state }, exec.arguments?.round) }
    }
    return next()
  })

  ctx.tools.register(defineTool({
    name: 'dsh_x_plan',
    description: '让 Codex、Claude 或 Grok 只读地写一份计划，并保存为 plan-<轮次>.md。不要自己编计划。调用前把相关文件摘录放进 context，不要贴整个仓库。返回后把计划交给用户。用户同意之前不要改文件，也不要调用 dsh_x_approve_plan。',
    parameters: {
      goal: { type: 'string', required: true, description: '要完成的目标。' },
      planner: {
        type: 'string',
        required: true,
        enum: FAMILIES,
        description: '规划者家族：codex、claude 或 grok。',
      },
      context: { type: 'string', description: '相关文件摘录。信息不够时规划者会写进待确认，而不是编造。' },
    },
    output: {
      schema: outputSchema({
        round: { type: 'integer' },
        planner: { type: 'string' },
        path: { type: 'string' },
        text: { type: 'string' },
        acceptance: { type: 'array', items: { type: 'string' } },
      }),
      presentationMeta: (_args, value) => presentation('plan', value),
      render: (_args, value) => textBlock(value.text),
    },
    async execute(args, exec) {
      const dir = plansDir(exec)
      if (unapprovedDraft(dir) !== null) {
        throw planError('DRAFT_EXISTS', '已有未批准的计划。先调用 dsh_x_approve_plan，或调用 dsh_x_discard_plan 放弃。')
      }
      const planner = assertFamily(args.planner, '规划者')
      const goal = args.goal.trim()
      if (goal === '') throw planError('GOAL_EMPTY', '目标不能为空。')
      const context = args.context ?? ''
      if (context.length > MAX_CONTEXT_CHARS) {
        throw planError('CONTEXT_SIZE', `context 超过 ${MAX_CONTEXT_CHARS} 个字符。只保留相关摘录。`)
      }
      const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal)
      const launch = await resolveLaunch(planner, {
        resolveExecutable: (command, env, signal) => ctx.subprocess.resolveExecutable(command, env, signal),
        signal: exec.signal,
      })
      const result = await runAcpPrompt({
        spawn: spec => ctx.subprocess.spawn(spec),
        argv: launch.argv,
        cwd,
        env: launch.env,
        prompt: plannerPrompt({ goal, context }),
        signal: exec.signal,
        modeId: launch.modeId,
        timeoutMs: PLAN_TIMEOUT_MS,
      })
      if (!result.ok) throw planError('PLAN_FAILED', failureText('规划', result))
      const acceptance = parseAcceptance(result.text)
      if (Object.hasOwn(acceptance, 'error')) throw planError(acceptance.code, acceptance.error)
      const written = writeNewPlan(dir, {
        planner,
        reviewer: defaultReviewer(planner),
        cwd,
        text: result.text,
      })
      return {
        round: written.round,
        planner,
        path: written.path,
        body: written.text,
        text: [
          `第 ${written.round} 轮计划已写入 ${written.path}。`,
          '把计划交给用户确认。用户同意之前不要改文件。用户同意后调用 dsh_x_approve_plan。',
          '用户可以直接改这个文件，批准时以文件当时的内容为准。',
          '',
          written.text,
        ].join('\n'),
        acceptance: acceptance.commands,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'dsh_x_approve_plan',
    description: '在用户已经同意计划之后，把当前 plan-<轮次>.md 复制成 plan-<轮次>.approved.md。调用会先弹出审批卡，必须等用户允许。不要在用户表态之前调用。批准后只执行 approved 文件里的步骤。',
    parameters: {
      round: { type: 'integer', description: '轮次。省略时使用当前未批准的计划。' },
    },
    output: {
      schema: outputSchema({
        round: { type: 'integer' },
        path: { type: 'string' },
        text: { type: 'string' },
      }),
      presentationMeta: (_args, value) => presentation('approve', value),
      render: (_args, value) => textBlock(value.text),
    },
    async execute(args, exec) {
      const dir = plansDir(exec)
      const draft = unapprovedDraft(dir)
      const round = args.round ?? draft?.round
      if (round === undefined) throw planError('NO_DRAFT', '没有未批准的计划。')
      if (draft !== null && args.round !== undefined && args.round !== draft.round) {
        throw planError('WRONG_ROUND', `当前未批准的是第 ${draft.round} 轮。`)
      }
      const approved = approvePlan(dir, round)
      return {
        round: approved.round,
        path: approved.path,
        body: approved.text,
        text: `已批准第 ${approved.round} 轮计划。只执行这个文件里的步骤：\n${approved.path}\n\n${approved.text}`,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'dsh_x_discard_plan',
    description: '放弃当前计划。未批准的草稿或最近一份已批准的计划都可以放弃。调用会先弹出审批卡，必须等用户允许。放弃后才能开始新的一轮规划。',
    parameters: {
      round: { type: 'integer', description: '轮次。省略时放弃当前草稿，没有草稿则放弃最近一份已批准的计划。' },
    },
    output: {
      schema: outputSchema({
        round: { type: 'integer' },
        path: { type: 'string' },
        text: { type: 'string' },
      }),
      presentationMeta: (_args, value) => presentation('discard', value),
      render: (_args, value) => textBlock(value.text),
    },
    async execute(args, exec) {
      const dir = plansDir(exec)
      const target = discardTarget(dir)
      const round = args.round ?? target?.round
      if (round === undefined) throw planError('NO_DISCARD', '没有可以放弃的计划。')
      const discarded = discardPlan(dir, round)
      return {
        round: discarded.round,
        path: discarded.path,
        text: `已放弃第 ${discarded.round} 轮计划。`,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'dsh_x_review',
    description: '让另一个模型家族对照已批准的计划、git diff 和计划里的验收命令做只读验收。失败时结果只有缺口列表。同一份已批准计划失败两次后，这个工具不再发起验收，应停下来问用户。',
    parameters: {
      reviewer: {
        type: 'string',
        enum: FAMILIES,
        description: '验收者家族。省略时使用和规划者不同的默认家族。不能与规划者相同。',
      },
      round: { type: 'integer', description: '已批准计划的轮次。省略时使用最近一份未放弃的已批准计划。' },
    },
    output: {
      schema: outputSchema({
        round: { type: 'integer' },
        attempt: { type: 'integer' },
        reviewer: { type: 'string' },
        verdict: { type: 'string', enum: ['pass', 'fail', 'stopped'] },
        path: { type: 'string' },
        text: { type: 'string' },
      }),
      presentationMeta: (_args, value) => presentation('review', value),
      render: (_args, value) => textBlock(value.text),
    },
    async execute(args, exec) {
      const dir = plansDir(exec)
      const round = args.round ?? latestApproved(dir)?.round
      if (round === undefined) throw planError('NO_APPROVED', '没有已批准的计划。')
      const approved = readApproved(dir, round)
      if (reviewLimitReached(dir, round)) {
        const paths = failedReviewPaths(dir, round)
        return {
          round,
          attempt: paths.length,
          reviewer: approved.meta.reviewer,
          verdict: 'stopped',
          path: paths[paths.length - 1] ?? '',
          text: `第 ${round} 轮计划已经失败 ${MAX_REVIEW_FAILURES} 次。停下来，把已有缺口交给用户。缺口文件：${paths.join('、')}。可以调用 dsh_x_plan 开始新的一轮。`,
        }
      }
      const reviewer = args.reviewer === undefined
        ? approved.meta.reviewer
        : assertFamily(args.reviewer, '验收者')
      assertFamily(reviewer, '验收者')
      if (reviewer === approved.meta.planner) {
        throw planError('SAME_FAMILY', `验收者不能和规划者同为 ${reviewer}。`)
      }
      const acceptance = parseAcceptance(approved.text)
      if (Object.hasOwn(acceptance, 'error')) throw planError(acceptance.code, acceptance.error)
      const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal)
      const launch = await resolveLaunch(reviewer, {
        resolveExecutable: (command, env, signal) => ctx.subprocess.resolveExecutable(command, env, signal),
        signal: exec.signal,
      })
      const evidence = await collectEvidence(spec => ctx.subprocess.spawn(spec), {
        cwd,
        commands: acceptance.commands,
        signal: exec.signal,
      })
      const result = await runAcpPrompt({
        spawn: spec => ctx.subprocess.spawn(spec),
        argv: launch.argv,
        cwd,
        env: launch.env,
        prompt: reviewerPrompt({
          planner: approved.meta.planner,
          reviewer,
          evidence: renderEvidence(approved.text, evidence),
        }),
        signal: exec.signal,
        modeId: launch.modeId,
        timeoutMs: PLAN_TIMEOUT_MS,
      })
      if (!result.ok) throw planError('REVIEW_FAILED', failureText('验收', result))
      const parsed = parseVerdict(result.text)
      const written = writeReview(dir, {
        round,
        reviewer,
        verdict: parsed.verdict,
        gaps: parsed.gaps,
      })
      const text = parsed.verdict === 'pass'
        ? `验收通过。\n${parsed.gaps}`
        : parsed.gaps
      return {
        round,
        attempt: written.attempt,
        reviewer,
        verdict: parsed.verdict,
        path: written.path,
        body: parsed.body,
        missingVerdict: parsed.missingVerdict,
        text,
      }
    },
  }))
}

function outputSchema(properties) {
  return { type: 'object', additionalProperties: false, properties: { ...properties, body: { type: 'string' }, missingVerdict: { type: 'boolean' } } }
}

function textBlock(text) {
  return [{ type: 'text', text }]
}

function plansDir(exec) {
  const sessionId = exec.agent?.id
  if (typeof sessionId !== 'string' || sessionId === '') {
    throw planError('NO_SESSION', 'dsh-x-plan 需要当前会话。这次工具调用没有 agent.id。')
  }
  return sessionPlansDir(resolveHome(), sessionId)
}

function lookupState(exec) {
  const sessionId = exec.agent?.id
  if (typeof sessionId !== 'string' || sessionId === '') return { draft: null, discard: null }
  try {
    const dir = sessionPlansDir(resolveHome(), sessionId)
    return { draft: unapprovedDraft(dir), discard: discardTarget(dir) }
  } catch {
    // A missing plan directory is handled by the store. Other read failures
    // must stop execution instead of silently lifting the draft gate.
    throw planError('STATE_READ', '无法读取当前会话的计划状态，已停止工具执行。请检查计划目录后重试。')
  }
}

function withRequestedRound(exec, reason) {
  const round = exec.arguments?.round
  if (typeof round !== 'number') return reason
  return `${reason}（本次调用指定第 ${round} 轮）`
}

function failureText(label, result) {
  const denied = result.permissionDenials > 0
    ? `已拒绝 ${result.permissionDenials} 次工具权限请求。`
    : ''
  const body = result.text.trim()
  const excerpt = body === '' ? '' : `\n${body.slice(0, 4_000)}`
  return `${label}没有完成（${result.stopReason}）。${denied}${excerpt}`
}

function presentation(operation, value) {
  return { kind: 'dsh-x-plan.result', version: 1, operation, round: value.round, path: value.path, body: value.body ?? '', verdict: value.verdict ?? null, attempt: value.attempt ?? 0, missingVerdict: value.missingVerdict === true }
}
