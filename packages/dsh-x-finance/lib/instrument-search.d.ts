export declare const SEARCH_RPC_ENDPOINT = "dsh-x-finance.search";
export declare const SEARCH_SOURCE_NAME = "smartbox.gtimg.cn (unofficial)";
export declare const SEARCH_MAX_QUERY = 24;
export declare const SEARCH_MAX_RESULTS = 10;
/** Exchange-tradable kinds the watchlist can hold. */
export type InstrumentKind = 'stock' | 'etf' | 'fund' | 'reit';
/** `cn` is the A-share watchlist directory; `us` and `hk` add view-only boards. */
export type InstrumentMarket = 'cn' | 'us' | 'hk';
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
/** Total upstream probes one query may trigger, including the relax step. */
export declare const SEARCH_MAX_PROBES = 4;
/** A query is "thin" below this many candidates and earns the relax probe. */
export declare const SEARCH_RELAX_BELOW = 4;
/**
 * How one lookup is split before it reaches the directory.
 *
 * The directory matches one contiguous substring per request, against either
 * the name or the pinyin initials: it has no notion of AND, so `红利低波动etf
 * 易方达` returns nothing even though `红利低波` finds the fund. A plan turns
 * the typed string into a short, ordered probe list instead of sending it
 * verbatim.
 */
export interface SearchPlan {
    /** The normalised query, exactly as typed; used for display and the first probe. */
    query: string;
    /** Content tokens used for ranking, in typed order. */
    tokens: string[];
    /** Always-tried probes, in order. The first one is always `query`. */
    probes: string[];
    /** Extra probe tried only while the merged pool is still thin. */
    relax?: string;
}
/** One directory row plus the probe that produced it; `via` only breaks ties. */
export interface SearchCandidate {
    match: InstrumentMatch;
    via: string;
    order: number;
}
/**
 * Builds the probe ladder for one query.
 *
 * `push` caps the strict probes and drops duplicates case-insensitively, so the
 * whole ladder stays inside `SEARCH_MAX_PROBES` requests no matter what the
 * user typed.
 */
export declare function planSearch(query: string): SearchPlan;
/**
 * Orders the merged pool so the row that answers the whole query comes first.
 *
 * Scores are additive per token and the sort falls back to probe/insertion
 * order, so a pinyin query (whose letters never appear in a CJK name) keeps the
 * directory's own ranking rather than being shuffled by the tie-break.
 */
export declare function rankCandidates(candidates: readonly SearchCandidate[], plan: SearchPlan): InstrumentMatch[];
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
/**
 * Parses the Hong Kong entries of the same payload: market `hk`, class `GP`
 * and a five-digit code written with its leading zeros. ETFs and stocks share
 * the `GP` class on this directory, so the row is carried as a stock rather
 * than guessing a class from the name. Warrants and CBBCs are `QZ` and are not
 * projected, and the RMB counter of a dual-counter listing is dropped in
 * `parseHkDirectoryCode`. Exported for offline tests.
 */
export declare function parseHkInstrumentHints(payload: unknown): InstrumentMatch[];
export declare function normalizeMatch(raw: unknown): InstrumentMatch;
