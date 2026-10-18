export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type ReleaseKind = 'desktop' | 'plugins';
export interface ReleaseEntry {
    tag: string;
    version: string;
    kind: ReleaseKind;
    updatedAt: string | null;
}
export declare function classifyTag(tag: string): {
    kind: ReleaseKind;
    version: string;
} | null;
/** Parse the public releases Atom feed. No API token or rate limit is involved. */
export declare function parseAtom(xml: string): ReleaseEntry[];
/** Fallback parser for the public REST listing when the Atom feed is unavailable. */
export declare function parseApi(json: unknown): ReleaseEntry[];
export declare function assetUrl(repository: string, tag: string, file: string): string;
export declare function feedUrl(repository: string): string;
export declare function apiUrl(repository: string): string;
/** Newest-first release entries, fetched from the public Atom feed. */
export declare function fetchReleaseIndex(options: {
    repository: string;
    feedUrl?: string;
    fetchImpl: FetchLike;
    signal?: AbortSignal;
}): Promise<ReleaseEntry[]>;
export declare function newestFor(entries: ReleaseEntry[], kind: ReleaseKind, limit?: number): ReleaseEntry[];
export declare function latestVersion(entries: ReleaseEntry[], kind: ReleaseKind): string | null;
