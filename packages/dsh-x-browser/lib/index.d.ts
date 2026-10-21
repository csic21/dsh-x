import type { Context } from '@deepseek-ai/cordis';
/** Plugin config; `embedded` stays the default until a packaged CDP run is recorded. */
export interface BrowserConfig {
    backend?: 'embedded' | 'cdp';
    /**
     * How browser actions reach the user. `ask` (default) keeps one official approval
     * per non-observe action. `auto` lets an unattended run continue without those
     * prompts: the explicit tab grant, the visible-tab requirement, the credential
     * filters and Take over still bound what the model may do. See the README.
     */
    approval?: 'ask' | 'auto';
    /**
     * Keep one explicit tab grant across turns and in-tab navigation instead of
     * expiring it at the end of the authorizing turn. Required for unattended work,
     * where nobody is present to click Allow AI again on the next turn.
     */
    persistentGrant?: boolean;
    /**
     * Let the tab grant itself as soon as the embedded page is ready and visible, so
     * nobody presses Allow AI at all. Off by default; the capability still never
     * leaves the renderer closure and Take over still revokes immediately.
     */
    autoGrant?: boolean;
    cdp?: {
        /** CLI executable; defaults to `agent-browser` on PATH. */
        command?: string;
        /** Headed by default so the user can watch; headless must be explicit. */
        headed?: boolean;
        /** Empty means unrestricted; entries match a host or its subdomains. */
        allowedDomains?: string[];
        extraArgs?: string[];
        timeoutMs?: number;
    };
}
export declare const name = "dsh-x-browser";
export declare const inject: string[];
/** Composition root: authority + one backend + optional renderer routes + model-facing tools. */
export declare function apply(ctx: Context, config?: BrowserConfig): void;
