import type { BrowserBackend, BrowserScope } from './backends/types.ts';
import type { EmbeddedBroker } from './backends/embedded/broker.ts';
import type { BrowserCommand } from './contract/commands.ts';
import type { BrowserJson } from './contract/json.ts';
/** One model-facing target; embedded tabs and CDP targets share this shape. */
export interface RuntimeTarget {
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
}
export interface RuntimeList {
    tabs: RuntimeTarget[];
    runtime: string;
    nativeRuntimes: string[];
    experimental?: boolean;
}
export interface RuntimeResult {
    tabId: string;
    epoch: number;
    grantRevision: number;
    untrustedPageContent: true;
    result: BrowserJson;
}
export interface DispatchOwner {
    signal?: AbortSignal;
    runId?: string;
    turnNumber?: number;
    assertCurrent?: () => void;
    ownerToken?: symbol | null;
}
export interface RuntimeExecuteArgs {
    tabId: string;
    epoch: number;
    grantRevision: number;
    command: BrowserCommand;
}
/** The only browser surface the model-facing tools know about. */
export interface BrowserRuntime {
    readonly kind: 'embedded' | 'cdp';
    /** Present only when the runtime can create a target without a renderer. */
    readonly open?: (scope: BrowserScope, url: string, owner: DispatchOwner) => Promise<RuntimeTarget>;
    /** Validate a prospective open before asking for approval; throws on invalid or disallowed URLs. */
    readonly canOpen?: (url: string) => void;
    list(scope: BrowserScope, options?: {
        ownerToken?: symbol | null;
        assertCurrent?: () => void;
        signal?: AbortSignal;
    }): Promise<RuntimeList>;
    execute(scope: BrowserScope, args: RuntimeExecuteArgs, owner: DispatchOwner): Promise<RuntimeResult>;
    dispose(): Promise<void>;
}
/** Adapter over the renderer-backed broker; behavior stays exactly as before. */
export declare function embeddedRuntime(broker: EmbeddedBroker): BrowserRuntime;
export interface CdpRuntimeOptions {
    /** Empty means unrestricted; matching is exact host or a subdomain of the entry. */
    allowedDomains?: readonly string[];
}
/** Adapter over the external agent-browser backend: epoch is the target revision, grant is config-level. */
export declare function cdpRuntime(backend: BrowserBackend, options?: CdpRuntimeOptions): BrowserRuntime;
