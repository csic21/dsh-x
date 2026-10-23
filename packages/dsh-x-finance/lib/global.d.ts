export declare const GLOBAL_MARKET_ENDPOINT = "https://push2.eastmoney.com/api/qt/ulist.np/get";
export declare const GLOBAL_MARKET_SOURCE = "\u4E1C\u65B9\u8D22\u5BCC\u5168\u7403\u6307\u6570 (unofficial)";
/** One batched request covers the whole board. */
export declare const GLOBAL_MAX_QUOTES = 64;
export declare const GLOBAL_TTL_MS = 60000;
export type GlobalRegionKey = 'americas' | 'asiaPacific' | 'europe';
export interface GlobalRegion {
    key: GlobalRegionKey;
    name: string;
    nameEn: string;
}
export declare const GLOBAL_REGIONS: readonly GlobalRegion[];
export interface GlobalInstrument {
    /** Upstream `market.code` identity, e.g. `100.N225` or `1.000001`. */
    secid: string;
    /** Stable display code, e.g. `N225` or `SH.000001`. */
    code: string;
    region: GlobalRegionKey;
    name: string;
    nameEn: string;
    /** IANA zone of the exchange that publishes this index. */
    timeZone: string;
}
/**
 * Curated major indices by region. This is deliberately an identity list: the
 * upstream's own global-index list is not queried, so a new or removed upstream
 * row cannot silently change what the page claims to show.
 */
export declare const GLOBAL_INSTRUMENTS: readonly GlobalInstrument[];
export declare function globalInstrument(code: string): GlobalInstrument | undefined;
export interface GlobalQuote {
    code: string;
    name: string;
    nameEn: string;
    region: GlobalRegionKey;
    timeZone: string;
    price: number;
    change: number | null;
    changePercent: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    previousClose: number | null;
    /** Exchange-local instant as an ISO string, or null when the source omitted it. */
    quotedAt: string | null;
}
export interface GlobalMarketOverview {
    source: string;
    fetchedAt: string;
    /** Newest quote time among the returned indices. */
    quotedAt: string | null;
    quotes: GlobalQuote[];
}
/** Epoch seconds into ISO; impossible, absurd or future values become null. */
export declare function globalQuoteTime(raw: unknown, now: number): string | null;
/**
 * Reads East Money's `ulist.np` payload. Only catalogued identities are kept;
 * a row with an unknown code, a non-positive price or an impossible change is
 * dropped rather than repaired. Missing optional fields stay null.
 */
export declare function parseGlobalQuotes(payload: any, now: number): GlobalQuote[];
/**
 * Host trust boundary: re-validates an adapter's overview and replaces every
 * identity field with the catalogue's values. A replacement adapter cannot add
 * an unknown index, rename one, or claim a different region/time zone.
 */
export declare function projectGlobalOverview(raw: unknown, now: number): GlobalMarketOverview;
/** Unweighted regional averages over available indices; null when none has a change. */
export declare function globalRegionSummary(quotes: GlobalQuote[], region: GlobalRegionKey): {
    count: number;
    up: number;
    down: number;
    flat: number;
    averageChangePercent: number | null;
};
