import type { GenerateOptions, LlmCallConfig, StreamChunk } from '@deepseek-ai/dsh-llm';
/** Exact provider route for one snapshot review. */
export interface ModelRoute {
    provider: string;
    model: string;
}
/**
 * Minimal LLM service surface this plugin calls. The official `LlmRuntime`
 * satisfies it structurally; tests may use smaller fixtures.
 */
export interface ReviewLlm {
    prepareCall(config: LlmCallConfig, signal?: AbortSignal): Promise<{
        readonly config: LlmCallConfig;
        stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    }>;
}
/** Approval-visible record of the exact official model request. */
export interface ReviewRequestRecord {
    route: ModelRoute;
    config: LlmCallConfig;
    sessionId: GenerateOptions['sessionId'];
    system: string;
    messages: GenerateOptions['messages'];
    tools: GenerateOptions['tools'];
    maxTokens: number;
    reasoningEffort?: LlmCallConfig['reasoningEffort'];
}
/** Arguments handed by the controller to the official model call. */
export interface SnapshotReviewArgs {
    prompt: string;
    route: ModelRoute;
    sessionId: GenerateOptions['sessionId'];
    recordRequest?: (request: ReviewRequestRecord) => void;
}
/** Auxiliary official model call: one bounded snapshot message, zero tools/history. */
export declare function runSnapshotReview(llm: ReviewLlm | undefined, { prompt, route, sessionId, recordRequest }: SnapshotReviewArgs, parentSignal?: AbortSignal): Promise<string>;
