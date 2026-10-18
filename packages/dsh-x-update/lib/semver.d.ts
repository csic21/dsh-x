export interface ParsedVersion {
    major: number;
    minor: number;
    patch: number;
    prerelease: Array<string | number>;
    raw: string;
}
export declare function parseVersion(value: unknown): ParsedVersion | null;
/** Semver precedence, including prerelease ordering. Returns -1, 0 or 1. */
export declare function compareVersions(left: string, right: string): number;
export declare function isNewer(candidate: string, current: string | null): boolean;
export declare function maxVersion(values: Array<string | null>): string | null;
export declare function isVersion(value: unknown): value is string;
