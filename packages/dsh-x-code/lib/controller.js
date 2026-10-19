import { randomUUID } from 'node:crypto';
import { fail, sessionId } from './store.js';
import { createRepository, LIMITS } from './repository.js';
import { reviewPrompt, parseReview } from './review.js';
import { projectTranscript } from './transcript.js';
// A thrown value is untrusted; read a code or message only through these guards.
const codeOf = (error) => error?.code;
const messageOf = (error) => error?.message;
const active = new Set(['running']);
export function createCodeController({ store, spawn, contextOf, reviewerInfo = () => ({ dshAvailable: false, dshModel: null }), dshReview, messagesOf = () => [], now = () => new Date().toISOString() }) {
    const repository = createRepository(spawn), running = new Map(), host = randomUUID();
    let disposed = false;
    const publicReview = (review) => { if (!review)
        return null; const cloned = structuredClone(review); const { snapshot, hostId, request, repair: _repair, nativeTask: _nativeTask, ...value } = cloned; if (active.has(value.state) && hostId !== host) {
        value.state = 'interrupted';
        value.reason = 'Previous host execution ended without a verified result. No automatic replay.';
    } if (value.state === 'repairing') {
        value.state = 'interrupted';
        value.reason = 'Native repair was retired. Review the current source again.';
    } return value; };
    const inventory = async (id, options = {}, exec) => { const context = await contextOf(id, exec); return repository.inventory({ ...context, mode: options.mode ?? 'worktree', base: options.base, signal: exec?.signal ?? options.signal }); };
    async function freshness(id, review, exec, signal) {
        if (!review)
            return { stale: false, staleReason: null };
        try {
            const inv = await inventory(id, { mode: review.mode, base: review.baseRef, signal }, exec);
            const current = await repository.capture(inv, review.paths);
            return current.snapshotId === review.snapshotId ? { stale: false, staleReason: null } : { stale: true, staleReason: 'Selected source, Git revision, index, or workspace changed after this review.' };
        }
        catch (error) {
            if (exec?.signal?.aborted)
                throw exec.signal.reason;
            if (signal?.aborted)
                throw signal.reason;
            return { stale: true, staleReason: 'The original workspace or selected source can no longer be verified.' };
        }
    }
    async function snapshot(args, exec) {
        const id = sessionId(args.sessionId ?? exec?.agent?.session?.id), inv = await inventory(id, args, exec), data = store.read(id);
        const bound = (record) => ['cwd', 'repoRoot', 'gitDir', 'repositoryId'].every(key => inv.workspace[key] === record.snapshot.workspace[key]);
        const latest = data.reviews.at(-1), saved = latest && bound(latest) ? latest : null, review = publicReview(saved);
        if (review)
            Object.assign(review, await freshness(id, saved, exec, args.signal));
        const operation = running.get(id);
        return { scope: store.scope, sessionId: id, revision: data.revision, workspace: inv.workspace, files: inv.files, limits: LIMITS, complete: inv.complete, truncated: inv.truncated, ...reviewerInfo(id, exec), operation: operation ? { id: operation.id, kind: operation.kind, reviewId: operation.reviewId, state: operation.state, startedAt: operation.startedAt } : null, review, history: data.reviews.slice(0, -1).filter(bound).map(r => ({ id: r.id, state: publicReview(r).state, createdAt: r.createdAt, snapshotId: r.snapshotId, summary: r.summary, runtime: r.runtime, findings: r.findings.length, previousReviewId: r.previousReviewId ?? null })) };
    }
    async function source(args, exec) {
        const id = sessionId(args.sessionId ?? exec?.agent?.session?.id);
        if (args.scope !== store.scope)
            throw fail('CODE_STALE', 'Profile scope changed. Refresh Code.');
        if (args.reviewId) {
            // A session/cwd change must not expose another workspace's historical source.
            const saved = store.read(id).reviews.find(r => r.id === args.reviewId);
            if (!saved)
                throw fail('CODE_STALE', 'The selected review is unavailable.');
            const current = await inventory(id, { mode: 'worktree', signal: args.signal }, exec);
            if (['cwd', 'repoRoot', 'gitDir', 'repositoryId'].some(key => current.workspace[key] !== saved.snapshot.workspace[key]))
                throw fail('CODE_BINDING', 'The session now belongs to another workspace.');
            const value = saved.snapshot.files.find(f => f.path === args.path);
            if (!value)
                throw fail('CODE_PATH', 'The file was not included in this review.');
            return { ...structuredClone(value), snapshotId: saved.snapshotId, immutable: true };
        }
        const inv = await inventory(id, args, exec);
        if (args.workspaceId !== inv.workspace.id)
            throw fail('CODE_STALE', 'Workspace revision changed. Refresh Code.');
        const file = await repository.file(inv, args.path, { preview: args.preview === true && !exec });
        const after = await inventory(id, args, exec);
        if (after.workspace.id !== inv.workspace.id)
            throw fail('CODE_STALE', 'Workspace changed while reading source. Refresh Code.');
        return { ...file, workspaceId: inv.workspace.id, immutable: false };
    }
    async function reviewDetail(args, exec) {
        const id = sessionId(args.sessionId ?? exec?.agent?.session?.id);
        scope(args);
        const data = store.read(id), saved = data.reviews.find(r => r.id === args.reviewId);
        if (!saved)
            throw fail('CODE_STALE', 'The selected review is no longer retained.');
        const inv = await inventory(id, { mode: 'worktree', signal: args.signal }, exec);
        if (['cwd', 'repoRoot', 'gitDir', 'repositoryId'].some(key => inv.workspace[key] !== saved.snapshot.workspace[key]))
            throw fail('CODE_BINDING', 'The selected review belongs to another repository or workspace.');
        return { ...publicReview(saved), ...await freshness(id, saved, exec, args.signal), isLatest: data.reviews.at(-1)?.id === saved.id };
    }
    function scope(args) { if (args.scope !== store.scope)
        throw fail('CODE_STALE', 'Profile scope changed. Refresh Code.'); }
    async function owned(id, exec, kind, options, fn) {
        if (disposed)
            throw fail('CODE_UNAVAILABLE', 'Code was disabled.');
        if (running.has(id))
            throw fail('CODE_BUSY', 'A Code operation is already running.');
        const controller = new AbortController();
        let settle;
        const settlement = new Promise(resolve => { settle = resolve; });
        const operation = { controller, settlement, id: randomUUID(), kind, reviewId: null, state: 'preparing', startedAt: now(), options };
        running.set(id, operation);
        const signal = exec.signal ? AbortSignal.any([exec.signal, controller.signal]) : controller.signal;
        try {
            return await fn({ ...exec, signal });
        }
        finally {
            if (running.get(id) === operation)
                running.delete(id);
            settle();
        }
    }
    function update(id, reviewId, patch) { store.mutate(id, data => { const review = data.reviews.find(r => r.id === reviewId); if (!review)
        throw fail('CODE_STALE', 'Review no longer exists.'); Object.assign(review, patch, { updatedAt: now() }); }); }
    async function review(args, exec) {
        const id = sessionId(exec.agent?.session?.id);
        scope(args);
        if (args.runtime !== undefined && args.runtime !== 'dsh')
            throw fail('CODE_RUNTIME', 'Code review uses the current DSH model only. Native agent review and repair were retired.');
        const reviewer = reviewerInfo(id, exec);
        if (!reviewer.dshAvailable || !dshReview)
            throw fail('CODE_MODEL', 'Select a configured current DSH model before reviewing.');
        if (args.model !== undefined)
            throw fail('CODE_MODEL', 'Snapshot review uses the current DSH route; model overrides are unsupported.');
        return owned(id, exec, 'review', { mode: args.mode, base: args.base }, async (exec) => {
            const inv = await inventory(id, args, exec);
            if (inv.workspace.id !== args.workspaceId)
                throw fail('CODE_STALE', 'Workspace revision changed. Refresh and select the scope again.');
            const captured = await repository.capture(inv, args.paths), prompt = reviewPrompt(captured);
            const prior = args.previousReviewId ? store.read(id).reviews.find(r => r.id === args.previousReviewId) : null;
            if (args.previousReviewId && (!prior || prior.state !== 'completed' || JSON.stringify(prior.paths) !== JSON.stringify(captured.paths) || ['cwd', 'repoRoot', 'gitDir', 'repositoryId'].some(key => prior.snapshot.workspace[key] !== captured.workspace[key])))
                throw fail('CODE_VERIFY', 'Re-review must keep the exact previous file scope.');
            const record = { id: randomUUID(), hostId: host, state: 'running', createdAt: now(), updatedAt: now(), runtime: 'dsh', model: reviewer.dshModel.model, provider: reviewer.dshModel.provider, snapshotId: captured.snapshotId, snapshot: captured, mode: inv.workspace.mode, base: inv.workspace.base, baseRef: inv.workspace.baseRef, head: inv.workspace.head, paths: captured.paths, findings: [], checks: [], summary: '', stale: false, staleReason: null, previousReviewId: prior?.id ?? null };
            store.mutate(id, data => { data.reviews.push(record); });
            Object.assign(running.get(id), { reviewId: record.id, state: 'waiting_permission' });
            try {
                const beforeDispatch = async () => { const current = await freshness(id, record, exec); if (current.stale)
                    throw fail('CODE_STALE', 'Source changed while review approval was pending. Refresh and review again.'); running.get(id).state = 'reviewing'; };
                const summary = await dshReview({ prompt, snapshot: captured, route: reviewer.dshModel, beforeDispatch, recordRequest: request => update(id, record.id, { request }) }, exec);
                running.get(id).state = 'verifying';
                const parsed = parseReview(summary, captured), fresh = await freshness(id, record, exec);
                exec.signal?.throwIfAborted();
                update(id, record.id, { ...parsed, ...fresh, state: 'completed', verification: prior ? { previousReviewId: prior.id, result: fresh.stale ? 'stale' : parsed.findings.length ? 'findings_remaining' : 'no_findings_in_scope', testsVerified: false } : null });
            }
            catch (error) {
                const code = codeOf(error);
                update(id, record.id, { state: exec.signal?.aborted ? 'cancelled' : typeof code === 'string' && ['CODE_APPROVAL', 'CODE_STALE'].includes(code) ? 'blocked' : 'failed', reason: String(messageOf(error) ?? 'Review failed.').slice(0, 2000) });
                throw error;
            }
            return snapshot({ sessionId: id, mode: args.mode, base: args.base }, exec);
        });
    }
    async function cancel(args) { const id = sessionId(args.sessionId); scope(args); const operation = running.get(id); if (!operation || operation.id !== args.operationId)
        throw fail('CODE_STALE', 'This Code operation is no longer active.'); operation.state = 'cancelling'; operation.controller.abort(fail('CODE_CANCELLED', 'Cancelled by the user.')); return snapshot({ sessionId: id, ...operation.options }); }
    function transcript(args) {
        const id = sessionId(args.sessionId);
        return { messages: projectTranscript(messagesOf(id)) };
    }
    return { snapshot, source, reviewDetail, review, cancel, transcript, async dispose() { disposed = true; const operations = [...running.values()]; for (const operation of operations)
            operation.controller.abort(new Error('Code plugin disabled.')); await Promise.all(operations.map(operation => operation.settlement)); } };
}
