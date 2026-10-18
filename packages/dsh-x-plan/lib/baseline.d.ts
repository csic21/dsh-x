export interface EvidenceIssue {
    code: string;
    message: string;
    path?: string;
}
export interface IndexEntry {
    path: string;
    kind: string;
    mode?: string;
    oid?: string;
}
export interface RepositoryIdentity {
    cwd: string | null;
    repoRoot: string | null;
    gitDir: string | null;
    head: string | null;
    indexEntries: IndexEntry[];
    indexDigest: string | null;
    complete: boolean;
    issues: EvidenceIssue[];
}
export interface Baseline {
    version: number;
    cwd: string | null;
    repoRoot: string | null;
    gitDir: string | null;
    head: string | null;
    dirty: {
        path: string;
        status: string;
        oldPath?: string;
    }[];
    untracked: string[];
    files: any[];
    index: IndexEntry[];
    complete: boolean;
    issues: EvidenceIssue[];
    digest?: string;
}
/** Only fixed-argv, read-only Git plumbing is permitted in evidence capture. */
export declare function readGit(spawn: any, cwd: any, args: any, signal: any, maxChars?: number): Promise<{
    exitCode: any;
    signal: any;
    output: string;
    truncated: boolean;
    ok: boolean;
}>;
/** Capture canonical worktree identity; never accept a different repo or cwd. */
export declare function captureRepositoryIdentity(spawn: any, { cwd, signal }: any): Promise<RepositoryIdentity>;
export declare function captureGitState(spawn: any, { cwd, signal }: any): Promise<{
    dirty: any;
    untracked: any;
    fingerprint: null;
    issues: {
        code: string;
        message: string;
        path?: string | undefined;
    }[];
} | {
    dirty: any;
    untracked: any;
    fingerprint: string;
    issues: any[];
}>;
/** A plan-time snapshot. Persist it unchanged; never refresh at review time. */
export declare function captureBaseline(spawn: any, { cwd, signal }: any): Promise<Baseline>;
export declare function baselineDigest(baseline: any): string;
export declare function validateBaseline(baseline: any): any[];
export declare function statePaths(state: any): any[];
export declare function sameIdentity(left: any, right: any, { includeHead }?: any): boolean;
/**
 * Only explicitly Git-visible source-text targets are supported in this version.
 * Recheck before approval and before/after acceptance: ignore rules may change
 * without appearing in the tracked diff (for example .git/info/exclude).
 * Returns issues rather than changing files or silently broadening collection.
 */
export declare function assertVisibleScope(spawn: any, { cwd, files, signal }: any): Promise<EvidenceIssue[]>;
