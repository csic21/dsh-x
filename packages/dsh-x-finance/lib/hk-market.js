// Shared Hong-Kong-listing contract for the page lookup. Everything here is
// plain data and pure functions, so the Host, the browser bundle and the tests
// agree on identities, request shapes and validation without a network in the
// room.
//
// The HK board is part of the same explicitly opt-in local free source as the
// A-share board: one switch, one unofficial host family (Tencent), no API key.
// It is quote + forward-adjusted daily bars only. There is no HK fundamentals,
// no minute feed, no batch watchlist and no trading surface here.
//
// `HK.` is already the namespace of the four Hang Seng indices (HK.HSI and
// friends). Those are letters, not codes, and they keep their own route; a
// listing here is always `HK.` plus five digits, so the two never collide.
import { MAX_ABSOLUTE_PRICE } from './chart-data.js';
import { zonedQuoteTime } from './global.js';
import { zoneToday } from './market.js';
export const HK_ENDPOINT = 'dsh-x-finance.hk';
export const HK_SOURCE_NAME = '腾讯港股 (unofficial)';
export const HK_CURRENCY = 'HKD';
export const HK_EXCHANGE_TIME_ZONE = 'Asia/Hong_Kong';
/** Four years of daily bars, the same ceiling the A-share chart uses. */
export const HK_MAX_HISTORY = 1_000;
export const HK_QUOTE_MAX_BYTES = 64 * 1024;
export const HK_HISTORY_MAX_BYTES = 512 * 1024;
export const HK_TIMEOUT_MS = 10_000;
/** A suspended HK listing keeps a meaningful last price; a year is still the cutoff. */
export const HK_MAX_QUOTE_AGE_MS = 365 * 24 * 60 * 60_000;
const CODE_SHAPE = /^\d{5}$/;
const SYMBOL_SHAPE = /^HK\.(\d{5})$/;
/**
 * The Hong Kong exchange lists a RMB-traded counter of a stock 80,000 above
 * its HKD code (00700 → 80700, 02800 → 82800). They are real listings, but the
 * directory answers them next to the HKD line with the same name plus an `r`,
 * so surfacing both would turn every HK lookup into pairs. Only the HKD counter
 * is projected; the directory's row is not rewritten or guessed into anything.
 */
const RMB_COUNTER_MIN = 80_000;
const RMB_COUNTER_MAX = 89_999;
export function hkError(code, message) {
    return Object.assign(new Error(message), { code });
}
/** Canonical `HK.00700` identity. Rejects A-share, US and index codes. */
export function normalizeHkSymbol(input) {
    if (typeof input !== 'string')
        throw hkError('finance/hk-symbol', '港股代码无效。');
    const match = SYMBOL_SHAPE.exec(input.trim().toUpperCase());
    if (!match)
        throw hkError('finance/hk-symbol', '港股代码须形如 HK.00700。');
    return `HK.${match[1]}`;
}
export function isHkSymbol(input) {
    return typeof input === 'string' && SYMBOL_SHAPE.test(input.trim().toUpperCase());
}
/** Five-digit code without the namespace: `HK.00700` → `00700`. */
export function hkCodeOf(symbol) {
    const match = SYMBOL_SHAPE.exec(normalizeHkSymbol(symbol));
    return match[1];
}
/** Whether a directory code is the HKD counter of a dual-counter listing. */
export function isRmbCounterCode(code) {
    if (!CODE_SHAPE.test(code))
        return false;
    const value = Number(code);
    return value >= RMB_COUNTER_MIN && value <= RMB_COUNTER_MAX;
}
/**
 * Splits a directory code into the canonical identity, or null when the row is
 * not an HKD-counter Hong Kong listing. The directory writes codes with their
 * leading zeros, so the padding is preserved rather than re-derived.
 */
export function parseHkDirectoryCode(input) {
    if (typeof input !== 'string')
        return null;
    const code = input.trim();
    if (!CODE_SHAPE.test(code) || isRmbCounterCode(code))
        return null;
    return `HK.${code}`;
}
export function hkQuoteUrl(symbol) {
    return `https://qt.gtimg.cn/q=hk${hkCodeOf(symbol)}`;
}
export function hkHistoryUrl(symbol, limit) {
    const bounded = validateHkHistoryLimit(limit);
    return `https://proxy.finance.qq.com/ifzqgtimg/appstock/app/hkfqkline/get?param=hk${hkCodeOf(symbol)},day,,,${bounded},qfq`;
}
export function validateHkHistoryLimit(input) {
    if (!Number.isInteger(input) || input < 1 || input > HK_MAX_HISTORY) {
        throw hkError('finance/hk-invalid', '港股日 K 数量无效。');
    }
    return input;
}
const CONTROL = /[\u0000-\u001f\u007f]/g;
function cleanText(raw, max) {
    if (typeof raw !== 'string')
        return '';
    const text = raw.replace(CONTROL, '').trim();
    return text && [...text].length <= max ? text : '';
}
/** A finite number in range; `null` for blank, `undefined` for a malformed value. */
function readNumber(raw, min, max) {
    if (raw === '' || raw == null)
        return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < min || value > max)
        return undefined;
    return value;
}
function decimalsOf(raw) {
    const dot = raw.indexOf('.');
    return dot < 0 ? 0 : Math.min(6, raw.length - dot - 1);
}
/**
 * Projects the `v_hk00700="..."` payload. Unknown symbols come back as a single
 * field, which is "no such listing", not a transport failure. The HK layout is
 * close to the US one but not identical: turnover sits at 37 and the currency
 * at 75, so the indices are spelled out here rather than shared. Exported for
 * offline tests.
 */
export function parseHkQuote(text, symbol, now) {
    const canonical = normalizeHkSymbol(symbol);
    const code = hkCodeOf(canonical);
    if (typeof text !== 'string' || text.length > HK_QUOTE_MAX_BYTES) {
        throw hkError('finance/hk-quote-unavailable', '港股报价暂不可用。');
    }
    const match = new RegExp(`v_hk${code}="([^"]*)"`).exec(text);
    if (!match || !match[1])
        throw hkError('finance/hk-quote-unavailable', '没有这只港股的有效报价。');
    const fields = match[1].split('~');
    // An unknown code answers `v_hk99999="1"`: one sentinel field, no listing.
    if (fields.length < 2)
        throw hkError('finance/hk-quote-unavailable', '没有这只港股的有效报价。');
    if (fields.length < 38)
        throw hkError('finance/hk-quote-invalid', '港股报价响应格式无效。');
    const rawPrice = fields[3] ?? '';
    const price = readNumber(rawPrice, Number.MIN_VALUE, MAX_ABSOLUTE_PRICE);
    if (price === null || price === undefined)
        throw hkError('finance/hk-quote-invalid', '港股报价响应格式无效。');
    // The row must describe the security it was asked about.
    const echoed = (fields[2] ?? '').trim();
    if (echoed && echoed !== code)
        throw hkError('finance/hk-quote-invalid', '港股报价响应与请求代码不一致。');
    const currency = (fields[75] ?? '').trim().toUpperCase();
    if (currency && currency !== HK_CURRENCY)
        throw hkError('finance/hk-quote-invalid', '港股报价币种不是港币。');
    const optional = (index, max = MAX_ABSOLUTE_PRICE) => {
        const value = readNumber(fields[index], 0, max);
        if (value === undefined)
            throw hkError('finance/hk-quote-invalid', '港股报价包含无效数值。');
        return value === 0 ? null : value;
    };
    const previousClose = optional(4);
    const open = optional(5);
    const high = optional(33);
    const low = optional(34);
    const volume = optional(36, Number.MAX_SAFE_INTEGER);
    const amount = optional(37, Number.MAX_SAFE_INTEGER);
    const change = (() => {
        const value = readNumber(fields[31], -MAX_ABSOLUTE_PRICE, MAX_ABSOLUTE_PRICE);
        if (value === undefined)
            throw hkError('finance/hk-quote-invalid', '港股报价包含无效数值。');
        return value;
    })();
    const changePercent = (() => {
        const value = readNumber(fields[32], -10_000, 10_000);
        if (value === undefined)
            throw hkError('finance/hk-quote-invalid', '港股报价包含无效数值。');
        return value;
    })();
    if (high !== null && low !== null) {
        if (high < low)
            throw hkError('finance/hk-quote-invalid', '港股报价最高价低于最低价。');
        const slack = Math.max(0.005, price * 1e-4);
        if (price > high + slack || price < low - slack) {
            throw hkError('finance/hk-quote-invalid', '港股报价最新价不在当日区间内。');
        }
    }
    // Change fields are cross-checked against price and previous close instead of
    // being trusted: a shifted layout would otherwise publish a plausible lie.
    if (previousClose !== null && change !== null) {
        const expected = price - previousClose;
        if (Math.abs(change - expected) > Math.max(0.011, Math.abs(price) * 1e-4)) {
            throw hkError('finance/hk-quote-invalid', '港股报价涨跌额与价格不一致。');
        }
        if (changePercent !== null && previousClose > 0) {
            const percent = expected / previousClose * 100;
            if (Math.abs(changePercent - percent) > 0.05) {
                throw hkError('finance/hk-quote-invalid', '港股报价涨跌幅与价格不一致。');
            }
        }
    }
    return {
        symbol: canonical,
        name: cleanText(fields[1], 64),
        price,
        pricePrecision: decimalsOf(rawPrice),
        change,
        changePercent,
        open,
        high,
        low,
        previousClose,
        volume,
        amount,
        currency: HK_CURRENCY,
        quotedAt: zonedQuoteTime(fields[30], HK_EXCHANGE_TIME_ZONE, now, HK_MAX_QUOTE_AGE_MS),
        fetchedAt: new Date(now).toISOString(),
        marketStatus: 'unknown',
        source: HK_SOURCE_NAME,
    };
}
const SESSION_DATE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * The HK daily rows use the same open/close/high/low order as the A-share and
 * US feeds. Rows with impossible OHLC, duplicate or unsorted dates are dropped
 * rather than repaired; an empty result is reported as unavailable.
 */
export function parseHkDailyRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length > HK_MAX_HISTORY + 50)
        throw hkError('finance/hk-history-invalid', '港股日 K 响应过大。');
    const parsed = [];
    let previous = '';
    for (const row of list) {
        if (!Array.isArray(row) || row.length < 6)
            continue;
        const sessionDate = row[0];
        if (typeof sessionDate !== 'string' || !SESSION_DATE.test(sessionDate) || sessionDate <= previous)
            continue;
        const open = Number(row[1]), close = Number(row[2]), high = Number(row[3]), low = Number(row[4]);
        if (![open, close, high, low].every(Number.isFinite))
            continue;
        if (open <= 0 || close <= 0 || high <= 0 || low <= 0)
            continue;
        if (low > Math.min(open, close) || high < Math.max(open, close) || low > high)
            continue;
        if (Math.max(open, high, low, close) > MAX_ABSOLUTE_PRICE)
            continue;
        const rawVolume = row[5];
        const volume = rawVolume === '' || rawVolume == null ? null : Number(rawVolume);
        const rawAmount = row[8];
        const amount = rawAmount === '' || rawAmount == null ? null : Number(rawAmount);
        if (volume !== null && (!Number.isFinite(volume) || volume < 0))
            continue;
        if (amount !== null && (!Number.isFinite(amount) || amount < 0))
            continue;
        previous = sessionDate;
        parsed.push({ sessionDate, open, high, low, close, volume, amount });
    }
    if (!parsed.length)
        throw hkError('finance/hk-history-unavailable', '这只港股没有可用的日 K 数据。');
    return parsed;
}
/**
 * The daily endpoint reports HK volume in shares, but a unit claim needs
 * evidence: the embedded quote block carries the same session's volume, so a
 * matching last bar confirms shares. A row that does not match is left unknown
 * instead of being scaled by a guess — an unknown unit empties the volume
 * rather than publishing a plausible but wrong share count.
 */
export function hkVolumeBasis(rows, quotedVolume) {
    const last = rows.at(-1);
    if (!last || last.volume === null || quotedVolume === null || quotedVolume <= 0)
        return 'unknown';
    const ratio = last.volume / quotedVolume;
    return ratio >= 0.98 && ratio <= 1.02 ? 'shares' : 'unknown';
}
/**
 * The HK turnover column is printed in 万元 (the A-share convention) while the
 * quote block states HKD. The ratio between the two settles the unit: roughly
 * 10,000 means the column is 万元, roughly 1 means it is already HKD. Anything
 * else (a stale last bar, a shifted column) stays unknown and the amount is
 * omitted rather than scaled by a guess.
 */
export function hkAmountUnit(rows, quotedAmount) {
    const last = rows.at(-1);
    if (!last || last.amount === null || last.amount <= 0 || quotedAmount === null || quotedAmount <= 0)
        return 'unknown';
    const ratio = quotedAmount / last.amount;
    if (ratio >= 9_000 && ratio <= 11_000)
        return 'wan';
    if (ratio >= 0.9 && ratio <= 1.1)
        return 'yuan';
    return 'unknown';
}
function quoteField(entry, code, index) {
    const fields = entry?.qt?.[`hk${code}`];
    return Array.isArray(fields) ? fields[index] : undefined;
}
/** Projects the HK daily response; exported for offline tests. */
export function parseHkHistory(payload, options) {
    const { symbol, limit, now } = options;
    const canonical = normalizeHkSymbol(symbol);
    const code = hkCodeOf(canonical);
    const body = payload;
    if (!body || typeof body !== 'object' || body.code !== 0) {
        throw hkError('finance/hk-history-unavailable', '这只港股没有可用的日 K 数据。');
    }
    const entry = body.data?.[`hk${code}`];
    if (!entry || typeof entry !== 'object') {
        throw hkError('finance/hk-history-unavailable', '这只港股没有可用的日 K 数据。');
    }
    const adjusted = Array.isArray(entry.qfqday) && entry.qfqday.length;
    const key = adjusted ? 'qfqday' : Array.isArray(entry.day) && entry.day.length ? 'day' : null;
    const rows = key ? parseHkDailyRows(entry[key]) : null;
    if (!rows)
        throw hkError('finance/hk-history-unavailable', '这只港股没有可用的日 K 数据。');
    const bounded = limit > 0 && limit <= HK_MAX_HISTORY ? limit : HK_MAX_HISTORY;
    const bars = rows.slice(-bounded);
    const rawQuotedVolume = readNumber(quoteField(entry, code, 36), 0, Number.MAX_SAFE_INTEGER);
    const quotedVolume = typeof rawQuotedVolume === 'number' && rawQuotedVolume > 0 ? rawQuotedVolume : null;
    const rawQuotedAmount = readNumber(quoteField(entry, code, 37), 0, Number.MAX_SAFE_INTEGER);
    const quotedAmount = typeof rawQuotedAmount === 'number' && rawQuotedAmount > 0 ? rawQuotedAmount : null;
    const basis = hkVolumeBasis(bars, quotedVolume);
    const amountUnit = hkAmountUnit(bars, quotedAmount);
    const amountScale = amountUnit === 'wan' ? 10_000 : amountUnit === 'yuan' ? 1 : null;
    const today = zoneToday(now, HK_EXCHANGE_TIME_ZONE);
    const projected = bars.map((bar, index) => ({
        sessionDate: bar.sessionDate,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: basis === 'unknown' || bar.volume === null ? null : Math.round(bar.volume),
        amount: amountScale === null || bar.amount === null ? null : Math.round(bar.amount * amountScale),
        // Only today's newest bar can still be moving; the source has no close flag
        // for an HK row, so an older last bar is final.
        isFinal: index < bars.length - 1 || bar.sessionDate !== today,
    }));
    // Report what the source actually returned: when it answers without a qfq
    // series, the rows are unadjusted and are labelled that way.
    const adjustment = adjusted ? 'forward' : 'none';
    return {
        symbol: canonical,
        name: cleanText(quoteField(entry, code, 1), 64) || canonical,
        source: HK_SOURCE_NAME,
        fetchedAt: new Date(now).toISOString(),
        adjustment,
        adjustmentLabel: adjustment === 'forward' ? 'forward-adjusted (qfq)' : 'unadjusted',
        pricePrecision: 3,
        volumeUnit: 'shares',
        volumeBasis: basis,
        amountUnit: HK_CURRENCY,
        currency: HK_CURRENCY,
        exchangeTimezone: HK_EXCHANGE_TIME_ZONE,
        firstSessionDate: projected[0].sessionDate,
        lastSessionDate: projected.at(-1).sessionDate,
        bars: projected,
    };
}
const QUOTE_KEYS = ['kind', 'symbol'];
const HISTORY_KEYS = ['kind', 'limit', 'symbol'];
/**
 * Accepts only the two documented request shapes; extra keys are rejected.
 * Unlike the US route there is no venue code: the HK daily endpoint takes the
 * same five-digit code as the quote endpoint, so the identity is enough.
 */
export function parseHkRequest(payload) {
    if (!payload || Object.getPrototypeOf(payload) !== Object.prototype) {
        throw hkError('finance/hk-invalid', '港股请求格式无效。');
    }
    const value = payload;
    const keys = Object.keys(value).sort();
    if (keys.join(',') === QUOTE_KEYS.join(',') && value.kind === 'quote') {
        return { kind: 'quote', symbol: normalizeHkSymbol(value.symbol) };
    }
    if (keys.join(',') === HISTORY_KEYS.join(',') && value.kind === 'history') {
        return { kind: 'history', symbol: normalizeHkSymbol(value.symbol), limit: validateHkHistoryLimit(value.limit) };
    }
    throw hkError('finance/hk-invalid', '港股请求格式无效。');
}
/**
 * Re-validates a provider's quote at the RPC boundary, so a replacement
 * adapter cannot publish extra fields, another symbol or an impossible price.
 */
export function projectHkQuote(raw, symbol, now) {
    const canonical = normalizeHkSymbol(symbol);
    const value = raw;
    const price = value?.price;
    if (!value || typeof value !== 'object' || !Number.isFinite(price) || price <= 0 || price > MAX_ABSOLUTE_PRICE) {
        throw hkError('finance/hk-quote-invalid', '港股报价响应格式无效。');
    }
    if (value.symbol !== canonical)
        throw hkError('finance/hk-quote-invalid', '港股报价响应与请求代码不一致。');
    if (value.currency !== HK_CURRENCY)
        throw hkError('finance/hk-quote-invalid', '港股报价币种不是港币。');
    const precision = Number.isInteger(value.pricePrecision) && value.pricePrecision >= 0 && value.pricePrecision <= 6
        ? value.pricePrecision : 3;
    const optional = (input, max = MAX_ABSOLUTE_PRICE) => typeof input === 'number' && Number.isFinite(input) && input >= 0 && input <= max ? input : null;
    const signed = (input, max) => typeof input === 'number' && Number.isFinite(input) && Math.abs(input) <= max ? input : null;
    const quotedAt = typeof value.quotedAt === 'string' && Number.isFinite(Date.parse(value.quotedAt))
        && Date.parse(value.quotedAt) <= now + 300_000 ? value.quotedAt : null;
    return {
        symbol: canonical,
        name: typeof value.name === 'string' ? value.name.replace(CONTROL, '').trim().slice(0, 64) : '',
        price: price,
        pricePrecision: precision,
        change: signed(value.change, MAX_ABSOLUTE_PRICE),
        changePercent: signed(value.changePercent, 10_000),
        open: optional(value.open),
        high: optional(value.high),
        low: optional(value.low),
        previousClose: optional(value.previousClose),
        volume: optional(value.volume, Number.MAX_SAFE_INTEGER),
        amount: optional(value.amount, Number.MAX_SAFE_INTEGER),
        currency: HK_CURRENCY,
        quotedAt,
        fetchedAt: new Date(now).toISOString(),
        marketStatus: 'unknown',
        source: HK_SOURCE_NAME,
    };
}
/** Re-validates a provider's history: identity, bars, ordering and provenance. */
export function projectHkHistory(raw, symbol, now) {
    const canonical = normalizeHkSymbol(symbol);
    const value = raw;
    if (!value || typeof value !== 'object' || value.symbol !== canonical || !Array.isArray(value.bars) || !value.bars.length) {
        throw hkError('finance/hk-history-invalid', '港股日 K 响应格式无效。');
    }
    const bars = [];
    let previous = '';
    for (const bar of value.bars.slice(-HK_MAX_HISTORY)) {
        const date = bar?.sessionDate;
        if (typeof date !== 'string' || !SESSION_DATE.test(date) || date <= previous)
            continue;
        const [open, high, low, close] = [bar.open, bar.high, bar.low, bar.close];
        if (![open, high, low, close].every(Number.isFinite))
            continue;
        if (open <= 0 || close <= 0 || high <= 0 || low <= 0)
            continue;
        if (low > Math.min(open, close) || high < Math.max(open, close) || low > high)
            continue;
        if (Math.max(open, high, low, close) > MAX_ABSOLUTE_PRICE)
            continue;
        const volume = typeof bar.volume === 'number' && Number.isFinite(bar.volume) && bar.volume >= 0 ? bar.volume : null;
        const amount = typeof bar.amount === 'number' && Number.isFinite(bar.amount) && bar.amount >= 0 ? bar.amount : null;
        previous = date;
        bars.push({ sessionDate: date, open, high, low, close, volume, amount, isFinal: bar.isFinal === true });
    }
    if (!bars.length)
        throw hkError('finance/hk-history-invalid', '港股日 K 响应格式无效。');
    return {
        symbol: canonical,
        name: typeof value.name === 'string' ? value.name.replace(CONTROL, '').trim().slice(0, 64) : canonical,
        source: HK_SOURCE_NAME,
        fetchedAt: new Date(now).toISOString(),
        adjustment: value.adjustment === 'forward' || value.adjustment === 'backward' ? value.adjustment : 'none',
        adjustmentLabel: value.adjustment === 'forward' ? 'forward-adjusted (qfq)' : value.adjustment === 'backward' ? 'backward-adjusted (hfq)' : 'unadjusted',
        pricePrecision: 3,
        volumeUnit: 'shares',
        volumeBasis: value.volumeBasis === 'unknown' ? 'unknown' : 'shares',
        amountUnit: HK_CURRENCY,
        currency: HK_CURRENCY,
        exchangeTimezone: HK_EXCHANGE_TIME_ZONE,
        firstSessionDate: bars[0].sessionDate,
        lastSessionDate: bars.at(-1).sessionDate,
        bars,
    };
}
