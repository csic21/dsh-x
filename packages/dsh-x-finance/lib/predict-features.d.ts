export interface PredictBar {
    sessionDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
}
/**
 * Same-session breadth of the whole market. Offline it is measured over the
 * research sample, live over the full ranking snapshot; both estimate the same
 * population share, and the definition below is identical in both places.
 */
export interface PredictCrossSection {
    /** Percent of stocks that closed up. */
    upShare: number;
    /** Percent of stocks that closed at least `HOT_CHANGE` percent up. */
    hotShare: number;
    /** Median percent change across the cross-section. */
    medianChange: number;
}
/**
 * Market-level features are turned into percentile ranks against these knots
 * before they reach the model. A raw share is not stationary: the policy rally
 * of 2024-09-30 put 64% of the market above +9%, and a linear term fitted on
 * that single session would otherwise dominate every later prediction. A rank
 * keeps the ordering, bounds the input and makes the number readable as
 * "today's heat sits at the 87th percentile of the research sample".
 */
export interface PredictTransform {
    upShare: number[];
    hotShare: number[];
    medianChange: number[];
}
/** Twenty-one knots, one per 5th percentile, over `values`. */
export declare function predictKnots(values: readonly number[]): number[];
/** Percentile rank (0–100) of `value` against sorted `knots`. */
export declare function percentileRank(knots: readonly number[], value: number): number;
/** A stock this far below its price limit still counts as "attacking the limit". */
export declare const PREDICT_POPULATION_GAP = 1.5;
/** The fixed cross-section threshold behind `hotShare`, board-independent on purpose. */
export declare const HOT_CHANGE = 9;
export declare const PREDICT_FEATURE_NAMES: readonly ['streak', 'limitUp', 'distLimit', 'ret1', 'ret5', 'ret20', 'gap', 'amplitude', 'closePos', 'volRatio5', 'amtRatio20', 'ma5Dist', 'ma20Dist', 'burst5', 'limitCount20', 'fromHigh20', 'oneWord', 'upShare', 'hotShare', 'medianChange', 'streakHot'];
export type PredictFeatureName = (typeof PREDICT_FEATURE_NAMES)[number];
export type PredictVector = Record<PredictFeatureName, number>;
/** Shortest series the features need: 20 bars for the windows plus today. */
export declare const PREDICT_MIN_BARS = 30;
/**
 * The price limit in percent for a symbol on a normal session, or null when the
 * board has no dependable limit (new listing, delisting). ST names are not part
 * of the research population; the 5% case is still resolved so a caller cannot
 * silently label an ST limit-up as a 10% one.
 */
export declare function boardLimitRate(symbol: string, name?: string): number | null;
/**
 * True when a session closed on its price limit. A limit close is both "up by
 * the limit" and "at the session high": the limit is the highest price the
 * board allows, so a day that touched the limit and fell back is explicitly not
 * a limit close. The tolerance absorbs the rounding of a forward-adjusted
 * series without accepting a 9.6% close as a 10% limit.
 */
export declare function isLimitClose(bars: readonly PredictBar[], index: number, rate: number): boolean;
/** Consecutive limit closes ending at the last bar. */
export declare function predictLimitStreak(bars: readonly PredictBar[], rate: number, cap?: number): number;
/**
 * The research population excludes special treatment names and brand-new
 * listings: their limits are 5% or undefined, so a model trained on 10/20/30
 * percent boards would be reading a different event. The screen applies the
 * same filter, so a name is only scored when it belongs to the trained set.
 */
export declare function isPredictUniverse(name: string): boolean;
/** True when today's session is hot enough to be part of the trained population. */
export declare function isPredictCandidate(changePercent: number, rate: number | null): boolean;
/**
 * Computes the feature vector for the last bar of `bars`, or null when the
 * series is too short, has a zero/absent volume inside a window, or carries a
 * non-finite price. A null result is reported as "insufficient history" and is
 * never filled with a neutral value.
 */
export declare function predictFeatures(bars: readonly PredictBar[], rate: number, cross: PredictCrossSection, transform: PredictTransform): PredictVector | null;
