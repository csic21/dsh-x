import { defineTool } from '@deepseek-ai/dsh-tools';
import { resolveConfig, runChat } from './chat.js';
export const name = 'dsh-x-chat';
export const inject = ['tools', 'llm'];
export function apply(ctx, config = {}) {
    const settings = resolveConfig(config);
    ctx.tools.register(defineTool({
        name: 'dsh_x_chat',
        description: '通过已配置的 LLM 提供方进行一次只读问答。仅发送 prompt 和显式 context，不读取会话历史或文件，不执行工具。不提供实时检索；可能产生提供方费用。provider/model 必须同时指定，或使用插件配置的默认值。',
        parameters: {
            prompt: { type: 'string', required: true, description: '本次问题，最多 16384 UTF-8 字节。' },
            context: { type: 'string', description: '明确允许发送的参考材料，最多 49152 UTF-8 字节。不会自动读取文件或历史。' },
            provider: { type: 'string', description: '已安装的提供方路由 ID，必须与 model 一起指定。' },
            model: { type: 'string', description: '该提供方的模型 ID，必须与 provider 一起指定。' },
        },
        output: {
            schema: {
                type: 'object', additionalProperties: false,
                properties: {
                    provider: { type: 'string', required: true }, model: { type: 'string', required: true },
                    text: { type: 'string', required: true }, truncated: { type: 'boolean', required: true },
                },
            },
            // Keep a stable model-facing warning in its own block. Browser copy is
            // separately localized; neither branch rewrites the provider's answer.
            render: (_args, value) => value.truncated
                ? [{ type: 'text', text: value.text }, { type: 'text', text: '[回答达到输出 token 上限，内容可能不完整。]' }]
                : [{ type: 'text', text: value.text }],
            presentationMeta: (_args, value) => ({
                kind: 'dsh-x-chat', version: 1, answerBlocks: 1,
                provider: value.provider, model: value.model, truncated: value.truncated,
            }),
        },
        execute: (args, exec) => runChat(ctx.llm, args, settings, exec.signal),
    }));
}
