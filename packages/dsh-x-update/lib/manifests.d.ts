import { type FetchLike } from './releases.ts';
import type { PluginRelease } from './types.ts';
export declare function safeFileName(value: unknown): value is string;
/** Load the build manifest published with a plugin release. Nothing is downloaded or executed. */
export declare function loadPluginRelease(options: {
    repository: string;
    tag: string;
    version: string;
    fetchImpl: FetchLike;
    signal?: AbortSignal;
}): Promise<PluginRelease | null>;
