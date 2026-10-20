/** Hard cap for one bounded tool result crossing the model boundary. */
export const MAX_RESULT_BYTES = 64 * 1024;
/** Text budget for one observation; longer text is truncated and flagged. */
export const MAX_OBSERVATION_TEXT_BYTES = 24 * 1024;
/** Reference budget for one observation; extra references are dropped and flagged. */
export const MAX_OBSERVATION_REFS = 500;
