// Local, deterministic screening for a market-wide "late-session volume dump".
//
// Every number here is computed from an already-fetched minute line and daily
// bars. Nothing is fetched, persisted, predicted or recommended. The scan is a
// description of one session: a high tail-volume ratio plus a falling tail is
// evidence of heavy selling into the close, not a forecast or an advice.
import { computeQuantStats } from './analytics.js';
import { isAshareMinute, shanghaiToday } from './market.js';
import { validateSymbol } from './watchlist.js';
/** How long one scan result may be reused by the Host. */
export const TAIL_SCAN_TTL_MS = 90_000;
/** Candidate minute lines fetched after the daily pre-screen. */
export const TAIL_SCAN_MAX_INTRADAY = 32;
/** Daily histories fetched for tail-confirmed candidates. */
export const TAIL_SCAN_MAX_HISTORY = 16;
/** Candidates returned to the browser. */
export const TAIL_SCAN_MAX_RESULTS = 20;
/** Minimum turnover for a stock to enter the scan (CNY). */
export const TAIL_SCAN_MIN_AMOUNT = 30_000_000;
/** Daily change must be at least this negative (percent). */
export const TAIL_SCAN_MIN_DAY_CHANGE = -0.5;
/** Daily volume ratio (Tencent field 49) must reach this value. */
export const TAIL_SCAN_MIN_VOLUME_RATIO = 1;
/** Tail volume / median prior 30-minute block. */
export const TAIL_SCAN_MIN_TAIL_RATIO = 1.3;
/** Tail return must be at least this negative (ratio). */
export const TAIL_SCAN_MIN_TAIL_CHANGE = -0.003;
/** A down day counts as volume expansion above this multiple of the prior 5-day mean. */
export const TAIL_SCAN_VOLUME_EXPANSION = 1.2;
/** Consecutive sessions needed for the "continuous" badge. */
export const TAIL_SCAN_MIN_STREAK = 2;
export const TAIL_SCAN_TAIL_START = '14:30';
export const TAIL_SCAN_TAIL_END = '15:00';
export const TAIL_SCAN_FILTERS = {
    minAmount: TAIL_SCAN_MIN_AMOUNT,
    minDayChange: TAIL_SCAN_MIN_DAY_CHANGE,
    minVolumeRatio: TAIL_SCAN_MIN_VOLUME_RATIO,
    minTailRatio: TAIL_SCAN_MIN_TAIL_RATIO,
    minTailChange: TAIL_SCAN_MIN_TAIL_CHANGE,
    volumeExpansionMultiple: TAIL_SCAN_VOLUME_EXPANSION,
    minStreak: TAIL_SCAN_MIN_STREAK,
};
const SESSION_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isSessionDate(value) {
    if (typeof value !== 'string' || !SESSION_DATE.test(value))
        return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
const MINUTE = /^\d{2}:\d{2}$/;
const BLOCKS = [
    ['10:00', '10:30'],
    ['10:30', '11:00'],
    ['11:00', '11:30'],
    ['13:00', '13:30'],
    ['13:30', '14:00'],
    ['14:00', '14:30'],
];
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function finite(value, min = -Infinity, max = Infinity) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function nullableNumber(value, min = -Infinity, max = Infinity) {
    return value === null || finite(value, min, max);
}
function nullableInteger(value, min = 0, max = 1e9) {
    return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max);
}
function median(values) {
    if (!values.length)
        return null;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function cleanPoints(input) {
    if (!Array.isArray(input))
        return [];
    const byTime = new Map();
    for (const raw of input) {
        if (!raw || typeof raw.time !== 'string' || !MINUTE.test(raw.time) || !isAshareMinute(raw.time))
            continue;
        if (!finite(raw.price, 0.0001, 1e12))
            continue;
        const volume = raw.volume === null ? null : finite(raw.volume, 0, Number.MAX_SAFE_INTEGER) ? raw.volume : undefined;
        if (volume === undefined)
            continue;
        const amount = raw.amount === undefined || raw.amount === null
            ? null
            : finite(raw.amount, 0, Number.MAX_SAFE_INTEGER) ? raw.amount : undefined;
        if (amount === undefined)
            continue;
        byTime.set(raw.time, { time: raw.time, price: raw.price, volume, amount });
    }
    return [...byTime.values()].sort((left, right) => left.time.localeCompare(right.time));
}
function totalVolume(points) {
    if (!points.length)
        return null;
    if (points.some(point => point.volume === null))
        return null;
    return points.reduce((sum, point) => sum + point.volume, 0);
}
/**
 * Computes the late-session metrics for one completed (or in-progress) minute
 * line. The tail is `(14:30, 15:00]`, so the 14:30 print is the reference price
 * and its volume belongs to the minute before the tail. The baseline is the
 * median of complete 30-minute blocks from 10:00 to 14:30; the opening half
 * hour is excluded because the opening auction distorts the first block.
 */
export function computeTailMetrics(input, options) {
    const points = cleanPoints(input);
    if (points.length < 2)
        throw new Error('tail-scan invalid minute line');
    const last = points.at(-1);
    const reference = [...points].reverse().find(point => point.time <= TAIL_SCAN_TAIL_START) ?? null;
    const tail = points.filter(point => point.time > TAIL_SCAN_TAIL_START && point.time <= TAIL_SCAN_TAIL_END);
    const blockVolumes = [];
    for (const [start, end] of BLOCKS) {
        const block = points.filter(point => point.time > start && point.time <= end);
        if (block.length < 25)
            continue;
        const volume = totalVolume(block);
        if (volume !== null)
            blockVolumes.push(volume);
    }
    const baselineVolume = blockVolumes.length >= 4 ? median(blockVolumes) : null;
    const tailVolume = totalVolume(tail);
    const dayVolume = totalVolume(points);
    const previousClose = finite(options.previousClose, 0.0001, 1e12) ? options.previousClose : null;
    return {
        sessionDate: options.sessionDate,
        complete: last.time >= TAIL_SCAN_TAIL_END && tail.length >= 25 && blockVolumes.length >= 4,
        tailStart: TAIL_SCAN_TAIL_START,
        tailEnd: TAIL_SCAN_TAIL_END,
        tailReturn: reference && tail.length > 0 && last.price > 0 ? last.price / reference.price - 1 : null,
        tailVolume,
        baselineVolume,
        tailVolumeRatio: tailVolume !== null && baselineVolume !== null && baselineVolume > 0 ? tailVolume / baselineVolume : null,
        tailVolumeShare: tailVolume !== null && dayVolume !== null && dayVolume > 0 ? tailVolume / dayVolume : null,
        dayReturn: previousClose !== null ? last.price / previousClose - 1 : null,
        points: points.length,
        blocks: blockVolumes.length,
    };
}
/**
 * Daily context for the same session. A missing volume on any comparison bar
 * makes that ratio null; no volume is inferred from turnover or price.
 */
export function computeDailyVolumeContext(input, sessionDate) {
    const empty = {
        sessionDate,
        volumeRatio5: null,
        volumeRatio20: null,
        downStreak: 0,
        volumeExpansionDownStreak: 0,
        volumeDeclineStreak: 0,
        distributionDays20: 0,
        downDays5: 0,
        downDays10: 0,
        todayReturn: null,
        prior5AvgVolume: null,
        isFinal: false,
        samples: 0,
    };
    if (!Array.isArray(input) || !isSessionDate(sessionDate))
        return empty;
    const unique = new Map();
    for (const raw of input) {
        if (!raw || typeof raw !== 'object')
            continue;
        const bar = raw;
        if (!isSessionDate(bar.sessionDate))
            continue;
        if (!finite(bar.close, 0.0001, 1e12))
            continue;
        if (bar.volume !== null && !finite(bar.volume, 0, Number.MAX_SAFE_INTEGER))
            continue;
        unique.set(bar.sessionDate, {
            sessionDate: bar.sessionDate,
            close: bar.close,
            volume: bar.volume,
            isFinal: bar.isFinal === true,
        });
    }
    const bars = [...unique.values()].sort((left, right) => left.sessionDate.localeCompare(right.sessionDate));
    const index = bars.findIndex(bar => bar.sessionDate === sessionDate);
    if (index < 0)
        return empty;
    const current = bars[index];
    const prior = (count) => {
        const start = index - count;
        if (start < 0)
            return null;
        const rows = bars.slice(start, index);
        if (rows.length !== count || rows.some(bar => bar.volume === null))
            return null;
        const average = mean(rows.map(bar => bar.volume));
        return average > 0 ? average : null;
    };
    const average5 = prior(5);
    const average20 = prior(20);
    const todayVolume = current.volume;
    const todayReturn = index > 0 ? current.close / bars[index - 1].close - 1 : null;
    let downStreak = 0;
    for (let cursor = index; cursor >= 1; cursor--) {
        if (!(bars[cursor].close < bars[cursor - 1].close))
            break;
        downStreak++;
    }
    let volumeExpansionDownStreak = 0;
    for (let cursor = index; cursor >= 1; cursor--) {
        const bar = bars[cursor];
        const previous = bars[cursor - 1];
        if (!(bar.close < previous.close))
            break;
        if (bar.volume === null || previous.volume === null || !(bar.volume > previous.volume))
            break;
        volumeExpansionDownStreak++;
    }
    let volumeDeclineStreak = 0;
    for (let cursor = index; cursor >= 1; cursor--) {
        if (!(bars[cursor].close < bars[cursor - 1].close))
            break;
        if (cursor < 5 || bars[cursor].volume === null)
            break;
        const rows = bars.slice(cursor - 5, cursor);
        if (rows.some(bar => bar.volume === null))
            break;
        const average = mean(rows.map(bar => bar.volume));
        if (!(average > 0) || bars[cursor].volume < TAIL_SCAN_VOLUME_EXPANSION * average)
            break;
        volumeDeclineStreak++;
    }
    let distributionDays20 = 0;
    for (let cursor = Math.max(1, index - 19); cursor <= index; cursor++) {
        const bar = bars[cursor];
        if (!(bar.close < bars[cursor - 1].close))
            continue;
        if (!(bar.close <= bars[cursor - 1].close * 0.98))
            continue;
        if (cursor < 5 || bar.volume === null)
            continue;
        const rows = bars.slice(cursor - 5, cursor);
        if (rows.some(row => row.volume === null))
            continue;
        const average = mean(rows.map(row => row.volume));
        if (average > 0 && bar.volume >= TAIL_SCAN_VOLUME_EXPANSION * average)
            distributionDays20++;
    }
    const downDays = (count) => {
        let value = 0;
        for (let cursor = Math.max(1, index - count + 1); cursor <= index; cursor++) {
            if (bars[cursor].close < bars[cursor - 1].close)
                value++;
        }
        return value;
    };
    return {
        sessionDate,
        volumeRatio5: todayVolume !== null && average5 !== null ? todayVolume / average5 : null,
        volumeRatio20: todayVolume !== null && average20 !== null ? todayVolume / average20 : null,
        downStreak,
        volumeExpansionDownStreak,
        volumeDeclineStreak,
        distributionDays20,
        downDays5: downDays(5),
        downDays10: downDays(10),
        todayReturn,
        prior5AvgVolume: average5,
        isFinal: current.isFinal === true,
        samples: bars.length,
    };
}
export function tailQuantSnapshot(stats) {
    return {
        samples: stats.samples,
        from: stats.from,
        to: stats.to,
        totalReturn: stats.totalReturn,
        annualVolatility: stats.annualVolatility,
        maxDrawdown: stats.maxDrawdown,
        sharpe: stats.sharpe,
        rsi14: stats.rsi14,
        atr14: stats.atr14,
        ma20: stats.ma20,
        ma60: stats.ma60,
        priceVsMa20: stats.priceVsMa20,
        priceVsMa60: stats.priceVsMa60,
        momentum20: stats.momentum20,
        momentum60: stats.momentum60,
        high52w: stats.high52w,
        low52w: stats.low52w,
        drawdownFromHigh: stats.drawdownFromHigh,
    };
}
export function tailQuantFromBars(bars) {
    return tailQuantSnapshot(computeQuantStats(bars));
}
const clamp01 = (value) => Math.min(1, Math.max(0, value));
/**
 * Explainable 0..100 score. The weights sum to 100:
 * tail volume 30, tail drop 25, day drop 15, daily volume 15, streak 15.
 * A missing component contributes zero, never a substitute value.
 */
export function scoreTailCandidate(input) {
    const streak = Math.max(input.daily?.volumeExpansionDownStreak ?? 0, input.daily?.volumeDeclineStreak ?? 0);
    const tailVolumePoints = input.tailVolumeRatio === null ? 0 : clamp01((input.tailVolumeRatio - 1) / 2) * 30;
    const tailDropPoints = input.tailReturn === null ? 0 : clamp01(-input.tailReturn / 0.03) * 25;
    const dayDropPoints = clamp01(-input.changePercent / 7) * 15;
    const dailyVolumePoints = input.daily?.volumeRatio5 == null ? 0 : clamp01((input.daily.volumeRatio5 - 1) / 2) * 15;
    const streakPoints = clamp01(streak / 3) * 15;
    const factors = [
        { key: 'tail-volume', points: Math.round(tailVolumePoints * 10) / 10, max: 30 },
        { key: 'tail-drop', points: Math.round(tailDropPoints * 10) / 10, max: 25 },
        { key: 'day-drop', points: Math.round(dayDropPoints * 10) / 10, max: 15 },
        { key: 'daily-volume', points: Math.round(dailyVolumePoints * 10) / 10, max: 15 },
        { key: 'streak', points: Math.round(streakPoints * 10) / 10, max: 15 },
    ];
    const tailDump = input.tailVolumeRatio !== null && input.tailVolumeRatio >= TAIL_SCAN_MIN_TAIL_RATIO
        && input.tailReturn !== null && input.tailReturn <= TAIL_SCAN_MIN_TAIL_CHANGE;
    return {
        score: Math.round(factors.reduce((sum, factor) => sum + factor.points, 0)),
        factors,
        flags: {
            tailDump,
            volumeExpansion: (input.daily?.volumeRatio5 ?? 0) >= TAIL_SCAN_VOLUME_EXPANSION || streak >= TAIL_SCAN_MIN_STREAK,
            consecutive: streak >= TAIL_SCAN_MIN_STREAK,
        },
    };
}
function projectDaily(raw, sessionDate) {
    if (raw === null || raw === undefined)
        return null;
    if (!isRecord(raw))
        throw new Error('tail-scan invalid daily context');
    if (raw.sessionDate !== sessionDate)
        throw new Error('tail-scan daily session mismatch');
    const ratio = (value) => value === null || finite(value, 0, 1e6);
    const nullable = (value, min, max) => value === null || finite(value, min, max);
    if (!ratio(raw.volumeRatio5) || !ratio(raw.volumeRatio20))
        throw new Error('tail-scan invalid daily ratio');
    for (const key of ['downStreak', 'volumeExpansionDownStreak', 'volumeDeclineStreak', 'distributionDays20', 'downDays5', 'downDays10', 'samples']) {
        if (!finite(raw[key], 0, 1e6) || !Number.isInteger(raw[key]))
            throw new Error('tail-scan invalid daily count');
    }
    if (!nullable(raw.todayReturn, -1, 10) || !nullable(raw.prior5AvgVolume, 0, Number.MAX_SAFE_INTEGER))
        throw new Error('tail-scan invalid daily value');
    if (typeof raw.isFinal !== 'boolean')
        throw new Error('tail-scan invalid daily final flag');
    return {
        sessionDate,
        volumeRatio5: raw.volumeRatio5,
        volumeRatio20: raw.volumeRatio20,
        downStreak: raw.downStreak,
        volumeExpansionDownStreak: raw.volumeExpansionDownStreak,
        volumeDeclineStreak: raw.volumeDeclineStreak,
        distributionDays20: raw.distributionDays20,
        downDays5: raw.downDays5,
        downDays10: raw.downDays10,
        todayReturn: raw.todayReturn,
        prior5AvgVolume: raw.prior5AvgVolume,
        isFinal: raw.isFinal,
        samples: raw.samples,
    };
}
function projectQuant(raw) {
    if (raw === null || raw === undefined)
        return null;
    if (!isRecord(raw))
        throw new Error('tail-scan invalid quant context');
    const keys = [
        'samples', 'from', 'to', 'totalReturn', 'annualVolatility', 'maxDrawdown', 'sharpe', 'rsi14', 'atr14',
        'ma20', 'ma60', 'priceVsMa20', 'priceVsMa60', 'momentum20', 'momentum60', 'high52w', 'low52w', 'drawdownFromHigh',
    ];
    for (const key of keys)
        if (!(key in raw))
            throw new Error('tail-scan missing quant field');
    if (!finite(raw.samples, 0, 1e6) || !Number.isInteger(raw.samples))
        throw new Error('tail-scan invalid quant samples');
    if (raw.from !== null && !isSessionDate(raw.from))
        throw new Error('tail-scan invalid quant from');
    if (raw.to !== null && !isSessionDate(raw.to))
        throw new Error('tail-scan invalid quant to');
    for (const key of ['totalReturn', 'annualVolatility', 'maxDrawdown', 'sharpe', 'rsi14', 'atr14', 'ma20', 'ma60', 'priceVsMa20', 'priceVsMa60', 'momentum20', 'momentum60', 'high52w', 'low52w', 'drawdownFromHigh']) {
        if (!nullableNumber(raw[key], -1e9, 1e9))
            throw new Error('tail-scan invalid quant value');
    }
    return {
        samples: raw.samples, from: raw.from, to: raw.to,
        totalReturn: raw.totalReturn, annualVolatility: raw.annualVolatility, maxDrawdown: raw.maxDrawdown,
        sharpe: raw.sharpe, rsi14: raw.rsi14, atr14: raw.atr14, ma20: raw.ma20, ma60: raw.ma60,
        priceVsMa20: raw.priceVsMa20, priceVsMa60: raw.priceVsMa60, momentum20: raw.momentum20, momentum60: raw.momentum60,
        high52w: raw.high52w, low52w: raw.low52w, drawdownFromHigh: raw.drawdownFromHigh,
    };
}
/**
 * Trust boundary for a provider-supplied scan. Required fields are re-checked,
 * optional contexts are kept only in their declared shape, and the score and
 * flags are recomputed from the metrics instead of trusting the adapter.
 */
export function projectTailScan(raw, now) {
    if (!isRecord(raw))
        throw new Error('tail-scan invalid result');
    const source = typeof raw.source === 'string' && raw.source.trim() && raw.source.length <= 64
        ? raw.source.replace(/[\u0000-\u001f\u007f]/g, '').trim()
        : null;
    if (!source)
        throw new Error('tail-scan invalid source');
    const sessionDate = raw.sessionDate === null ? null : isSessionDate(raw.sessionDate) ? raw.sessionDate : undefined;
    if (sessionDate === undefined)
        throw new Error('tail-scan invalid session date');
    const universe = raw.universe;
    if (!isRecord(universe) || typeof raw.complete !== 'boolean')
        throw new Error('tail-scan invalid universe');
    const counts = ['expected', 'covered', 'screened', 'intradayChecked', 'tailConfirmed', 'historyChecked', 'failedIntraday', 'failedHistory'];
    for (const key of counts) {
        if (typeof universe[key] !== 'number' || !Number.isInteger(universe[key]) || universe[key] < 0 || universe[key] > 100_000)
            throw new Error('tail-scan invalid universe count');
    }
    if (typeof universe.partial !== 'boolean')
        throw new Error('tail-scan invalid partial flag');
    const rawCandidates = Array.isArray(raw.candidates) ? raw.candidates : null;
    if (!rawCandidates || rawCandidates.length > TAIL_SCAN_MAX_RESULTS)
        throw new Error('tail-scan invalid candidate list');
    const candidates = rawCandidates.map(item => {
        if (!isRecord(item))
            throw new Error('tail-scan invalid candidate');
        if (typeof item.symbol !== 'string')
            throw new Error('tail-scan invalid symbol');
        const symbol = validateSymbol(item.symbol);
        if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 64)
            throw new Error('tail-scan invalid name');
        if (!finite(item.price, 0.0001, 1e12) || !finite(item.changePercent, -1000, 1000))
            throw new Error('tail-scan invalid quote');
        if (!finite(item.amount, 0, 1e15))
            throw new Error('tail-scan invalid amount');
        if (!nullableNumber(item.turnoverPercent, 0, 1000) || !nullableNumber(item.volumeRatio, 0, 1e4) || !nullableNumber(item.fiveMinuteChange, -100, 100))
            throw new Error('tail-scan invalid quote field');
        if (typeof item.sessionDate !== 'string' || item.sessionDate !== sessionDate)
            throw new Error('tail-scan candidate session mismatch');
        const tail = item.tail;
        if (!isRecord(tail) || typeof tail.complete !== 'boolean')
            throw new Error('tail-scan invalid tail');
        if (!nullableNumber(tail.tailReturn, -1, 1) || !nullableNumber(tail.tailVolumeRatio, 0, 1e6) || !nullableNumber(tail.tailVolumeShare, 0, 1))
            throw new Error('tail-scan invalid tail metric');
        if (!nullableNumber(tail.dayReturn, -1, 10) || !nullableNumber(tail.tailVolume, 0, Number.MAX_SAFE_INTEGER) || !nullableNumber(tail.baselineVolume, 0, Number.MAX_SAFE_INTEGER))
            throw new Error('tail-scan invalid tail volume');
        if (!finite(tail.points, 0, 1000) || !Number.isInteger(tail.points) || !finite(tail.blocks, 0, 1000) || !Number.isInteger(tail.blocks))
            throw new Error('tail-scan invalid tail count');
        if (typeof tail.tailStart !== 'string' || typeof tail.tailEnd !== 'string')
            throw new Error('tail-scan invalid tail window');
        const daily = projectDaily(item.daily, sessionDate);
        const quant = projectQuant(item.quant);
        const adjustment = item.adjustment === null ? null : ['none', 'forward', 'backward'].includes(item.adjustment) ? item.adjustment : undefined;
        if (adjustment === undefined)
            throw new Error('tail-scan invalid adjustment');
        if (typeof item.historyAvailable !== 'boolean')
            throw new Error('tail-scan invalid history flag');
        const scored = scoreTailCandidate({ tailReturn: tail.tailReturn, tailVolumeRatio: tail.tailVolumeRatio, changePercent: item.changePercent, daily });
        return {
            symbol,
            name: item.name.replace(/[\u0000-\u001f\u007f]/g, '').trim(),
            price: item.price,
            changePercent: item.changePercent,
            amount: item.amount,
            turnoverPercent: item.turnoverPercent,
            volumeRatio: item.volumeRatio,
            fiveMinuteChange: item.fiveMinuteChange,
            sessionDate,
            tail: {
                sessionDate,
                complete: tail.complete,
                tailStart: tail.tailStart,
                tailEnd: tail.tailEnd,
                tailReturn: tail.tailReturn,
                tailVolume: tail.tailVolume,
                baselineVolume: tail.baselineVolume,
                tailVolumeRatio: tail.tailVolumeRatio,
                tailVolumeShare: tail.tailVolumeShare,
                dayReturn: tail.dayReturn,
                points: tail.points,
                blocks: tail.blocks,
            },
            daily,
            quant,
            historyAvailable: item.historyAvailable,
            adjustment,
            ...scored,
        };
    }).sort((left, right) => right.score - left.score);
    return {
        source,
        fetchedAt: new Date(now).toISOString(),
        sessionDate,
        sessionIsToday: sessionDate !== null && sessionDate === shanghaiToday(now),
        complete: raw.complete && sessionDate !== null && candidates.every(candidate => candidate.tail.complete),
        universe: {
            expected: universe.expected,
            covered: universe.covered,
            screened: universe.screened,
            intradayChecked: universe.intradayChecked,
            tailConfirmed: universe.tailConfirmed,
            historyChecked: universe.historyChecked,
            failedIntraday: universe.failedIntraday,
            failedHistory: universe.failedHistory,
            partial: universe.partial,
        },
        filters: TAIL_SCAN_FILTERS,
        candidates,
    };
}
/** Exported for tests; the provider uses the same scale. */
export function tailBlockCount() {
    return BLOCKS.length;
}
