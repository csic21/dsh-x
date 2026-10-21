import type { Context } from '@deepseek-ai/cordis';
import type { BrowserAuthority } from './authority.ts';
import type { BrowserApprovalMode } from './authority.ts';
import type { BrowserOwnership } from './ownership.ts';
import type { BrowserRuntime } from './runtime.ts';
/** Model-facing tool surface; identical names and argument shape for every backend. */
export interface BrowserToolDeps {
    name: string;
    authority: BrowserAuthority;
    runtime: BrowserRuntime;
    ownership?: BrowserOwnership;
    /** `auto` tells the model it may proceed unattended instead of waiting for a prompt. */
    approval?: BrowserApprovalMode;
    /** True when one explicit tab grant persists across turns and in-tab navigation. */
    persistentGrant?: boolean;
    /** True when a hidden tab keeps its grant and still accepts commands. */
    background?: boolean;
    systemPrompt: {
        section(options: {
            name: string;
            order: number;
            interpolate: boolean;
            text: string;
        }): () => void;
    };
}
export declare function registerBrowserTools(ctx: Context, deps: BrowserToolDeps): void;
