export declare const GLOBAL_MARKET_ENDPOINT = "https://push2.eastmoney.com/api/qt/ulist.np/get";
export declare const GLOBAL_MARKET_SOURCE = "\u4E1C\u65B9\u8D22\u5BCC\u5168\u7403\u6307\u6570 (unofficial)";
/**
 * Fallback upstreams. East Money answers the whole catalogue in one request,
 * but it is reachable from some networks and silently unreachable from others
 * (TLS completes, the peer then closes the connection). Tencent's batch feed
 * and Sina's quote feed carry the same public data for most of the catalogue,
 * so the board degrades to a smaller snapshot instead of failing entirely.
 * Both are the same opt-in, unofficial source family as the rest of this
 * plugin: no SLA, no licence, no trading advice.
 */
export declare const GLOBAL_TENCENT_ENDPOINT = "https://qt.gtimg.cn/q=";
export declare const GLOBAL_TENCENT_SOURCE = "\u817E\u8BAF\u5168\u7403\u6307\u6570 (unofficial)";
export declare const GLOBAL_SINA_ENDPOINT = "https://hq.sinajs.cn/list=";
export declare const GLOBAL_SINA_SOURCE = "\u65B0\u6D6A\u5168\u7403\u6307\u6570 (unofficial)";
/** Sina answers 403 without a referer from its own site. */
export declare const GLOBAL_SINA_REFERER = "https://finance.sina.com.cn/";
/** One batched request covers the whole board. */
export declare const GLOBAL_MAX_QUOTES = 64;
export declare const GLOBAL_TTL_MS = 60000;
/**
 * A quote older than this is not a current snapshot: Sina still serves some
 * rows stamped more than a year ago, and a stale value shown as "today" would
 * be worse than an omitted card. Long exchange holidays stay well inside it.
 */
export declare const GLOBAL_MAX_QUOTE_AGE_MS: number;
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
    /**
     * Tencent symbol for the fallback feed. Only present where that source was
     * checked to answer with the same index; an index without a symbol is simply
     * absent from that source's snapshot instead of being approximated.
     */
    tencent?: string;
    /** Sina symbol for the second fallback feed, same rule as `tencent`. */
    sina?: string;
}
/**
 * Curated major indices by region. This is deliberately an identity list: the
 * upstream's own global-index list is not queried, so a new or removed upstream
 * row cannot silently change what the page claims to show.
 *
 * `tencent`/`sina` are only filled in where a live comparison showed the same
 * index at the same level. Sina also carries rows whose names look right but
 * whose values are not the catalogued index — its `b_SMI` is ~18% away from the
 * Swiss Market index and `b_TWSE` ~44% away from TAIEX — so a name match alone
 * was not accepted. Indices with no verified fallback symbol stay absent from
 * the fallback snapshots rather than being filled from a look-alike row.
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
 * Converts a source's wall-clock stamp into an instant. Tencent and Sina stamp
 * their global rows in the exchange's own local time (verified against East
 * Money for NY, London, Hong Kong and Shanghai), so the zone is an argument
 * rather than an assumption. Three stamp spellings are accepted because the
 * feeds differ: `2026-10-23 16:42:55`, `2026/10/23 18:31:07` and the compact
 * `20261023161500`. Impossible dates, unknown zones and future instants become
 * null; a stamp older than `GLOBAL_MAX_QUOTE_AGE_MS` also becomes null, because
 * a year-old value shown as today's quote is worse than no card at all.
 */
export declare function zonedQuoteTime(wall: unknown, timeZone: string, now: number): string | null;
/**
 * Reads East Money's `ulist.np` payload. Only catalogued identities are kept;
 * a row with an unknown code, a non-positive price or an impossible change is
 * dropped rather than repaired. Missing optional fields stay null.
 */
export declare function parseGlobalQuotes(payload: any, now: number): GlobalQuote[];
/**
 * Reads Tencent's tilde-separated global rows. The global feeds share the
 * A-share column layout — `[3]` price, `[4]` previous close, `[5]` open,
 * `[30]` stamp, `[31]` change, `[32]` percent, `[33]` high, `[34]` low — which
 * was checked against East Money for NY, London, Hong Kong, Tokyo and Shanghai
 * rows. A row is only kept for a catalogued symbol with a plausible, recent
 * stamp; nothing is inferred from the request order.
 */
export declare function parseTencentGlobalQuotes(text: string, now: number): GlobalQuote[];
/**
 * Reads Sina's global rows. Sina stamps them in Beijing time regardless of the
 * exchange, so the conversion uses `Asia/Shanghai` and the result is still
 * displayed in the exchange's own zone by the client.
 *
 * The two Sina families have different layouts: `gb_*` (US) is
 * `name,price,percent,stamp,change,open,high,low,...,previousClose`, while
 * `b_*` is `name,price,change,percent,...,date,time,open,previousClose,high,
 * low,turnover`. A row is only used when every required column is present.
 */
export declare function parseSinaGlobalQuotes(text: string, now: number): GlobalQuote[];
/**
 * Host trust boundary: re-validates an adapter's overview and replaces every
 * identity field with the catalogue's values. A replacement adapter cannot add
 * an unknown index, rename one, or claim a different region/time zone.
 */
export declare function projectGlobalOverview(raw: unknown, now: number): GlobalMarketOverview;
/** Newest quote stamp across the rows, or null when none carried one. */
export declare function globalNewestQuote(quotes: GlobalQuote[]): string | null;
/**
 * Merges several sources' snapshots into one overview. `preferred` is the
 * ordered list of `[source, quotes]` layers; the first layer that carries a
 * code wins it, so a healthy primary source is never diluted by a fallback.
 * Indices no layer answered for are simply absent — the page already renders
 * that as an empty region rather than inventing a number.
 */
export declare function mergeGlobalSnapshots(layers: readonly {
    source: string;
    quotes: GlobalQuote[];
}[], now: number): GlobalMarketOverview | null;
/** Unweighted regional averages over available indices; null when none has a change. */
export declare function globalRegionSummary(quotes: GlobalQuote[], region: GlobalRegionKey): {
    count: number;
    up: number;
    down: number;
    flat: number;
    averageChangePercent: number | null;
};
