import type { BackendKind, CapabilitySet } from '../contract/capabilities.ts';
import type { BrowserCommand } from '../contract/commands.ts';
import type { BrowserErrorCode } from '../contract/errors.ts';
import type { BrowserBackend } from './types.ts';
/** Injected failures let tests cover every backend failure path without a browser. */
export interface FakeBackendOptions {
    kind?: BackendKind;
    capabilities?: CapabilitySet;
    failOn?: Partial<Record<'ensure' | 'open' | 'observe' | 'execute' | 'close', BrowserErrorCode>>;
}
/** In-memory backend used by the conformance suite; no page, process or network access. */
export declare function createFakeBackend(options?: FakeBackendOptions): BrowserBackend & {
    commands: BrowserCommand[];
};
