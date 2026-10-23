export declare const SEARCH_RPC_ENDPOINT = "dsh-x-finance.search";
export declare const SEARCH_SOURCE_NAME = "smartbox.gtimg.cn (unofficial)";
export declare const SEARCH_MAX_QUERY = 24;
export declare const SEARCH_MAX_RESULTS = 10;
/** Exchange-tradable kinds the watchlist can hold. */
export type InstrumentKind = 'stock' | 'etf' | 'fund' | 'reit';
export interface InstrumentMatch {
    /** Exchange-qualified A-share identity, e.g. `SZ.002594`. */
    symbol: string;
    /** Directory name as returned by the source; never verified with an exchange. */
    name: string;
    kind: InstrumentKind;
}
export type SearchRequest = {
    action: 'status';
} | {
    action: 'search';
    query: string;
};
/** Trims, NFC-normalises and bounds a user query before it is sent upstream. */
export declare function normalizeSearchQuery(raw: unknown): string;
export declare function parseSearchRequest(payload: unknown): SearchRequest;
/**
 * Parses the `v_hint="..."` suggestion payload. Entries are `^`-separated and
 * fields are `~`-separated: market, code, escaped name, pinyin, class.
 * Malformed entries are skipped rather than trusted; `v_hint="N"` means no
 * match. Exported for offline tests.
 */
export declare function parseInstrumentHints(payload: unknown): InstrumentMatch[];
export declare function normalizeMatch(raw: unknown): InstrumentMatch;
