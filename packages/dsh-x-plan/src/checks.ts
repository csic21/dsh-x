import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { planError } from './errors.ts'
import { COMMAND_TIMEOUT_MS, MAX_ACCEPTANCE_COMMANDS, MAX_COMMAND_CHARS, MAX_COMMAND_OUTPUT_CHARS } from './limits.ts'

const JOB_CLEANUP_TIMEOUT_MS = 10_000
const TERMINAL_JOB_STATES = new Set(['completed', 'failed', 'killed'])

/**
 * Run explicitly approved checks through the host's policy/approval pipeline.
 * The caller owns approval and any trusted-parent registration; this helper
 * never supplies permission overrides, calls a tool body, or spawns a shell.
 * beforeExecute(check) may revalidate the immutable approval before each call.
 * Runtime execute promises are always drained, including after cancellation.
 */
export async function executeChecks(ctx: any, exec: any, {
  cwd, checks, beforeExecute, onJob, signal,
  timeoutMs = COMMAND_TIMEOUT_MS,
  cleanupTimeoutMs = JOB_CLEANUP_TIMEOUT_MS,
}: any) {
  validateChecks(cwd, checks)
  if (!exec?.token || !exec.rootCallId || typeof ctx?.tools?.execute !== 'function') {
    throw planError('CHECK_CONTEXT', '验收检查缺少宿主工具执行上下文，不能绕过审批直接运行。')
  }
  const callerSignal = combineSignals(exec.signal, signal)
  const runs: any[] = []
  let stopReason
  const approvedChecks = checks.map(({ id, command, required }: any) => Object.freeze({ id, command, required }))
  for (const check of approvedChecks) {
    if (stopReason || callerSignal?.aborted) {
      runs.push(unavailable(check, stopReason ?? '验收已取消，未运行后续检查。', { status: 'not-run' }))
      continue
    }
    const definition = ctx.tools.get?.('bash', exec.agent)
    if (!supportsForegroundBash(definition)) {
      stopReason = '当前 bash 工具不支持结构化前台结果，不能确认退出码和工作目录。请启用官方结构化 bash 工具；不会回退到持久 shell 或直接 spawn。'
      runs.push(unavailable(check, stopReason, { status: 'not-run' }))
      continue
    }
    const deadline = new AbortController()
    const duration = boundedTimeout(timeoutMs, COMMAND_TIMEOUT_MS)
    const bound = combineSignals(callerSignal, deadline.signal)
    let timer
    let dispatched = false
    let producedJobId
    let result
    try {
      await beforeExecute?.(check)
      if (bound!.aborted) {
        result = unavailable(check, '验收在执行前已取消。', { status: 'not-run', timedOut: deadline.signal.aborted })
      } else if (ctx.tools.get?.('bash', exec.agent) !== definition) {
        result = unavailable(check, 'bash 工具在审批核对期间被替换，必须重新检查兼容性。', { status: 'not-run' })
        stopReason = result.error
      } else {
        const args: {description: string, command: string, workdir: string, timeoutMs: number, run_in_background?: boolean} = { description: `Run approved acceptance check ${check.id}`, command: check.command, workdir: cwd, timeoutMs: duration }
        if (toolParameters(definition).run_in_background?.type === 'boolean') args.run_in_background = false
        timer = setTimeout(() => deadline.abort(new Error('Acceptance check deadline exceeded')), duration)
        dispatched = true
        const nested = await dispatch(ctx, exec, 'bash', args, bound)
        clearTimeout(timer)
        if (nested?.isError !== false) {
          const message = failureText(nested)
          result = unavailable(check, message, {
            timedOut: deadline.signal.aborted,
            status: deadline.signal.aborted ? 'failed' : 'inconclusive',
            quiescent: ['UNKNOWN_TOOL', 'ABORTED_BEFORE_DISPATCH'].includes(nested?.error?.info?.code),
          })
          stopReason = message
        } else if (nested.value?.kind === 'foreground') {
          result = foregroundRun(check, nested.value, cwd)
        } else {
          const jobId = structuredJobId(nested.value)
          if (jobId !== null) {
            producedJobId = jobId
            await onJob?.(jobId)
          }
          const cleanup = jobId === null
            ? { quiescent: false, error: '非前台结果没有可验证的结构化 jobId，无法确认后台工作已经停止。' }
            : await stopPromotedJob(ctx, exec, jobId, boundedTimeout(cleanupTimeoutMs, JOB_CLEANUP_TIMEOUT_MS))
          result = unavailable(check, cleanup.error ?? '验收命令被转为后台任务；已确认停止，但没有完整前台验收结果。', {
            quiescent: cleanup.quiescent, ...(jobId === null ? {} : { jobId }),
          })
          stopReason = result.error
        }
        if (nested?.concludesTurn === true) stopReason = '宿主工具已要求结束当前轮次，未运行后续检查。'
      }
    } catch (error: any) {
      // A rejected execute promise violates the normal materialized-result
      // contract, so do not assume its potentially started work is quiescent.
      result = unavailable(check, error instanceof Error ? error.message : String(error), {
        timedOut: deadline.signal.aborted, quiescent: !dispatched,
        status: deadline.signal.aborted ? 'failed' : 'inconclusive',
        ...(producedJobId === undefined ? {} : { jobId: producedJobId }),
      })
      stopReason = result.error
    } finally {
      clearTimeout(timer)
    }
    if (deadline.signal.aborted) {
      result.timedOut = true
      result.status = 'failed'
      result.unavailable = true
      stopReason ??= '验收检查已达到截止时间，未运行后续检查。'
    } else if (callerSignal?.aborted) {
      result.unavailable = true
      result.status = 'inconclusive'
      stopReason ??= '验收已取消，未运行后续检查。'
    }
    runs.push(result)
    if (!result.quiescent) stopReason ??= '验收进程尚未确认停止，不能开始下一项检查。'
  }
  return {
    runs,
    quiescent: runs.every(run => run.quiescent === true),
    jobIds: runs.flatMap(run => run.jobId ? [run.jobId] : []),
  }
}

/** A schema is a compatibility check, not proof of the tool vendor's identity. */
export function supportsForegroundBash(definition: any) {
  const params = toolParameters(definition)
  if (params?.command?.type !== 'string' || params?.workdir?.type !== 'string'
    || params?.description?.type !== 'string' || !['number', 'integer'].includes(params?.timeoutMs?.type)
    || (params.run_in_background !== undefined && params.run_in_background.type !== 'boolean')) return false
  const schema = definition?.output?.schema
  const branches = Array.isArray(schema?.oneOf) ? schema.oneOf : [schema]
  return branches.some((branch: any) => {
    const fields = branch?.properties
    return branch?.type === 'object' && fields?.kind?.const === 'foreground'
      && fields.cwd?.type === 'string'
      && nullable(fields.exitCode, 'integer') && nullable(fields.signal, 'string')
      && fields.timedOut?.type === 'boolean' && fields.aborted?.type === 'boolean'
      && streamSchema(fields.stdout) && streamSchema(fields.stderr)
  })
}

/** Shared predicate for the caller's guarded generic bash path. */
export const supportsStructuredBash = supportsForegroundBash

function foregroundRun(check: any, value: any, cwd: any) {
  const valid = typeof value.cwd === 'string' && path.resolve(value.cwd) === path.resolve(cwd)
    && (Number.isInteger(value.exitCode) || value.exitCode === null)
    && (typeof value.signal === 'string' || value.signal === null)
    && typeof value.timedOut === 'boolean' && typeof value.aborted === 'boolean'
    && validStream(value.stdout) && validStream(value.stderr)
    && (value.sandbox === undefined || (typeof value.sandbox?.denied === 'boolean'
      && (value.sandbox.runnerFailed === undefined || typeof value.sandbox.runnerFailed === 'boolean')))
  if (!valid) return unavailable(check, 'bash 前台结果不完整或工作目录与已批准目录不一致。', { quiescent: false })
  const fullOutput = [value.stdout.text, value.stderr.text].filter(Boolean).join('\n')
  const truncated = value.stdout.truncated || value.stderr.truncated || fullOutput.length > MAX_COMMAND_OUTPUT_CHARS
  const interrupted = value.aborted || value.signal !== null || value.sandbox?.denied === true
    || value.sandbox?.runnerFailed === true || value.stopped !== undefined
  const notAvailable = interrupted || value.timedOut || value.exitCode === null || truncated
  const failed = value.timedOut || (Number.isInteger(value.exitCode) && value.exitCode !== 0
    && !interrupted)
  return {
    id: check.id, command: check.command, exitCode: interrupted ? null : value.exitCode,
    output: fullOutput.slice(0, MAX_COMMAND_OUTPUT_CHARS),
    timedOut: value.timedOut, truncated, unavailable: notAvailable,
    signal: value.signal, status: failed ? 'failed' : notAvailable ? 'inconclusive' : 'passed',
    quiescent: true,
    ...(notAvailable ? { error: '验收输出被截断、取消或受到运行环境限制，不能据此判定通过。' } : {}),
  }
}

async function stopPromotedJob(ctx: any, exec: any, jobId: any, timeoutMs: any) {
  const kill = ctx.tools.get?.('job_kill', exec.agent)
  const output = ctx.tools.get?.('job_output', exec.agent)
  if (!supportsJobControl(kill, 'kill') || !supportsJobControl(output, 'output')) {
    return { quiescent: false, error: `后台验收任务 ${jobId} 未确认停止：需要可用的结构化 job_kill 和 job_output 工具。` }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const end = Date.now() + timeoutMs
  try {
    const killed = await dispatch(ctx, exec, 'job_kill', { job_id: jobId, reason: 'Acceptance checks require a completed foreground result' }, controller.signal)
    if (killed?.isError !== false || !['cancellation-requested', 'already-finished'].includes(killed.value?.outcome)
      || !sameJob(killed.value?.job, jobId)) {
      return { quiescent: false, error: `后台验收任务 ${jobId} 取消失败：${failureText(killed)}` }
    }
    // A kill acknowledgement is not quiescence. Even already-finished is
    // corroborated through the official observation tool in the same scope.
    while (!controller.signal.aborted) {
      const read = await dispatch(ctx, exec, 'job_output', {
        job_id: jobId, wait: true, timeout_ms: Math.max(1, end - Date.now()),
      }, controller.signal)
      if (read?.isError !== false || !sameJob(read.value?.job, jobId)) {
        return { quiescent: false, error: `后台验收任务 ${jobId} 的停止状态无法确认：${failureText(read)}` }
      }
      if (TERMINAL_JOB_STATES.has(read.value.job.status)) return { quiescent: true }
      if (!['running', 'stopping'].includes(read.value.job.status)) break
      if (!controller.signal.aborted) await new Promise<any>(resolve => setTimeout(resolve, Math.min(50, Math.max(0, end - Date.now()))))
    }
    return { quiescent: false, error: `后台验收任务 ${jobId} 在清理期限后仍未确认停止。` }
  } catch (error: any) {
    return { quiescent: false, error: `后台验收任务 ${jobId} 的清理未完成：${error instanceof Error ? error.message : String(error)}` }
  } finally {
    clearTimeout(timer)
  }
}

async function dispatch(ctx: any, exec: any, name: any, args: any, signal: any) {
  const result = await ctx.tools.execute({
    name, arguments: args, agent: exec.agent, signal,
    callId: randomUUID(), rootCallId: exec.rootCallId, parent: exec.token,
  })
  for (const context of result?.additionalContexts ?? []) exec.deferContext(context)
  if (result?.isError === false && result.concludesTurn === true) exec.concludeTurn()
  return result
}

function supportsJobControl(definition: any, kind: any) {
  const params = toolParameters(definition)
  if (params.job_id?.type !== 'string') return false
  if (kind === 'output' && (params.wait?.type !== 'boolean'
    || !['number', 'integer'].includes(params.timeout_ms?.type))) return false
  const schema = definition?.output?.schema
  const job = schema?.properties?.job
  if (schema?.type !== 'object' || job?.type !== 'object' || job.properties?.id?.type !== 'string'
    || job.properties?.status?.type !== 'string') return false
  return kind === 'kill' ? schema.properties.outcome?.type === 'string' : schema.properties.text?.type === 'string'
}

function sameJob(job: any, id: any) {
  return job?.id === id && job.kind === 'bash' && typeof job.status === 'string'
}

function structuredJobId(value: any) {
  return ['background', 'promoted'].includes(value?.kind) && typeof value.jobId === 'string'
    && value.jobId.length > 0 && value.jobId.length <= 512 && !/[\x00-\x1f\x7f]/.test(value.jobId)
    ? value.jobId : null
}

function unavailable(check: any, error: any, fields: any = {}) {
  return {
    id: check.id, command: check.command, exitCode: null,
    output: error.slice(0, MAX_COMMAND_OUTPUT_CHARS), timedOut: false,
    truncated: error.length > MAX_COMMAND_OUTPUT_CHARS, unavailable: true,
    signal: null, status: 'inconclusive', quiescent: true, error,
    ...fields,
  }
}

function failureText(result: any) {
  if (typeof result?.error?.message === 'string') return result.error.message
  const text = (result?.content ?? []).filter((item: any) => item?.type === 'text' && typeof item.text === 'string').map((item: any) => item.text).join('\n')
  return text || '宿主工具没有提供可用的结构化结果。'
}

function nullable(schema: any, type: any) {
  return Array.isArray(schema?.oneOf) && schema.oneOf.some((item: any) => item.type === type) && schema.oneOf.some((item: any) => item.type === 'null')
}

function streamSchema(schema: any) {
  return schema?.type === 'object' && schema.properties?.text?.type === 'string' && schema.properties?.truncated?.type === 'boolean'
}

function toolParameters(definition: any) {
  return definition?.parameters?.properties ?? definition?.parameters ?? {}
}

function validStream(stream: any) {
  return typeof stream?.text === 'string' && typeof stream.truncated === 'boolean'
}

function combineSignals(...signals: any[]) {
  const present = signals.filter(Boolean)
  return present.length === 0 ? undefined : AbortSignal.any(present)
}

function boundedTimeout(value: any, maximum: any) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : maximum
}

function validateChecks(cwd: any, checks: any) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || !Array.isArray(checks) || checks.length > MAX_ACCEPTANCE_COMMANDS
    || checks.some(check => typeof check?.id !== 'string' || check.id === '' || check.id.length > 40
      || typeof check.command !== 'string' || check.command.trim() === '' || check.command.length > MAX_COMMAND_CHARS
      || /[\r\n\0]/.test(check.command) || check.required !== true)
    || new Set(checks.map(check => check.id)).size !== checks.length) {
    throw planError('CHECKS_INVALID', '验收检查必须来自已批准契约，包含唯一标识、单行命令、required:true 和绝对工作目录。')
  }
}
