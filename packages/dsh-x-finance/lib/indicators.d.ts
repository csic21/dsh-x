export interface IndicatorBar {
    sessionDate: string;
    close: number | null;
    high?: number | null;
    low?: number | null;
}
export interface MacdParams {
    fast: number;
    slow: number;
    signal: number;
    histScale: number;
}
export interface KdjParams {
    n: number;
    k: number;
    d: number;
}
export interface IndicatorConfig {
    maPeriods: number[];
    macd: MacdParams;
    kdj: KdjParams;
    historyAnchor: string | null;
}
export interface IndicatorRow {
    sessionDate: string;
    ma: Record<number, number | null>;
    dif: number | null;
    dea: number | null;
    histRaw: number | null;
    hist: number | null;
    k: number | null;
    d: number | null;
    j: number | null;
}
export declare const INDICATOR_ALGORITHM_VERSION = "dsh-independent-sma-ema-v1";
export declare const MAX_INDICATOR_PERIOD = 500;
/**
 * Periods the chart offers: the short trio plus the long-term 季线/年线. The
 * engine already accepts any period up to MAX_INDICATOR_PERIOD, so this list
 * only decides what the chart asks for. DEFAULT_MA_PERIODS stays the smaller
 * default for callers that never opt in to the long lines.
 */
export declare const CHART_MA_PERIODS: readonly number[];
export declare const DEFAULT_MA_PERIODS: readonly number[];
export declare const DEFAULT_MACD: Readonly<{
    fast: 12;
    slow: 26;
    signal: 9;
    histScale: 2;
}>;
export declare const DEFAULT_KDJ: Readonly<{
    n: 9;
    k: 3;
    d: 3;
}>;
export declare function validateMacdParams(raw?: unknown): MacdParams;
/** Tongdaxin-style KDJ: RSV over N bars, then K and D smooth toward 50. J = 3K − 2D. */
export declare function validateKdjParams(raw?: unknown): KdjParams;
export declare function kdj(bars: unknown, input?: unknown): {
    params: KdjParams;
    rsv: (number | null)[];
    k: (number | null)[];
    d: (number | null)[];
    j: (number | null)[];
};
export declare function validateIndicatorConfig(raw?: unknown): IndicatorConfig;
/** Null breaks continuity; a complete fresh consecutive window is then required. */
export declare function sma(values: unknown, size: unknown): (number | null)[];
/** Independent SMA seed at period-1, alpha=2/(period+1); null resets the seed. */
export declare function ema(values: unknown, size: unknown): (number | null)[];
/** DIF is exactly independent fast EMA minus independent slow EMA, not TA-Lib's aligned seed. */
export declare function macd(values: unknown, input?: unknown): {
    params: MacdParams;
    fastEma: (number | null)[];
    slowEma: (number | null)[];
    dif: (number | null)[];
    dea: (number | null)[];
    histRaw: (number | null)[];
    hist: (number | null)[];
};
/**
 * Full-history result with dates and nullable rows for accessible tables. The
 * anchor must equal the first provided sample; we never claim to know an earlier
 * EMA state. Appending/revising preserves the anchor; explicitly prepending
 * history establishes a new earlier anchor and recomputes the complete series.
 */
export declare function computeIndicators(bars: unknown, input?: unknown): {
    spec: {
        algorithmVersion: string;
        seedPolicy: string;
        missingPolicy: string;
        input: string;
        historyAnchor: string;
        maPeriods: number[];
        macd: MacdParams;
        kdj: KdjParams;
        kdjSeed: string;
    };
    times: any[];
    ma: {
        [k: string]: (number | null)[];
    };
    macd: {
        params: MacdParams;
        fastEma: (number | null)[];
        slowEma: (number | null)[];
        dif: (number | null)[];
        dea: (number | null)[];
        histRaw: (number | null)[];
        hist: (number | null)[];
    };
    kdj: {
        params: KdjParams;
        rsv: (number | null)[];
        k: (number | null)[];
        d: (number | null)[];
        j: (number | null)[];
    };
    rows: IndicatorRow[];
    warmup: {
        macdBars: number;
        kdjBars: number;
        availableBars: number;
        complete: boolean;
    };
};
/**
 * Bounded in-memory update facade. Recompute from the immutable history anchor
 * rather than feeding repeated last-bar ticks back into a recursive EMA state.
 * With <=5,000 local bars this deliberately favors correctness over checkpoint
 * complexity. No renderer/viewport state enters this engine.
 *
 * update(bar): replace the same last date, or append a later date.
 * revise(bar): replace an existing historical date (never a silent insertion).
 * prepend(bars): require strictly earlier history, then reset the anchor.
 * replace(bars, config?): explicit dataset/adjustment revision or full reset.
 * All changes are transactional: invalid data leaves the previous result intact.
 */
export declare function createIndicatorEngine(initialBars?: any[], initialConfig?: any): Readonly<{
    snapshot: () => {
        bars: any;
        indicators: any;
        historyAnchor: string | null;
        revision: number;
    };
    update(bar: any): {
        bars: any;
        indicators: any;
        historyAnchor: string | null;
        revision: number;
    };
    revise(bar: any): {
        bars: any;
        indicators: any;
        historyAnchor: string | null;
        revision: number;
    };
    prepend(earlierBars: any): {
        bars: any;
        indicators: any;
        historyAnchor: string | null;
        revision: number;
    };
    replace(nextBars: any, nextConfig?: IndicatorConfig): {
        bars: any;
        indicators: any;
        historyAnchor: string | null;
        revision: number;
    };
    configure(nextConfig: any): {
        bars: any;
        indicators: any;
        historyAnchor: string | null;
        revision: number;
    };
}>;
