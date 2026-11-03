/**
 * The model-facing `chain_run` tool.
 *
 * One call carries a complete literal action bank. Every step dispatches
 * through the same registry the model would use directly, so policy, approval,
 * sandbox, and cancellation behave exactly as they do for a direct call. The
 * only thing the bank removes is the model round trip between two actions whose
 * arguments were already final.
 *
 * @module dsh-x-chain/tool
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock, ToolCallId, ToolSchema } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ParameterSchemaSpec, ToolExecutionResult, ToolRunContext, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import {
  describeGuard,
  guardHolds,
  parseSteps,
  truncate,
  type BankStep,
  type JsonValue,
  type StepReceipt,
} from './bank.ts'

/** Resolved tool options; every default is applied by the plugin entry. */
export interface ChainToolOptions {
  /** Registered tool name, e.g. `chain_run`. */
  readonly name: string
  /** Tool names a bank may dispatch. */
  readonly allowedTools: readonly string[]
  /** Maximum steps in one bank. */
  readonly maxSteps: number
  /** Model-visible character budget for one step's text. */
  readonly maxStepChars: number
  /** Continue after a failed step instead of stopping the chain. */
  readonly continueOnError: boolean
}

/** Why a chain stopped before running every step. */
export interface ChainStop {
  readonly step: string
  readonly reason: 'guard' | 'error' | 'aborted'
  readonly detail?: string
}

/** The canonical value of one `chain_run` call. */
export interface ChainValue {
  executed: number
  roundTripsSaved: number
  steps: {
    id: string
    tool: string
    ok: boolean
    ms: number
    text: string
    truncated: boolean
  }[]
  stopped?: {
    step: string
    reason: string
    detail?: string
  }
}

const PARAMETERS = {
  steps: {
    type: 'array',
    required: true,
    description: 'Literal actions to run in order. Each step is dispatched only after the previous one settles.',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', required: true, description: 'Unique id in this bank; later guards reference it.' },
        tool: { type: 'string', required: true, description: 'Tool to dispatch, e.g. write, bash, read.' },
        arguments: {
          type: 'json',
          description: 'Complete literal arguments for that tool. No step can read a previous result to build them.',
        },
        when: {
          type: 'array',
          description: 'Conditions over earlier receipts. All must hold, or the chain stops before this step.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              step: { type: 'string', required: true, description: 'Id of an earlier step.' },
              ok: { type: 'boolean', description: 'Require that step to have succeeded (true) or failed (false).' },
              path: { type: 'string', description: 'Dot path into that step’s result value, e.g. exitCode.' },
              equals: { type: 'json', description: 'Expected value at path, or the whole value when path is absent.' },
            },
          },
        },
      },
    },
  },
} satisfies ParameterSchemaSpec

const OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    executed: { type: 'integer', required: true },
    roundTripsSaved: { type: 'integer', required: true },
    steps: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          tool: { type: 'string', required: true },
          ok: { type: 'boolean', required: true },
          ms: { type: 'integer', required: true },
          text: { type: 'string', required: true },
          truncated: { type: 'boolean', required: true },
        },
      },
    },
    stopped: {
      type: 'object',
      additionalProperties: false,
      properties: {
        step: { type: 'string', required: true },
        reason: { type: 'string', required: true, enum: ['guard', 'error', 'aborted'] },
        detail: { type: 'string' },
      },
    },
  },
} satisfies ValueSchemaSpec

/** Model-facing text of one settled tool result, with non-text blocks named. */
function contentText(blocks: readonly ContentBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    if (block.type === 'text') parts.push(block.text)
    else if (block.type === 'image') parts.push('[image result]')
    else parts.push(`[${block.type} result]`)
  }
  return parts.join('\n')
}

/** Render one chain as a compact transcript. */
function renderChain(value: ChainValue): ContentBlock[] {
  const saved = value.roundTripsSaved
  const lines: string[] = [
    `chain: ${value.executed} step${value.executed === 1 ? '' : 's'} executed, ${saved} model round trip${saved === 1 ? '' : 's'} saved`,
  ]
  for (const step of value.steps) {
    lines.push('', `[${step.id}] ${step.tool} · ${step.ok ? 'ok' : 'failed'} · ${step.ms}ms`)
    lines.push(step.text.length > 0 ? step.text : '(no output)')
  }
  if (value.stopped !== undefined) {
    const { step, reason, detail } = value.stopped
    const tail = reason === 'guard' ? `guard did not hold: ${detail ?? ''}` : reason
    lines.push('', `stopped at step "${step}": ${tail}`)
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

/** Build the model-facing description from the resolved configuration. */
function describe(options: ChainToolOptions): string {
  const stop = options.continueOnError
    ? 'A failed step does not stop the chain; later steps still run.'
    : 'A failed step stops the chain.'
  return [
    'Run a short bank of tool calls inside one step, when every argument is already final.',
    'Steps run strictly in order. A step may declare guards over earlier receipts; when a guard does not hold, the chain stops before that step.',
    'Use it after you have decided a run of dependent actions — for example write a file, then run the formatter, then run the tests — instead of paying a model round trip between each action.',
    'Limits: no step can react to a previous result. Arguments are literal, so anything that depends on an earlier output must be a later, separate call.',
    `Allowed tools: ${options.allowedTools.join(', ')}. At most ${options.maxSteps} steps.`,
    `Each step keeps its normal policy, approval and sandbox path. ${stop}`,
  ].join(' ')
}

/**
 * Register the chain tool on the host tool registry.
 * @param ctx - the host context carrying `tools`.
 * @param options - resolved limits and defaults.
 */
export function registerChainTool(ctx: Context, options: ChainToolOptions): void {
  ctx.tools.register(defineTool({
    name: options.name,
    description: describe(options),
    parameters: PARAMETERS,
    output: {
      schema: OUTPUT,
      render: (_args, value) => renderChain(value as ChainValue),
    },
    timeoutMs: 15 * 60_000,
    isConcurrencySafe: () => false,
    async execute(raw, exec): Promise<ChainValue> {
      const steps = parseSteps(raw.steps, options)
      const receipts = new Map<string, StepReceipt>()
      const settled: { receipt: StepReceipt; truncated: boolean }[] = []
      let stopped: ChainStop | undefined

      const stop = (step: string, reason: ChainStop['reason'], detail?: string): void => {
        stopped = { step, reason, ...(detail === undefined ? {} : { detail }) }
      }

      for (const [index, step] of steps.entries()) {
        if (exec.signal.aborted) {
          stop(step.id, 'aborted')
          break
        }
        const failed = step.when.find(guard => !guardHolds(guard, receipts))
        if (failed !== undefined) {
          stop(step.id, 'guard', describeGuard(failed, receipts))
          break
        }

        const schema = toolSchema(ctx, step.tool, exec.agent)
        if (schema === undefined) {
          const receipt: StepReceipt = {
            id: step.id,
            tool: step.tool,
            ok: false,
            ms: 0,
            text: `tool ${JSON.stringify(step.tool)} is not registered in this session`,
          }
          receipts.set(step.id, receipt)
          settled.push({ receipt, truncated: false })
          stop(step.id, 'error', receipt.text)
          break
        }

        const started = Date.now()
        const subCallId = `${exec.callId}:chain:${index + 1}` as ToolCallId
        appendStart(exec, subCallId, step)
        const result = await dispatch(ctx, exec, step, subCallId, schema)
        appendSettled(exec, subCallId, step, result)
        const raw = contentText(result.content)
        const receipt: StepReceipt = {
          id: step.id,
          tool: step.tool,
          ok: !result.isError,
          ms: Date.now() - started,
          text: truncate(raw, options.maxStepChars),
          ...(result.isError ? {} : { value: result.value as JsonValue }),
        }
        receipts.set(step.id, receipt)
        settled.push({ receipt, truncated: raw.length > options.maxStepChars })

        if (exec.signal.aborted) {
          stop(step.id, 'aborted')
          break
        }
        if (result.isError && !options.continueOnError) {
          stop(step.id, 'error', result.error.message)
          break
        }
      }

      return {
        executed: settled.length,
        roundTripsSaved: Math.max(0, settled.length - 1),
        steps: settled.map(({ receipt, truncated }) => ({
          id: receipt.id,
          tool: receipt.tool,
          ok: receipt.ok,
          ms: receipt.ms,
          text: receipt.text,
          truncated,
        })),
        ...(stopped === undefined ? {} : { stopped }),
      }
    },
  }) as never)
}

/**
 * The binding schema a nested dispatch carries.
 *
 * The registry, `run_code`'s bridge, and the Auto preset's reviewer all read
 * this projection: the reviewer refuses a nested call whose binding schema is
 * absent, so a composite tool must hand over the exact registered schema.
 */
function toolSchema(ctx: Context, name: string, agent: unknown): ToolSchema | undefined {
  // A preset registers the file and command tools on the agent plane, so the
  // global view alone does not see them: pass the calling agent as the view.
  const definition = ctx.tools.get(name, agent as never)
  if (definition === undefined) return undefined
  return { name: definition.name, description: definition.description, parameters: definition.parameters }
}

/**
 * Log the start of one nested dispatch.
 *
 * `tool/ptc-dispatch-start` is the log-only sub-call vocabulary the registry
 * bridge uses for `run_code`; a composite tool uses the same pair so the UI can
 * show per-step state and the Auto preset's reviewer can find the pending call.
 * Without it the reviewer sees a nested call with no logged identity and
 * refuses to run it.
 */
function appendStart(exec: ToolRunContext, subCallId: ToolCallId, step: BankStep): void {
  exec.agent?.session.append('tool/ptc-dispatch-start', {
    rootCallId: exec.rootCallId,
    parentCallId: exec.callId,
    subCallId,
    name: step.tool,
    arguments: step.arguments,
  })
}

/** Log the settled outcome of one nested dispatch, in `tool/result` vocabulary. */
function appendSettled(
  exec: ToolRunContext,
  subCallId: ToolCallId,
  step: BankStep,
  result: ToolExecutionResult,
): void {
  exec.agent?.session.append('tool/ptc-dispatch', {
    rootCallId: exec.rootCallId,
    parentCallId: exec.callId,
    subCallId,
    name: step.tool,
    arguments: step.arguments,
    isError: result.isError,
    content: [...result.content],
    ...(result.meta === undefined ? {} : { meta: result.meta }),
    ...(result.isError
      ? { error: { name: result.error.info?.name ?? 'ChainStepError', code: result.error.info?.code ?? 'CHAIN_STEP', ...(result.error.info?.reason === undefined ? {} : { reason: result.error.info.reason }) } }
      : {}),
  })
}

/** Dispatch one step through the normal registry pipeline as a nested call. */
async function dispatch(
  ctx: Context,
  exec: ToolRunContext,
  step: { readonly tool: string; readonly arguments: Record<string, JsonValue> },
  subCallId: ToolCallId,
  schema: ToolSchema,
): Promise<ToolExecutionResult> {
  try {
    return await ctx.tools.execute({
      callId: subCallId,
      rootCallId: exec.rootCallId,
      name: step.tool,
      schema,
      arguments: step.arguments,
      ...(exec.agent === undefined ? {} : { agent: exec.agent }),
      parent: exec.token,
      signal: exec.signal,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      isError: true,
      content: [{ type: 'text', text: message }],
      error: { message, info: { name: 'ChainDispatchError', code: 'CHAIN_DISPATCH' } },
    }
  }
}
