import type { Context } from '@deepseek-ai/cordis';
/** Plugin config; `embedded` stays the default until a packaged CDP run is recorded. */
export interface BrowserConfig {
    backend?: 'embedded' | 'cdp';
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
