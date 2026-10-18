import type { FetchLike } from './releases.ts';
import type { PluginArtifact, PluginRelease, PendingAppUpdate, PendingPluginUpdate, UpdateTarget } from './types.ts';
export interface DownloadOptions {
    url: string;
    target: string;
    sha256: string;
    integrity?: string;
    maxBytes: number;
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    onProgress?: (received: number, total: number | null) => void;
}
/** Download to a private temporary file, verify both published digests, then rename into place. */
export declare function downloadVerified(options: DownloadOptions): Promise<{
    path: string;
    bytes: number;
}>;
export declare function sanitizeTag(tag: string): string;
export declare function stagePluginUpdate(options: {
    release: PluginRelease;
    installed: Set<string>;
    /** Artifacts selected by the decision; defaults to every installed name. */
    targets?: PluginArtifact[];
    home: string;
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    onProgress?: (file: string, received: number, total: number | null) => void;
}): Promise<PendingPluginUpdate>;
export declare function stageAppUpdate(options: {
    release: {
        tag: string;
        version: string;
        kernelVersion: string;
        target: UpdateTarget;
        installer: {
            file: string;
            sha256: string;
            url: string;
        };
    };
    home: string;
    installRoot: string;
    appPath: string;
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    onProgress?: (file: string, received: number, total: number | null) => void;
}): Promise<PendingAppUpdate>;
export declare function readPendingPlugin(home: string): Promise<PendingPluginUpdate | null>;
export declare function readPendingApp(home: string): Promise<PendingAppUpdate | null>;
export declare function fileDigest(file: string): Promise<{
    sha256: string;
    bytes: number;
}>;
