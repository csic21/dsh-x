import type { MarketAdjustment, MarketHistory, MarketQuote, MarketStock, MarketTopStock, MarketProvider, MarketIntraday } from './market.ts';
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
export declare const MARKET_INTRADAY_TTL_MS = 15000;
export declare const MARKET_INTRADAY_MAX_POINTS = 300;
export declare const MARKET_TIMEOUT_MS = 10000;
export declare const MARKET_MAX_BYTES: number;
export declare const MARKET_TOP_LIMIT = 8;
declare const INDEXES: readonly [{
    readonly quote: 'sh000001';
    readonly code: 'SH.000001';
}, {
    readonly quote: 'sz399001';
    readonly code: 'SZ.399001';
}, {
    readonly quote: 'sz399006';
    readonly code: 'SZ.399006';
}, {
    readonly quote: 'sh000300';
    readonly code: 'SH.000300';
}, {
    readonly quote: 'sh000688';
    readonly code: 'SH.000688';
}, {
    readonly quote: 'bj899050';
    readonly code: 'BJ.899050';
}];
export interface MarketProviderOptions {
    fetchImpl?: typeof fetch;
    now?: () => number;
    timeoutMs?: number;
    overviewTtlMs?: number;
    breadthTtlMs?: number;
    boardTtlMs?: number;
    retryDelayMs?: number;
    concurrency?: number;
}
/**
 * The upstream stamp is `yyyyMMddHHmmss` in exchange time (China Standard
 * Time, UTC+08:00, no DST). Invalid, impossible or future stamps are rejected
 * instead of being silently clamped. Exported for tests.
 */
export declare function parseTencentTimestamp(raw: unknown, now: number): string;
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
/** Parses one `getBoardRankList` page. Exported for tests. */
export declare function parseStockRankPage(payload: any): StockRankPage;
/** Parses one `v_sh600519="..."` stock line into the projected quote. */
export declare function parseStockQuote(key: string, fields: string[], now: number): MarketQuote;
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
export declare function createTencentMarketProvider(options?: MarketProviderOptions): MarketProvider;
/** Shanghai / Shenzhen are market 1 / 0. Beijing shares the Shenzhen market id; the codes do not overlap. */
export declare function eastmoneySecId(symbol: string): string;
export declare function intradayUrl(symbol: string): string;
/**
 * One trends2 row is `time,open,close,high,low,volume,amount,average`.
 * The 分时 price is the minute close. Volume stays in lots. Exported for tests.
 */
export declare function parseTrendsPayload(payload: any, symbol: string, now: number): MarketIntraday;
export { INDEXES as MARKET_INDEXES };
