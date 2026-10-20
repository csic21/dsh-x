import { realpathSync } from 'node:fs';
import { fail } from './contract/errors.js';
import { identifier } from './contract/ids.js';
function sessionsOf(services) {
    return services.get('sessions');
}
function projectionsOf(services) {
    return services.get('sessionProjections');
}
function approvalOf(services) {
    return services.get('approval');
}
/**
 * Profile/session/workspace resolution, turn binding and approval.
 * Grant semantics stay backend-specific: the embedded backend grants per tab and turn,
 * while the CDP backend treats the explicit `backend: 'cdp'` config as consent and still
 * requires one official approval per action. See docs/dev/browser-cdp.md.
 */
export function createAuthority(services) {
    const profile = realpathSync(services.profileContext.dir);
    const contextOf = async (sessionId, exec) => {
        identifier(sessionId, 'session');
        const session = exec?.agent?.session ?? sessionsOf(services)?.get(sessionId);
        if (!session || session.id !== sessionId)
            throw fail('BROWSER_SESSION', 'Open an existing DSH conversation.');
        const cwd = exec ? await services.workingDirectory.ensure(exec.agent, exec.signal) : services.workingDirectory.get(session);
        if (typeof cwd !== 'string')
            throw fail('BROWSER_WORKSPACE', 'The conversation workspace is not ready.');
        return { profile, sessionId, workspace: realpathSync(cwd) };
    };
    const turnOf = (sessionId) => {
        const session = sessionsOf(services)?.get(sessionId);
        const boundary = session && projectionsOf(services)?.stateOf(session, 'turnBoundary');
        return boundary ? { turn: boundary.lastTurn, runId: boundary.openTurnStartSeq === null ? null : `${sessionId}:${boundary.openTurnStartSeq}` } : null;
    };
    const binding = async (exec) => {
        if (!exec.agent?.session?.id)
            throw fail('BROWSER_SESSION', 'A current DSH conversation is required.');
        return contextOf(exec.agent.session.id, exec);
    };
    function executionTurn(exec, nativeOwner) {
        const current = () => projectionsOf(services)?.stateOf(exec.agent.session, 'turnBoundary')?.openTurnStartSeq;
        const sequence = current();
        if (!Number.isSafeInteger(sequence) || sequence < 0)
            throw fail('BROWSER_RUN', 'A live owning DSH turn is required.');
        return {
            signal: exec.signal,
            ownerToken: nativeOwner?.ownerToken ?? null,
            runId: `${exec.agent.session.id}:${sequence}`,
            turnNumber: projectionsOf(services).stateOf(exec.agent.session, 'turnBoundary').lastTurn,
            assertCurrent() {
                nativeOwner?.assertCurrent();
                exec.signal.throwIfAborted();
                if (current() !== sequence)
                    throw fail('BROWSER_RUN', 'The owning DSH turn ended.');
            },
        };
    }
    /** Every non-observe action needs one explicit official approval; no backend may skip it. */
    async function approve(exec, reason) {
        const approval = approvalOf(services);
        if (!approval)
            throw fail('BROWSER_APPROVAL', 'Official approval is unavailable; the browser action was not sent.');
        const result = await approval.request({ agent: exec.agent, callId: exec.callId, toolName: exec.name, signal: exec.signal, reason });
        if (result !== 'allowed-once')
            throw fail('BROWSER_APPROVAL', 'Browser action was not approved.');
    }
    return { profile, contextOf, turnOf, binding, executionTurn, approve };
}
