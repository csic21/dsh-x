export declare const FREE_SOURCE_NAME = "qt.gtimg.cn (unofficial)";
export declare const FREE_TIMEOUT_MS = 10000;
export declare const FREE_MAX_BYTES = 32768;
export interface FreeQuoteOptions {
    fetchImpl?: typeof fetch;
    now?: () => number;
    timeoutMs?: number;
}
export interface FreeQuote {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
    quotedAt: string;
    marketStatus: 'unknown';
}
export declare function parseTencentTimestamp(raw: unknown, now: number): string;
export declare function parseTencentLine(payload: unknown, symbol: unknown, now?: number): FreeQuote;
/**
 * Creates the opt-in adapter expected by `createWatchlistHandler({ provider })`.
 * It never logs, caches or forwards the raw payload: callers receive only the
 * projected quote fields, and failures surface as a generic rejection.
 */
export declare function createFreeQuoteProvider(options?: FreeQuoteOptions): {
    name: string;
    quote(input: unknown, { signal }?: {
        signal?: AbortSignal;
    }): Promise<FreeQuote>;
};
