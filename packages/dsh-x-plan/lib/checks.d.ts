/**
 * Run explicitly approved checks through the host's policy/approval pipeline.
 * The caller owns approval and any trusted-parent registration; this helper
 * never supplies permission overrides, calls a tool body, or spawns a shell.
 * beforeExecute(check) may revalidate the immutable approval before each call.
 * Runtime execute promises are always drained, including after cancellation.
 */
export declare function executeChecks(ctx: any, exec: any, { cwd, checks, beforeExecute, onJob, signal, timeoutMs, cleanupTimeoutMs, }: any): Promise<{
    runs: any[];
    quiescent: boolean;
    jobIds: any[];
}>;
/** A schema is a compatibility check, not proof of the tool vendor's identity. */
export declare function supportsForegroundBash(definition: any): any;
/** Shared predicate for the caller's guarded generic bash path. */
export declare const supportsStructuredBash: typeof supportsForegroundBash;
