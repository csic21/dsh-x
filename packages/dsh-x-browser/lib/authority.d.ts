import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { BrowserScope, BrowserTurn } from './backends/types.ts';
import type { BrowserOwner } from './ownership.ts';
/** One DSH session as the official sessions service exposes it. */
export interface BrowserSession {
    id: string;
}
/** Turn boundary projection used to bind a grant to exactly one run. */
export interface BrowserTurnBoundary {
    lastTurn: number;
    openTurnStartSeq: number | null;
}
/** Official approval service this plugin consumes without a shipped type dependency. */
export interface BrowserApproval {
    request(request: {
        agent: unknown;
        callId: unknown;
        toolName: string;
        signal: AbortSignal;
        reason: string;
    }): Promise<unknown>;
}
/**
 * Host services the authority reads. Optional services stay late-bound through `get`
 * so a service provided after plugin apply is still observed, as before.
 */
export interface AuthorityServices {
    profileContext: {
        dir: string;
    };
    workingDirectory: {
        ensure(agent: unknown, signal: AbortSignal): Promise<string | undefined>;
        get(session: unknown): unknown;
    };
    get(name: string): unknown;
}
/** One live owning run handed to the backend for a single dispatch. */
export interface ExecutionTurn {
    signal: AbortSignal;
    ownerToken: symbol | null;
    runId: string;
    turnNumber: number;
    assertCurrent(): void;
}
/**
 * Profile/session/workspace resolution, turn binding and approval.
 * Grant semantics stay backend-specific: the embedded backend grants per tab and turn,
 * while the CDP backend treats the explicit `backend: 'cdp'` config as consent and still
 * requires one official approval per action. See docs/dev/browser-cdp.md.
 */
export declare function createAuthority(services: AuthorityServices): {
    profile: string;
    contextOf: (sessionId: string, exec?: ToolRunContext) => Promise<BrowserScope>;
    turnOf: (sessionId: string) => BrowserTurn | null;
    binding: (exec: ToolRunContext) => Promise<BrowserScope>;
    executionTurn: (exec: ToolRunContext, nativeOwner: BrowserOwner | null) => ExecutionTurn;
    approve: (exec: ToolRunContext, reason: string) => Promise<void>;
};
export type BrowserAuthority = ReturnType<typeof createAuthority>;
