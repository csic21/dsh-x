import { boardLimitRate, predictFeatures, percentileRank } from './predict-features.js';
import { PREDICT_MODEL } from './predict-model.js';
/** Percentile boundaries behind the cold / normal / hot label. */
export const REGIME_COLD_MAX = 33;
export const REGIME_HOT_MIN = 67;
/** Rows returned to the browser. */
export const PREDICT_MAX_ROWS = 60;
/** Snapshot candidates that also receive daily bars. */
export const PREDICT_MAX_CANDIDATES = 90;
/** Daily bars requested per candidate; features need 30. */
export const PREDICT_BARS = 80;
/** A finished scan may be reused for this long. */
export const PREDICT_TTL_MS = 120_000;
/** Bound on one projection, so a hostile adapter cannot flood the client. */
export const PREDICT_MAX_DURATION_MS = 600_000;
const MODEL_INDEX = new Map(PREDICT_MODEL.features.map((name, index) => [name, index]));
/**
 * Feature ids that describe one stock, so a market-wide value is not repeated
 * per row. The board streak, the limit close and the distance to the limit are
 * left out on purpose: they are already the "N 板" chip, and repeating them as a
 * reason would say nothing a reader cannot see.
 */
const STOCK_FEATURES = [
    'ret5', 'ret20', 'gap', 'amplitude', 'closePos', 'volRatio5', 'amtRatio20',
    'ma5Dist', 'ma20Dist', 'burst5', 'limitCount20', 'fromHigh20',
];
/**
 * Standardises one feature exactly the way the research script did, including
 * the five-deviation clip: an unseen spike then contributes as much as the
 * largest one in the training sample instead of taking over the score.
 */
function standardised(vector, name) {
    const modelIndex = MODEL_INDEX.get(name);
    if (modelIndex === undefined)
        return 0;
    const mean = PREDICT_MODEL.mean[modelIndex] ?? 0;
    const scale = PREDICT_MODEL.scale[modelIndex] || 1;
    return Math.max(-5, Math.min(5, (vector[name] - mean) / scale));
}
function linearScore(weights, names, vector) {
    let value = weights.intercept;
    for (const name of names)
        value += (weights.coef[MODEL_INDEX.get(name) ?? -1] ?? 0) * standardised(vector, name);
    return value;
}
/**
 * Applies the shipped coefficients to one feature vector. The output is a
 * probability of the next session closing limit-up; the model predicts no
 * return, because the measured out-of-sample rank correlation for returns is
 * negative and a point estimate would be false precision.
 */
export function predictProbability(vector) {
    const eta = linearScore(PREDICT_MODEL.limitUp, PREDICT_MODEL.features, vector);
    return Math.min(0.999, Math.max(0.001, 1 / (1 + Math.exp(-Math.max(-12, Math.min(12, eta))))));
}
/** Strongest stock-level contributors to the promotion probability. */
export function predictReasons(vector) {
    const scored = STOCK_FEATURES
        .map(name => ({
        name,
        contribution: (PREDICT_MODEL.limitUp.coef[MODEL_INDEX.get(name) ?? -1] ?? 0) * standardised(vector, name),
    }))
        .filter(entry => Math.abs(entry.contribution) > 0.05)
        .sort((left, right) => right.contribution - left.contribution);
    const reasons = scored.filter(entry => entry.contribution > 0).slice(0, 2).map(entry => entry.name);
    const negative = scored.filter(entry => entry.contribution < 0).slice(-1).map(entry => entry.name);
    const risks = [...negative];
    if (vector.streak >= 3)
        risks.push('high-board');
    if (vector.burst5 >= 2)
        risks.push('failed-boards');
    if (vector.volRatio5 >= 3)
        risks.push('volume-spike');
    if (vector.oneWord >= 1)
        risks.push('one-word');
    if (vector.ma20Dist >= 25)
        risks.push('extended');
    if (vector.closePos <= 0.3)
        risks.push('weak-close');
    return { reasons, risks: [...new Set(risks)].slice(0, 3) };
}
export function baseBucketFor(table, value) {
    for (const bucket of table) {
        if (value >= bucket.from && (bucket.to === null || value <= bucket.to))
            return bucket;
    }
    return null;
}
export function readRegime(cross) {
    const rank = percentileRank(PREDICT_MODEL.transform.hotShare, cross.hotShare);
    return { rank, level: rank < REGIME_COLD_MAX ? 'cold' : rank >= REGIME_HOT_MIN ? 'hot' : 'normal' };
}
/**
 * Turns one snapshot candidate into a row, or null when the history is too
 * short or carries a hole. The board rate comes from the symbol and the quoted
 * name, never from the browser.
 */
export function scoreCandidate(candidate, cross) {
    const rate = boardLimitRate(candidate.symbol, candidate.name);
    if (rate === null)
        return null;
    const vector = predictFeatures(candidate.bars, rate, cross, PREDICT_MODEL.transform);
    if (!vector)
        return null;
    const pLimitUp = predictProbability(vector);
    const streakBucket = baseBucketFor(PREDICT_MODEL.baseRates.streak, vector.streak);
    const { reasons, risks } = predictReasons(vector);
    if (!Number.isFinite(pLimitUp))
        return null;
    return {
        symbol: candidate.symbol,
        name: candidate.name,
        price: candidate.price,
        changePercent: candidate.changePercent,
        limitRate: rate,
        streak: vector.streak,
        oneWord: vector.oneWord >= 1,
        pLimitUp,
        basePLimitUp: streakBucket?.pLimitUp ?? 0,
        edge: pLimitUp * 100 - (streakBucket?.pLimitUp ?? 0),
        baseTradeReturn: streakBucket?.tradeReturn ?? 0,
        baseWinRate: streakBucket?.winRate ?? 0,
        baseN: streakBucket?.n ?? 0,
        reasons,
        risks,
    };
}
/**
 * Ranks by promotion probability, then by streak, then by symbol. Ordering by
 * return would mean inventing a return model: the measured out-of-sample rank
 * correlation for returns is negative, so the probability is the only ordering
 * this pipeline can defend.
 */
export function sortPredictRows(rows) {
    return rows.slice().sort((left, right) => right.pLimitUp - left.pLimitUp
        || right.streak - left.streak
        || left.symbol.localeCompare(right.symbol));
}
/**
 * Re-validates a Host result at the browser boundary, exactly like the other
 * market projections: unknown fields are dropped, out-of-range numbers are
 * rejected instead of repaired, and a row is only kept when its feature ids are
 * known. A model file that no longer matches the feature list fails here rather
 * than showing a wrong number.
 */
export function projectPredictScan(raw, now) {
    const fail = () => Object.assign(new Error('predict scan unavailable'), { code: 'finance/predict-scan-invalid' });
    const value = raw;
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw fail();
    const finite = (input, min, max) => typeof input === 'number' && Number.isFinite(input) && input >= min && input <= max ? input : null;
    const text = (input, max) => typeof input === 'string' && input.trim() && input.length <= max
        ? input.replace(/[\u0000-\u001f\u007f]/g, '').trim() : null;
    const enumerable = (input, allowed) => allowed.includes(input) ? input : null;
    const source = text(value.source, 64);
    const sessionDate = text(value.sessionDate, 10);
    if (!source || !sessionDate || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate))
        throw fail();
    const durationMs = finite(value.durationMs, 0, PREDICT_MAX_DURATION_MS);
    const barFinal = value.barFinal;
    if (durationMs === null || typeof barFinal !== 'boolean')
        throw fail();
    const model = value.model;
    if (!model || typeof model !== 'object')
        throw fail();
    const version = finite(model.version, 1, 9999);
    const trainedThrough = text(model.trainedThrough, 10);
    const costPercent = finite(model.costPercent, 0, 5);
    const staleDays = finite(model.staleDays, 0, 3650);
    if (version === null || !trainedThrough || costPercent === null || staleDays === null)
        throw fail();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trainedThrough))
        throw fail();
    const sample = model.sample;
    const metrics = model.metrics;
    if (!sample || typeof sample !== 'object' || !metrics || typeof metrics !== 'object')
        throw fail();
    const sampleOut = {
        stocks: finite(sample.stocks, 1, 100_000) ?? 0,
        rows: finite(sample.rows, 1, 10_000_000) ?? 0,
        from: text(sample.from, 10) ?? trainedThrough,
        to: text(sample.to, 10) ?? trainedThrough,
        days: finite(sample.days, 1, 20_000) ?? 0,
    };
    const holdout = metrics.holdout;
    if (!holdout || typeof holdout !== 'object')
        throw fail();
    const holdoutOut = {
        from: text(holdout.from, 10) ?? trainedThrough,
        to: text(holdout.to, 10) ?? trainedThrough,
        rows: finite(holdout.rows, 1, 10_000_000) ?? 0,
        days: finite(holdout.days, 1, 20_000) ?? 0,
    };
    const calibration = [];
    for (const row of Array.isArray(metrics.calibration) ? metrics.calibration.slice(0, 20) : []) {
        if (!row || typeof row !== 'object')
            continue;
        const bin = finite(row.bin, 0, 19);
        const n = finite(row.n, 0, 10_000_000);
        const predicted = finite(row.predicted, 0, 100);
        const actual = finite(row.actual, 0, 100);
        if (bin === null || n === null || predicted === null || actual === null)
            continue;
        calibration.push({ bin, n, predicted, actual });
    }
    const backtests = (raw) => {
        const list = [];
        for (const row of Array.isArray(raw) ? raw.slice(0, 6) : []) {
            if (!row || typeof row !== 'object')
                continue;
            const k = finite(row.k, 1, 100);
            if (k === null)
                continue;
            list.push({
                k,
                days: finite(row.days, 0, 100_000) ?? 0,
                trades: finite(row.trades, 0, 1_000_000) ?? 0,
                winRate: finite(row.winRate, 0, 100) ?? 0,
                avgNet: finite(row.avgNet, -50, 50) ?? 0,
                total: finite(row.total, -100, 100_000) ?? 0,
                maxDrawdown: finite(row.maxDrawdown, -100, 0) ?? 0,
            });
        }
        return list;
    };
    const groups = (raw, max) => {
        const list = [];
        for (const row of Array.isArray(raw) ? raw.slice(0, max) : []) {
            if (!row || typeof row !== 'object')
                continue;
            const key = text(row.key, 24);
            if (!key)
                continue;
            list.push({
                key,
                n: finite(row.n, 0, 10_000_000) ?? 0,
                pLimitUp: finite(row.pLimitUp, 0, 100) ?? 0,
                tradeReturn: finite(row.tradeReturn, -100, 100) ?? 0,
                winRate: finite(row.winRate, 0, 100) ?? 0,
            });
        }
        return list;
    };
    const metricsOut = {
        holdout: holdoutOut,
        auc: finite(metrics.auc, 0, 1) ?? 0.5,
        brier: finite(metrics.brier, 0, 1) ?? 0,
        baseRate: finite(metrics.baseRate, 0, 100) ?? 0,
        ic: finite(metrics.ic, -1, 1) ?? 0,
        calibration,
        top: backtests(metrics.top),
        byRegime: groups(metrics.byRegime, 4),
        byProbability: groups(metrics.byProbability, 6),
    };
    const regime = value.regime;
    if (!regime || typeof regime !== 'object')
        throw fail();
    const hotShare = finite(regime.hotShare, 0, 100);
    const upShare = finite(regime.upShare, 0, 100);
    const medianChange = finite(regime.medianChange, -100, 100);
    const rank = finite(regime.rank, 0, 100);
    const level = enumerable(regime.level, ['cold', 'normal', 'hot']);
    if (hotShare === null || upShare === null || medianChange === null || rank === null || !level)
        throw fail();
    if ((level === 'cold') !== (rank < REGIME_COLD_MAX))
        throw fail();
    if ((level === 'hot') !== (rank >= REGIME_HOT_MIN))
        throw fail();
    const universe = value.universe;
    if (!universe || typeof universe !== 'object')
        throw fail();
    const universeOut = {
        expected: finite(universe.expected, 0, 100_000) ?? 0,
        covered: finite(universe.covered, 0, 100_000) ?? 0,
        candidates: finite(universe.candidates, 0, 100_000) ?? 0,
        scored: finite(universe.scored, 0, 100_000) ?? 0,
        failed: finite(universe.failed, 0, 100_000) ?? 0,
        partial: universe.partial === true,
    };
    let board = null;
    if (value.board !== null && value.board !== undefined) {
        const code = text(value.board.code, 8);
        const name = text(value.board.name, 32);
        if (!code || !name || !/^801\d{3}$/.test(code))
            throw fail();
        board = { code, name };
    }
    const baseRates = readBaseRates(value.baseRates, finite, text);
    const rows = [];
    for (const row of Array.isArray(value.rows) ? value.rows.slice(0, PREDICT_MAX_ROWS) : []) {
        if (!row || typeof row !== 'object' || Array.isArray(row))
            continue;
        const symbol = text(row.symbol, 12);
        const name = text(row.name, 64);
        if (!symbol || !/^(SH|SZ|BJ)\.\d{6}$/.test(symbol) || !name)
            continue;
        const price = finite(row.price, 0.0001, 1e9);
        const changePercent = finite(row.changePercent, -100, 100);
        const limitRate = finite(row.limitRate, 1, 30);
        const streak = finite(row.streak, 0, 20);
        const pLimitUp = finite(row.pLimitUp, 0, 1);
        const edge = finite(row.edge, -100, 100);
        if (price === null || changePercent === null || limitRate === null || streak === null)
            continue;
        if (pLimitUp === null || edge === null)
            continue;
        if (!Array.isArray(row.reasons) || !Array.isArray(row.risks))
            continue;
        if (typeof row.oneWord !== 'boolean')
            continue;
        const reasons = row.reasons.filter((id) => STOCK_FEATURES.includes(id)).slice(0, 4);
        const risks = row.risks.filter((id) => typeof id === 'string' && RISK_IDS.includes(id)).slice(0, 4);
        rows.push({
            symbol, name, price, changePercent, limitRate, streak, oneWord: row.oneWord,
            pLimitUp,
            basePLimitUp: finite(row.basePLimitUp, 0, 100) ?? 0,
            edge,
            baseTradeReturn: finite(row.baseTradeReturn, -50, 50) ?? 0,
            baseWinRate: finite(row.baseWinRate, 0, 100) ?? 0,
            baseN: finite(row.baseN, 0, 10_000_000) ?? 0,
            reasons,
            risks,
        });
    }
    return {
        source,
        fetchedAt: new Date(now).toISOString(),
        sessionDate,
        barFinal,
        durationMs: Math.round(durationMs),
        board,
        model: { version, trainedThrough, costPercent, staleDays, sample: sampleOut, metrics: metricsOut },
        regime: {
            upShare, hotShare, medianChange, rank, level,
            base: readBucket(regime.base, finite, text),
        },
        universe: universeOut,
        baseRates,
        rows: sortPredictRows(rows),
    };
}
const RISK_IDS = ['high-board', 'failed-boards', 'volume-spike', 'one-word', 'extended', 'weak-close'];
function readBucket(raw, finite, text) {
    if (!raw || typeof raw !== 'object')
        return null;
    const key = text(raw.key, 32);
    if (!key)
        return null;
    return {
        key,
        from: finite(raw.from, -1000, 1000) ?? 0,
        to: raw.to === null ? null : finite(raw.to, -1000, 1000),
        n: finite(raw.n, 0, 10_000_000) ?? 0,
        pLimitUp: finite(raw.pLimitUp, 0, 100) ?? 0,
        gapNext: finite(raw.gapNext, -100, 100) ?? 0,
        tradeReturn: finite(raw.tradeReturn, -100, 100) ?? 0,
        winRate: finite(raw.winRate, 0, 100) ?? 0,
        medianTradeReturn: finite(raw.medianTradeReturn, -100, 100) ?? 0,
    };
}
function readBaseRates(raw, finite, text) {
    const table = (key) => {
        const rows = [];
        for (const row of Array.isArray(raw?.[key]) ? raw[key].slice(0, 12) : []) {
            const bucket = readBucket(row, finite, text);
            if (bucket)
                rows.push(bucket);
        }
        return rows;
    };
    return { streak: table('streak'), sentiment: table('sentiment'), position: table('position') };
}
