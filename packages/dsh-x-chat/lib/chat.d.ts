import type { GenerateOptions, LlmCallConfig, StreamChunk } from '@deepseek-ai/dsh-llm';
/** Hard safety bounds; the tool card and errors never interpolate input data. */
export declare const LIMITS: Readonly<{
    promptBytes: 16384;
    contextBytes: 49152;
    streamBytes: 1048576;
    chunks: 20000;
}>;
/** Plugin configuration accepted from the official profile configuration. */
export interface ChatConfig {
    provider?: string;
    model?: string;
    timeoutMs?: number;
    maxOutputTokens?: number;
}
/** Exact provider route for one call. */
export interface ChatRoute {
    provider: string;
    model: string;
}
/** Configuration after validation, with defaults materialized. */
export interface ResolvedChatConfig extends Partial<ChatRoute> {
    timeoutMs: number;
    maxOutputTokens: number;
}
/** Validated tool arguments for one Q&A call. */
export interface ChatArgs {
    prompt: string;
    context?: string;
    provider?: string;
    model?: string;
}
/** Canonical tool result declared by the output schema. */
export interface ChatAnswer extends ChatRoute {
    text: string;
    truncated: boolean;
}
/**
 * Minimal LLM service surface this plugin calls. The official `LlmRuntime`
 * satisfies it structurally; tests may use smaller fixtures.
 */
export interface ChatLlm {
    prepareCall(config: LlmCallConfig, signal?: AbortSignal): Promise<{
        readonly config: LlmCallConfig;
        stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    }>;
}
/** Validate configuration keys and scalar bounds before any dispatch. */
export declare function resolveConfig(config?: ChatConfig): ResolvedChatConfig;
export declare function runChat(llm: ChatLlm, args: ChatArgs, config?: ChatConfig, parentSignal?: AbortSignal): Promise<ChatAnswer>;
