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
import { defineTool } from '@deepseek-ai/dsh-tools';
import { bindCallOptions } from './call-options.js';
/** Parameter schema shared by every delegation tool. */
const BASE_PARAMETERS = {
    cwd: {
        type: 'string',
        description: 'Initial child working directory. Relative paths use your current directory; omitted inherits it.',
    },
    description: {
        type: 'string',
        required: true,
        description: 'A short (3-5 word) description of the delegated task, for display.',
    },
    prompt: {
        type: 'string',
        required: true,
        description: 'The complete, self-contained task for the delegated agent. It does not share this conversation, so include everything it needs.',
    },
};
/**
 * Register one delegation tool bound to a named provider.
 * @param ctx - the host context carrying `tools` and `subagents`.
 * @param options - tool identity, provider, and backend-specific schema.
 */
export function registerDelegateTool(ctx, options) {
    const subagents = ctx.subagents;
    const parameters = { ...BASE_PARAMETERS, ...options.extraParameters };
    ctx.tools.register(defineTool({
        name: options.name,
        description: options.description,
        parameters: parameters,
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
            render: (_args, value) => [{
                    type: 'text',
                    text: `started delegated agent ${String(value.subagentId)} via ${String(value.provider)}`,
                }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const parent = exec.agent;
            if (parent === undefined)
                throw new Error('delegation tool requires a calling agent');
            const task = typeof args.prompt === 'string' ? args.prompt : '';
            if (task.trim().length === 0)
                throw new Error('the delegated task must not be empty');
            const label = typeof args.description === 'string' && args.description.length > 0
                ? args.description
                : 'delegated task';
            const cwd = typeof args.cwd === 'string' && args.cwd.length > 0 ? args.cwd : undefined;
            const prompt = [{ type: 'text', text: task }];
            if (options.capture !== undefined)
                bindCallOptions(prompt, options.capture(args));
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
            });
            return {
                kind: 'activation',
                provider: options.provider,
                subagentId: String(activation.childId),
            };
        },
    }));
}
