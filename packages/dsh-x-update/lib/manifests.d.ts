import { type FetchLike } from './releases.ts';
import type { DesktopRelease, PluginRelease, UpdateTarget } from './types.ts';
export declare function targetForPlatform(platform: NodeJS.Platform, arch: string): UpdateTarget | null;
export declare function installerSuffix(target: UpdateTarget): string;
export declare function parseSha256Sums(text: string): Map<string, string>;
export declare function safeFileName(value: unknown): value is string;
/** Load one target's distribution manifest and its installer checksum. */
export declare function loadDesktopRelease(options: {
    repository: string;
    tag: string;
    version: string;
    target: UpdateTarget;
    fetchImpl: FetchLike;
    signal?: AbortSignal;
}): Promise<DesktopRelease | null>;
/** Load the build manifest published with a plugin release. */
export declare function loadPluginRelease(options: {
    repository: string;
    tag: string;
    version: string;
    fetchImpl: FetchLike;
    signal?: AbortSignal;
}): Promise<PluginRelease | null>;
