import type { MarketQuote, MarketStock, MarketTopStock, MarketProvider } from './market.ts';
export declare const MARKET_QUOTE_ENDPOINT = "https://qt.gtimg.cn/q=";
export declare const MARKET_BOARD_RANK_ENDPOINT = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/mktHs/rank";
export declare const MARKET_STOCK_RANK_ENDPOINT = "https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList";
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
export declare function createTencentMarketProvider(options?: MarketProviderOptions): MarketProvider;
export { INDEXES as MARKET_INDEXES };
