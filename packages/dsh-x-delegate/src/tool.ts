/**
 * Model-facing delegation tools.
 *
 * Each backend gets its own tool name so the model chooses a target explicitly,
 * and each tool exposes the knobs the official providers hard-code: the model,
 * the sandbox or permission tier, and (for ACP backends) the session
 * configuration the agent advertised.
 *
 * The tool starts through the shared activation seam, so the parent Agent keeps
 * ownership of lifecycle, cancellation, and result delivery. The tool returns
 * only an activation receipt; the run's outcome arrives through the normal
 * subagent notification path.
 *
 * @module dsh-x-delegate/tool
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SubagentActivation } from '@deepseek-ai/dsh-subagent'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { bindCallOptions, type CallOptions } from './call-options.ts'

/** One JSON value in a tool result. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** The activation receipt every delegation tool returns. */
export interface DelegationReceipt {
  /** Always `activation`. */
  readonly kind: 'activation'
  /** The provider that accepted the run. */
  readonly provider: string
  /** The child identity minted by the activation manager. */
  readonly subagentId: string
}

/** The `subagents` surface the tool drives. */
export interface DelegationSubagents {
  startActivation(spec: {
    readonly provider: string
    readonly label: string
    readonly request: {
      readonly prompt: ContentBlock[]
      readonly parent: Agent
      readonly cwd?: string
    }
    readonly signal: AbortSignal
    readonly delivery: 'parent' | 'caller'
  }): Promise<SubagentActivation>
}

/** Options for one delegation tool. */
export interface DelegateToolOptions {
  /** Tool name shown to the model, e.g. `delegate_grok`. */
  readonly name: string
  /** Provider registry name. */
  readonly provider: string
  /** Tool description shown to the model. */
  readonly description: string
  /** Extra parameters contributed by the backend. */
  readonly extraParameters?: Record<string, unknown>
  /** Read per-call overrides from the tool arguments. */
  readonly capture?: (args: Record<string, unknown>) => CallOptions
}

/** Parameter schema shared by every delegation tool. */
const BASE_PARAMETERS = {
  cwd: {
    type: 'string' as const,
    description: 'Initial child working directory. Relative paths use your current directory; omitted inherits it.',
  },
  description: {
    type: 'string' as const,
    required: true,
    description: 'A short (3-5 word) description of the delegated task, for display.',
  },
  prompt: {
    type: 'string' as const,
    required: true,
    description: 'The complete, self-contained task for the delegated agent. It does not share this conversation, so include everything it needs.',
  },
}

/**
 * Register one delegation tool bound to a named provider.
 * @param ctx - the host context carrying `tools` and `subagents`.
 * @param options - tool identity, provider, and backend-specific schema.
 */
export function registerDelegateTool(ctx: Context, options: DelegateToolOptions): void {
  const subagents = (ctx as unknown as { subagents: DelegationSubagents }).subagents
  const parameters = { ...BASE_PARAMETERS, ...options.extraParameters }

  ctx.tools.register(defineTool({
    name: options.name,
    description: options.description,
    parameters: parameters as never,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, const: 'activation' },
          provider: { type: 'string', required: true },
          subagentId: { type: 'string', required: true },
        },
      },
      render: (_args: unknown, value: Record<string, JsonValue>): ContentBlock[] => [{
        type: 'text',
        text: `started delegated agent ${String(value.subagentId)} via ${String(value.provider)}`,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args: Record<string, unknown>, exec: ToolRunContext) {
      const parent = exec.agent
      if (parent === undefined) throw new Error('delegation tool requires a calling agent')
      const task = typeof args.prompt === 'string' ? args.prompt : ''
      if (task.trim().length === 0) throw new Error('the delegated task must not be empty')
      const label = typeof args.description === 'string' && args.description.length > 0
        ? args.description
        : 'delegated task'
      const cwd = typeof args.cwd === 'string' && args.cwd.length > 0 ? args.cwd : undefined
      const prompt: ContentBlock[] = [{ type: 'text', text: task }]
      if (options.capture !== undefined) bindCallOptions(prompt, options.capture(args))

      const activation = await subagents.startActivation({
        provider: options.provider,
        label,
        request: {
          prompt,
          parent,
          ...(cwd === undefined ? {} : { cwd }),
        },
        signal: exec.signal,
        delivery: 'parent',
      })

      return {
        kind: 'activation',
        provider: options.provider,
        subagentId: String(activation.childId),
      } satisfies DelegationReceipt
    },
  }) as never)
}
