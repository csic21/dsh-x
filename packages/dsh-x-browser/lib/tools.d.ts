import type { Context } from '@deepseek-ai/cordis';
import type { BrowserAuthority } from './authority.ts';
import type { BrowserOwnership } from './ownership.ts';
import type { BrowserRuntime } from './runtime.ts';
/** Model-facing tool surface; identical names and argument shape for every backend. */
export interface BrowserToolDeps {
    name: string;
    authority: BrowserAuthority;
    runtime: BrowserRuntime;
    ownership?: BrowserOwnership;
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
