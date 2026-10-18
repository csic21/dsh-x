/** Bounds for one planner or reviewer ACP call and the evidence packet. */
export const PLAN_TIMEOUT_MS = 8 * 60 * 1000;
/** Per acceptance command. The plan may name up to {@link MAX_ACCEPTANCE_COMMANDS}. */
export const COMMAND_TIMEOUT_MS = 120 * 1000;
export const MAX_ACCEPTANCE_COMMANDS = 8;
export const MAX_COMMAND_CHARS = 400;
export const MAX_DIFF_CHARS = 60_000;
export const MAX_COMMAND_OUTPUT_CHARS = 20_000;
export const MAX_CONTEXT_CHARS = 80_000;
export const MAX_PLAN_CHARS = 200_000;
export const MAX_REVIEW_CHARS = 40_000;
/** Failed reviews of one approved plan before the tool stops and asks the user. */
export const MAX_REVIEW_FAILURES = 2;
/** Matches the official ACP child dispose grace. */
export const SUBPROCESS_GRACE_MS = 3_000;
