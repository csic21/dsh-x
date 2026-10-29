import type { GlobalMarketOverview } from './global.ts';
import type { TailScanResult } from './tail-scan.ts';
import type { HotScanResult } from './hot.ts';
import type { PredictScanResult } from './predict.ts';
import type { QuantScanRequest, QuantScanResult } from './quant-scan.ts';
export type { QuantScanRequest, QuantScanResult, QuantCounts, QuantRow, QuantFactors } from './quant-scan.ts';
export declare const MARKET_ENDPOINT = "dsh-x-finance.market";
export declare const MARKET_PREFERENCE_ENDPOINT = "dsh-x-finance.market-preference";
export declare const MARKET_SOURCE_NAME = "\u817E\u8BAF\u884C\u60C5 (unofficial)";
/** One batched request covers the whole fixed bottom bar. */
export declare const MARKET_MAX_QUOTES = 8;
/** Internal batch size for the market-wide scan; one URL stays far below the response cap. */
export declare const MARKET_MAX_QUOTE_BATCH = 600;
export declare const MARKET_MAX_BOARD_STOCKS = 200;
export declare const MARKET_MAX_SECTORS = 200;
export declare const MARKET_MAX_STOCKS = 12000;
export declare const MARKET_MAX_PAGES = 60;
export declare const MARKET_PAGE_SIZE = 200;
export declare const MARKET_CACHE_TTL_MS: number;
export declare const MARKET_OVERVIEW_TTL_MS = 60000;
export declare const MARKET_BOARD_TTL_MS: number;
/**
 * Hang Seng indices the same free daily host answers for. They are quote-and-
 * history symbols only: the daily bars are HKD on the Hong Kong session, and
 * they never enter the A-share watchlist, quote batch or intraday route.
 */
export declare const HK_INDEX_SYMBOLS: readonly ['HK.HSI', 'HK.HSCEI', 'HK.HSTECH', 'HK.HSCCI'];
export declare function isHkIndexSymbol(symbol: string): boolean;
/** Currency and session zone follow the symbol the history route accepted. */
export declare function historyMarket(symbol: string): {
    currency: 'CNY' | 'HKD';
    timeZone: 'Asia/Shanghai' | 'Asia/Hong_Kong';
};
/**
 * History accepts a wider symbol domain than the A-share watchlist: the four
 * Hang Seng index codes have a real daily route, but only that route. Quote,
 * intraday, tail-scan and the watchlist keep calling `validateSymbol`.
 */
export declare function validateHistorySymbol(input: unknown): string;
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
/**
 * The one index this special panel exists for. It is a fixed identity, not a
 * user preference: the drill-down opens it, and the fund-share panel is shown
 * only there.
 */
export declare const CSI300_FUND_SHARE_INDEX = "SH.000300";
/**
 * Fund categories the CSI 300 fund-share ratio counts. Feeder funds (ETF
 * 联接) are excluded because they hold the ETF and would be counted twice;
 * enhanced index funds are excluded because their active positions are not
 * passive CSI 300 exposure. Both exclusions are stated in the UI.
 */
export declare const CSI300_FUND_TYPES: readonly ['ETF', 'LOF', '指数基金'];
export type Csi300FundType = (typeof CSI300_FUND_TYPES)[number];
/** One fund tracking CSI 300, with the size the index provider reports. */
export interface Csi300Fund {
    code: string;
    name: string;
    type: Csi300FundType;
    /** Latest reported fund size in CNY. */
    aum: number;
}
/**
 * One quarter of the ratio. The fund total is the sum of the current fund
 * catalogue's quarterly reports; the float capitalisation is scaled from the
 * index level and is therefore an estimate, never a reported figure.
 */
export interface Csi300FundSharePoint {
    date: string;
    fundAum: number;
    floatCap: number;
    ratio: number;
}
/**
 * The special CSI 300 fund-share snapshot plus its quarterly trend. Every
 * number is either reported by the index provider / fund reports or explicitly
 * labelled as estimated; nothing is filled in when a source is missing.
 */
export interface Csi300FundShare {
    source: string;
    fetchedAt: string;
    /** Latest quarter present in the fund reports, null when no report parsed. */
    reportDate: string | null;
    /** CSI 300 free-float capitalisation in CNY from the live index quote. */
    indexFloatCap: number;
    /** The index level the live float capitalisation belongs to. */
    indexClose: number;
    /** Quote time of the live index snapshot, null when the source omitted it. */
    indexQuotedAt: string | null;
    totalAum: number;
    /** totalAum / indexFloatCap, clamped to a usable 0..1. */
    ratio: number;
    fundCount: number;
    /** Funds sorted by size, largest first. */
    funds: Csi300Fund[];
    history: Csi300FundSharePoint[];
    /** Share of totalAum covered by funds that reported the latest quarter. */
    historyCoverage: number;
    /** True because history's float capitalisation is level-scaled, not reported. */
    estimatedFloatCap: true;
}
/**
 * One watchlist/stock-page quote. `status` is part of the contract: a symbol
 * the source does not answer for is reported as `unavailable` with null
 * numbers, never as a zero or a previous close.
 */
export interface MarketQuote {
    symbol: string;
    status: 'available' | 'unavailable';
    name: string;
    price: number | null;
    /**
     * Decimal places the source actually quoted, not a fixed 2. A fund or bond
     * ETF may quote 3–4 decimals, and rounding it to 2 would change the price
     * the user sees. Null means the source did not state a usable width.
     */
    pricePrecision: number | null;
    changePercent: number | null;
    quotedAt: string | null;
    fetchedAt: string | null;
    marketStatus: 'closed' | 'unknown';
}
/**
 * One historical daily bar projected to the browser. `volume` is in shares and
 * `amount` in CNY only when the source's declared unit was verified; both stay
 * null rather than being guessed. `isFinal` is false only for the newest bar of
 * a still-running session. No indicator, adjusted close or missing bar is
 * invented here.
 */
export interface MarketDailyBar {
    sessionDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
    amount: number | null;
    isFinal: boolean;
}
export interface MarketHistory {
    symbol: string;
    name: string;
    source: string;
    fetchedAt: string;
    /** `none` when the source returned unadjusted prices. */
    adjustment: 'none' | 'forward' | 'backward';
    adjustmentLabel: string;
    pricePrecision: number;
    volumeUnit: 'shares';
    /**
     * How the source's volume unit was established for this response. `unknown`
     * means turnover was missing or ambiguous, so every bar's volume is null;
     * `reported` means an index row whose volume is the source's own aggregate,
     * which is not a share count and is labelled as such.
     */
    volumeBasis: 'shares' | 'lots' | 'unknown' | 'reported';
    /**
     * The history route also answers four Hang Seng indices. Their bars are
     * quoted in HKD on the Hong Kong session, so the currency and zone follow the
     * symbol instead of being fixed at the A-share pair.
     */
    amountUnit: 'CNY' | 'HKD';
    currency: 'CNY' | 'HKD';
    exchangeTimezone: 'Asia/Shanghai' | 'Asia/Hong_Kong';
    /** First and last session dates actually returned. */
    firstSessionDate: string;
    lastSessionDate: string;
    bars: MarketDailyBar[];
}
/** One minute of the current A-share session. Volume stays in the source's lots. */
export interface MarketIntradayPoint {
    time: string;
    price: number;
    volume: number | null;
    average: number | null;
}
export interface MarketIntraday {
    symbol: string;
    name: string;
    source: string;
    fetchedAt: string;
    sessionDate: string;
    previousClose: number | null;
    pricePrecision: number;
    /** The minute endpoint reports lots (手) and has no turnover to prove otherwise. */
    volumeBasis: 'lots';
    currency: 'CNY';
    exchangeTimezone: 'Asia/Shanghai';
    /** False while Shanghai time is still inside the session this series belongs to. */
    closed: boolean;
    points: MarketIntradayPoint[];
}
/** Auction through the morning close, then the afternoon session. Lunch is excluded. */
export declare function isAshareMinute(time: string): boolean;
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
export type MarketQuotesResult = MarketUnconfigured | {
    status: 'ready';
    source: string;
    quotes: MarketQuote[];
};
export type MarketHistoryResult = MarketUnconfigured | {
    status: 'ready';
    history: MarketHistory;
};
export type MarketGlobalResult = MarketUnconfigured | {
    status: 'ready';
    global: GlobalMarketOverview;
};
export type MarketTailScanResult = MarketUnconfigured | {
    status: 'ready';
    tailScan: TailScanResult;
};
export type MarketCsi300FundsResult = MarketUnconfigured | {
    status: 'ready';
    csi300Funds: Csi300FundShare;
};
export type MarketPredictScanResult = MarketUnconfigured | {
    status: 'ready';
    predictScan: PredictScanResult;
};
export type MarketQuantScanResult = MarketUnconfigured | {
    status: 'ready';
    quantScan: QuantScanResult | null;
};
export type MarketResult = MarketOverviewResult | MarketBreadthResult | MarketBoardResult | MarketQuotesResult | MarketHistoryResult | MarketGlobalResult | MarketTailScanResult | MarketCsi300FundsResult | MarketPredictScanResult | MarketQuantScanResult;
export type MarketRequest = {
    kind: 'overview';
} | {
    kind: 'breadth';
} | {
    kind: 'board';
    board: string;
} | {
    kind: 'quotes';
    symbols: string[];
} | {
    kind: 'history';
    symbol: string;
    adjustment: 'none' | 'forward' | 'backward';
    limit: number;
} | {
    kind: 'intraday';
    symbol: string;
} | {
    kind: 'global';
} | {
    kind: 'tail-scan';
    window?: TailScanWindow;
} | {
    kind: 'hot-scan';
    board?: string;
} | {
    kind: 'csi300-funds';
} | {
    kind: 'predict-scan';
    board?: string;
} | ({
    kind: 'quant-scan';
} & QuantScanRequest);
/**
 * Session tails the scan can describe: the last 30 minutes of the morning break
 * and of the close. One result describes exactly one of them, and `afternoon` is
 * what a client that sends no window has always asked for.
 */
export declare const TAIL_SCAN_WINDOWS: readonly ['morning', 'afternoon'];
export type TailScanWindow = (typeof TAIL_SCAN_WINDOWS)[number];
export declare const TAIL_SCAN_DEFAULT_WINDOW: TailScanWindow;
export declare function validateTailScanWindow(value: unknown): TailScanWindow;
/** Daily bars requested by one history call. Bounded for response size. */
export declare const MARKET_HISTORY_DEFAULT_LIMIT = 250;
export declare const MARKET_HISTORY_MAX_LIMIT = 1000;
export declare const MARKET_HISTORY_ADJUSTMENTS: readonly ['none', 'forward', 'backward'];
export type MarketAdjustment = (typeof MARKET_HISTORY_ADJUSTMENTS)[number];
export declare function validateHistoryLimit(value: unknown): number;
export declare function validateAdjustment(value: unknown): MarketAdjustment;
export interface MarketPreference {
    enabled: boolean;
    forced: boolean;
}
export type MarketPreferenceRequest = {
    action: 'get';
} | {
    action: 'set';
    enabled: boolean;
};
export interface MarketProvider {
    name: string;
    overview(): Promise<MarketOverview>;
    breadth(): Promise<MarketBreadth>;
    board(code: string): Promise<BoardDetail>;
    /** Unpaged current quotes for at most MARKET_MAX_QUOTES A-share symbols. */
    quotes(symbols: string[]): Promise<MarketQuote[]>;
    /**
     * Daily OHLCV history for one A-share or index; never synthesized. Optional:
     * a replacement adapter without daily bars leaves the chart unconfigured
     * instead of failing the whole source.
     */
    history?(symbol: string, options: {
        adjustment: MarketAdjustment;
        limit: number;
    }): Promise<MarketHistory>;
    /** Today's minute line for one symbol. Optional, and never synthesized from daily bars. */
    intraday?(symbol: string): Promise<MarketIntraday>;
    /**
     * Global index board. Optional and independent from A-share breadth: an
     * adapter that only covers A shares leaves the global tab unavailable
     * instead of failing the whole source.
     */
    globalOverview?(): Promise<GlobalMarketOverview>;
    /**
     * Market-wide session-tail volume-dump scan for one window. Optional: an
     * adapter without minute data leaves this panel unavailable instead of failing
     * the board.
     */
    tailScan?(options?: {
        window?: TailScanWindow;
    }): Promise<TailScanResult>;
    /**
     * Market-wide hot-topic screen. Optional and independent from the breadth
     * board: the snapshot layer is cheap, the history layer is bounded and the
     * result states how many symbols received it.
     */
    hotScan?(options: {
        board?: string;
    }): Promise<HotScanResult>;
    /**
     * The CSI 300 fund-share ratio (fund size over index free-float market cap)
     * plus its quarterly trend. Optional and independent from the board: an
     * adapter without it leaves only this special panel unavailable.
     */
    csi300Funds?(): Promise<Csi300FundShare>;
    /**
     * Limit-up relay probabilities. Optional and independent from the hot screen:
     * a source that cannot serve daily bars leaves this panel unavailable without
     * breaking the market board.
     */
    predictScan?(options: {
        board?: string;
    }): Promise<PredictScanResult>;
    /** Manual, bounded daily scan; status never starts work. No watchlist access. */
    quantScan?(request: QuantScanRequest, signal?: AbortSignal): Promise<QuantScanResult | null>;
}
export declare function validateBoardCode(value: unknown): string;
export declare function stockMarketError(code: string): Error & {
    code: string;
};
/**
 * Decimal places exactly as the source quoted the price. The raw string is the
 * authority: an ETF quoted at `4.027` or `4.0240` keeps that width, and the UI
 * never rounds it to two decimals. Returns null for a non-numeric field or a
 * width beyond six places, so the caller can fall back instead of guessing.
 */
export declare function quotePrecision(raw: unknown): number | null;
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
/** Calendar date (yyyy-mm-dd) of an instant in one exchange zone, independent of the browser zone. */
export declare function zoneToday(now: number, timeZone: string): string;
/** Shanghai calendar date (yyyy-mm-dd) for an instant, independent of the browser zone. */
export declare function shanghaiToday(now: number): string;
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
export declare function parseMarketPreferenceRequest(payload: unknown): MarketPreferenceRequest;
export declare function parseMarketRequest(payload: unknown): MarketRequest;
