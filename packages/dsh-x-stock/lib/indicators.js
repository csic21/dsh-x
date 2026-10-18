/** Pure, deterministic close-price indicators. Never calculate from a viewport. */
import { isSessionDate, MAX_BARS } from './chart-data.js';
export const INDICATOR_ALGORITHM_VERSION = 'dsh-independent-sma-ema-v1';
export const MAX_INDICATOR_PERIOD = 500;
export const DEFAULT_MA_PERIODS = Object.freeze([5, 10, 20]);
export const DEFAULT_MACD = Object.freeze({ fast: 12, slow: 26, signal: 9, histScale: 2 });
function period(value, label = 'period') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_INDICATOR_PERIOD)
        throw new RangeError(`${label} must be an integer from 1 to ${MAX_INDICATOR_PERIOD}`);
    return value;
}
function valuesInput(values) {
    if (!Array.isArray(values))
        throw new TypeError('Indicator input must be an array');
    for (const value of values)
        if (value !== null && (typeof value !== 'number' || !Number.isFinite(value)))
            throw new TypeError('Indicator values must be finite numbers or explicit null');
}
function number(value) {
    if (!Number.isFinite(value))
        throw new RangeError('Indicator arithmetic exceeded the finite number range');
    return Object.is(value, -0) ? 0 : value;
}
function mean(values) {
    // Compensated summation keeps flat windows exactly flat. For extreme finite
    // values, scale before summing to avoid overflowing an otherwise finite mean.
    let sum = 0;
    let correction = 0;
    for (const value of values) {
        const adjusted = value - correction;
        const next = sum + adjusted;
        correction = (next - sum) - adjusted;
        sum = next;
    }
    if (Number.isFinite(sum))
        return number(sum / values.length);
    let result = 0;
    for (const value of values)
        result += value / values.length;
    return number(result);
}
export function validateMacdParams(raw = {}) {
    const input = raw;
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new TypeError('MACD parameters must be an object');
    for (const key of Object.keys(input))
        if (!['fast', 'slow', 'signal', 'histScale'].includes(key))
            throw new TypeError('Unknown MACD parameter');
    const result = { ...DEFAULT_MACD, ...input };
    period(result.fast, 'fast');
    period(result.slow, 'slow');
    period(result.signal, 'signal');
    if (result.fast >= result.slow)
        throw new RangeError('MACD fast must be smaller than slow');
    if (![1, 2].includes(result.histScale))
        throw new RangeError('MACD histScale must be 1 or 2');
    return result;
}
export function validateIndicatorConfig(raw = {}) {
    const input = raw;
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new TypeError('Indicator configuration must be an object');
    for (const key of Object.keys(input))
        if (!['maPeriods', 'macd', 'historyAnchor'].includes(key))
            throw new TypeError('Unknown indicator configuration');
    const maPeriods = input.maPeriods === undefined ? [...DEFAULT_MA_PERIODS] : input.maPeriods;
    if (!Array.isArray(maPeriods) || maPeriods.length > 8)
        throw new RangeError('MA requires an array of at most 8 periods');
    for (const value of maPeriods)
        period(value, 'MA period');
    if (new Set(maPeriods).size !== maPeriods.length)
        throw new RangeError('MA periods must be unique');
    if (input.historyAnchor !== undefined && input.historyAnchor !== null && !isSessionDate(input.historyAnchor))
        throw new TypeError('historyAnchor must be a session date');
    return { maPeriods: [...maPeriods], macd: validateMacdParams(input.macd), historyAnchor: input.historyAnchor ?? null };
}
/** Null breaks continuity; a complete fresh consecutive window is then required. */
export function sma(values, size) {
    valuesInput(values);
    const windowSize = period(size);
    const output = [];
    const window = [];
    for (const value of values) {
        if (value === null) {
            window.length = 0;
            output.push(null);
            continue;
        }
        window.push(value);
        if (window.length > windowSize)
            window.shift();
        output.push(window.length === windowSize ? mean(window) : null);
    }
    return output;
}
/** Independent SMA seed at period-1, alpha=2/(period+1); null resets the seed. */
export function ema(values, size) {
    valuesInput(values);
    const windowSize = period(size);
    const output = [];
    const seed = [];
    const alpha = 2 / (windowSize + 1);
    let previous = null;
    for (const value of values) {
        if (value === null) {
            seed.length = 0;
            previous = null;
            output.push(null);
            continue;
        }
        if (previous === null) {
            seed.push(value);
            if (seed.length === windowSize)
                previous = mean(seed);
        }
        else {
            // Keeping identical values unchanged also canonicalizes exact flat-line
            // DIF/histograms to zero rather than floating-point cancellation noise.
            previous = value === previous ? previous : number(alpha * value + (1 - alpha) * previous);
        }
        output.push(previous);
    }
    return output;
}
/** DIF is exactly independent fast EMA minus independent slow EMA, not TA-Lib's aligned seed. */
export function macd(values, input = {}) {
    valuesInput(values);
    const params = validateMacdParams(input);
    const fastEma = ema(values, params.fast);
    const slowEma = ema(values, params.slow);
    const dif = values.map((_, index) => fastEma[index] === null || slowEma[index] === null ? null : number(fastEma[index] - slowEma[index]));
    const dea = ema(dif, params.signal);
    const histRaw = dif.map((value, index) => value === null || dea[index] === null ? null : number(value - dea[index]));
    const hist = histRaw.map((value) => value === null ? null : number(value * params.histScale));
    return { params, fastEma, slowEma, dif, dea, histRaw, hist };
}
function barInput(bars) {
    if (!Array.isArray(bars) || bars.length > MAX_BARS)
        throw new RangeError(`Indicator bars must be an array of at most ${MAX_BARS}`);
    let previousDate = '';
    for (const bar of bars) {
        if (!bar || !isSessionDate(bar.sessionDate) || bar.sessionDate <= previousDate)
            throw new TypeError('Indicator bars require unique increasing session dates');
        if (bar.close !== null && (typeof bar.close !== 'number' || !Number.isFinite(bar.close)))
            throw new TypeError('Bar close must be finite or explicit null');
        previousDate = bar.sessionDate;
    }
}
/**
 * Full-history result with dates and nullable rows for accessible tables. The
 * anchor must equal the first provided sample; we never claim to know an earlier
 * EMA state. Appending/revising preserves the anchor; explicitly prepending
 * history establishes a new earlier anchor and recomputes the complete series.
 */
export function computeIndicators(bars, input = {}) {
    barInput(bars);
    const config = validateIndicatorConfig(input);
    const historyAnchor = bars[0]?.sessionDate ?? null;
    if (config.historyAnchor !== null && config.historyAnchor !== historyAnchor)
        throw new RangeError('historyAnchor must match the first supplied history bar');
    const values = bars.map((bar) => bar.close);
    const times = bars.map((bar) => bar.sessionDate);
    const ma = Object.fromEntries(config.maPeriods.map(size => [size, sma(values, size)]));
    const macdResult = macd(values, config.macd);
    const rows = times.map((sessionDate, index) => ({
        sessionDate,
        ma: Object.fromEntries(config.maPeriods.map(size => [size, ma[size][index]])),
        dif: macdResult.dif[index], dea: macdResult.dea[index], histRaw: macdResult.histRaw[index], hist: macdResult.hist[index],
    }));
    const macdBars = config.macd.slow + config.macd.signal - 1;
    return {
        spec: {
            algorithmVersion: INDICATOR_ALGORITHM_VERSION,
            seedPolicy: 'independent-sma', missingPolicy: 'reset-and-reseed-on-null',
            input: 'close', historyAnchor, maPeriods: config.maPeriods, macd: config.macd,
        },
        times, ma, macd: macdResult, rows,
        warmup: { macdBars, availableBars: bars.length, complete: macdResult.hist.at(-1) != null },
    };
}
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
export function createIndicatorEngine(initialBars = [], initialConfig = {}) {
    let config = validateIndicatorConfig(initialConfig);
    let bars = [];
    let result;
    let revision = 0;
    const copyBars = (input) => input.map((bar) => Object.freeze({ ...bar }));
    function apply(nextBars, nextConfig = config, preserveAnchor = true) {
        const resolved = { ...nextConfig };
        if (!preserveAnchor)
            resolved.historyAnchor = nextBars[0]?.sessionDate ?? null;
        const nextResult = computeIndicators(nextBars, resolved);
        bars = copyBars(nextBars);
        config = { ...resolved, historyAnchor: nextResult.spec.historyAnchor };
        result = nextResult;
        revision++;
        return snapshot();
    }
    function snapshot() {
        // Results are deep-cloned so callers cannot corrupt the engine's next update.
        return { bars: bars.map((bar) => ({ ...bar })), indicators: structuredClone(result), historyAnchor: config.historyAnchor, revision };
    }
    apply(initialBars);
    return Object.freeze({
        snapshot,
        update(bar) {
            const last = bars.at(-1);
            if (last && bar?.sessionDate < last.sessionDate)
                throw new RangeError('Use revise() for a historical bar');
            const next = last?.sessionDate === bar?.sessionDate ? [...bars.slice(0, -1), bar] : [...bars, bar];
            return apply(next, config, bars.length > 0);
        },
        revise(bar) {
            const index = bars.findIndex((value) => value.sessionDate === bar?.sessionDate);
            if (index < 0)
                throw new RangeError('Historical revision must match an existing date');
            const next = [...bars];
            next[index] = bar;
            return apply(next);
        },
        prepend(earlierBars) {
            barInput(earlierBars);
            if (earlierBars.length === 0)
                return snapshot();
            if (bars.length && earlierBars.at(-1).sessionDate >= bars[0].sessionDate)
                throw new RangeError('Prepended bars must precede the existing history anchor');
            return apply([...earlierBars, ...bars], config, false);
        },
        replace(nextBars, nextConfig = config) {
            return apply(nextBars, validateIndicatorConfig(nextConfig), false);
        },
        configure(nextConfig) {
            const next = validateIndicatorConfig(nextConfig);
            next.historyAnchor = config.historyAnchor;
            return apply(bars, next);
        },
    });
}
