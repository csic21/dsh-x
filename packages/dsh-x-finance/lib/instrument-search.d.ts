export declare const SEARCH_RPC_ENDPOINT = "dsh-x-finance.search";
export declare const SEARCH_SOURCE_NAME = "smartbox.gtimg.cn (unofficial)";
export declare const SEARCH_MAX_QUERY = 24;
export declare const SEARCH_MAX_RESULTS = 10;
/** Exchange-tradable kinds the watchlist can hold. */
export type InstrumentKind = 'stock' | 'etf' | 'fund' | 'reit';
/** `cn` is the A-share watchlist directory; `us` adds view-only US listings. */
export type InstrumentMarket = 'cn' | 'us';
export interface InstrumentMatch {
    /** Exchange-qualified identity, e.g. `SZ.002594` or `US.BRK.A`. */
    symbol: string;
    /** Directory name as returned by the source; never verified with an exchange. */
    name: string;
    kind: InstrumentKind;
    market: InstrumentMarket;
    /** US only: the venue-qualified code the daily endpoint needs, e.g. `AAPL.OQ`. */
    code?: string;
}
export type SearchRequest = {
    action: 'status';
} | {
    action: 'search';
    query: string;
    market: InstrumentMarket;
};
/** Trims, NFC-normalises and bounds a user query before it is sent upstream. */
export declare function normalizeSearchQuery(raw: unknown): string;
export declare function parseSearchRequest(payload: unknown): SearchRequest;
/**
 * Parses the A-share `v_hint="..."` suggestion payload. Entries are
 * `^`-separated and fields are `~`-separated: market, code, escaped name,
 * pinyin, class. Malformed entries are skipped rather than trusted; a
 * `v_hint="N"` body means no match. Exported for offline tests.
 */
export declare function parseInstrumentHints(payload: unknown): InstrumentMatch[];
/**
 * Parses the US entries of the same payload: market `us`, class `GP`, and a
 * venue-qualified code (`aapl.oq`, `brk.a.n`). The venue is stripped from the
 * identity and kept as `code`, because the quote host takes the bare ticker
 * while the daily host takes the qualified one. Unknown venues are skipped
 * instead of being guessed. Exported for offline tests.
 */
export declare function parseUsInstrumentHints(payload: unknown): InstrumentMatch[];
export declare function normalizeMatch(raw: unknown): InstrumentMatch;
