// Gold panel contract shared by the Host and the browser. The numbers are
// read-only facts from one unofficial public endpoint; nothing here infers a
// trend, a recommendation or a currency that the source did not state.
//
// Sina's quote feed is GBK text with a per-market field layout. Each layout is
// parsed and validated separately, and a field that does not look like a price
// makes the instrument unavailable instead of being filled in with a guess.
import { quotePrecision } from './market.js';
export const GOLD_ENDPOINT = 'dsh-x-finance.gold';
export const GOLD_SOURCE_NAME = '新浪财经 (unofficial)';
export const GOLD_QUOTE_ENDPOINT = 'https://hq.sinajs.cn/list=';
export const GOLD_HISTORY_PATH = 'https://stock2.finance.sina.com.cn/futures/api/jsonp.php/';
export const GOLD_TIMEOUT_MS = 10_000;
/** The daily feed returns the full history; only the tail is kept. */
export const GOLD_MAX_BYTES = 4 * 1024 * 1024;
export const GOLD_HISTORY_BARS = 260;
export const GOLD_SNAPSHOT_TTL_MS = 15_000;
export const GOLD_HISTORY_TTL_MS = 10 * 60_000;
/** One troy ounce in grams; used only to restate a USD/oz price in CNY/g. */
export const TROY_OUNCE_GRAMS = 31.1034768;
const INSTRUMENTS = [
    { key: 'XAU', prefixes: ['hf_XAU'], unit: 'usd-ounce' },
    { key: 'GC', prefixes: ['hf_GC'], unit: 'usd-ounce' },
    { key: 'SI', prefixes: ['hf_SI'], unit: 'usd-ounce' },
    { key: 'AU9999', prefixes: ['gds_AU9999'], unit: 'cny-gram' },
    { key: 'AUTD', prefixes: ['gds_AUTD'], unit: 'cny-gram' },
    { key: 'USDCNH', prefixes: ['fx_susdcnh'], unit: 'cny-usd' },
];
/** The single batched request the panel issues. */
export const GOLD_QUOTE_KEYS = INSTRUMENTS.map(item => item.prefixes[0]);
const clean = (raw, max = 32) => {
    if (typeof raw !== 'string')
        return null;
    const value = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return value && [...value].length <= max ? value : null;
};
const number = (raw, min = 0, max = 1e9) => {
    if (typeof raw !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(raw.trim()))
        return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > min && value <= max ? value : null;
};
const percent = (raw) => raw !== null && Math.abs(raw) <= 50 ? raw : null;
/** `yyyy-MM-dd` + `HH:mm:ss` in Beijing time; missing or future stamps fail. */
export function goldStamp(date, time, now) {
    const day = typeof date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
    const clock = typeof time === 'string' ? /^(\d{2}):(\d{2}):(\d{2})$/.exec(time) : null;
    if (!day || !clock)
        return null;
    const [year, month, dateOfMonth] = [Number(day[1]), Number(day[2]), Number(day[3])];
    const calendar = new Date(Date.UTC(year, month - 1, dateOfMonth));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== dateOfMonth)
        return null;
    const [hour, minute, second] = [Number(clock[1]), Number(clock[2]), Number(clock[3])];
    if (hour > 23 || minute > 59 || second > 59)
        return null;
    const stamp = Date.UTC(year, month - 1, dateOfMonth, hour - 8, minute, second);
    if (!Number.isFinite(stamp) || stamp > now + 300_000)
        return null;
    // Gold trades almost around the clock but not through a long holiday.
    if (now - stamp > 10 * 24 * 60 * 60 * 1000)
        return null;
    return new Date(stamp).toISOString();
}
function build(key, unit, name, raw) {
    const change = raw.change ?? (raw.previousClose !== null && raw.previousClose !== undefined && raw.price !== null
        ? raw.price - raw.previousClose : null);
    const changePercent = raw.changePercent ?? (change !== null && raw.previousClose
        ? (change / raw.previousClose) * 100 : null);
    const amplitude = raw.high != null && raw.low != null && raw.high >= raw.low && raw.previousClose
        ? ((raw.high - raw.low) / raw.previousClose) * 100 : null;
    return {
        key, name, unit,
        price: raw.price,
        precision: raw.precision ?? null,
        change, changePercent: percent(changePercent),
        open: raw.open ?? null, high: raw.high ?? null, low: raw.low ?? null,
        previousClose: raw.previousClose ?? null,
        amplitudePercent: percent(amplitude),
        quotedAt: raw.quotedAt,
    };
}
/**
 * Parses one `hq_str_*="..."` payload. Futures and SGE symbols share the
 * `price,?,?,?,high,low,time,previousClose,open,...` layout; the offshore FX
 * line carries its own clock and change fields and only its price is used.
 */
export function parseGoldQuote(key, fields, now) {
    const spec = INSTRUMENTS.find(item => item.prefixes.includes(key));
    if (!spec)
        throw new Error('unknown gold instrument');
    if (key.startsWith('fx_')) {
        const price = number(fields[1], 0, 1e6);
        const changePercent = number(fields[10], -1e6, 1e6);
        const change = number(fields[11], -1e6, 1e6);
        const name = clean(fields[9]) ?? 'USD/CNH';
        // The FX layout appends the session date after empty padding, so it is
        // located by shape instead of a fixed index.
        const date = fields.find(field => /^\d{4}-\d{2}-\d{2}$/.test(field));
        const quotedAt = goldStamp(date, fields[0], now);
        if (price === null)
            throw new Error('invalid gold quote');
        return build(spec.key, spec.unit, name, {
            price,
            precision: quotePrecision(fields[1]),
            change: change !== null ? change : null,
            changePercent: changePercent !== null ? changePercent : null,
            quotedAt,
        });
    }
    const price = number(fields[0], 0, 1e6);
    const high = number(fields[4], 0, 1e6);
    const low = number(fields[5], 0, 1e6);
    const previousClose = number(fields[7], 0, 1e6);
    const open = number(fields[8], 0, 1e6);
    // The commodity layout puts the session date after a variable number of
    // padding fields, so it is located by shape and the label follows it.
    const dateIndex = fields.findIndex(field => /^\d{4}-\d{2}-\d{2}$/.test(field));
    const name = clean(dateIndex >= 0 ? fields[dateIndex + 1] : fields[14]) ?? spec.key;
    const quotedAt = goldStamp(dateIndex >= 0 ? fields[dateIndex] : null, fields[6], now);
    if (price === null)
        throw new Error('invalid gold quote');
    if (high !== null && low !== null && high < low)
        throw new Error('invalid gold quote range');
    return build(spec.key, spec.unit, name, {
        price,
        precision: quotePrecision(fields[0]),
        open: open ?? null,
        high: high ?? null,
        low: low ?? null,
        previousClose: previousClose ?? null,
        quotedAt,
    });
}
/** Splits `var hq_str_hf_XAU="a,b,c";` lines into validated instruments. */
export function parseGoldQuotes(text, now) {
    const found = new Map();
    for (const line of text.split('\n')) {
        const match = /^var hq_str_([A-Za-z0-9_]+)="([^"]*)";?$/.exec(line.trim());
        if (!match)
            continue;
        if (!GOLD_QUOTE_KEYS.includes(match[1]))
            continue;
        let instrument;
        try {
            instrument = parseGoldQuote(match[1], match[2].split(','), now);
        }
        catch {
            continue;
        }
        if (!found.has(instrument.key))
            found.set(instrument.key, instrument);
    }
    return INSTRUMENTS.flatMap(spec => found.get(spec.key) ?? []);
}
/** Parses the JSONP body of the daily series (`var _GC=([...]);`). */
export function parseGoldHistory(body) {
    const start = body.indexOf('['), end = body.lastIndexOf(']');
    if (start < 0 || end <= start)
        throw new Error('invalid gold history');
    const rows = JSON.parse(body.slice(start, end + 1));
    if (!Array.isArray(rows) || !rows.length)
        throw new Error('invalid gold history');
    const bars = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object')
            continue;
        const date = /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : null;
        const [open, high, low, close] = ['open', 'high', 'low', 'close'].map(field => {
            const value = Number(row[field]);
            return Number.isFinite(value) && value > 0 && value < 1e6 ? value : null;
        });
        if (!date || open === null || high === null || low === null || close === null)
            continue;
        if (high < low || high < Math.max(open, close) || low > Math.min(open, close))
            continue;
        if (bars.length && date <= bars[bars.length - 1].date)
            continue;
        bars.push({ date, open, high, low, close });
    }
    if (!bars.length)
        throw new Error('invalid gold history');
    return bars.slice(-GOLD_HISTORY_BARS);
}
const rangeChange = (bars, sessions) => {
    const last = bars[bars.length - 1];
    const base = bars[bars.length - 1 - sessions];
    if (!last || !base || base.close <= 0)
        return null;
    return (last.close / base.close - 1) * 100;
};
/** Year-to-date uses the last close of the previous year, never a guess. */
const yearToDate = (bars) => {
    const last = bars[bars.length - 1];
    if (!last)
        return null;
    const year = last.date.slice(0, 4);
    const base = [...bars].reverse().find(bar => bar.date.slice(0, 4) < year);
    if (!base || base.close <= 0)
        return null;
    return (last.close / base.close - 1) * 100;
};
export function computeGoldSeries(key, bars) {
    const window = bars.slice(-250);
    const last = bars[bars.length - 1] ?? null;
    const high52w = window.length ? Math.max(...window.map(bar => bar.high)) : null;
    const low52w = window.length ? Math.min(...window.map(bar => bar.low)) : null;
    return {
        key,
        lastClose: last?.close ?? null,
        lastDate: last?.date ?? null,
        ranges: [
            { label: '5d', changePercent: percent(rangeChange(bars, 5)) },
            { label: '20d', changePercent: percent(rangeChange(bars, 20)) },
            { label: '60d', changePercent: percent(rangeChange(bars, 60)) },
            { label: 'ytd', changePercent: percent(yearToDate(bars)) },
        ],
        high52w, low52w,
        drawdownPercent: last && high52w ? ((last.close - high52w) / high52w) * 100 : null,
    };
}
const byKey = (instruments, key) => instruments.find(item => item.key === key) ?? null;
/** CNY-per-gram restatement, the Shanghai premium and the gold/silver ratio. */
export function deriveGold(instruments) {
    const xau = byKey(instruments, 'XAU'), cnh = byKey(instruments, 'USDCNH');
    const sge = byKey(instruments, 'AU9999') ?? byKey(instruments, 'AUTD');
    const silver = byKey(instruments, 'SI');
    const londonCnyPerGram = xau && cnh ? (xau.price * cnh.price) / TROY_OUNCE_GRAMS : null;
    const shanghaiPremium = londonCnyPerGram && sge ? sge.price - londonCnyPerGram : null;
    return {
        londonCnyPerGram,
        shanghaiPremium,
        shanghaiPremiumPercent: shanghaiPremium !== null && londonCnyPerGram ? (shanghaiPremium / londonCnyPerGram) * 100 : null,
        goldSilverRatio: xau && silver && silver.price > 0 ? xau.price / silver.price : null,
    };
}
/**
 * Trust boundary: re-validates the provider's snapshot before it leaves the
 * Host. A value that fails here is reported as unavailable, never repaired.
 */
export function validateGoldSnapshot(raw, now) {
    if (!raw || typeof raw !== 'object')
        throw new Error('invalid gold snapshot');
    if (typeof raw.source !== 'string' || !raw.source || raw.source.length > 64)
        throw new Error('invalid gold source');
    const instruments = Array.isArray(raw.instruments) ? raw.instruments : [];
    const checked = instruments.map(item => {
        if (!item || typeof item !== 'object')
            throw new Error('invalid gold instrument');
        const spec = INSTRUMENTS.find(entry => entry.key === item.key);
        if (!spec)
            throw new Error('invalid gold instrument');
        const price = item.price;
        if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 1e6)
            throw new Error('invalid gold price');
        const optional = (value) => value === null ? null : (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1e6 ? value : null);
        const signed = (value) => value === null ? null : (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e6 ? value : null);
        const quotedAt = typeof item.quotedAt === 'string' && Number.isFinite(Date.parse(item.quotedAt)) && Date.parse(item.quotedAt) <= now + 300_000
            ? item.quotedAt : null;
        const rawPrecision = item.precision;
        const precision = typeof rawPrecision === 'number' && Number.isInteger(rawPrecision) && rawPrecision >= 0 && rawPrecision <= 6 ? rawPrecision : null;
        return {
            key: item.key, name: typeof item.name === 'string' ? item.name.slice(0, 32) : spec.key, unit: spec.unit,
            price, precision,
            change: signed(item.change), changePercent: percent(item.changePercent),
            open: optional(item.open), high: optional(item.high), low: optional(item.low), previousClose: optional(item.previousClose),
            amplitudePercent: percent(item.amplitudePercent),
            quotedAt,
        };
    });
    const series = (Array.isArray(raw.series) ? raw.series : []).filter((entry) => {
        if (!entry || typeof entry !== 'object' || !['XAU', 'GC'].includes(entry.key))
            return false;
        if (!Array.isArray(entry.ranges) || entry.ranges.length !== 4)
            return false;
        return entry.ranges.every((range) => ['5d', '20d', '60d', 'ytd'].includes(range.label)
            && (range.changePercent === null || (typeof range.changePercent === 'number' && Number.isFinite(range.changePercent) && Math.abs(range.changePercent) <= 500)));
    });
    return {
        source: raw.source,
        fetchedAt: new Date(now).toISOString(),
        instruments: checked,
        derived: deriveGold(checked),
        series,
        seriesIncomplete: series.length < 2,
    };
}
