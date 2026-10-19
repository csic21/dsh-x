import type { ReviewStore } from './store.ts';
import { LIMITS } from './repository.ts';
import type { CapturedSnapshot, FileEvidence, HostPolicy, Inventory, ReviewMode } from './repository.ts';
import type { Spawn } from './git.ts';
import type { Finding, ReviewCheck } from './review.ts';
import type { ModelRoute, ReviewRequestRecord } from './llm-review.ts';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
/** The verification stamp recorded with a completed review. */
export interface VerificationView {
    previousReviewId: string;
    result: string;
    testsVerified: boolean;
}
/** One durable review record. */
export interface ReviewRecord {
    id: string;
    hostId: string;
    state: string;
    createdAt: string;
    updatedAt: string;
    runtime: string;
    model: string | null;
    provider: string | null;
    snapshotId: string;
    snapshot: CapturedSnapshot;
    mode: ReviewMode;
    base: string;
    baseRef: string;
    head: string;
    paths: string[];
    findings: Finding[];
    checks: ReviewCheck[];
    summary: string;
    stale: boolean;
    staleReason: string | null;
    previousReviewId: string | null;
    reason?: string;
    verification?: VerificationView | null;
    request?: ReviewRequestRecord | null;
}
/** One review as exposed to the client; internal host fields are removed. */
export interface PublicReview {
    id: string;
    state: string;
    createdAt: string;
    updatedAt: string;
    runtime: string;
    model: string | null;
    provider: string | null;
    snapshotId: string;
    mode: ReviewMode;
    base: string;
    baseRef: string;
    head: string;
    paths: string[];
    findings: Finding[];
    checks: ReviewCheck[];
    summary: string;
    stale: boolean;
    staleReason: string | null;
    previousReviewId: string | null;
    reason?: string;
    verification?: VerificationView | null;
}
/** One review detail answer with its current freshness stamp. */
export type ReviewDetailView = PublicReview & {
    isLatest: boolean;
};
/** One recorded review summary in the history list. */
export interface HistoryView {
    id: string;
    state: string;
    createdAt: string;
    snapshotId: string;
    summary: string;
    runtime: string;
    findings: number;
    previousReviewId: string | null;
}
/** One active operation exposed to the client. */
export interface OperationView {
    id: string;
    kind: string;
    reviewId: string | null;
    state: string;
    startedAt: string;
}
/** Reviewer availability and identity for the current session. */
export interface ReviewerInfo {
    dshAvailable: boolean;
    dshModel: ModelRoute | null;
}
/** One bounded repository snapshot plus the current review state. */
export interface SnapshotView {
    scope: string;
    sessionId: string;
    revision: number;
    workspace: Inventory['workspace'];
    files: Inventory['files'];
    limits: typeof LIMITS;
    complete: boolean;
    truncated: boolean;
    dshAvailable: boolean;
    dshModel: ModelRoute | null;
    operation: OperationView | null;
    review: PublicReview | null;
    history: HistoryView[];
}
/** One source answer: the file view plus its binding and immutability. */
export type SourceView = FileEvidence & {
    immutable: boolean;
    workspaceId?: string;
    snapshotId?: string;
};
/** Optional scope overrides for one inventory read. */
export interface InventoryArgs {
    mode?: string;
    base?: string;
    signal?: AbortSignal | undefined;
}
/** One inspect/snapshot request from the tool or the client RPC. */
export interface SnapshotArgs extends InventoryArgs {
    sessionId?: string;
}
/** One source read request. */
export interface SourceArgs extends SnapshotArgs {
    scope?: string;
    workspaceId?: string;
    path: string;
    reviewId?: string;
    preview?: boolean;
}
/** One review detail request. */
export interface ReviewDetailArgs extends SnapshotArgs {
    scope?: string;
    reviewId?: string;
}
/** One review request. Runtime and model remain accepted only for explicit refusal. */
export interface ReviewArgs extends InventoryArgs {
    sessionId?: string;
    scope?: string;
    workspaceId?: string;
    runtime?: string;
    model?: string;
    paths: string[];
    previousReviewId?: string;
}
/** One cancellation request. */
export interface CancelArgs {
    sessionId?: string;
    scope?: string;
    operationId?: string;
}
/** Arguments the controller hands to the official model call. */
export interface DshReviewArgs {
    prompt: string;
    snapshot: CapturedSnapshot;
    route: ModelRoute;
    beforeDispatch: () => Promise<void>;
    recordRequest: (request: ReviewRequestRecord) => void;
}
/** The host services a Code controller runs on. */
export interface CodeControllerDeps {
    store: ReviewStore<ReviewRecord>;
    spawn: Spawn;
    contextOf: (id: string, exec?: ToolRunContext) => Promise<{
        cwd: string;
        policy: HostPolicy | undefined;
    }>;
    reviewerInfo?: (id: string, exec?: ToolRunContext) => ReviewerInfo;
    dshReview?: (args: DshReviewArgs, exec: ToolRunContext) => Promise<string>;
    now?: () => string;
}
export declare function createCodeController({ store, spawn, contextOf, reviewerInfo, dshReview, now }: CodeControllerDeps): {
    snapshot: (args: SnapshotArgs, exec?: ToolRunContext) => Promise<SnapshotView>;
    source: (args: SourceArgs, exec?: ToolRunContext) => Promise<SourceView>;
    reviewDetail: (args: ReviewDetailArgs, exec?: ToolRunContext) => Promise<ReviewDetailView>;
    review: (args: ReviewArgs, exec: ToolRunContext) => Promise<SnapshotView>;
    cancel: (args: CancelArgs) => Promise<SnapshotView>;
    dispose(): Promise<void>;
};
