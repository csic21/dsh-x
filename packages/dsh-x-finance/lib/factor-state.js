// Daily self-correction for the limit-up relay screen.
//
// The shipped model is fitted once and then frozen, so every factor keeps the
// centre and spread of its training sample while the market moves underneath
// it: a 20-day return of +25% is extreme in a quiet tape and ordinary in a hot
// one. Two years later the same z-score means something else. That is the drift
// this module removes, once per session, without refitting a single
// coefficient — the structure stays put, the measuring stick is what moves.
//
// Three quantities are corrected, all of them cheap and low-variance:
//   * centre and spread of every factor, as an exponentially weighted
//     cross-section (half-life in sessions, not calendar days);
//   * the rank information coefficient of every factor against realised net
//     return, so the screen can report which factors still carry signal;
//   * a two-parameter logistic recalibration of the frozen model's logit, so
//     "18%" keeps meaning eighteen percent after the base rate drifts.
//
// Nothing here refits the model. A daily refit on roughly two hundred rows and
// twenty-one factors fits noise, and picking the best of many daily refits is a
// multiple-testing machine. Beliefs update every day; structure changes only
// through an evidence gate that lives outside this file.
export const FACTOR_STATE_VERSION = 1;
export const FACTOR_STATE_FILE = 'factor-state.json';
export const FACTOR_STATE_MAX_BYTES = 256 * 1024;
/** Sessions for the exponential weight to halve. 60 ≈ one quarter. */
export const FACTOR_HALF_LIFE = 60;
/** Sessions of evidence before the state is allowed to override the frozen model. */
export const FACTOR_MIN_SESSIONS = 20;
/** Standardised inputs are clipped at five deviations, exactly like the fit. */
export const FACTOR_CLIP = 5;
/** A cross-section thinner than this cannot estimate a spread. */
export const FACTOR_MIN_ROWS = 8;
const fail = () => { throw Object.assign(new Error('factor state unavailable'), { code: 'finance/factor-state-invalid' }); };
const CLOCK = /^\d{4}-\d{2}-\d{2}$/;
function finite(value, min = -1e9, max = 1e9) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function exact(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype
        || Object.keys(value).sort().join(',') !== [...keys].sort().join(','))
        fail();
}
function averageRanks(values) {
    const order = values.map((value, index) => ({ value, index }))
        .sort((left, right) => left.value - right.value);
    const ranks = new Array(values.length);
    for (let start = 0; start < order.length;) {
        let end = start + 1;
        while (end < order.length && order[end].value === order[start].value)
            end++;
        const rank = (start + end - 1) / 2;
        for (let cursor = start; cursor < end; cursor++)
            ranks[order[cursor].index] = rank;
        start = end;
    }
    return ranks;
}
function pearson(left, right) {
    const n = left.length;
    if (n < 3 || n !== right.length)
        return null;
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let index = 0; index < n; index++) {
        const x = left[index], y = right[index];
        sx += x;
        sy += y;
        sxx += x * x;
        syy += y * y;
        sxy += x * y;
    }
    const denominator = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    return denominator > 0 ? (n * sxy - sx * sy) / denominator : null;
}
function spearman(left, right) {
    return left.length === right.length && left.length >= 3
        ? pearson(averageRanks(left), averageRanks(right))
        : null;
}
function meanOf(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
function deviationOf(values) {
    if (values.length < 2)
        return 0;
    const mean = meanOf(values);
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
}
/**
 * The weight a new session receives. The first sessions behave like a plain
 * running average, then the weight decays to the half-life weight so a single
 * violent session cannot own the estimate.
 */
export function factorAlpha(sessions, halfLife) {
    const decay = 1 - Math.pow(2, -1 / Math.max(1, halfLife));
    return Math.max(1 / (sessions + 1), decay);
}
export function emptyFactorState(features, asOf = '1970-01-01') {
    return {
        version: FACTOR_STATE_VERSION,
        asOf,
        halfLife: FACTOR_HALF_LIFE,
        sessions: 0,
        features: [...features],
        center: new Array(features.length).fill(0),
        spread: new Array(features.length).fill(1),
        ic: new Array(features.length).fill(0),
        icSpread: new Array(features.length).fill(0),
        calibration: { a: 1, b: 0 },
    };
}
/**
 * Folds new sessions into the state. Sessions at or before `asOf` are ignored,
 * so replaying the same day twice is a no-op — the caller does not need to
 * deduplicate. A session with a thin cross-section advances nothing.
 */
export function updateFactorState(previous, features, sessions, model) {
    if (!features.length)
        fail();
    const state = previous ? cloneState(previous) : emptyFactorState(features);
    if (state.features.length !== features.length || state.features.some((name, index) => name !== features[index]))
        fail();
    const ordered = [...sessions].sort((left, right) => left.sessionDate.localeCompare(right.sessionDate));
    for (const session of ordered) {
        if (!CLOCK.test(session.sessionDate))
            fail();
        if (session.sessionDate <= state.asOf)
            continue;
        const rows = session.rows.filter(row => finite(row.netReturn) && row.vector);
        if (rows.length < FACTOR_MIN_ROWS)
            continue;
        const alpha = factorAlpha(state.sessions, state.halfLife);
        const net = rows.map(row => row.netReturn);
        for (let index = 0; index < features.length; index++) {
            const name = features[index];
            const pairs = rows
                .map(row => ({ value: row.vector[name], net: row.netReturn }))
                .filter(pair => finite(pair.value) && finite(pair.net));
            if (pairs.length < FACTOR_MIN_ROWS)
                continue;
            const values = pairs.map(pair => pair.value);
            const dayMean = meanOf(values);
            const daySpread = Math.max(1e-6, deviationOf(values));
            state.center[index] = (1 - alpha) * state.center[index] + alpha * dayMean;
            state.spread[index] = Math.sqrt((1 - alpha) * state.spread[index] ** 2 + alpha * daySpread ** 2);
            const ic = spearman(values, pairs.map(pair => pair.net));
            if (ic === null)
                continue;
            const delta = ic - state.ic[index];
            state.ic[index] = state.ic[index] + alpha * delta;
            state.icSpread[index] = (1 - alpha) * state.icSpread[index] + alpha * delta * delta;
        }
        updateCalibration(state, alpha, rows, features, model);
        state.sessions += 1;
        state.asOf = session.sessionDate;
    }
    return state;
}
/**
 * One averaged gradient step on (a, b). The learning rate is deliberately
 * small and the parameters are bounded: this is a correction to a fitted
 * probability, not a second model competing with it.
 *
 * The logit is recomputed with the centre and spread this session just
 * installed, so the correction always describes the same score the Host will
 * produce from this state.
 */
function updateCalibration(state, alpha, rows, features, model) {
    if (!model || model.coef.length !== features.length)
        return;
    const usable = rows.filter(row => row.label === 0 || row.label === 1);
    if (usable.length < FACTOR_MIN_ROWS)
        return;
    const rate = 0.5 * Math.min(0.2, alpha);
    let slope = 0, intercept = 0;
    for (const row of usable) {
        let eta = model.intercept;
        for (let index = 0; index < features.length; index++) {
            eta += (model.coef[index] ?? 0) * factorStandardise(state, index, row.vector[features[index]] ?? state.center[index]);
        }
        const bounded = Math.max(-12, Math.min(12, eta));
        const probability = 1 / (1 + Math.exp(-Math.max(-12, Math.min(12, state.calibration.a * bounded + state.calibration.b))));
        const error = probability - row.label;
        slope += error * bounded;
        intercept += error;
    }
    state.calibration.a = Math.min(4, Math.max(0.25, state.calibration.a - rate * slope / usable.length));
    state.calibration.b = Math.min(2.5, Math.max(-2.5, state.calibration.b - rate * intercept / usable.length));
}
function cloneState(state) {
    return {
        ...state,
        features: [...state.features],
        center: [...state.center],
        spread: [...state.spread],
        ic: [...state.ic],
        icSpread: [...state.icSpread],
        calibration: { ...state.calibration },
    };
}
/**
 * Whether this state may replace the frozen statistics. A state that has not
 * seen enough sessions, or that was built for another feature list, is refused
 * rather than partially applied.
 */
export function isFactorStateReady(state, features) {
    if (!state || state.sessions < FACTOR_MIN_SESSIONS)
        return false;
    if (state.features.length !== features.length)
        return false;
    if (state.features.some((name, index) => name !== features[index]))
        return false;
    return state.center.length === features.length
        && state.spread.length === features.length
        && state.center.every(value => Number.isFinite(value))
        && state.spread.every(value => Number.isFinite(value) && value > 0);
}
/** Standardised, clipped input for one factor, exactly as the fit defined it. */
export function factorStandardise(state, index, value) {
    const center = state.center[index] ?? 0;
    const spread = state.spread[index] || 1;
    return Math.max(-FACTOR_CLIP, Math.min(FACTOR_CLIP, (value - center) / spread));
}
/** The frozen logit, recalibrated against the base rate actually observed. */
export function factorCalibrate(state, logit) {
    const bounded = Math.max(-12, Math.min(12, logit));
    return state.calibration.a * bounded + state.calibration.b;
}
export function parseFactorState(value) {
    exact(value, ['version', 'asOf', 'halfLife', 'sessions', 'features', 'center', 'spread', 'ic', 'icSpread', 'calibration']);
    const raw = value;
    if (raw.version !== FACTOR_STATE_VERSION)
        fail();
    if (typeof raw.asOf !== 'string' || !CLOCK.test(raw.asOf) || !Number.isFinite(Date.parse(raw.asOf)))
        fail();
    if (!finite(raw.halfLife, 5, 250) || !Number.isInteger(raw.sessions) || raw.sessions < 0 || raw.sessions > 20_000)
        fail();
    if (!Array.isArray(raw.features) || raw.features.length < 1 || raw.features.length > 64)
        fail();
    const seen = new Set();
    for (const name of raw.features) {
        if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(name) || seen.has(name))
            fail();
        seen.add(name);
    }
    const size = raw.features.length;
    for (const list of [raw.center, raw.spread, raw.ic, raw.icSpread]) {
        if (!Array.isArray(list) || list.length !== size)
            fail();
    }
    for (let index = 0; index < size; index++) {
        if (!finite(raw.center[index], -1e6, 1e6))
            fail();
        if (!finite(raw.spread[index], 1e-9, 1e6))
            fail();
        if (!finite(raw.ic[index], -1, 1))
            fail();
        if (!finite(raw.icSpread[index], 0, 1))
            fail();
    }
    exact(raw.calibration, ['a', 'b']);
    if (!finite(raw.calibration.a, 0.25, 4) || !finite(raw.calibration.b, -2.5, 2.5))
        fail();
    return cloneState(raw);
}
