export const WATCH_SIGNAL_MIN_SAMPLES = 120;
export const WATCH_SIGNAL_MA20_PERIOD = 20;
export const WATCH_SIGNAL_MA60_PERIOD = 60;
export const WATCH_SIGNAL_BREAKOUT_PERIOD = 20;
function emptySignal(reason) {
    return {
        status: 'insufficient', reason, sessionDate: null, samples: 0, isFinal: false,
        close: null, ma20: null, ma60: null, previousClose: null, previousMa20: null, prior20High: null,
    };
}
// Calendar validation only: no clock, timezone, date rollover or holiday guesses.
function isSessionDate(value) {
    if (typeof value !== 'string' || value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
    if (year < 1 || month < 1 || month > 12 || day < 1)
        return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= days[month - 1];
}
/** Mean of a complete trailing window, with an exclusive end index. */
function mean(bars, end, period) {
    if (end < period)
        return null;
    const start = end - period;
    const anchor = bars[start].close;
    // Centering keeps a flat decimal-price series exactly flat for strict comparisons.
    let offsets = 0;
    for (let index = start; index < end; index++)
        offsets += bars[index].close - anchor;
    if (Number.isFinite(offsets))
        return anchor + offsets / period;
    // Finite positive prices can still overflow a sum; this mean stays bounded.
    let average = anchor;
    for (let index = start + 1; index < end; index++) {
        average += (bars[index].close - average) / (index - start + 1);
    }
    return average;
}
/**
 * Deterministic A-share daily research observations from caller-supplied bars.
 * These user-confirmed example rules have not been backtested; buy/sell are
 * observation labels, not investment advice or instructions to place orders.
 * Free quotes may be unreliable. The caller owns market eligibility and data
 * freshness; names/ST labels, system time, networks and models are not used.
 *
 * Reject the entire series on any invalid row (including duplicate dates or an
 * unfinished historical bar). No row is silently dropped or deduplicated.
 * Valid short series retain all available fields, but an indicator is null
 * until its full window exists. The 120-bar gate includes an unfinished latest
 * bar, whose isFinal=false must remain visible as intraday/unconfirmed in UI.
 */
export function evaluateWatchSignal(input) {
    if (!Array.isArray(input))
        return emptySignal('invalid');
    const bars = [];
    const dates = new Set();
    for (const raw of input) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            return emptySignal('invalid');
        const { sessionDate, close, isFinal } = raw;
        if (!isSessionDate(sessionDate) || dates.has(sessionDate)
            || typeof close !== 'number' || !Number.isFinite(close) || close <= 0
            || typeof isFinal !== 'boolean')
            return emptySignal('invalid');
        dates.add(sessionDate);
        bars.push({ sessionDate, close, isFinal });
    }
    bars.sort((left, right) => left.sessionDate < right.sessionDate ? -1 : left.sessionDate > right.sessionDate ? 1 : 0);
    for (let index = 0; index < bars.length - 1; index++) {
        if (!bars[index].isFinal)
            return emptySignal('invalid');
    }
    const today = bars.at(-1);
    if (!today)
        return emptySignal('insufficient');
    const samples = bars.length;
    const previous = bars.at(-2);
    const ma20 = mean(bars, samples, WATCH_SIGNAL_MA20_PERIOD);
    const ma60 = mean(bars, samples, WATCH_SIGNAL_MA60_PERIOD);
    const previousMa20 = mean(bars, samples - 1, WATCH_SIGNAL_MA20_PERIOD);
    const prior20High = samples > WATCH_SIGNAL_BREAKOUT_PERIOD
        ? Math.max(...bars.slice(samples - 1 - WATCH_SIGNAL_BREAKOUT_PERIOD, samples - 1).map(bar => bar.close))
        : null;
    const result = {
        status: 'insufficient', reason: 'insufficient', sessionDate: today.sessionDate, samples,
        isFinal: today.isFinal, close: today.close, ma20, ma60,
        previousClose: previous?.close ?? null, previousMa20, prior20High,
    };
    if (samples < WATCH_SIGNAL_MIN_SAMPLES)
        return result;
    // All windows are complete after the sample gate. Risk observation takes precedence.
    result.reason = 'ok';
    if (today.close < ma20 && previous.close < previousMa20)
        result.status = 'sell';
    else if (today.close > prior20High && ma20 > ma60)
        result.status = 'buy';
    else
        result.status = 'watch';
    return result;
}
