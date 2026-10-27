import type { PredictCrossSection, PredictTransform, PredictVector } from './predict-features.ts';
export interface PredictBaseBucket {
    key: string;
    from: number;
    to: number | null;
    /** Labelled sessions in this bucket. */
    n: number;
    /** Percent that closed limit-up on the next session. */
    pLimitUp: number;
    /** Mean next open gap in percent. */
    gapNext: number;
    /** Mean return from next open to the session after that, in percent. */
    tradeReturn: number;
    /** Percent of those trades that ended positive. */
    winRate: number;
    medianTradeReturn: number;
}
export interface PredictCalibrationBin {
    bin: number;
    n: number;
    /** Mean predicted probability in this bin, percent. */
    predicted: number;
    /** Realised promotion rate in this bin, percent. */
    actual: number;
}
/** One out-of-sample slice: by sentiment regime or by modelled probability. */
export interface PredictGroup {
    key: string;
    n: number;
    /** Realised promotion rate in this slice, percent. */
    pLimitUp: number;
    /** Mean next-open-to-following-close return, percent. */
    tradeReturn: number;
    winRate: number;
}
export interface PredictBacktest {
    k: number;
    days: number;
    trades: number;
    winRate: number;
    /** Mean net return per trade after the modelled round trip cost, percent. */
    avgNet: number;
    /** Compounded return over the out-of-sample window, percent. */
    total: number;
    maxDrawdown: number;
}
export interface PredictModel {
    version: number;
    /** Last labelled session the shipped coefficients were fitted on. */
    trainedThrough: string;
    /** Round-trip cost subtracted from the expected return, percent. */
    costPercent: number;
    sample: {
        stocks: number;
        rows: number;
        from: string;
        to: string;
        days: number;
    };
    features: string[];
    /** Per-feature training mean, in the feature's own unit. */
    mean: number[];
    /** Per-feature training standard deviation, never zero. */
    scale: number[];
    limitUp: {
        intercept: number;
        coef: number[];
    };
    metrics: {
        /** Strictly out-of-sample window: monthly refits, never trained on it. */
        holdout: {
            from: string;
            to: string;
            rows: number;
            days: number;
        };
        auc: number;
        brier: number;
        /** Unconditional promotion rate in the holdout, percent. */
        baseRate: number;
        /** Mean within-session rank correlation between score and realised return. */
        /** Within-session rank correlation between the residual score and the realised return. */
        ic: number;
        calibration: PredictCalibrationBin[];
        /**
         * Equal-weight top-k of the residual score, bought at the next open and
         * sold at the following close, net of `costPercent`. This is the number
         * that decides whether the screen is a signal or just a description.
         */
        top: PredictBacktest[];
        byRegime: PredictGroup[];
        /** Buyable rows only, so a sealed board cannot flatter the bucket. */
        byProbability: PredictGroup[];
    };
    baseRates: {
        streak: PredictBaseBucket[];
        sentiment: PredictBaseBucket[];
        position: PredictBaseBucket[];
    };
    /** Frozen knots that turn the raw market cross-section into percentile ranks. */
    transform: PredictTransform;
}
/** Percentile boundaries behind the cold / normal / hot label. */
export declare const REGIME_COLD_MAX = 33;
export declare const REGIME_HOT_MIN = 67;
/** Rows returned to the browser. */
export declare const PREDICT_MAX_ROWS = 60;
/** Snapshot candidates that also receive daily bars. */
export declare const PREDICT_MAX_CANDIDATES = 90;
/** Daily bars requested per candidate; features need 30. */
export declare const PREDICT_BARS = 80;
/** A finished scan may be reused for this long. */
export declare const PREDICT_TTL_MS = 120000;
/** Bound on one projection, so a hostile adapter cannot flood the client. */
export declare const PREDICT_MAX_DURATION_MS = 600000;
export type PredictRegimeLevel = 'cold' | 'normal' | 'hot';
export interface PredictRow {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
    /** The board's price limit for this session, percent. */
    limitRate: number;
    /** Consecutive limit closes ending today, 0 when today is not a limit close. */
    streak: number;
    /** Modelled probability that the next session closes limit-up, 0–1. */
    pLimitUp: number;
    /** Historical promotion rate of this row's streak bucket, percent. */
    basePLimitUp: number;
    /** `pLimitUp` minus the bucket rate, in percentage points. */
    edge: number;
    baseTradeReturn: number;
    baseWinRate: number;
    baseN: number;
    /** True when today's session was one price: a sealed board, hard to buy at the open. */
    oneWord: boolean;
    /** Stock-level feature ids that pushed the probability up, strongest first. */
    reasons: string[];
    /** Descriptive flags; never a recommendation. */
    risks: string[];
}
export interface PredictScanResult {
    source: string;
    fetchedAt: string;
    /** Session the features were measured on. */
    sessionDate: string;
    /** False while the newest bar is still forming, i.e. during the session. */
    barFinal: boolean;
    durationMs: number;
    /** Present when the scan was limited to one industry board. */
    board: {
        code: string;
        name: string;
    } | null;
    model: {
        version: number;
        trainedThrough: string;
        costPercent: number;
        /** Days between `trainedThrough` and `sessionDate`; the model ages. */
        staleDays: number;
        sample: PredictModel['sample'];
        metrics: PredictModel['metrics'];
    };
    regime: {
        /** Raw percent of the market that closed up. */
        upShare: number;
        /** Raw percent of the market that closed at least 9% up. */
        hotShare: number;
        /** Raw median percent change. */
        medianChange: number;
        /** Percentile of `hotShare` against the research sample, 0–100. */
        rank: number;
        level: PredictRegimeLevel;
        /** Historical bucket this rank falls into, if any. */
        base: PredictBaseBucket | null;
    };
    universe: {
        expected: number;
        covered: number;
        /** Stocks hot enough for the trained population. */
        candidates: number;
        /** Candidates that produced a feature vector and a score. */
        scored: number;
        failed: number;
        partial: boolean;
    };
    baseRates: PredictModel['baseRates'];
    rows: PredictRow[];
}
/**
 * Applies the shipped coefficients to one feature vector. The output is a
 * probability of the next session closing limit-up; the model predicts no
 * return, because the measured out-of-sample rank correlation for returns is
 * negative and a point estimate would be false precision.
 */
export declare function predictProbability(vector: PredictVector): number;
/** Strongest stock-level contributors to the promotion probability. */
export declare function predictReasons(vector: PredictVector): {
    reasons: string[];
    risks: string[];
};
export declare function baseBucketFor(table: readonly PredictBaseBucket[], value: number): PredictBaseBucket | null;
/** A raw cross-section plus its percentile against the research sample. */
export interface RegimeReading {
    rank: number;
    level: PredictRegimeLevel;
}
export declare function readRegime(cross: PredictCrossSection): RegimeReading;
export interface PredictCandidate {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
    bars: PredictBarLike[];
    final: boolean;
}
interface PredictBarLike {
    sessionDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
}
/**
 * Turns one snapshot candidate into a row, or null when the history is too
 * short or carries a hole. The board rate comes from the symbol and the quoted
 * name, never from the browser.
 */
export declare function scoreCandidate(candidate: PredictCandidate, cross: PredictCrossSection): PredictRow | null;
/**
 * Ranks by promotion probability, then by streak, then by symbol. Ordering by
 * return would mean inventing a return model: the measured out-of-sample rank
 * correlation for returns is negative, so the probability is the only ordering
 * this pipeline can defend.
 */
export declare function sortPredictRows(rows: PredictRow[]): PredictRow[];
/**
 * Re-validates a Host result at the browser boundary, exactly like the other
 * market projections: unknown fields are dropped, out-of-range numbers are
 * rejected instead of repaired, and a row is only kept when its feature ids are
 * known. A model file that no longer matches the feature list fails here rather
 * than showing a wrong number.
 */
export declare function projectPredictScan(raw: unknown, now: number): PredictScanResult;
export {};
