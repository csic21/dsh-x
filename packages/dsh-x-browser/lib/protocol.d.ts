import { NAVIGATION, type BrowserCommand } from './contract/commands.ts';
import { fail } from './contract/errors.ts';
import type { BrowserFailure } from './contract/errors.ts';
import { identifier } from './contract/ids.ts';
import { boundedJson } from './contract/json.ts';
import type { BrowserJson } from './contract/json.ts';
import { modelUrl } from './contract/observation.ts';
import { parseAddress } from './contract/url.ts';
export type { BrowserCommand, BrowserFailure, BrowserJson };
export { boundedJson as boundedResult, fail, identifier, modelUrl, NAVIGATION, parseAddress };
export { MAX_RESULT_BYTES } from './contract/limits.ts';
/** Shared finite protocol. Never accepts JavaScript, selectors, CDP or arbitrary IPC. */
export declare const ACTIONS: readonly string[];
export declare function validateCommand(raw: unknown, applicationOrigin?: string | null, refPattern?: RegExp, actions?: readonly string[]): BrowserCommand;
