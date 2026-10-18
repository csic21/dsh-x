export declare function assertSessionKey(sessionId: any): string;
export declare function sessionPlansDir(home: any, sessionId: any): string;
/** Includes legacy approvals and interrupted work that require a fresh approval. */
export declare function unapprovedDraft(dir: any): any;
export declare function latestApproved(dir: any): any;
export declare function currentWorkflow(dir: any): any;
export declare function discardTarget(dir: any): {
    round: any;
    path: string;
} | null;
/** baseline is caller-supplied JSON, typically repository identity + starting HEAD. */
export declare function writeNewPlan(dir: any, record: any): any;
/** Replace only an unapproved draft, publishing the replacement before closing the old one. */
export declare function replaceDraft(dir: any, round: any, record: any): any;
/** Capture exactly the draft and binding displayed in the approval request. */
export declare function prepareApproval(dir: any, round: any, context?: any): any;
/** No unbound/default approval is allowed. The request token and exact hash are mandatory. */
export declare function approvePlan(dir: any, round: any, { token, expectedHash, expectedRevision }?: any): any;
export declare function discardPlan(dir: any, round: any): any;
export declare function readWorkflow(dir: any, round: any): any;
export declare function transitionWorkflow(dir: any, round: any, next: any, { expectedState, reason }?: any): any;
/** Read the immutable snapshot, verifying body, manifest, metadata and optional caller binding. */
export declare function readApproved(dir: any, round: any, context?: any): {
    round: any;
    revision: any;
    path: string;
    text: string;
    hash: any;
    contentHash: any;
    binding: any;
    manifest: any;
    state: any;
    meta: any;
};
export declare function failureCount(dir: any, round: any): number;
export declare function reviewLimitReached(dir: any, round: any): boolean;
/** Writes are serialized across processes; attempt numbers never overwrite existing results. */
export declare function writeReview(dir: any, record: any): any;
export declare function failedReviewPaths(dir: any, round: any): string[];
export declare function readMeta(dir: any, round: any): any;
export declare function listRounds(dir: any): number[];
/** The run lock exists before planning begins, even when no draft exists yet. */
export declare function taskLockState(dir: any): any;
export declare function withTaskLock(dir: any, callback: any, options?: any): Promise<any>;
/**
 * Call only after an explicit recovery decision. Never steals a live or unverifiable owner.
 * A stale .store.lock deliberately requires manual inspection; this helper never clears it.
 */
export declare function recoverTaskLock(dir: any, { expectedToken }?: any): any;
