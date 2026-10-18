import { runSnapshotReview } from './llm-review.js';
import { randomUUID } from 'node:crypto';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createReviewStore, fail, sessionId } from './store.js';
import { createCodeController } from './controller.js';
import { createCodeRoute } from './routes.js';
export const name = 'dsh-x-code';
export const inject = ['tools', 'workingDirectory', 'subprocess', 'profileContext', 'systemPrompt'];
export function apply(context) {
    const ctx = context;
    const store = createReviewStore(ctx.profileContext.dir), dispatchChecks = new Map();
    ctx.on('dsh-x-agents/before-dispatch', async (exec) => { const check = dispatchChecks.get(exec.parent); if (check)
        await check(); });
    const sessionFor = (id) => { const sessions = ctx.get('sessions'); return sessions?.get(id); };
    const selectedModel = (id, exec) => { const session = exec?.agent?.session ?? sessionFor(id); const route = session?.requestHeader?.()?.config ?? ctx.get('agentDefaultModel')?.currentSelection?.(); return typeof route?.provider === 'string' && typeof route?.model === 'string' && route.provider.length <= 256 && route.model.length <= 256 ? { provider: route.provider, model: route.model } : null; };
    const controller = createCodeController({ store, spawn: spec => ctx.subprocess.spawn(spec), agentsAvailable: () => Boolean(ctx.tools.get('dsh_x_agents_run')),
        reviewerInfo: (id, exec) => { const dshModel = selectedModel(id, exec); return { dshAvailable: Boolean(ctx.get('llm') && dshModel), dshModel, nativeReviewAvailable: Boolean(ctx.get('sandbox') && ctx.tools.get('dsh_x_agents_run')), nativeReviewReason: ctx.get('sandbox') ? 'strict-native-startup' : 'sandbox-unavailable' }; },
        dshReview: async (args, exec) => {
            const approval = ctx.get('approval');
            if (!approval)
                throw fail('CODE_APPROVAL', 'Official approval service is unavailable.');
            const result = await approval.request({ agent: exec.agent, callId: exec.callId, toolName: exec.name, signal: exec.signal, reason: `Code · ${args.route.provider}/${args.route.model}\nReview only these captured files / 仅审查以下快照文件：\n${args.snapshot.paths.join('\n')}\n${args.snapshot.bytes} UTF-8 bytes (before + after) · Snapshot ${args.snapshot.snapshotId}\nNo tools or session history. No test execution. This model call may incur provider charges.\n无工具、无会话历史，不执行测试。此模型调用可能产生提供方费用。` });
            if (result !== true && result !== 'allowed-once')
                throw fail('CODE_APPROVAL', 'Snapshot review was not approved; no source was sent to the model.');
            exec.signal?.throwIfAborted();
            await args.beforeDispatch();
            const current = selectedModel(exec.agent.session.id, exec);
            if (JSON.stringify(current) !== JSON.stringify(args.route))
                throw fail('CODE_MODEL', 'The current model changed during approval. Refresh and review again.');
            return runSnapshotReview(ctx.get('llm'), { ...args, sessionId: exec.agent.session.id }, exec.signal);
        },
        contextOf: async (id, exec) => {
            const session = exec?.agent?.session ?? sessionFor(sessionId(id));
            if (!session || session.id !== id)
                throw fail('CODE_SESSION', 'Open an existing conversation to select its workspace.');
            const cwd = exec ? await ctx.workingDirectory.ensure(exec.agent, exec.signal) : ctx.workingDirectory.get(session);
            return { cwd, policy: ctx.get('sandboxPolicy')?.resolve({ session }) };
        },
        delegate: async (args, exec, options = {}) => {
            if (options.beforeDispatch)
                dispatchChecks.set(exec.token, options.beforeDispatch);
            let result;
            try {
                result = await ctx.tools.execute({ name: 'dsh_x_agents_run', arguments: Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined)), agent: exec.agent, signal: exec.signal, callId: randomUUID(), rootCallId: exec.rootCallId, parent: exec.token });
            }
            finally {
                dispatchChecks.delete(exec.token);
            }
            if (result.additionalContexts)
                for (const item of result.additionalContexts)
                    exec.deferContext?.(item);
            if (result.concludesTurn)
                exec.concludeTurn?.();
            if (result.isError)
                throw fail(result.error?.info?.code ?? 'CODE_NATIVE', result.error?.message ?? 'Native Agents execution failed. Inspect the Agents task.');
            return result.value;
        },
    });
    ctx.effect(() => () => controller.dispose(), 'code: owned runtime lifetime');
    const output = { schema: { type: 'object', additionalProperties: true, properties: {} }, presentationMeta: (_args, value) => ({ kind: 'dsh-x-code.result', version: 1, ...value }), render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] };
    const modes = { type: 'string', enum: ['worktree', 'staged', 'range'] }, runtime = { type: 'string', required: true, enum: ['codex', 'opencode', 'claude', 'grok'] }, scope = { type: 'string', required: true };
    const register = (name, description, parameters, execute) => ctx.tools.register(defineTool({ name, description, parameters, output, execute: async (args, exec) => await execute(args, exec) }));
    register('dsh_x_code_inspect', 'Read the bounded local repository file manifest and durable Code review state. Does not send source to a model.', { mode: modes, base: { type: 'string' } }, (args, exec) => controller.snapshot(args, exec));
    register('dsh_x_code_file', 'Read one allowlisted repository source or immutable review snapshot. No ignored, credential-like, symlink, binary or oversized content is returned.', { scope, workspaceId: { type: 'string' }, path: { type: 'string', required: true }, mode: modes, base: { type: 'string' }, reviewId: { type: 'string' } }, (args, exec) => controller.source(args, exec));
    register('dsh_x_code_review', 'Review explicitly selected source snapshots using runtime dsh (the current configured DSH model, no tools/history) or an optional read-only native Agents runtime. Requests official approval and discloses provider costs. Re-review is required after repairs; findings never imply executed tests.', { scope, workspaceId: { type: 'string', required: true }, mode: { ...modes, required: true }, base: { type: 'string' }, paths: { type: 'array', items: { type: 'string' }, required: true }, runtime: { ...runtime, enum: ['dsh', 'codex', 'opencode', 'claude', 'grok'] }, model: { type: 'string' }, previousReviewId: { type: 'string' } }, (args, exec) => controller.review(args, exec));
    register('dsh_x_code_repair', 'Repair only selected current Code findings through native Agents and existing approvals. Does not resolve findings; source changes invalidate old evidence until a new review.', { scope, reviewId: { type: 'string', required: true }, findingIds: { type: 'array', items: { type: 'string' }, required: true }, runtime, model: { type: 'string' } }, (args, exec) => controller.repair(args, exec));
    ctx.effect(() => ctx.systemPrompt.section({ name, order: 8200, interpolate: false, text: 'Code is an explicit source-review workspace. Use dsh_x_code_inspect and dsh_x_code_file for bounded local browsing. Review only the files the user selected via dsh_x_code_review, using exact scope/workspaceId and selected runtime/model. Never infer permission to send the entire repository. Native launch and permission requests use Agents. Repairs require explicit selected finding IDs, a fresh snapshot and dsh_x_code_repair. Preserve original findings; after a repair, re-review the same file scope with previousReviewId to establish new evidence. Source-only review cannot verify tests. Do not bypass active Plan, blocked permissions, missing Agents, stale source or secret exclusions. No PR/GitHub writes are supported.' }), 'code: instructions');
    ctx.inject(['connection'], hostContext => {
        const host = hostContext;
        host.connection.fetch.register(createCodeRoute('code/snapshot', args => controller.snapshot(args), ['sessionId', 'mode', 'base']));
        host.connection.fetch.register(createCodeRoute('code/review', args => controller.reviewDetail(args), ['sessionId', 'scope', 'reviewId']));
        host.connection.fetch.register(createCodeRoute('code/cancel', args => controller.cancel(args), ['sessionId', 'scope', 'operationId']));
        host.connection.fetch.register(createCodeRoute('code/file', args => controller.source(args), ['sessionId', 'scope', 'workspaceId', 'path', 'mode', 'base', 'reviewId']));
    });
}
