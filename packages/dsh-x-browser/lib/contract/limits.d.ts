/** Hard cap for one bounded tool result crossing the model boundary. */
export declare const MAX_RESULT_BYTES: number;
/** Text budget for one observation; longer text is truncated and flagged. */
export declare const MAX_OBSERVATION_TEXT_BYTES: number;
/** Reference budget for one observation; extra references are dropped and flagged. */
export declare const MAX_OBSERVATION_REFS = 500;
