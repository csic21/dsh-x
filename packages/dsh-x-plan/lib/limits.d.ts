/** Bounds for one planner or reviewer ACP call and the evidence packet. */
export declare const PLAN_TIMEOUT_MS: number;
/** Per acceptance command. The plan may name up to {@link MAX_ACCEPTANCE_COMMANDS}. */
export declare const COMMAND_TIMEOUT_MS: number;
export declare const MAX_ACCEPTANCE_COMMANDS = 8;
export declare const MAX_COMMAND_CHARS = 400;
export declare const MAX_DIFF_CHARS = 60000;
export declare const MAX_COMMAND_OUTPUT_CHARS = 20000;
export declare const MAX_CONTEXT_CHARS = 80000;
export declare const MAX_PLAN_CHARS = 200000;
export declare const MAX_REVIEW_CHARS = 40000;
/** Failed reviews of one approved plan before the tool stops and asks the user. */
export declare const MAX_REVIEW_FAILURES = 2;
/** Matches the official ACP child dispose grace. */
export declare const SUBPROCESS_GRACE_MS = 3000;
