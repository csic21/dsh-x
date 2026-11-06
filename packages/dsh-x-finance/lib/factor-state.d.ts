export declare const FACTOR_STATE_VERSION = 2;
export declare const FACTOR_STATE_FILE = "factor-state.json";
export declare const FACTOR_STATE_MAX_BYTES: number;
/** Sessions for the exponential weight to halve. 60 ≈ one quarter. */
export declare const FACTOR_HALF_LIFE = 60;
/**
 * The state never replaces the frozen statistics outright: it is blended in
 * with `sessions / (sessions + FACTOR_BLEND_SESSIONS)`. One good week should
 * move the ruler a little, not take it over.
 */
export declare const FACTOR_BLEND_SESSIONS = 10;
/** Pseudo-count pulling a bucket edge back toward its shipped prior. */
export declare const FACTOR_EDGE_PRIOR_WEIGHT = 30;
/** A bucket's effective sample count stops growing here. */
export declare const FACTOR_EDGE_MAX_COUNT = 600;
/** Standardised inputs are clipped at five deviations, exactly like the fit. */
export declare const FACTOR_CLIP = 5;
/** A cross-section thinner than this cannot estimate a spread. */
export declare const FACTOR_MIN_ROWS = 8;
export interface FactorCalibration {
    /** Slope on the frozen logit; 1 reproduces the shipped probability. */
    a: number;
    /** Intercept on the frozen logit; 0 reproduces the shipped probability. */
    b: number;
}
export interface FactorEdgeBucket {
    key: string;
    /** Effective sample count after exponential decay, capped. */
    n: number;
    /** Exponentially weighted net percent return of this bucket's trades. */
    edge: number;
    /** Exponentially weighted variance around that edge. */
    variance: number;
}
export interface FactorState {
    version: typeof FACTOR_STATE_VERSION;
    /** Last session ingested, `YYYY-MM-DD`. */
    asOf: string;
    halfLife: number;
    /** Sessions of cross-section observed so far. */
    sessions: number;
    features: string[];
    center: number[];
    spread: number[];
    /** Exponentially weighted rank IC against net return. */
    ic: number[];
    /** Exponentially weighted variance of that IC; ic/sqrt gives its stability. */
    icSpread: number[];
    calibration: FactorCalibration;
    /** Bucket edges, by dimension; the gate reads these before the shipped table. */
    edges: {
        streak: FactorEdgeBucket[];
        regime: FactorEdgeBucket[];
    };
}
export interface FactorObservation {
    /** Raw factor vector for one candidate. */
    vector: Record<string, number>;
    /** Net percent return of the proposed trade, after cost. */
    netReturn: number;
    /** 1 when the next session closed at its limit. */
    label: number;
}
/** The frozen structure the state corrects, never replaces. */
export interface FactorCoefficients {
    intercept: number;
    coef: number[];
}
export interface FactorBucket {
    key: string;
    from: number;
    to: number | null;
}
export interface FactorBuckets {
    streak: FactorBucket[];
    regime: FactorBucket[];
}
export interface FactorModel extends FactorCoefficients {
    buckets?: FactorBuckets;
}
export interface FactorSession {
    sessionDate: string;
    rows: FactorObservation[];
}
/**
 * The weight a new session receives. The first sessions behave like a plain
 * running average, then the weight decays to the half-life weight so a single
 * violent session cannot own the estimate.
 */
export declare function factorAlpha(sessions: number, halfLife: number): number;
/**
 * How much of the daily state may be used, from 0 (frozen only) to 1 (fully
 * daily). A hard "20 sessions before it counts" switch left the screen frozen
 * for a month; this ramps instead, so the first week already nudges the ruler.
 */
export declare function factorWeight(state: FactorState | null | undefined, features: readonly string[]): number;
export declare function emptyFactorState(features: readonly string[], asOf?: string): FactorState;
/**
 * Folds new sessions into the state. Sessions at or before `asOf` are ignored,
 * so replaying the same day twice is a no-op — the caller does not need to
 * deduplicate. A session with a thin cross-section advances nothing.
 */
export declare function updateFactorState(previous: FactorState | null, features: readonly string[], sessions: readonly FactorSession[], model?: FactorModel): FactorState;
/** Standardised, clipped input for one factor, exactly as the fit defined it. */
export declare function factorStandardise(state: FactorState, index: number, value: number): number;
/**
 * The bucket's edge pulled back toward its shipped prior. With no observations
 * the answer is exactly the prior; with many it is almost the live estimate.
 */
export declare function shrunkEdge(state: FactorState | null | undefined, dimension: keyof FactorState['edges'], key: string, prior: number): number;
export declare function parseFactorState(value: unknown): FactorState;
