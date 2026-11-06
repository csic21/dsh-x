// The return head the screen never had.
//
// `predict-model.ts` predicts one thing: the probability that the next session
// closes limit-up. It explicitly refuses to predict a return, and the refusal
// is correct — the shipped rank correlation was negative. But a screen that
// ranks by probability and settles in money has to rank by money, or the
// ordering and the payoff disagree. That is exactly what happened: AUC 0.68,
// top-3 net return -99%.
//
// This head is deliberately the simplest thing that can carry that ordering:
// a ridge regression on the same factors, fitted to the *net* return of the
// trade the screen proposes (buy the next open, sell the close after, after
// the cost that trade actually pays). It is not a price forecast and it is not
// a promise; it is a ranking device with a measurable information coefficient.
//
// Like every fitted object here it is fitted offline and shipped frozen. The
// daily correction lives in `factor-state.ts`, which moves the measuring stick
// rather than the structure.
/** Standardised inputs are clipped at five deviations, exactly like the classifier. */
const CLIP = 5;
/** Sessions for the fit weight to halve. */
const FIT_HALF_LIFE = 120;
/** Net returns beyond this are winsorised: a one-day hold cannot print much more. */
const TARGET_CLIP = 15;
function solve(matrix, vector) {
    const size = vector.length;
    const a = matrix.map((row, index) => [...row, vector[index]]);
    for (let column = 0; column < size; column++) {
        let pivot = column;
        for (let row = column + 1; row < size; row++) {
            if (Math.abs(a[row][column]) > Math.abs(a[pivot][column]))
                pivot = row;
        }
        if (Math.abs(a[pivot][column]) < 1e-12)
            return null;
        if (pivot !== column) {
            const swap = a[column];
            a[column] = a[pivot];
            a[pivot] = swap;
        }
        const lead = a[column][column];
        for (let k = column; k <= size; k++)
            a[column][k] /= lead;
        for (let row = 0; row < size; row++) {
            if (row === column)
                continue;
            const factor = a[row][column];
            if (!factor)
                continue;
            for (let k = column; k <= size; k++)
                a[row][k] -= factor * a[column][k];
        }
    }
    return a.map(row => row[size]);
}
function meanOf(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
function deviationOf(values) {
    if (values.length < 2)
        return 0;
    const mean = meanOf(values);
    return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}
function standardisedValue(model, index, value) {
    const centre = model.mean[index] ?? 0;
    const spread = model.scale[index] || 1;
    const z = (value - centre) / spread;
    return Math.max(-CLIP, Math.min(CLIP, z));
}
/**
 * Fits the ridge head. Rows are weighted by recency so an old regime cannot
 * outvote the last two quarters, and the target is winsorised so one
 * limit-down session cannot own the coefficients.
 */
export function fitReturnModel(rows, features, options = {}) {
    if (!features.length)
        throw new Error('no features');
    const usable = rows.filter(row => Number.isFinite(row.netReturn) && row.vector);
    if (usable.length < features.length * 10)
        throw new Error('not enough rows to fit a return model');
    const sessions = [...new Set(usable.map(row => row.sessionDate))].sort();
    const rankOf = new Map(sessions.map((session, index) => [session, index]));
    const halfLife = options.halfLifeSessions ?? FIT_HALF_LIFE;
    const last = Math.max(0, sessions.length - 1);
    const weights = usable.map(row => Math.pow(2, -((last - (rankOf.get(row.sessionDate) ?? last)) / Math.max(1, halfLife))));
    const weightMean = meanOf(weights) || 1;
    const mean = features.map(name => meanOf(usable.map(row => row.vector[name]).filter(Number.isFinite)));
    const scale = features.map(name => {
        const values = usable.map(row => row.vector[name]).filter(Number.isFinite);
        return Math.max(1e-6, deviationOf(values) || 1);
    });
    const model = { mean, scale };
    const size = features.length + 1;
    const hessian = Array.from({ length: size }, () => new Array(size).fill(0));
    const gradient = new Array(size).fill(0);
    for (let index = 0; index < usable.length; index++) {
        const row = usable[index];
        const weight = weights[index] / weightMean;
        const design = [1, ...features.map((name, position) => standardisedValue(model, position, row.vector[name] ?? mean[position]))];
        const target = Math.max(-TARGET_CLIP, Math.min(TARGET_CLIP, row.netReturn));
        for (let left = 0; left < size; left++) {
            gradient[left] += design[left] * target * weight;
            for (let right = 0; right < size; right++)
                hessian[left][right] += design[left] * design[right] * weight;
        }
    }
    const lambda = options.lambda ?? 30;
    for (let index = 1; index < size; index++)
        hessian[index][index] += lambda;
    const beta = solve(hessian, gradient);
    if (!beta)
        throw new Error('return model is singular');
    return {
        version: 1,
        trainedThrough: options.trainedThrough ?? sessions[last] ?? '1970-01-01',
        features: [...features],
        mean,
        scale,
        intercept: beta[0],
        coef: beta.slice(1),
        lambda,
        clip: TARGET_CLIP,
        sample: {
            rows: usable.length,
            from: sessions[0] ?? '1970-01-01',
            to: sessions[last] ?? '1970-01-01',
            sessions: sessions.length,
        },
    };
}
/** Expected net percent return for one feature vector. */
export function predictNetReturn(model, vector) {
    let value = model.intercept;
    for (let index = 0; index < model.features.length; index++) {
        const name = model.features[index];
        value += (model.coef[index] ?? 0) * standardisedValue(model, index, vector[name] ?? model.mean[index] ?? 0);
    }
    return value;
}
/** Same model rendered as a checked TypeScript module, for the Host to import. */
export function renderReturnModel(model) {
    const number = (value) => Number.isFinite(value) ? Number(value.toPrecision(7)) : 0;
    const array = (values) => `[${values.map(number).join(', ')}]`;
    return [
        '// GENERATED FILE — do not edit by hand.',
        '//',
        '// Produced by `node scripts/finance-research.mjs fit`. It ranks the net return',
        '// of the trade the screen proposes, which is the quantity the screen is paid on.',
        "import type { ReturnModel } from './return-model.ts'",
        '',
        'export const RETURN_MODEL: ReturnModel = {',
        `  version: 1,`,
        `  trainedThrough: '${model.trainedThrough}',`,
        `  features: ${JSON.stringify(model.features)},`,
        `  mean: ${array(model.mean)},`,
        `  scale: ${array(model.scale)},`,
        `  intercept: ${number(model.intercept)},`,
        `  coef: ${array(model.coef)},`,
        `  lambda: ${number(model.lambda)},`,
        `  clip: ${number(model.clip)},`,
        `  sample: { rows: ${model.sample.rows}, from: '${model.sample.from}', to: '${model.sample.to}', sessions: ${model.sample.sessions} },`,
        '}',
        '',
    ].join('\n');
}
