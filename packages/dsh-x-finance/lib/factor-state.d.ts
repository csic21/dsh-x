export declare const FACTOR_STATE_VERSION = 1;
export declare const FACTOR_STATE_FILE = "factor-state.json";
export declare const FACTOR_STATE_MAX_BYTES: number;
/** Sessions for the exponential weight to halve. 60 ≈ one quarter. */
export declare const FACTOR_HALF_LIFE = 60;
/** Sessions of evidence before the state is allowed to override the frozen model. */
export declare const FACTOR_MIN_SESSIONS = 20;
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
export declare function emptyFactorState(features: readonly string[], asOf?: string): FactorState;
/**
 * Folds new sessions into the state. Sessions at or before `asOf` are ignored,
 * so replaying the same day twice is a no-op — the caller does not need to
 * deduplicate. A session with a thin cross-section advances nothing.
 */
export declare function updateFactorState(previous: FactorState | null, features: readonly string[], sessions: readonly FactorSession[], model?: FactorCoefficients): FactorState;
/**
 * Whether this state may replace the frozen statistics. A state that has not
 * seen enough sessions, or that was built for another feature list, is refused
 * rather than partially applied.
 */
export declare function isFactorStateReady(state: FactorState | null | undefined, features: readonly string[]): state is FactorState;
/** Standardised, clipped input for one factor, exactly as the fit defined it. */
export declare function factorStandardise(state: FactorState, index: number, value: number): number;
/** The frozen logit, recalibrated against the base rate actually observed. */
export declare function factorCalibrate(state: FactorState, logit: number): number;
export declare function parseFactorState(value: unknown): FactorState;
