import type { QuantStats } from './analytics.ts';
import type { MarketAdjustment } from './market.ts';
/** How long one scan result may be reused by the Host. */
export declare const TAIL_SCAN_TTL_MS = 90000;
/** Candidate minute lines fetched after the daily pre-screen. */
export declare const TAIL_SCAN_MAX_INTRADAY = 32;
/** Daily histories fetched for tail-confirmed candidates. */
export declare const TAIL_SCAN_MAX_HISTORY = 16;
/** Candidates returned to the browser. */
export declare const TAIL_SCAN_MAX_RESULTS = 20;
/** Minimum turnover for a stock to enter the scan (CNY). */
export declare const TAIL_SCAN_MIN_AMOUNT = 30000000;
/** Daily change must be at least this negative (percent). */
export declare const TAIL_SCAN_MIN_DAY_CHANGE = -0.5;
/** Daily volume ratio (Tencent field 49) must reach this value. */
export declare const TAIL_SCAN_MIN_VOLUME_RATIO = 1;
/** Tail volume / median prior 30-minute block. */
export declare const TAIL_SCAN_MIN_TAIL_RATIO = 1.3;
/** Tail return must be at least this negative (ratio). */
export declare const TAIL_SCAN_MIN_TAIL_CHANGE = -0.003;
/** A down day counts as volume expansion above this multiple of the prior 5-day mean. */
export declare const TAIL_SCAN_VOLUME_EXPANSION = 1.2;
/** Consecutive sessions needed for the "continuous" badge. */
export declare const TAIL_SCAN_MIN_STREAK = 2;
export declare const TAIL_SCAN_TAIL_START = "14:30";
export declare const TAIL_SCAN_TAIL_END = "15:00";
/** The thresholds are returned with the result so the UI never invents them. */
export interface TailScanFilters {
    minAmount: number;
    minDayChange: number;
    minVolumeRatio: number;
    minTailRatio: number;
    minTailChange: number;
    volumeExpansionMultiple: number;
    minStreak: number;
}
export declare const TAIL_SCAN_FILTERS: TailScanFilters;
/** One per-minute point. Volume is a delta for that minute, not a cumulative count. */
export interface TailMinutePoint {
    time: string;
    price: number;
    volume: number | null;
    amount?: number | null;
}
export interface TailMetrics {
    sessionDate: string;
    complete: boolean;
    tailStart: string;
    tailEnd: string;
    /** Last price / price at 14:30 - 1. */
    tailReturn: number | null;
    tailVolume: number | null;
    /** Median volume of the complete 30-minute blocks before the tail. */
    baselineVolume: number | null;
    tailVolumeRatio: number | null;
    tailVolumeShare: number | null;
    /** Last price / previous close - 1; null when the previous close is unknown. */
    dayReturn: number | null;
    points: number;
    blocks: number;
}
export interface TailDailyBar {
    sessionDate: string;
    close: number;
    volume: number | null;
    isFinal?: boolean;
}
export interface TailDailyContext {
    sessionDate: string;
    /** Today's volume / mean volume of the previous five sessions. */
    volumeRatio5: number | null;
    /** Today's volume / mean volume of the previous twenty sessions. */
    volumeRatio20: number | null;
    /** Consecutive sessions whose close is below the previous close, ending today. */
    downStreak: number;
    /**
     * Consecutive down sessions where each session's volume is above the
     * previous session's volume. This is the strict "increasing volume on the
     * way down" reading.
     */
    volumeExpansionDownStreak: number;
    /**
     * Consecutive down sessions where volume is at least
     * TAIL_SCAN_VOLUME_EXPANSION times the previous five-day mean.
     */
    volumeDeclineStreak: number;
    /** Down >= 2% sessions with volume expansion in the last twenty sessions. */
    distributionDays20: number;
    downDays5: number;
    downDays10: number;
    todayReturn: number | null;
    prior5AvgVolume: number | null;
    /** False when today's daily bar is still moving. */
    isFinal: boolean;
    samples: number;
}
/** The subset of the daily quant engine that is useful on a scan row. */
export interface TailQuantContext {
    samples: number;
    from: string | null;
    to: string | null;
    totalReturn: number | null;
    annualVolatility: number | null;
    maxDrawdown: number | null;
    sharpe: number | null;
    rsi14: number | null;
    atr14: number | null;
    ma20: number | null;
    ma60: number | null;
    priceVsMa20: number | null;
    priceVsMa60: number | null;
    momentum20: number | null;
    momentum60: number | null;
    high52w: number | null;
    low52w: number | null;
    drawdownFromHigh: number | null;
}
export type TailScanFactorKey = 'tail-volume' | 'tail-drop' | 'day-drop' | 'daily-volume' | 'streak';
export interface TailScanFactor {
    key: TailScanFactorKey;
    points: number;
    max: number;
}
export interface TailScanFlags {
    /** Tail volume ratio and tail return both clear their thresholds. */
    tailDump: boolean;
    /** Today's volume is expanded, or the strict consecutive reading is met. */
    volumeExpansion: boolean;
    /** At least TAIL_SCAN_MIN_STREAK consecutive volume-expansion down sessions. */
    consecutive: boolean;
}
export interface TailScanCandidate {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
    /** Turnover in CNY. */
    amount: number;
    turnoverPercent: number | null;
    /** Tencent's daily volume ratio (量比), not the tail ratio. */
    volumeRatio: number | null;
    /** Five-minute change reported by the quote source, when present. */
    fiveMinuteChange: number | null;
    sessionDate: string;
    tail: TailMetrics;
    daily: TailDailyContext | null;
    quant: TailQuantContext | null;
    historyAvailable: boolean;
    adjustment: MarketAdjustment | null;
    /** Local, explainable score in 0..100. Not an expected return. */
    score: number;
    factors: TailScanFactor[];
    flags: TailScanFlags;
}
export interface TailScanUniverse {
    expected: number;
    covered: number;
    screened: number;
    intradayChecked: number;
    tailConfirmed: number;
    historyChecked: number;
    failedIntraday: number;
    failedHistory: number;
    partial: boolean;
}
export interface TailScanResult {
    source: string;
    fetchedAt: string;
    sessionDate: string | null;
    /** False on a weekend or holiday, so the UI says "latest session". */
    sessionIsToday: boolean;
    /** False when the 14:30–15:00 window is not complete. */
    complete: boolean;
    universe: TailScanUniverse;
    filters: TailScanFilters;
    candidates: TailScanCandidate[];
}
/**
 * Computes the late-session metrics for one completed (or in-progress) minute
 * line. The tail is `(14:30, 15:00]`, so the 14:30 print is the reference price
 * and its volume belongs to the minute before the tail. The baseline is the
 * median of complete 30-minute blocks from 10:00 to 14:30; the opening half
 * hour is excluded because the opening auction distorts the first block.
 */
export declare function computeTailMetrics(input: TailMinutePoint[], options: {
    sessionDate: string;
    previousClose?: number | null;
}): TailMetrics;
/**
 * Daily context for the same session. A missing volume on any comparison bar
 * makes that ratio null; no volume is inferred from turnover or price.
 */
export declare function computeDailyVolumeContext(input: unknown, sessionDate: string): TailDailyContext;
export declare function tailQuantSnapshot(stats: QuantStats): TailQuantContext;
export declare function tailQuantFromBars(bars: unknown): TailQuantContext;
/**
 * Explainable 0..100 score. The weights sum to 100:
 * tail volume 30, tail drop 25, day drop 15, daily volume 15, streak 15.
 * A missing component contributes zero, never a substitute value.
 */
export declare function scoreTailCandidate(input: {
    tailReturn: number | null;
    tailVolumeRatio: number | null;
    changePercent: number;
    daily: TailDailyContext | null;
}): {
    score: number;
    factors: TailScanFactor[];
    flags: TailScanFlags;
};
/**
 * Trust boundary for a provider-supplied scan. Required fields are re-checked,
 * optional contexts are kept only in their declared shape, and the score and
 * flags are recomputed from the metrics instead of trusting the adapter.
 */
export declare function projectTailScan(raw: unknown, now: number): TailScanResult;
/** Exported for tests; the provider uses the same scale. */
export declare function tailBlockCount(): number;
