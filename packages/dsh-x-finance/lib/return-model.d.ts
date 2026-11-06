export interface ReturnRow {
    sessionDate: string;
    vector: Record<string, number>;
    /** Net percent return of the proposed trade, after cost. */
    netReturn: number;
}
export interface ReturnModel {
    version: 1;
    trainedThrough: string;
    features: string[];
    mean: number[];
    scale: number[];
    intercept: number;
    coef: number[];
    /** Ridge strength used for the fit, kept so a refit is reproducible. */
    lambda: number;
    /** Target clipping, in percent: one limit-down cannot own the fit. */
    clip: number;
    sample: {
        rows: number;
        from: string;
        to: string;
        sessions: number;
    };
}
/**
 * Fits the ridge head. Rows are weighted by recency so an old regime cannot
 * outvote the last two quarters, and the target is winsorised so one
 * limit-down session cannot own the coefficients.
 */
export declare function fitReturnModel(rows: readonly ReturnRow[], features: readonly string[], options?: {
    lambda?: number;
    halfLifeSessions?: number;
    trainedThrough?: string;
}): ReturnModel;
/** Expected net percent return for one feature vector. */
export declare function predictNetReturn(model: ReturnModel, vector: Record<string, number>): number;
/** Same model rendered as a checked TypeScript module, for the Host to import. */
export declare function renderReturnModel(model: ReturnModel): string;
