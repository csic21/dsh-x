import type { AgentBrowserCliOptions } from './cli.ts';
import type { BrowserBackend } from '../types.ts';
export interface AgentBrowserBackendOptions extends AgentBrowserCliOptions {
    /** Headed by default so the user can watch; headless must be explicit in config. */
    headed?: boolean;
}
/** CDP backend: one agent-browser session per DSH session, targets addressed by stable tab id. */
export declare function createAgentBrowserBackend(options?: AgentBrowserBackendOptions): BrowserBackend;
