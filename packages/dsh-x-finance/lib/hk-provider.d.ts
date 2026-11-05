import type { HkQuote } from './hk-market.ts';
import type { MarketHistory } from './market.ts';
export interface HkProvider {
    name: string;
    quote(symbol: string, options?: {
        signal?: AbortSignal;
    }): Promise<HkQuote>;
    history(request: {
        symbol: string;
        limit: number;
    }, options?: {
        signal?: AbortSignal;
    }): Promise<MarketHistory>;
}
export interface HkProviderOptions {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    now?: () => number;
}
/**
 * The adapter re-validates every identity it is handed and reuses the same
 * parser the tests exercise. It never retries a throttled request, and it
 * reports a missing listing as unavailable rather than as a network error.
 */
export declare function createTencentHkProvider(options?: HkProviderOptions): HkProvider;
