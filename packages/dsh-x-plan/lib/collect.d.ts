export { containsCredentialLikeText } from './evidence-files.ts';
/**
 * Capture bounded source evidence relative to the immutable plan-time baseline.
 * Acceptance commands must already have run through the official tool runtime;
 * this function never executes shell commands or calls a supplied check callback.
 */
export declare function collectEvidence(spawn: any, { cwd, baseline, commands, runs, signal }: any): Promise<any>;
/** Mandatory command failures win even when other evidence is incomplete. */
export declare function assessEvidence(evidence: any): {
    verdict: string;
    gaps: string;
};
/** A model's prose can never convert missing evidence or a failed check to pass. */
export declare function enforceEvidenceVerdict(modelVerdict: any, evidence: any): any;
export declare function renderEvidence(planText: any, evidence: any): string;
