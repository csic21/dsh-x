// Deterministic feature extraction for the limit-up relay screen.
//
// This module is the single definition of "what the model sees". The Host calls
// it on live daily bars, and `scripts/finance-research.mjs` calls the same
// function over historical bars when it fits the coefficients. Training and
// serving therefore cannot drift apart, which is the usual way a screen like
// this quietly stops working.
//
// Every value is computed from the daily bars up to and including the signal
// session plus a cross-section of the same session. Nothing here reads a future
// bar: the labels live in the research script, never in this file.
//
// Units are explicit and uniform: every return-like feature is in percent
// (9.5 means +9.5%), every ratio-like feature is unitless, `closePos` is 0–1.
/** Twenty-one knots, one per 5th percentile, over `values`. */
export function predictKnots(values) {
    const sorted = [...values].filter(value => Number.isFinite(value)).sort((left, right) => left - right);
    if (!sorted.length)
        return new Array(21).fill(0);
    const knots = [];
    for (let step = 0; step <= 20; step++) {
        const position = (sorted.length - 1) * step / 20;
        const lower = Math.floor(position);
        const upper = Math.min(sorted.length - 1, lower + 1);
        const weight = position - lower;
        knots.push(sorted[lower] * (1 - weight) + sorted[upper] * weight);
    }
    return knots;
}
/** Percentile rank (0–100) of `value` against sorted `knots`. */
export function percentileRank(knots, value) {
    if (knots.length < 2 || !Number.isFinite(value))
        return 50;
    if (value <= knots[0])
        return 0;
    const last = knots.length - 1;
    if (value >= knots[last])
        return 100;
    for (let index = 1; index <= last; index++) {
        const upper = knots[index];
        if (value <= upper) {
            const lower = knots[index - 1];
            const span = upper - lower;
            const share = span > 0 ? (value - lower) / span : 0;
            return ((index - 1 + share) / last) * 100;
        }
    }
    return 100;
}
/** A stock this far below its price limit still counts as "attacking the limit". */
export const PREDICT_POPULATION_GAP = 1.5;
/** The fixed cross-section threshold behind `hotShare`, board-independent on purpose. */
export const HOT_CHANGE = 9;
export const PREDICT_FEATURE_NAMES = [
    'streak', 'limitUp', 'distLimit', 'ret1', 'ret5', 'ret20',
    'gap', 'amplitude', 'closePos', 'volRatio5', 'amtRatio20',
    'ma5Dist', 'ma20Dist', 'burst5', 'limitCount20', 'fromHigh20',
    'oneWord', 'upShare', 'hotShare', 'medianChange', 'streakHot',
];
/** Shortest series the features need: 20 bars for the windows plus today. */
export const PREDICT_MIN_BARS = 30;
/**
 * The price limit in percent for a symbol on a normal session, or null when the
 * board has no dependable limit (new listing, delisting). ST names are not part
 * of the research population; the 5% case is still resolved so a caller cannot
 * silently label an ST limit-up as a 10% one.
 */
export function boardLimitRate(symbol, name = '') {
    if (/^[NC]/.test(name) || /^退市/.test(name) || /^退$/.test(name))
        return null;
    const st = /^(?:\*?ST|S\*ST)/i.test(name);
    if (symbol.startsWith('BJ.'))
        return st ? 30 : 30;
    const code = symbol.slice(3);
    const wide = /^(?:68[89]|30[0-9])/.test(code);
    if (wide)
        return 20;
    return st ? 5 : 10;
}
function percentChange(current, previous) {
    return (current.close / previous.close - 1) * 100;
}
/**
 * True when a session closed on its price limit. A limit close is both "up by
 * the limit" and "at the session high": the limit is the highest price the
 * board allows, so a day that touched the limit and fell back is explicitly not
 * a limit close. The tolerance absorbs the rounding of a forward-adjusted
 * series without accepting a 9.6% close as a 10% limit.
 */
export function isLimitClose(bars, index, rate) {
    if (index < 1 || index >= bars.length)
        return false;
    const bar = bars[index];
    const previous = bars[index - 1];
    if (!(previous.close > 0) || !(bar.close > 0))
        return false;
    const change = percentChange(bar, previous);
    if (change < rate - 0.4)
        return false;
    return bar.high - bar.close <= Math.max(1e-6, bar.close * 1e-4);
}
/** Consecutive limit closes ending at the last bar. */
export function predictLimitStreak(bars, rate, cap = 6) {
    let streak = 0;
    for (let index = bars.length - 1; index > 0 && streak < cap; index--) {
        if (!isLimitClose(bars, index, rate))
            break;
        streak += 1;
    }
    return streak;
}
/**
 * The research population excludes special treatment names and brand-new
 * listings: their limits are 5% or undefined, so a model trained on 10/20/30
 * percent boards would be reading a different event. The screen applies the
 * same filter, so a name is only scored when it belongs to the trained set.
 */
export function isPredictUniverse(name) {
    if (!name)
        return false;
    if (/^(?:\*?ST|S\*ST)/i.test(name))
        return false;
    return !/^[NC]/.test(name) && !/退/.test(name);
}
/** True when today's session is hot enough to be part of the trained population. */
export function isPredictCandidate(changePercent, rate) {
    if (rate === null || !Number.isFinite(changePercent))
        return false;
    return changePercent >= rate - PREDICT_POPULATION_GAP;
}
function mean(values) {
    if (!values.length)
        return null;
    let total = 0;
    for (const value of values)
        total += value;
    return total / values.length;
}
function lastVolume(bars, index) {
    const volume = bars[index]?.volume;
    return typeof volume === 'number' && Number.isFinite(volume) && volume >= 0 ? volume : null;
}
/**
 * Computes the feature vector for the last bar of `bars`, or null when the
 * series is too short, has a zero/absent volume inside a window, or carries a
 * non-finite price. A null result is reported as "insufficient history" and is
 * never filled with a neutral value.
 */
export function predictFeatures(bars, rate, cross, transform) {
    if (!Number.isFinite(rate) || rate <= 0)
        return null;
    if (bars.length < PREDICT_MIN_BARS)
        return null;
    const session = bars.at(-1);
    const previous = bars.at(-2);
    if (!(session.close > 0) || !(previous.close > 0))
        return null;
    if (!(session.high >= session.low))
        return null;
    if (!Number.isFinite(cross.upShare) || !Number.isFinite(cross.hotShare) || !Number.isFinite(cross.medianChange))
        return null;
    const returnOver = (sessions) => {
        const index = bars.length - 1 - sessions;
        if (index < 0)
            return null;
        const close = bars[index].close;
        return close > 0 ? (session.close / close - 1) * 100 : null;
    };
    const ret1 = percentChange(session, previous);
    const ret5 = returnOver(5);
    const ret20 = returnOver(20);
    if (ret5 === null || ret20 === null)
        return null;
    const volumes = [];
    for (let index = bars.length - 21; index < bars.length; index++) {
        const volume = lastVolume(bars, index);
        if (volume === null)
            return null;
        volumes.push(volume);
    }
    const todayVolume = volumes.at(-1);
    const previousFive = mean(volumes.slice(-6, -1));
    const previousTwenty = mean(volumes.slice(0, -1));
    if (!previousFive || !previousTwenty || previousFive <= 0 || previousTwenty <= 0)
        return null;
    // Amount ratios stay scale-free on purpose: the source reports volume in
    // lots, so an absolute turnover in CNY would be a made-up number.
    const amounts = [];
    for (let index = bars.length - 21; index < bars.length; index++) {
        const bar = bars[index];
        const volume = lastVolume(bars, index);
        if (volume === null)
            return null;
        amounts.push(volume * bar.close);
    }
    const amountRatio = mean(amounts.slice(0, -1));
    if (!amountRatio || amountRatio <= 0)
        return null;
    const closes = bars.slice(-20).map(bar => bar.close);
    const ma5 = mean(bars.slice(-5).map(bar => bar.close));
    const ma20 = mean(closes);
    if (!ma5 || !ma20 || ma5 <= 0 || ma20 <= 0)
        return null;
    let highest = -Infinity;
    for (let index = bars.length - 20; index < bars.length; index++)
        highest = Math.max(highest, bars[index].high);
    const limit = isLimitClose(bars, bars.length - 1, rate);
    const streak = limit ? predictLimitStreak(bars, rate) : 0;
    let burst5 = 0;
    let limitCount20 = 0;
    for (let index = bars.length - 20; index < bars.length; index++) {
        if (isLimitClose(bars, index, rate))
            limitCount20 += 1;
    }
    for (let index = Math.max(1, bars.length - 5); index < bars.length; index++) {
        const bar = bars[index];
        const prior = bars[index - 1];
        const touched = (bar.high / prior.close - 1) * 100 >= rate - 0.4;
        if (touched && !isLimitClose(bars, index, rate))
            burst5 += 1;
    }
    const range = session.high - session.low;
    const vector = {
        streak,
        limitUp: limit ? 1 : 0,
        distLimit: rate - ret1,
        ret1,
        ret5,
        ret20,
        gap: (session.open / previous.close - 1) * 100,
        amplitude: range / previous.close * 100,
        closePos: range > 0 ? (session.close - session.low) / range : 1,
        volRatio5: todayVolume / previousFive,
        amtRatio20: (todayVolume * session.close) / amountRatio,
        ma5Dist: (session.close / ma5 - 1) * 100,
        ma20Dist: (session.close / ma20 - 1) * 100,
        burst5,
        limitCount20,
        fromHigh20: highest > 0 ? (session.close / highest - 1) * 100 : 0,
        oneWord: range <= Math.max(1e-6, session.close * 1e-4) ? 1 : 0,
        upShare: percentileRank(transform.upShare, cross.upShare),
        hotShare: percentileRank(transform.hotShare, cross.hotShare),
        medianChange: percentileRank(transform.medianChange, cross.medianChange),
        streakHot: streak * percentileRank(transform.hotShare, cross.hotShare),
    };
    for (const value of Object.values(vector))
        if (!Number.isFinite(value))
            return null;
    return vector;
}
