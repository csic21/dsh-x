// Pure, deterministic quantitative analysis over an already-loaded daily
// series. Nothing here fetches, persists, predicts or recommends: it computes
// descriptive statistics and a declared, cost-aware rule replay. Every
// assumption is stated in the UI, and an input that cannot support a metric
// yields null instead of a substituted value.
import { bollinger, kdj, macd, sma } from './indicators.js';
export const QUANT_MAX_BARS = 5000;
export const QUANT_TRADING_DAYS = 252;
export const QUANT_RULE_KEYS = ['ma5-20', 'ma10-60', 'macd', 'kdj'];
const SESSION = /^\d{4}-\d{2}-\d{2}$/;
/**
 * Sorts, de-duplicates and bounds the series. A bar without a usable positive
 * OHLC is dropped; nothing is interpolated across the gap.
 */
export function normalizeQuantBars(input) {
    if (!Array.isArray(input))
        return [];
    const unique = new Map();
    for (const raw of input) {
        if (!raw || typeof raw !== 'object')
            continue;
        const bar = raw;
        if (typeof bar.sessionDate !== 'string' || !SESSION.test(bar.sessionDate))
            continue;
        const values = [bar.open, bar.high, bar.low, bar.close];
        if (!values.every(value => typeof value === 'number' && Number.isFinite(value) && value > 0))
            continue;
        const [open, high, low, close] = values;
        if (high < low || low > Math.min(open, close) || high < Math.max(open, close))
            continue;
        unique.set(bar.sessionDate, {
            sessionDate: bar.sessionDate,
            open, high, low, close,
            isFinal: bar.isFinal === true,
        });
    }
    return [...unique.values()].sort((left, right) => left.sessionDate.localeCompare(right.sessionDate)).slice(-QUANT_MAX_BARS);
}
function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
/** Sample standard deviation; null only when there are fewer than two samples. */
function stdev(values) {
    if (values.length < 2)
        return null;
    const average = mean(values);
    const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
}
function simpleReturns(values) {
    const returns = [];
    for (let index = 1; index < values.length; index++) {
        const previous = values[index - 1];
        if (previous > 0)
            returns.push(values[index] / previous - 1);
    }
    return returns;
}
function calendarDays(from, to) {
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    return Number.isFinite(start) && Number.isFinite(end) ? (end - start) / 86_400_000 : 0;
}
function annualized(first, last, from, to) {
    if (!(first > 0) || !(last > 0))
        return null;
    const days = calendarDays(from, to);
    // Annualising a few weeks produces a misleading number; leave it blank.
    if (days < 30)
        return null;
    return (last / first) ** (365.25 / days) - 1;
}
function maxDrawdownOf(series) {
    if (!series.length)
        return { value: null, peakDate: null, troughDate: null };
    let peak = series[0].value;
    let peakDate = series[0].date;
    let worst = 0;
    let worstPeak = null;
    let worstTrough = null;
    for (const point of series) {
        if (point.value > peak) {
            peak = point.value;
            peakDate = point.date;
        }
        if (peak > 0) {
            const drawdown = point.value / peak - 1;
            if (drawdown < worst) {
                worst = drawdown;
                worstPeak = peakDate;
                worstTrough = point.date;
            }
        }
    }
    return { value: worst, peakDate: worstPeak, troughDate: worstTrough };
}
function sharpeOf(series) {
    if (series.length < 21)
        return null;
    const returns = simpleReturns(series.map(point => point.value));
    const deviation = stdev(returns);
    if (deviation === null || deviation === 0)
        return null;
    return (mean(returns) / deviation) * Math.sqrt(QUANT_TRADING_DAYS);
}
/** Wilder ATR; null until a full warm-up window exists. */
export function averageTrueRange(bars, period = 14) {
    if (bars.length <= period)
        return null;
    const trueRanges = [];
    for (let index = 1; index < bars.length; index++) {
        const bar = bars[index], previous = bars[index - 1];
        trueRanges.push(Math.max(bar.high - bar.low, Math.abs(bar.high - previous.close), Math.abs(bar.low - previous.close)));
    }
    if (trueRanges.length < period)
        return null;
    let value = mean(trueRanges.slice(0, period));
    for (let index = period; index < trueRanges.length; index++) {
        value = (value * (period - 1) + trueRanges[index]) / period;
    }
    return value;
}
/** Wilder RSI. A perfectly flat window is neutral (50), not 0 or 100. */
export function relativeStrengthIndex(bars, period = 14) {
    if (bars.length <= period)
        return null;
    let gain = 0, loss = 0;
    for (let index = 1; index <= period; index++) {
        const difference = bars[index].close - bars[index - 1].close;
        if (difference >= 0)
            gain += difference;
        else
            loss -= difference;
    }
    let averageGain = gain / period;
    let averageLoss = loss / period;
    for (let index = period + 1; index < bars.length; index++) {
        const difference = bars[index].close - bars[index - 1].close;
        averageGain = (averageGain * (period - 1) + Math.max(difference, 0)) / period;
        averageLoss = (averageLoss * (period - 1) + Math.max(-difference, 0)) / period;
    }
    if (averageGain === 0 && averageLoss === 0)
        return 50;
    if (averageLoss === 0)
        return 100;
    if (averageGain === 0)
        return 0;
    return 100 - 100 / (1 + averageGain / averageLoss);
}
/** %B of a 20-period, 2-sigma Bollinger band; null when the band has no width. */
export function bollingerPercentB(bars, period = 20, multiplier = 2) {
    if (bars.length < period)
        return null;
    // One implementation, one set of digits: this card and the chart's %B pane
    // must never drift apart.
    return bollinger(bars.map(bar => bar.close), { period, multiplier }).percentB.at(-1) ?? null;
}
export function monthlyReturns(bars) {
    const groups = new Map();
    for (const bar of bars) {
        const key = bar.sessionDate.slice(0, 7);
        const rows = groups.get(key) ?? [];
        rows.push(bar);
        groups.set(key, rows);
    }
    const lastDate = bars.at(-1)?.sessionDate ?? '';
    return [...groups.entries()].map(([key, rows]) => {
        const first = rows[0], last = rows.at(-1);
        return {
            year: Number(key.slice(0, 4)),
            month: Number(key.slice(5, 7)),
            returnRatio: last.close / first.close - 1,
            bars: rows.length,
            partial: last.sessionDate === lastDate && last.isFinal === false,
        };
    });
}
export function computeQuantStats(input) {
    const bars = normalizeQuantBars(input);
    const empty = {
        samples: 0, from: null, to: null, totalReturn: null, cagr: null, annualVolatility: null,
        sharpe: null, maxDrawdown: null, drawdownPeakDate: null, drawdownTroughDate: null,
        dailyWinRate: null, bestDay: null, worstDay: null, averageDaily: null,
        atr14: null, rsi14: null, bollingerPercentB: null,
        ma20: null, ma60: null, ma120: null, priceVsMa20: null, priceVsMa60: null,
        momentum20: null, momentum60: null, momentum120: null,
        high52w: null, low52w: null, drawdownFromHigh: null, monthly: [],
    };
    if (!bars.length)
        return empty;
    const closes = bars.map(bar => bar.close);
    const last = bars.at(-1);
    const returns = simpleReturns(closes);
    const deviation = stdev(returns);
    const drawdown = maxDrawdownOf(bars.map(bar => ({ date: bar.sessionDate, value: bar.close })));
    const ma = (period) => closes.length >= period ? mean(closes.slice(-period)) : null;
    const ma20 = ma(20), ma60 = ma(60), ma120 = ma(120);
    const momentum = (period) => closes.length > period ? last.close / closes[closes.length - 1 - period] - 1 : null;
    const window = bars.slice(-Math.min(252, bars.length));
    const high52w = Math.max(...window.map(bar => bar.high));
    const low52w = Math.min(...window.map(bar => bar.low));
    return {
        samples: bars.length,
        from: bars[0].sessionDate,
        to: last.sessionDate,
        totalReturn: closes.length > 1 ? last.close / closes[0] - 1 : null,
        cagr: closes.length > 1 ? annualized(closes[0], last.close, bars[0].sessionDate, last.sessionDate) : null,
        annualVolatility: deviation === null ? null : deviation * Math.sqrt(QUANT_TRADING_DAYS),
        sharpe: deviation === null || deviation === 0 ? null : (mean(returns) / deviation) * Math.sqrt(QUANT_TRADING_DAYS),
        maxDrawdown: drawdown.value,
        drawdownPeakDate: drawdown.peakDate,
        drawdownTroughDate: drawdown.troughDate,
        dailyWinRate: returns.length ? returns.filter(value => value > 0).length / returns.length : null,
        bestDay: returns.length ? Math.max(...returns) : null,
        worstDay: returns.length ? Math.min(...returns) : null,
        averageDaily: returns.length ? mean(returns) : null,
        atr14: averageTrueRange(bars),
        rsi14: relativeStrengthIndex(bars),
        bollingerPercentB: bollingerPercentB(bars),
        ma20, ma60, ma120,
        priceVsMa20: ma20 === null ? null : last.close / ma20 - 1,
        priceVsMa60: ma60 === null ? null : last.close / ma60 - 1,
        momentum20: momentum(20),
        momentum60: momentum(60),
        momentum120: momentum(120),
        high52w, low52w,
        drawdownFromHigh: last.close / high52w - 1,
        monthly: monthlyReturns(bars),
    };
}
/** Pearson correlation of aligned daily returns; requires at least 20 pairs. */
export function correlationWith(left, right) {
    const first = normalizeQuantBars(left);
    const second = normalizeQuantBars(right);
    if (first.length < 21 || second.length < 21)
        return null;
    const byDate = new Map(second.map(bar => [bar.sessionDate, bar.close]));
    const aligned = [];
    for (const bar of first) {
        const other = byDate.get(bar.sessionDate);
        if (other !== undefined)
            aligned.push({ date: bar.sessionDate, left: bar.close, right: other });
    }
    if (aligned.length < 21)
        return null;
    const leftReturns = [], rightReturns = [];
    for (let index = 1; index < aligned.length; index++) {
        const previous = aligned[index - 1], current = aligned[index];
        leftReturns.push(current.left / previous.left - 1);
        rightReturns.push(current.right / previous.right - 1);
    }
    if (leftReturns.length < 20)
        return null;
    const leftMean = mean(leftReturns), rightMean = mean(rightReturns);
    let covariance = 0, leftVariance = 0, rightVariance = 0;
    for (let index = 0; index < leftReturns.length; index++) {
        const dl = leftReturns[index] - leftMean;
        const dr = rightReturns[index] - rightMean;
        covariance += dl * dr;
        leftVariance += dl * dl;
        rightVariance += dr * dr;
    }
    if (leftVariance === 0 || rightVariance === 0)
        return null;
    return { value: covariance / Math.sqrt(leftVariance * rightVariance), samples: leftReturns.length };
}
export function validateRule(raw) {
    return QUANT_RULE_KEYS.includes(raw) ? raw : 'ma5-20';
}
function costBps(raw, fallback) {
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : fallback;
}
function crossSignals(fast, slow) {
    const signals = [];
    let previous = null;
    for (let index = 0; index < fast.length; index++) {
        const fastValue = fast[index], slowValue = slow[index];
        if (fastValue == null || slowValue == null) {
            previous = null;
            signals.push(null);
            continue;
        }
        if (fastValue === slowValue) {
            signals.push(null);
            continue;
        }
        const side = fastValue > slowValue ? 'above' : 'below';
        signals.push(previous !== null && side !== previous ? (side === 'above' ? 'buy' : 'sell') : null);
        previous = side;
    }
    return signals;
}
/** Declared rule signals, evaluated at each close. Exported for tests. */
export function ruleSignals(bars, rule) {
    const closes = bars.map(bar => bar.close);
    if (rule === 'ma5-20')
        return crossSignals(sma(closes, 5), sma(closes, 20));
    if (rule === 'ma10-60')
        return crossSignals(sma(closes, 10), sma(closes, 60));
    if (rule === 'macd') {
        const value = macd(closes);
        return crossSignals(value.dif, value.dea);
    }
    const value = kdj(bars);
    return crossSignals(value.k, value.d);
}
/**
 * Long-only, fully invested rule replay. A signal is read at the close and
 * executed at the next bar's open; commission and slippage are applied on both
 * sides. No shorting, leverage, position sizing, dividends or taxes are
 * modelled, and the final open position is marked at the last close.
 */
export function runBacktest(input, options = {}) {
    const bars = normalizeQuantBars(input);
    const rule = validateRule(options.rule);
    const commissionBps = costBps(options.commissionBps, 5);
    const slippageBps = costBps(options.slippageBps, 5);
    const signals = ruleSignals(bars, rule);
    const buyFactor = (1 + commissionBps / 10_000) * (1 + slippageBps / 10_000);
    const sellFactor = (1 - commissionBps / 10_000) * (1 - slippageBps / 10_000);
    const trades = [];
    const points = [];
    let equity = 1;
    let position = null;
    let pending = null;
    let inMarket = 0;
    for (let index = 0; index < bars.length; index++) {
        const bar = bars[index];
        if (pending === 'buy' && !position) {
            const price = bar.open * buyFactor;
            position = { entryDate: bar.sessionDate, entryPrice: price, entryGross: bar.open, entryIndex: index };
        }
        else if (pending === 'sell' && position) {
            const price = bar.open * sellFactor;
            equity *= price / position.entryPrice;
            trades.push({
                entryDate: position.entryDate, exitDate: bar.sessionDate,
                entryPrice: position.entryGross, exitPrice: bar.open,
                returnRatio: price / position.entryPrice - 1,
                bars: index - position.entryIndex, open: false,
            });
            position = null;
        }
        pending = null;
        if (position)
            inMarket++;
        points.push({
            date: bar.sessionDate,
            strategy: position ? equity * (bar.close / position.entryPrice) : equity,
            buyHold: bar.close / bars[0].close,
        });
        if (index < bars.length - 1) {
            if (!position && signals[index] === 'buy')
                pending = 'buy';
            else if (position && signals[index] === 'sell')
                pending = 'sell';
        }
    }
    if (position) {
        const last = bars.at(-1);
        const price = last.close * sellFactor;
        equity *= price / position.entryPrice;
        trades.push({
            entryDate: position.entryDate, exitDate: last.sessionDate,
            entryPrice: position.entryGross, exitPrice: last.close,
            returnRatio: price / position.entryPrice - 1,
            bars: bars.length - 1 - position.entryIndex, open: true,
        });
        points[points.length - 1] = { ...points.at(-1), strategy: equity };
    }
    const wins = trades.filter(trade => trade.returnRatio > 0);
    const losses = trades.filter(trade => trade.returnRatio < 0);
    const gains = wins.reduce((sum, trade) => sum + trade.returnRatio, 0);
    const totalLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.returnRatio, 0));
    const drawdown = maxDrawdownOf(points.map(point => ({ date: point.date, value: point.strategy })));
    const strategyReturns = simpleReturns(points.map(point => point.strategy));
    const deviation = stdev(strategyReturns);
    return {
        rule, commissionBps, slippageBps,
        bars: bars.length,
        trades,
        points,
        totalReturn: points.length ? points.at(-1).strategy - 1 : null,
        buyHoldReturn: points.length ? points.at(-1).buyHold - 1 : null,
        cagr: points.length > 1 ? annualized(points[0].strategy, points.at(-1).strategy, points[0].date, points.at(-1).date) : null,
        maxDrawdown: drawdown.value,
        sharpe: deviation === null || deviation === 0 ? null : (mean(strategyReturns) / deviation) * Math.sqrt(QUANT_TRADING_DAYS),
        winRate: trades.length ? wins.length / trades.length : null,
        tradeCount: trades.length,
        averageTrade: trades.length ? trades.reduce((sum, trade) => sum + trade.returnRatio, 0) / trades.length : null,
        profitFactor: totalLoss > 0 ? gains / totalLoss : null,
        exposure: bars.length ? inMarket / bars.length : null,
    };
}
