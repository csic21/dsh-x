import type { InstrumentMarket, InstrumentMatch } from './instrument-search.ts';
export declare const SEARCH_URL = "https://smartbox.gtimg.cn/s3/";
export declare const SEARCH_TIMEOUT_MS = 8000;
export declare const SEARCH_MAX_BYTES: number;
export interface InstrumentSearchOptions {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}
export interface InstrumentSearchProvider {
    name: string;
    search(query: string, options?: {
        signal?: AbortSignal;
        market?: InstrumentMarket;
    }): Promise<InstrumentMatch[]>;
}
/**
 * Creates the opt-in directory adapter. Every probe in the plan is
 * re-validated, each response body is bounded, and only allowlisted fields are
 * projected.
 *
 * The directory resolves one contiguous substring per request, so a compound
 * query is probed in a short ladder instead of being sent verbatim: the typed
 * query first, then its token concatenation, then the content tokens, then —
 * only while the merged pool is still thin — one shortened CJK token. Probes
 * stop as soon as a full page is in hand, and the whole ladder shares one
 * timeout, so the worst case is still a bounded number of requests inside the
 * existing 8 second budget.
 */
export declare function createInstrumentSearchProvider(options?: InstrumentSearchOptions): InstrumentSearchProvider;
