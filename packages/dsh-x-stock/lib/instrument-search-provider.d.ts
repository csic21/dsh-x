import type { InstrumentMatch } from './instrument-search.ts';
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
    }): Promise<InstrumentMatch[]>;
}
/**
 * Creates the opt-in directory adapter. Every query is re-validated, the
 * response body is bounded, and only allowlisted fields are projected.
 */
export declare function createInstrumentSearchProvider(options?: InstrumentSearchOptions): InstrumentSearchProvider;
