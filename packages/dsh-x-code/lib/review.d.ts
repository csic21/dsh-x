import type { CapturedSnapshot } from './repository.ts';
/** One validated finding in a stored review. */
export interface Finding {
    id: string;
    path: string;
    startLine: number;
    endLine: number;
    side: 'before' | 'after';
    severity: string;
    title: string;
    body: string;
    evidence: string;
    trigger: string;
    status: string;
}
/** One reported verification check; only a source-only `not_run` status is host-claimed. */
export interface ReviewCheck {
    name: string;
    status: string;
    evidence: string;
    verified: boolean;
    reportedStatus?: string;
    reportedEvidence?: string;
    command?: string;
}
/** The structured review contract parsed from one reviewer response. */
export interface ParsedReview {
    summary: string;
    findings: Finding[];
    checks: ReviewCheck[];
}
/** The stored review fields a repair prompt reads. */
export interface RepairReview {
    id: string;
    snapshotId: string;
    findings: Finding[];
}
export declare function reviewPrompt(snapshot: CapturedSnapshot): string;
export declare function parseReview(raw: unknown, snapshot: CapturedSnapshot): ParsedReview;
export declare function repairPrompt(review: RepairReview, ids: string[]): string;
