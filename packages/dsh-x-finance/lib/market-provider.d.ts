import type { HotSnapshot } from './hot.ts';
import type { Csi300Fund, Csi300FundShare, MarketAdjustment, MarketHistory, MarketQuote, MarketStock, MarketTopStock, MarketProvider, MarketIntraday } from './market.ts';
import type { TailMinutePoint } from './tail-scan.ts';
import type { QuantPage } from './quant-scan.ts';
export declare const MARKET_QUOTE_ENDPOINT = "https://qt.gtimg.cn/q=";
export declare const MARKET_BOARD_RANK_ENDPOINT = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/mktHs/rank";
export declare const MARKET_STOCK_RANK_ENDPOINT = "https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList";
/** Daily OHLCV for one symbol. Same opt-in source and same bounded client. */
export declare const MARKET_HISTORY_ENDPOINT = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get";
/**
 * Today's 分时. East Money's trends feed, not the Tencent daily host: each row
 * is already a Beijing wall-clock minute. The `ut` value is the public page
 * token shipped in that site's script, not a credential.
 */
export declare const MARKET_INTRADAY_ENDPOINT = "https://push2.eastmoney.com/api/qt/stock/trends2/get";
export declare const MARKET_INTRADAY_SOURCE = "\u4E1C\u65B9\u8D22\u5BCC\u5206\u65F6 (unofficial)";
/**
 * CSI 300 fund-share panel. The index provider publishes the fund catalogue
 * and the index level history; each fund page publishes its quarterly size.
 * All three are public, unauthenticated, unofficial endpoints, so this panel
 * is part of the same explicit opt-in as the rest of the local market source.
 */
export declare const CSI300_FUNDS_CATALOG_ENDPOINT = "https://www.csindex.com.cn/csindex-home/index-list/queryByIndexCode/000300";
export declare const CSI300_INDEX_PERF_ENDPOINT = "https://www.csindex.com.cn/csindex-home/perf/index-perf";
export declare const CSI300_FUND_SCALE_ENDPOINT = "https://fund.eastmoney.com/pingzhongdata/";
export declare const CSI300_FUNDS_SOURCE = "\u4E2D\u8BC1\u6307\u6570 + \u5929\u5929\u57FA\u91D1 + \u817E\u8BAF\u884C\u60C5 (unofficial)";
/** Fund sizes change only when a quarterly report is published. */
export declare const CSI300_FUNDS_TTL_MS: number;
/** One fund's `pingzhongdata` bundle carries all of its series, so it is larger than a quote. */
export declare const CSI300_FUND_SCALE_MAX_BYTES: number;
/** Quarters shown in the trend; older reports are not drawn. */
export declare const CSI300_FUNDS_MAX_HISTORY = 12;
/** A quarter is drawn only when funds covering at least this share of AUM reported it. */
export declare const CSI300_FUNDS_MIN_COVERAGE = 0.8;
/**
 * The per-fund scripts are fetched in parallel, but a throttled upstream must
 * not hold the whole panel open. After this budget the snapshot is returned
 * with whatever quarterly series arrived; coverage says how much is missing.
 */
export declare const CSI300_FUNDS_BUDGET_MS = 15000;
/** Tencent's own minute feed: the tail scan and the 分时 fallback both read it. */
export declare const MARKET_MINUTE_ENDPOINT = "https://web.ifzq.gtimg.cn/appstock/app/minute/query";
export declare const MARKET_MINUTE_SOURCE = "\u817E\u8BAF\u5206\u65F6 (unofficial)";
export declare const MARKET_MINUTE_MAX_BYTES: number;
/** Labelled as its own source so a chart drawn from the fallback never claims East Money. */
export declare const MARKET_INTRADAY_TENCENT_SOURCE = "\u817E\u8BAF\u5206\u65F6 (unofficial)";
/** Fallback minute feed: Sina's 1-minute K-line JSONP, already used by the gold panel. */
export declare const MARKET_SINA_MINUTE_ENDPOINT = "https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20_data=/CN_MarketDataService.getKLineData";
export declare const MARKET_SINA_MINUTE_MAX_BYTES: number;
export declare const MARKET_SINA_MINUTE_SOURCE = "\u65B0\u6D6A\u5206\u65F6 (unofficial)";
export declare const MARKET_TAIL_SOURCE = "\u817E\u8BAF\u884C\u60C5 (unofficial) + \u817E\u8BAF/\u65B0\u6D6A\u5206\u65F6 (unofficial)";
export declare const MARKET_INTRADAY_TTL_MS = 15000;
/**
 * The 分时 host answers by dropping the connection when it is busy or throttling
 * (`Empty reply from server`), which used to take the whole line down on the
 * first attempt. A dropped connection costs nothing to retry, so each source
 * gets a second try before the next one is used.
 */
export declare const MARKET_INTRADAY_ATTEMPTS = 2;
/**
 * Shorter than the shared timeout on purpose: this panel polls, so a hung host
 * must not hold the request for the full budget on every attempt.
 */
export declare const MARKET_INTRADAY_TIMEOUT_MS = 5000;
/**
 * A 分时 source that just failed is skipped for this long, so a throttled host
 * costs one failure per minute instead of one per poll; the fallback keeps the
 * chart live in the meantime.
 */
export declare const MARKET_INTRADAY_COOLDOWN_MS = 60000;
/**
 * How long a global upstream that just failed is skipped. Long enough that a
 * blocked host costs one timeout per two minutes instead of one per refresh,
 * short enough that a recovered host is used again without a restart.
 */
export declare const GLOBAL_SOURCE_COOLDOWN_MS = 120000;
export declare const MARKET_INTRADAY_MAX_POINTS = 300;
export declare const MARKET_TIMEOUT_MS = 10000;
export declare const MARKET_MAX_BYTES: number;
export declare const MARKET_TOP_LIMIT = 8;
declare const INDEXES: readonly [{
    readonly quote: 'sh000001';
    readonly code: 'SH.000001';
    readonly market: 'cn';
}, {
    readonly quote: 'sz399001';
    readonly code: 'SZ.399001';
    readonly market: 'cn';
}, {
    readonly quote: 'sz399006';
    readonly code: 'SZ.399006';
    readonly market: 'cn';
}, {
    readonly quote: 'sh000300';
    readonly code: 'SH.000300';
    readonly market: 'cn';
}, {
    readonly quote: 'sh000688';
    readonly code: 'SH.000688';
    readonly market: 'cn';
}, {
    readonly quote: 'bj899050';
    readonly code: 'BJ.899050';
    readonly market: 'cn';
}, {
    readonly quote: 'sh000905';
    readonly code: 'SH.000905';
    readonly market: 'cn';
}, {
    readonly quote: 'sh000906';
    readonly code: 'SH.000906';
    readonly market: 'cn';
}, {
    readonly quote: 'sh000852';
    readonly code: 'SH.000852';
    readonly market: 'cn';
}, {
    readonly quote: 'sh000985';
    readonly code: 'SH.000985';
    readonly market: 'cn';
}, {
    readonly quote: 'hkHSI';
    readonly code: 'HK.HSI';
    readonly market: 'hk';
}, {
    readonly quote: 'hkHSCEI';
    readonly code: 'HK.HSCEI';
    readonly market: 'hk';
}, {
    readonly quote: 'hkHSTECH';
    readonly code: 'HK.HSTECH';
    readonly market: 'hk';
}, {
    readonly quote: 'hkHSCCI';
    readonly code: 'HK.HSCCI';
    readonly market: 'hk';
}];
export interface MarketProviderOptions {
    fetchImpl?: typeof fetch;
    now?: () => number;
    timeoutMs?: number;
    overviewTtlMs?: number;
    breadthTtlMs?: number;
    boardTtlMs?: number;
    globalTtlMs?: number;
    csi300FundsTtlMs?: number;
    retryDelayMs?: number;
    concurrency?: number;
}
/**
 * The upstream stamp is `yyyyMMddHHmmss` in exchange time (China Standard
 * Time, UTC+08:00, no DST). Invalid, impossible or future stamps are rejected
 * instead of being silently clamped. Exported for tests.
 */
export declare function parseTencentTimestamp(raw: unknown, now: number): string;
/**
 * Hang Seng lines stamp `yyyy/MM/dd HH:mm:ss` in Hong Kong time (UTC+8, no
 * DST). Impossible or future stamps are rejected, not clamped. Exported for tests.
 */
export declare function parseTencentHkTimestamp(raw: unknown, now: number): string;
/** Parses the tilde-separated Tencent batch format. Exported for tests. */
export declare function parseTencentBatch(text: string): Map<string, string[]>;
interface RankBoard {
    code: string;
    name: string;
    changePercent: number | null;
    topStock: MarketTopStock | null;
}
/** Parses `mktHs/rank` (level-2 boards and their leading stock). */
export declare function parseBoardRank(payload: any): Map<string, RankBoard>;
interface StockRankPage {
    total: number;
    rows: MarketStock[];
}
/** Preserve stock identities even when quotes/turnover/name/status are missing.
 * Reusing parseStockRankPage would silently prefilter the daily universe.
 */
export declare function parseQuantRankPage(payload: any): QuantPage;
/** Parses one `getBoardRankList` page. Exported for tests. */
export declare function parseStockRankPage(payload: any): StockRankPage;
/**
 * One ranking row as the hot screen needs it. The feed is the same endpoint the
 * breadth board uses, but the hot layer also reads 量比, 换手, 振幅, 涨速,
 * 主力净流入 and the 5/10/20/60-day moves. Missing optional fields stay null: a
 * rule that needs one simply does not fire instead of reading a zero.
 */
export declare function parseHotRow(row: any): HotSnapshot | null;
/** Parses one hot ranking page. Exported for tests. */
export declare function parseHotPage(payload: any): {
    total: number;
    rows: HotSnapshot[];
};
/** Parses one `v_sh600519="..."` stock line into the projected quote. */
export declare function parseStockQuote(key: string, fields: string[], now: number): MarketQuote;
/** Extra Tencent quote fields used only by the local tail scan. */
export interface TailQuote {
    symbol: string;
    name: string;
    price: number;
    pricePrecision: number | null;
    changePercent: number;
    previousClose: number;
    /** Today's volume in lots (手), the source's own unit. */
    volumeLots: number;
    /** Turnover in CNY. */
    amount: number;
    turnoverPercent: number;
    /** Tencent's daily volume ratio (量比), not the tail ratio. */
    volumeRatio: number;
    quotedAt: string;
    sessionDate: string;
}
/**
 * Parses the fields the tail scan needs. A missing or malformed field makes the
 * row unusable rather than being replaced by a zero; the scan then has fewer
 * candidates, which is honest. Exported for tests.
 */
export declare function parseTailQuote(key: string, fields: string[], now: number): TailQuote | null;
export interface TailMinuteSeries {
    symbol: string;
    name: string;
    sessionDate: string;
    previousClose: number | null;
    /** Per-minute deltas; volume is lots and amount is CNY. */
    points: TailMinutePoint[];
}
/**
 * The tail scan wants per-minute deltas only. Kept as its own projection so the
 * shared reader stays free to keep the cumulative counters the 分时 line needs.
 * Exported for tests.
 */
export declare function parseTencentMinutePayload(payload: any, symbol: string, now: number): TailMinuteSeries;
/**
 * Sina's minute K-line is a JSONP array of `{day, open, high, low, close,
 * volume, amount}` rows. Volume is shares and amount is CNY. The feed may carry
 * the previous session too, so only the newest session date is kept. Exported
 * for tests.
 */
export declare function parseSinaMinutePayload(text: string, symbol: string, now: number, previousClose?: number | null): TailMinuteSeries;
export declare function loadTailMinuteSeries(symbol: string, previousClose: number | null, options: {
    request: (url: string, encoding: 'utf-8' | 'gbk', maxBytes: number) => Promise<string>;
    now: () => number;
}): Promise<TailMinuteSeries>;
export declare function tencentMinuteUrl(symbol: string): string;
/** Daily rows arrive as arrays; a malformed row is dropped, never repaired. */
export interface RawDailyRow {
    sessionDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
    /** Upstream turnover in 万元 (10,000 CNY) when the row carries it. */
    amountWan: number | null;
}
/**
 * Parses `[date, open, close, high, low, volume, ..., rate, amountWan]` rows.
 * The upstream order is open/close/high/low, not OHLC; treating it as OHLC
 * would silently swap close and high. Impossible OHLC relationships are
 * rejected rather than clamped, and the result stays sorted and unique.
 */
export declare function parseDailyRows(rows: unknown): RawDailyRow[];
/**
 * Tencent sends volume in lots (手, 100 shares) for most SSE/SZSE/ETF rows but
 * in shares for STAR rows, so the unit is inferred from each row's own
 * turnover instead of assumed: `amountWan * 1e4 / volume` is an average traded
 * price, so it lands near `close` for shares and near `100 × close` for lots.
 * When turnover is missing or the ratio is ambiguous the volume stays unknown
 * rather than being published under a guessed unit.
 */
export declare function inferVolumeUnit(rows: RawDailyRow[]): {
    unit: 'shares' | 'lots';
    samples: number;
} | null;
/**
 * Index codes share the A-share symbol shape but their reported volume is an
 * exchange aggregate, not a share count. Treating it as shares would mislabel
 * the axis, so indices carry the source's own unit and say so.
 */
export declare function isIndexSymbol(symbol: string): boolean;
/** Builds the projected history; bars the unit cannot be established for are dropped. */
export declare function projectHistory(options: {
    symbol: string;
    name: string;
    rows: RawDailyRow[];
    adjustment: MarketAdjustment;
    precision: number;
    now: number;
}): MarketHistory;
/**
 * The index provider's fund catalogue for CSI 300. Only funds that actually
 * track the index and report a positive size are kept; feeder funds (联接) and
 * enhanced funds are filtered by `fundType`, because counting them would either
 * double-count the ETF or mix active positions into a passive-share measure.
 * Exported for tests.
 */
export declare function parseCsi300FundCatalog(payload: any): Csi300Fund[];
/**
 * One fund's quarterly size series from its public `pingzhongdata` bundle. The
 * file contains many series, so only the size object is read; entries with a
 * non-calendar date or a non-numeric size are dropped, never coerced to zero.
 * Exported for tests.
 */
export declare function parseCsi300FundScale(text: string): {
    date: string;
    aum: number;
}[];
/** The index provider's daily level history, used only to scale the float cap. */
export declare function parseCsi300IndexPerf(payload: any): {
    date: string;
    close: number;
}[];
/**
 * CSI 300 free-float capitalisation from the same Tencent index quote the board
 * already uses: field 44 is 流通市值 in 亿元 and field 3 is the index level.
 * Exported for tests.
 */
export declare function parseCsi300IndexQuote(fields: string[] | undefined, now: number): {
    floatCap: number;
    close: number;
    quotedAt: string | null;
};
/**
 * Joins the reported sizes and the index levels into the snapshot and the
 * quarterly trend. The trend's float capitalisation is the live figure scaled
 * by the index level at each quarter end: constituents and free-float shares
 * change over time, so the result is an estimate and is marked as such. A
 * quarter is dropped when the funds that reported it cover too little of the
 * catalogue, instead of drawing a misleading dip. Exported for tests.
 */
export declare function buildCsi300FundShare(input: {
    funds: Csi300Fund[];
    history: Map<string, {
        date: string;
        aum: number;
    }[]>;
    perf: {
        date: string;
        close: number;
    }[];
    indexClose: number;
    indexFloatCap: number;
    indexQuotedAt: string | null;
    now: number;
}): Csi300FundShare;
export declare function createTencentMarketProvider(options?: MarketProviderOptions): MarketProvider;
/** Shanghai / Shenzhen are market 1 / 0. Beijing shares the Shenzhen market id; the codes do not overlap. */
export declare function eastmoneySecId(symbol: string): string;
export declare function intradayUrl(symbol: string): string;
/**
 * One trends2 row is `time,open,close,high,low,volume,amount,average`.
 * The 分时 price is the minute close. Volume stays in lots. Exported for tests.
 */
export declare function parseTrendsPayload(payload: any, symbol: string, now: number): MarketIntraday;
/**
 * The 分时 fallback. Tencent's feed carries the same minute closes and lots as
 * East Money but only cumulative counters, so the per-minute volume is the
 * delta and the running average is the cumulative amount over the cumulative
 * lots. Both are derived from the source's own numbers; nothing is filled in.
 * Exported for tests.
 */
export declare function parseTencentIntradayPayload(payload: any, symbol: string, now: number): MarketIntraday;
export { INDEXES as MARKET_INDEXES };
