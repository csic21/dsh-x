import type { Spawn } from './git.ts';
export declare const LIMITS: Readonly<{
    maxFiles: 4000;
    maxSelectedFiles: 20;
    maxFileBytes: number;
    maxReviewBytes: 49152;
    maxFindings: 100;
}>;
/** Comparison scope selected for one repository read. */
export type ReviewMode = 'worktree' | 'staged' | 'range';
/** Host workspace policy as validated before any repository request. */
export interface HostPolicy {
    workspaceRoot: string;
    mode: string;
}
/** One index or tree record for a path. */
export interface ManifestEntry {
    mode: string;
    oid: string;
    kind?: string;
    unmerged?: boolean;
}
/** One file view for one path; `kind` selects which optional payload fields apply. */
export interface FileEvidence {
    path: string;
    kind: string;
    reason?: string;
    fingerprint?: string;
    mode?: '100644' | '100755';
    text?: string;
    beforeText?: string;
    hash?: string;
    beforeHash?: string;
    status?: string;
    version?: string;
    baseVersion?: string;
    afterKind?: string;
    beforeKind?: string;
    diff?: string;
    hunks?: Hunk[];
    truncated?: boolean;
    /** Base64 media for a preview-only image, audio, or video. Never stored in a review snapshot. */
    data?: string;
    beforeData?: string;
    mediaType?: string;
    diffTruncated?: boolean;
    selectable?: boolean;
    changed?: boolean;
}
/** One diff hunk with its original and current line coordinates. */
export interface Hunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
}
/** One enumerated manifest entry, whether or not its source may be shown. */
export interface WorkspaceFile {
    path: string;
    changed: boolean;
    status: string;
    selectable: boolean;
    reason: string | null;
}
/** The immutable repository identity a review is bound to. */
export interface Workspace {
    cwd: string;
    repoRoot: string;
    gitDir: string;
    commonDir: string;
    repositoryId: string;
    head: string;
    base: string;
    baseRef: string;
    mode: ReviewMode;
    indexHash: string;
    policyRoot: string;
    id: string;
}
/** One bounded repository inspection. */
export interface Inventory {
    workspace: Workspace;
    files: WorkspaceFile[];
    complete: boolean;
    truncated: boolean;
    limits: typeof LIMITS;
    before: Map<string, ManifestEntry>;
    after: Map<string, ManifestEntry>;
    signal: AbortSignal | undefined;
    policy: HostPolicy;
}
/** One immutable captured review scope. */
export interface CapturedSnapshot {
    snapshotId: string;
    workspace: Workspace;
    files: FileEvidence[];
    bytes: number;
    paths: string[];
}
/** One repository read request; every field is validated before use. */
export interface InventoryOptions {
    cwd: string;
    policy: HostPolicy | null | undefined;
    mode?: string;
    base?: string;
    signal?: AbortSignal | undefined;
}
export declare const validMode: (mode: unknown) => ReviewMode;
export declare function createRepository(spawn: Spawn): {
    inventory: ({ cwd, policy, mode, base, signal }: InventoryOptions) => Promise<Inventory>;
    file: (inv: Inventory, file: string, options?: {
        preview?: boolean;
    }) => Promise<FileEvidence>;
    capture: (inv: Inventory, paths: string[]) => Promise<CapturedSnapshot>;
};
