import type { BrowserJson } from './protocol.ts';
declare module '@deepseek-ai/cordis' {
    interface Events {
        /** Bounded browser diagnostics consumed by tests and packaged smoke tooling. */
        'dsh-x-browser/trace'(event: BrowserTraceEvent): void;
    }
}
/** One profile/session/workspace binding; a tab only ever acts inside its own. */
export type BrowserScope = {
    profile: string;
    sessionId: string;
    workspace: string;
};
/** Current turn boundary reported by the host session projections. */
export type BrowserTurn = {
    runId: string | null;
    turn: number;
};
/** Model-facing tab snapshot; the capability never leaves the trusted renderer closure. */
export type BrowserPublicTab = {
    tabId: string;
    sessionId: string;
    epoch: number;
    grantRevision: number;
    visible: boolean;
    granted: boolean;
    title: string;
    url: string;
    busy: boolean;
    status: string;
};
/** Bounded diagnostics emitted as `dsh-x-browser/trace` for tests and packaged smoke tooling. */
export type BrowserTraceEvent = {
    event: string;
    reason: string | null;
    tabId: string;
    sessionId: string;
    expectedTurn: number | null;
    currentTurn: number | null;
    runId: string | null;
    expectedRunId: string | null;
    currentRunId: string | null;
    epoch: number;
    grantRevision: number;
};
/** Settled canonical value of one owned browser command; `result` is untrusted page evidence. */
export type BrowserExecutionResult = {
    tabId: string;
    epoch: number;
    grantRevision: number;
    untrustedPageContent: true;
    result: BrowserJson;
};
/** Capability-bound client request; every field is runtime-validated before use. */
type BrowserAuthRequest = {
    tabId?: string;
    capability?: string;
};
/** Capability-bound state report; every field is runtime-validated before use. */
type BrowserSyncPayload = BrowserAuthRequest & {
    epoch: number;
    visible: boolean;
    title?: string;
    url?: string;
};
/** Capability-bound grant request; every field is runtime-validated before use. */
type BrowserGrantPayload = BrowserAuthRequest & {
    epoch: number;
    grantRevision: number;
};
/** Capability-bound dispatch admission; every field is runtime-validated before use. */
type BrowserConfirmPayload = BrowserAuthRequest & {
    commandId: string;
    grantRevision: number;
    epoch: number;
};
/** Capability-bound acknowledgement; every field is runtime-validated before use. */
type BrowserAcknowledgePayload = BrowserAuthRequest & {
    commandId: string;
    grantRevision: number;
    epoch: number;
    result?: unknown;
    error?: unknown;
};
/** Native owner lifetime handed to one dispatch. */
type BrowserDispatchOwner = {
    signal?: AbortSignal;
    runId?: unknown;
    turnNumber?: unknown;
    assertCurrent?: () => void;
    ownerToken?: symbol | null;
};
/** Host services the broker calls back into. */
type BrowserBrokerOptions = {
    profile: string;
    contextOf: (sessionId: string) => Promise<BrowserScope>;
    turnOf?: (sessionId: string) => BrowserTurn | null | undefined;
    now?: () => number;
    timeoutMs?: number;
    heartbeatMs?: number;
    onRevoke?: (tab: BrowserPublicTab & {
        reason: string;
    }) => void;
    onTrace?: (event: BrowserTraceEvent) => void;
};
/** One broker per host profile. Capabilities stay in trusted renderer closures, never model results. */
export declare function createBrowserBroker({ profile, contextOf, turnOf, now, timeoutMs, heartbeatMs, onRevoke, onTrace }: BrowserBrokerOptions): {
    register({ sessionId, clientTabId }: {
        sessionId: string;
        clientTabId: string;
    }): Promise<{
        tabId: string;
        sessionId: string;
        epoch: number;
        grantRevision: number;
        visible: boolean;
        granted: boolean;
        title: string;
        url: string;
        busy: boolean;
        status: string;
        capability: string;
        workspace: string;
    }>;
    list(binding: BrowserScope, { ownerToken, assertCurrent }?: {
        ownerToken?: symbol | null;
        assertCurrent?: () => void;
    }): Promise<{
        tabs: BrowserPublicTab[];
        runtime: string;
        nativeRuntimes: never[];
        experimental: boolean;
    }>;
    sync(args: BrowserSyncPayload): Promise<BrowserPublicTab>;
    grant(args: BrowserGrantPayload): Promise<BrowserPublicTab>;
    revoke(args: BrowserAuthRequest): BrowserPublicTab;
    revokeOwner(ownerToken: symbol): void;
    close(args: BrowserAuthRequest): {
        closed: boolean;
    };
    poll(args: BrowserAuthRequest): Promise<{
        tabId: string;
        sessionId: string;
        epoch: number;
        grantRevision: number;
        visible: boolean;
        granted: boolean;
        title: string;
        url: string;
        busy: boolean;
        status: string;
        command: null;
    } | {
        tabId: string;
        sessionId: string;
        epoch: number;
        grantRevision: number;
        visible: boolean;
        granted: boolean;
        title: string;
        url: string;
        busy: boolean;
        status: string;
        command: {
            action: string;
            url?: string;
            target?: string;
            text?: string;
            x?: number;
            y?: number;
            key?: string;
            id: string;
            epoch: number;
            grantRevision: number;
        };
    }>;
    confirm(args: BrowserConfirmPayload): Promise<{
        allowed: boolean;
    }>;
    acknowledge(args: BrowserAcknowledgePayload): Promise<{
        acknowledged: boolean;
    }>;
    execute(binding: BrowserScope, args: {
        tabId: string;
        epoch: number;
        grantRevision: number;
        command: unknown;
    }, { signal, runId, turnNumber, assertCurrent, ownerToken }?: BrowserDispatchOwner): Promise<BrowserExecutionResult>;
    dispose(): void;
};
export {};
