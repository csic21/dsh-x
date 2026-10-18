export declare const MARKET_ENDPOINT = "dsh-x-stock.market";
export declare const MARKET_SOURCE_NAME = "\u817E\u8BAF\u884C\u60C5 (unofficial)";
export declare const MARKET_MAX_BOARD_STOCKS = 200;
export declare const MARKET_MAX_SECTORS = 200;
export declare const MARKET_MAX_STOCKS = 12000;
export declare const MARKET_MAX_PAGES = 60;
export declare const MARKET_PAGE_SIZE = 200;
export declare const MARKET_CACHE_TTL_MS: number;
export declare const MARKET_OVERVIEW_TTL_MS = 60000;
export declare const MARKET_BOARD_TTL_MS: number;
export interface MarketIndex {
    code: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    open: number | null;
    high: number | null;
    low: number | null;
    previousClose: number | null;
    amount: number | null;
    quotedAt: string;
}
export interface MarketTopStock {
    code: string;
    name: string;
    changePercent: number;
}
export interface MarketSector {
    code: string;
    name: string;
    level: 1 | 2;
    /** Level-1 industry code for a level-2 board, null for a level-1 board. */
    parent: string | null;
    changePercent: number;
    amount: number | null;
    /** Total market capitalisation in CNY, when the source provides it. */
    marketCap: number | null;
    topStock: MarketTopStock | null;
    quotedAt: string | null;
}
export interface MarketOverview {
    source: string;
    fetchedAt: string;
    quotedAt: string | null;
    indices: MarketIndex[];
    sectors: MarketSector[];
}
export interface MarketStock {
    code: string;
    name: string;
    price: number;
    changePercent: number;
    /** Turnover in CNY. */
    amount: number;
    /** Total market capitalisation in CNY, when the source provides it. */
    marketCap: number | null;
    suspended: boolean;
}
export interface MarketBucket {
    /** Inclusive lower bound in percent; null means -infinity. */
    from: number | null;
    /** Exclusive upper bound in percent; null means +infinity. */
    to: number | null;
    count: number;
}
export interface MarketBreadth {
    source: string;
    fetchedAt: string;
    /** Expected number of A-share rows reported by the upstream first page. */
    expected: number;
    /** Number of distinct valid rows used for the counts. */
    covered: number;
    up: number;
    down: number;
    flat: number;
    suspended: number;
    /** covered / expected, clamped to 0..1. */
    coverage: number;
    partial: boolean;
    /** Total turnover in CNY for the covered rows. */
    amount: number;
    distribution: MarketBucket[];
    topGainers: MarketStock[];
    topLosers: MarketStock[];
    topAmount: MarketStock[];
}
export interface BoardDetail {
    source: string;
    fetchedAt: string;
    code: string;
    name: string;
    changePercent: number | null;
    amount: number | null;
    marketCap: number | null;
    total: number;
    truncated: boolean;
    stocks: MarketStock[];
}
export interface MarketUnconfigured {
    status: 'unconfigured';
    source: null;
}
export type MarketOverviewResult = MarketUnconfigured | {
    status: 'ready';
    overview: MarketOverview;
};
export type MarketBreadthResult = MarketUnconfigured | {
    status: 'ready';
    breadth: MarketBreadth;
};
export type MarketBoardResult = MarketUnconfigured | {
    status: 'ready';
    board: BoardDetail;
};
export type MarketResult = MarketOverviewResult | MarketBreadthResult | MarketBoardResult;
export type MarketRequest = {
    kind: 'overview';
} | {
    kind: 'breadth';
} | {
    kind: 'board';
    board: string;
};
export interface MarketProvider {
    name: string;
    overview(): Promise<MarketOverview>;
    breadth(): Promise<MarketBreadth>;
    board(code: string): Promise<BoardDetail>;
}
export declare function validateBoardCode(value: unknown): string;
export declare function stockMarketError(code: string): Error & {
    code: string;
};
export declare const MARKET_LEVEL1: readonly [{
    readonly code: '801010';
    readonly name: '农林牧渔';
}, {
    readonly code: '801030';
    readonly name: '基础化工';
}, {
    readonly code: '801040';
    readonly name: '钢铁';
}, {
    readonly code: '801050';
    readonly name: '有色金属';
}, {
    readonly code: '801080';
    readonly name: '电子';
}, {
    readonly code: '801880';
    readonly name: '汽车';
}, {
    readonly code: '801110';
    readonly name: '家用电器';
}, {
    readonly code: '801120';
    readonly name: '食品饮料';
}, {
    readonly code: '801130';
    readonly name: '纺织服饰';
}, {
    readonly code: '801140';
    readonly name: '轻工制造';
}, {
    readonly code: '801150';
    readonly name: '医药生物';
}, {
    readonly code: '801160';
    readonly name: '公用事业';
}, {
    readonly code: '801170';
    readonly name: '交通运输';
}, {
    readonly code: '801180';
    readonly name: '房地产';
}, {
    readonly code: '801200';
    readonly name: '商贸零售';
}, {
    readonly code: '801210';
    readonly name: '社会服务';
}, {
    readonly code: '801780';
    readonly name: '银行';
}, {
    readonly code: '801790';
    readonly name: '非银金融';
}, {
    readonly code: '801230';
    readonly name: '综合';
}, {
    readonly code: '801710';
    readonly name: '建筑材料';
}, {
    readonly code: '801720';
    readonly name: '建筑装饰';
}, {
    readonly code: '801730';
    readonly name: '电力设备';
}, {
    readonly code: '801890';
    readonly name: '机械设备';
}, {
    readonly code: '801740';
    readonly name: '国防军工';
}, {
    readonly code: '801750';
    readonly name: '计算机';
}, {
    readonly code: '801760';
    readonly name: '传媒';
}, {
    readonly code: '801770';
    readonly name: '通信';
}, {
    readonly code: '801950';
    readonly name: '煤炭';
}, {
    readonly code: '801960';
    readonly name: '石油石化';
}, {
    readonly code: '801970';
    readonly name: '环保';
}, {
    readonly code: '801980';
    readonly name: '美容护理';
}];
export declare const MARKET_LEVEL1_CODES: readonly string[];
export declare function level1Name(code: string): string | null;
export declare const MARKET_LEVEL2_PARENT: Readonly<Record<string, string>>;
export declare function level2Parent(name: string): string | null;
export declare function normalizeMarketCode(code: string): string | null;
export interface BreadthInput {
    up: number;
    down: number;
    flat: number;
}
export interface SentimentFactor {
    key: 'index' | 'breadth' | 'sector' | 'momentum';
    score: number;
    weight: number;
}
export interface Sentiment {
    score: number;
    label: 'extreme-fear' | 'fear' | 'neutral' | 'greed' | 'extreme-greed';
    factors: SentimentFactor[];
    partial: boolean;
}
/** A deliberately simple, auditable local score. Not an official index. */
export declare function computeSentiment(input: {
    indexChanges: number[];
    breadth?: BreadthInput | null;
    sectorChanges: number[];
}): Sentiment | null;
export type MarketPhase = 'weekend' | 'preopen' | 'auction' | 'open' | 'lunch' | 'closed';
export interface MarketClock {
    phase: MarketPhase;
    quoteToday: boolean;
    stale: boolean;
}
/**
 * Infers a session from the wall clock and the newest quote. It deliberately
 * does not claim a statutory holiday calendar: if there is no quote dated
 * today, the UI says the feed has no today snapshot rather than "trading".
 */
export declare function marketClock(now: Date, quotedAt: string | null): MarketClock;
export declare const MARKET_DISTRIBUTION: readonly {
    from: number | null;
    to: number | null;
}[];
export declare function distributionBucket(value: number): number;
export declare function parseMarketRequest(payload: unknown): MarketRequest;
