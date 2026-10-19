// Optional, opt-in A-share market-board adapter backed by Tencent's public
// quote and ranking endpoints. This is NOT a licensed market-data feed: no
// SLA, no redistribution right, and it can break, delay or rate-limit at any
// time. It exists for local, single-user use behind an explicit opt-in and
// must never become the default source of a distributed build.
//
// Only projected fields leave this module. Raw payloads, upstream errors and
// request details are never returned to the browser or written to disk.
import { MARKET_BOARD_TTL_MS, MARKET_CACHE_TTL_MS, MARKET_HISTORY_MAX_LIMIT, MARKET_LEVEL1_CODES, MARKET_MAX_BOARD_STOCKS, MARKET_MAX_PAGES, MARKET_MAX_QUOTES, MARKET_MAX_SECTORS, MARKET_MAX_STOCKS, MARKET_OVERVIEW_TTL_MS, MARKET_PAGE_SIZE, MARKET_SOURCE_NAME, MARKET_DISTRIBUTION, distributionBucket, level2Parent, level1Name, normalizeMarketCode, shanghaiToday, validateBoardCode, validateHistoryLimit, validateAdjustment, } from './market.js';
import { validateSymbol } from './watchlist.js';
import { MAX_ABSOLUTE_PRICE } from './chart-data.js';
export const MARKET_QUOTE_ENDPOINT = 'https://qt.gtimg.cn/q=';
export const MARKET_BOARD_RANK_ENDPOINT = 'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/mktHs/rank';
export const MARKET_STOCK_RANK_ENDPOINT = 'https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList';
/** Daily OHLCV for one symbol. Same opt-in source and same bounded client. */
export const MARKET_HISTORY_ENDPOINT = 'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get';
export const MARKET_TIMEOUT_MS = 10_000;
export const MARKET_MAX_BYTES = 512 * 1024;
export const MARKET_TOP_LIMIT = 8;
const STAMP = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;
const INDEXES = [
    { quote: 'sh000001', code: 'SH.000001' },
    { quote: 'sz399001', code: 'SZ.399001' },
    { quote: 'sz399006', code: 'SZ.399006' },
    { quote: 'sh000300', code: 'SH.000300' },
    { quote: 'sh000688', code: 'SH.000688' },
    { quote: 'bj899050', code: 'BJ.899050' },
];
function cleanText(raw, max = 64) {
    if (typeof raw !== 'string')
        return null;
    const value = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!value || [...value].length > max)
        return null;
    return value;
}
function finiteNumber(raw, min = -Infinity, max = Infinity) {
    if (typeof raw !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(raw))
        return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= min && value <= max ? value : null;
}
function positiveOrNull(value, max = 1e15) {
    return value !== null && value > 0 && value < max ? value : null;
}
function isoNow(now) {
    return new Date(now).toISOString();
}
function laterQuote(left, right) {
    if (!left)
        return right;
    if (!right)
        return left;
    return Date.parse(right) > Date.parse(left) ? right : left;
}
function toCnyFromWan(value) {
    return value === null ? null : value * 10_000;
}
/**
 * The upstream stamp is `yyyyMMddHHmmss` in exchange time (China Standard
 * Time, UTC+08:00, no DST). Invalid, impossible or future stamps are rejected
 * instead of being silently clamped. Exported for tests.
 */
export function parseTencentTimestamp(raw, now) {
    const match = typeof raw === 'string' ? STAMP.exec(raw) : null;
    if (!match)
        throw new Error('invalid quote timestamp');
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59)
        throw new Error('invalid quote timestamp');
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day)
        throw new Error('invalid quote timestamp');
    const stamp = Date.UTC(year, month - 1, day, hour - 8, minute, second);
    const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}+08:00`;
    if (!Number.isFinite(stamp) || Date.parse(iso) !== stamp)
        throw new Error('invalid quote timestamp');
    if (stamp > now + 300_000)
        throw new Error('quote timestamp is in the future');
    return iso;
}
async function readBody(response, maxBytes) {
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > maxBytes)
        throw new Error('market response too large');
    if (!response.body)
        throw new Error('market response is empty');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > maxBytes)
                throw new Error('market response too large');
            chunks.push(value);
        }
    }
    finally {
        void reader.cancel().catch(() => { });
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
function assertTextResponse(response) {
    if (!response.ok)
        throw new Error(`market http ${response.status}`);
    const type = (response.headers.get('content-type') ?? '').toLowerCase();
    if (type && !type.includes('json') && !type.startsWith('text/'))
        throw new Error('market response type');
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
            const index = cursor++;
            if (index >= items.length)
                return;
            results[index] = await worker(items[index]);
        }
    });
    await Promise.all(runners);
    return results;
}
/** Parses the tilde-separated Tencent batch format. Exported for tests. */
export function parseTencentBatch(text) {
    const result = new Map();
    for (const raw of text.trim().split(/\r?\n/)) {
        const line = raw.trim();
        if (!line)
            continue;
        const match = /^v_((?:sh|sz|bj)\d{6}|pt\d{8})="([^"]*)";?$/.exec(line);
        if (!match)
            continue;
        const fields = match[2].split('~');
        if (fields.length < 35)
            continue;
        result.set(match[1], fields);
    }
    return result;
}
/** Parses `mktHs/rank` (level-2 boards and their leading stock). */
export function parseBoardRank(payload) {
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    if (rows.length > MARKET_MAX_SECTORS)
        throw new Error('market board list too large');
    const result = new Map();
    for (const row of rows) {
        if (!row || typeof row !== 'object')
            continue;
        const code = typeof row.bd_code === 'string' && /^pt01801\d{3}$/.test(row.bd_code) ? row.bd_code.slice(4) : null;
        const name = cleanText(row.bd_name, 48);
        if (!code || !name)
            continue;
        const rawPercent = row.bd_zdf;
        const changePercent = rawPercent === '' || rawPercent == null ? Number.NaN : Number(rawPercent);
        const topCode = normalizeMarketCode(row.nzg_code);
        const topName = cleanText(row.nzg_name, 64);
        const rawTopPercent = row.nzg_zdf;
        const topPercent = rawTopPercent === '' || rawTopPercent == null ? Number.NaN : Number(rawTopPercent);
        result.set(code, {
            code,
            name,
            changePercent: Number.isFinite(changePercent) && Math.abs(changePercent) <= 100 ? changePercent : null,
            topStock: topCode && topName && Number.isFinite(topPercent) && Math.abs(topPercent) <= 100
                ? { code: topCode, name: topName, changePercent: topPercent }
                : null,
        });
    }
    return result;
}
/** Parses one `getBoardRankList` page. Exported for tests. */
export function parseStockRankPage(payload) {
    const data = payload?.data;
    const total = Number(data?.total);
    if (!Number.isInteger(total) || total < 0 || total > MARKET_MAX_STOCKS)
        throw new Error('market stock total');
    const list = Array.isArray(data?.rank_list) ? data.rank_list : [];
    if (list.length > MARKET_PAGE_SIZE)
        throw new Error('market stock page too large');
    const rows = [];
    for (const row of list) {
        if (!row || typeof row !== 'object')
            continue;
        const code = normalizeMarketCode(row.code);
        const name = cleanText(row.name, 64);
        const price = Number(row.zxj);
        const changePercent = Number(row.zdf);
        const amount = Number(row.turnover);
        const marketCap = Number(row.zsz);
        if (!code || !name || !Number.isFinite(price) || price <= 0 || price >= 1e10)
            continue;
        if (!Number.isFinite(changePercent) || Math.abs(changePercent) > 1000)
            continue;
        if (!Number.isFinite(amount) || amount < 0 || amount > 1e12)
            continue;
        rows.push({
            code,
            name,
            price,
            changePercent,
            amount: amount * 10_000,
            marketCap: Number.isFinite(marketCap) && marketCap >= 0 && marketCap < 1e8 ? marketCap * 1e8 : null,
            suspended: row.state === 'S',
        });
    }
    return { total, rows };
}
function boardTopStock(rank, code) {
    return rank.get(code)?.topStock ?? null;
}
function parseIndexQuote(key, fields, now) {
    const [market, digits] = [key.slice(0, 2), key.slice(2)];
    const name = cleanText(fields[1], 32);
    const price = finiteNumber(fields[3], 0.0001, 1e9);
    const change = finiteNumber(fields[31], -1e9, 1e9);
    const changePercent = finiteNumber(fields[32], -100, 100);
    if (!name || price === null || change === null || changePercent === null)
        throw new Error('invalid index quote');
    if (fields[2] !== digits)
        throw new Error('index quote mismatch');
    const amount = toCnyFromWan(positiveOrNull(finiteNumber(fields[37], 0, 1e12)));
    return {
        code: `${market.toUpperCase()}.${digits}`,
        name,
        price,
        change,
        changePercent,
        open: positiveOrNull(finiteNumber(fields[5], 0, 1e9)),
        high: positiveOrNull(finiteNumber(fields[33], 0, 1e9)),
        low: positiveOrNull(finiteNumber(fields[34], 0, 1e9)),
        previousClose: positiveOrNull(finiteNumber(fields[4], 0, 1e9)),
        amount,
        quotedAt: parseTencentTimestamp(fields[30], now),
    };
}
/** Parses one `v_sh600519="..."` stock line into the projected quote. */
export function parseStockQuote(key, fields, now) {
    const [market, digits] = [key.slice(0, 2), key.slice(2)];
    const symbol = `${market.toUpperCase()}.${digits}`;
    validateSymbol(symbol);
    if (fields[2] !== digits)
        throw new Error('stock quote mismatch');
    const name = cleanText(fields[1], 64);
    const price = finiteNumber(fields[3], 0.0001, 1e9);
    const changePercent = finiteNumber(fields[32], -100, 100);
    if (!name || price === null || changePercent === null)
        throw new Error('invalid stock quote');
    return {
        symbol,
        status: 'available',
        name,
        price,
        changePercent,
        quotedAt: parseTencentTimestamp(fields[30], now),
        fetchedAt: null,
        // The source has no suspension flag; the UI labels freshness instead of
        // claiming a session state it cannot verify.
        marketStatus: 'unknown',
    };
}
function parseBoardQuote(key, fields, now, rank) {
    const code = key.slice(4);
    if (!/^801\d{3}$/.test(code))
        return null;
    if (fields[2] !== `01${code}`)
        return null;
    const name = cleanText(fields[1], 48);
    const changePercent = finiteNumber(fields[32], -100, 100);
    if (!name || changePercent === null)
        return null;
    const level = fields[58] === 'BK-HY-1' ? 1 : fields[58] === 'BK-HY-2' ? 2 : null;
    if (!level)
        return null;
    const amount = toCnyFromWan(positiveOrNull(finiteNumber(fields[37], 0, 1e12)));
    const capYi = positiveOrNull(finiteNumber(fields[45], 0, 1e8));
    return {
        code,
        name,
        level,
        parent: level === 2 ? level2Parent(name) : null,
        changePercent,
        amount,
        marketCap: capYi === null ? null : capYi * 1e8,
        topStock: level === 2 ? boardTopStock(rank, code) : null,
        quotedAt: parseTencentTimestamp(fields[30], now),
    };
}
function sortTop(stocks, pick, direction) {
    return [...stocks]
        .filter(stock => Number.isFinite(pick(stock)))
        .sort((left, right) => (pick(right) - pick(left)) * direction)
        .slice(0, MARKET_TOP_LIMIT);
}
const HISTORY_ROW = /^\d{4}-\d{2}-\d{2}$/;
/**
 * Parses `[date, open, close, high, low, volume, ..., rate, amountWan]` rows.
 * The upstream order is open/close/high/low, not OHLC; treating it as OHLC
 * would silently swap close and high. Impossible OHLC relationships are
 * rejected rather than clamped, and the result stays sorted and unique.
 */
export function parseDailyRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length > MARKET_HISTORY_MAX_LIMIT + 50)
        throw new Error('history response too large');
    const parsed = [];
    let previous = '';
    for (const row of list) {
        if (!Array.isArray(row) || row.length < 6)
            continue;
        const sessionDate = row[0];
        if (typeof sessionDate !== 'string' || !HISTORY_ROW.test(sessionDate))
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
        const amountWan = rawAmount === '' || rawAmount == null ? null : Number(rawAmount);
        if (volume !== null && (!Number.isFinite(volume) || volume < 0))
            continue;
        if (amountWan !== null && (!Number.isFinite(amountWan) || amountWan < 0))
            continue;
        if (sessionDate <= previous)
            continue;
        previous = sessionDate;
        parsed.push({ sessionDate, open, close, high, low, volume, amountWan });
    }
    if (!parsed.length)
        throw new Error('history empty');
    return parsed;
}
/**
 * Tencent sends volume in lots (手, 100 shares) for most SSE/SZSE/ETF rows but
 * in shares for STAR rows, so the unit is inferred from each row's own
 * turnover instead of assumed: `amountWan * 1e4 / volume` is an average traded
 * price, so it lands near `close` for shares and near `100 × close` for lots.
 * When turnover is missing or the ratio is ambiguous the volume stays unknown
 * rather than being published under a guessed unit.
 */
export function inferVolumeUnit(rows) {
    let shares = 0, lots = 0;
    for (const row of rows) {
        if (row.volume === null || !row.volume || row.amountWan === null || !row.amountWan)
            continue;
        const ratio = ((row.amountWan * 10_000) / row.volume) / row.close;
        if (ratio >= 0.5 && ratio <= 2)
            shares++;
        else if (ratio >= 50 && ratio <= 200)
            lots++;
    }
    const total = shares + lots;
    // Require a clear majority: a mixed or barely-supported sample stays unknown.
    if (shares > lots && shares >= Math.max(2, Math.ceil(total * 0.8)))
        return { unit: 'shares', samples: total };
    if (lots > shares && lots >= Math.max(2, Math.ceil(total * 0.8)))
        return { unit: 'lots', samples: total };
    return null;
}
/**
 * Index codes share the A-share symbol shape but their reported volume is an
 * exchange aggregate, not a share count. Treating it as shares would mislabel
 * the axis, so indices carry the source's own unit and say so.
 */
export function isIndexSymbol(symbol) {
    return /^(?:SH\.000|SZ\.399|BJ\.899)\d{3}$/.test(symbol);
}
/** Builds the projected history; bars the unit cannot be established for are dropped. */
export function projectHistory(options) {
    const { symbol, name, rows, adjustment, precision, now } = options;
    const index = isIndexSymbol(symbol);
    const unit = index ? { unit: 'reported', samples: 0 } : inferVolumeUnit(rows);
    const scale = unit?.unit === 'lots' ? 100 : 1;
    const bars = rows.map((row, index) => ({
        sessionDate: row.sessionDate,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        // An unknown unit is reported as unknown; a lot count is never presented
        // as a share count.
        volume: unit && row.volume !== null ? Math.round(row.volume * scale) : null,
        amount: row.amountWan !== null ? Math.round(row.amountWan * 10_000) : null,
        // Only today's newest bar can still be moving. The source has no final
        // flag, so a last bar from an earlier session is final, not provisional.
        isFinal: index < rows.length - 1 || row.sessionDate !== shanghaiToday(now),
    }));
    return {
        symbol,
        name,
        source: MARKET_SOURCE_NAME,
        fetchedAt: isoNow(now),
        adjustment,
        adjustmentLabel: adjustment === 'none' ? 'unadjusted' : adjustment === 'forward' ? 'forward-adjusted (qfq)' : 'backward-adjusted (hfq)',
        pricePrecision: precision,
        volumeUnit: 'shares',
        volumeBasis: unit?.unit ?? 'unknown',
        amountUnit: 'CNY',
        currency: 'CNY',
        exchangeTimezone: 'Asia/Shanghai',
        firstSessionDate: bars[0].sessionDate,
        lastSessionDate: bars.at(-1).sessionDate,
        bars,
    };
}
function buildBreadth(rows, expected, partial, now) {
    const unique = new Map();
    for (const row of rows)
        if (!unique.has(row.code))
            unique.set(row.code, row);
    const stocks = [...unique.values()];
    const covered = stocks.length;
    if (!covered || covered < expected * 0.9)
        throw new Error('market breadth coverage too low');
    let up = 0, down = 0, flat = 0, suspended = 0;
    const distribution = MARKET_DISTRIBUTION.map(bucket => ({ ...bucket, count: 0 }));
    for (const stock of stocks) {
        if (stock.changePercent > 0)
            up++;
        else if (stock.changePercent < 0)
            down++;
        else
            flat++;
        if (stock.suspended)
            suspended++;
        distribution[distributionBucket(stock.changePercent)].count++;
    }
    return {
        source: MARKET_SOURCE_NAME,
        fetchedAt: isoNow(now),
        expected,
        covered,
        up,
        down,
        flat,
        suspended,
        coverage: Math.min(1, covered / expected),
        partial,
        amount: stocks.reduce((sum, stock) => sum + stock.amount, 0),
        distribution,
        topGainers: sortTop(stocks, stock => stock.changePercent, 1),
        topLosers: sortTop(stocks, stock => stock.changePercent, -1),
        topAmount: sortTop(stocks, stock => stock.amount, 1),
    };
}
export function createTencentMarketProvider(options = {}) {
    const { fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = MARKET_TIMEOUT_MS, overviewTtlMs = MARKET_OVERVIEW_TTL_MS, breadthTtlMs = MARKET_CACHE_TTL_MS, boardTtlMs = MARKET_BOARD_TTL_MS, retryDelayMs = 200, concurrency = 6, } = options;
    if (typeof fetchImpl !== 'function')
        throw new Error('market fetch unavailable');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
        throw new Error('invalid market timeout');
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12)
        throw new Error('invalid market concurrency');
    if (![overviewTtlMs, breadthTtlMs, boardTtlMs, retryDelayMs].every(value => Number.isFinite(value) && value >= 0))
        throw new Error('invalid market cache');
    const cache = new Map();
    const inflight = new Map();
    async function request(url, encoding, maxBytes) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(url, {
                method: 'GET',
                redirect: 'error',
                signal: controller.signal,
                headers: { accept: 'application/json, text/plain, text/html', 'user-agent': 'dsh-x-stock/0.3 (local-only)' },
            });
            assertTextResponse(response);
            const bytes = await readBody(response, maxBytes);
            return new TextDecoder(encoding).decode(bytes);
        }
        finally {
            clearTimeout(timer);
            controller.abort();
        }
    }
    async function requestJson(url, maxBytes = MARKET_MAX_BYTES) {
        const text = await request(url, 'utf-8', maxBytes);
        let value;
        try {
            value = JSON.parse(text);
        }
        catch {
            throw new Error('market invalid json');
        }
        if (!value || typeof value !== 'object')
            throw new Error('market invalid json');
        return value;
    }
    async function quoteBatch(codes, { requireAny = true } = {}) {
        if (!codes.length || codes.length > 300)
            throw new Error('invalid market quote batch');
        const text = await request(`${MARKET_QUOTE_ENDPOINT}${codes.join(',')}`, 'gbk', MARKET_MAX_BYTES);
        // An empty body means the request itself failed; a body without any usable
        // line means the source does not know these codes. Only the first case is a
        // transport failure, so the callers can tell "no data for this symbol" from
        // "the feed is gone".
        if (!text.trim())
            throw new Error('empty market quote response');
        const parsed = parseTencentBatch(text);
        const allowed = new Set(codes);
        const result = new Map();
        for (const [key, fields] of parsed)
            if (allowed.has(key))
                result.set(key, fields);
        if (!result.size && requireAny)
            throw new Error('empty market quote batch');
        return result;
    }
    async function fetchBoardRank() {
        const url = `${MARKET_BOARD_RANK_ENDPOINT}?l=200&p=1&t=01/averatio&ordertype=&o=0`;
        const payload = await requestJson(url);
        if (payload.code !== 0)
            throw new Error('market board rank failed');
        return parseBoardRank(payload);
    }
    async function loadOverview() {
        const rank = await fetchBoardRank();
        const quotes = [
            ...INDEXES.map(index => index.quote),
            ...MARKET_LEVEL1_CODES.map(code => `pt01${code}`),
            ...[...rank.keys()].map(code => `pt01${code}`),
        ];
        const batch = await quoteBatch([...new Set(quotes)]);
        const stamp = now();
        const indices = [];
        for (const index of INDEXES) {
            const fields = batch.get(index.quote);
            if (!fields)
                continue;
            try {
                indices.push(parseIndexQuote(index.quote, fields, stamp));
            }
            catch { /* one bad index must not hide the board */ }
        }
        if (indices.length < 3)
            throw new Error('market indices unavailable');
        const sectors = [];
        for (const code of MARKET_LEVEL1_CODES) {
            const fields = batch.get(`pt01${code}`);
            if (!fields)
                continue;
            try {
                const sector = parseBoardQuote(`pt01${code}`, fields, stamp, rank);
                if (sector)
                    sectors.push(sector);
            }
            catch { /* skip one malformed board, keep the rest */ }
        }
        for (const [code, board] of rank) {
            const fields = batch.get(`pt01${code}`);
            if (fields) {
                try {
                    const sector = parseBoardQuote(`pt01${code}`, fields, stamp, rank);
                    if (sector) {
                        sectors.push(sector);
                        continue;
                    }
                }
                catch { /* fall through to the rank-only projection */ }
            }
            // A board without a quote is still a real board: show its rank change and
            // leader, but never invent turnover or market capitalisation.
            if (board.changePercent === null)
                continue;
            sectors.push({
                code, name: board.name, level: 2, parent: level2Parent(board.name),
                changePercent: board.changePercent, amount: null, marketCap: null,
                topStock: board.topStock, quotedAt: null,
            });
        }
        if (sectors.filter(sector => sector.level === 1).length < 20)
            throw new Error('market sectors unavailable');
        let quotedAt = null;
        for (const sector of sectors)
            quotedAt = laterQuote(quotedAt, sector.quotedAt);
        for (const index of indices)
            quotedAt = laterQuote(quotedAt, index.quotedAt);
        return {
            source: MARKET_SOURCE_NAME,
            fetchedAt: isoNow(stamp),
            quotedAt,
            indices,
            sectors: sectors.slice(0, MARKET_MAX_SECTORS),
        };
    }
    async function loadBreadth() {
        const first = await retry(() => requestJson(`${MARKET_STOCK_RANK_ENDPOINT}?_appver=11.17.0&board_code=aStock&sort_type=turnover&direct=down&offset=0&count=${MARKET_PAGE_SIZE}`), 2);
        const firstPage = parseStockRankPage(first);
        const pages = Math.min(MARKET_MAX_PAGES, Math.ceil(firstPage.total / MARKET_PAGE_SIZE));
        if (pages < 1)
            throw new Error('market breadth empty');
        const offsets = Array.from({ length: pages }, (_, index) => index * MARKET_PAGE_SIZE);
        const results = await mapLimit(offsets, concurrency, async (offset) => {
            if (offset === 0)
                return { offset, page: firstPage };
            try {
                const payload = await retry(() => requestJson(`${MARKET_STOCK_RANK_ENDPOINT}?_appver=11.17.0&board_code=aStock&sort_type=turnover&direct=down&offset=${offset}&count=${MARKET_PAGE_SIZE}`), 2);
                return { offset, page: parseStockRankPage(payload) };
            }
            catch {
                return null;
            }
        });
        const rows = [];
        let failed = 0;
        for (const result of results) {
            if (!result) {
                failed++;
                continue;
            }
            rows.push(...result.page.rows);
        }
        return buildBreadth(rows, firstPage.total, failed > 0, now());
    }
    async function retry(action, attempts) {
        let error;
        for (let attempt = 0; attempt < attempts; attempt++) {
            try {
                return await action();
            }
            catch (failure) {
                error = failure;
            }
            if (attempt + 1 < attempts && retryDelayMs)
                await sleep(retryDelayMs);
        }
        throw error;
    }
    async function loadBoard(code) {
        const payload = await requestJson(`${MARKET_STOCK_RANK_ENDPOINT}?_appver=11.17.0&board_code=pt01${code}&sort_type=turnover&direct=down&offset=0&count=${MARKET_PAGE_SIZE}`);
        const page = parseStockRankPage(payload);
        const stocks = page.rows.slice(0, MARKET_MAX_BOARD_STOCKS);
        let name = level1Name(code) ?? code;
        let changePercent = null;
        let amount = null;
        let marketCap = null;
        const overviewEntry = cache.get('overview');
        const cachedOverview = overviewEntry && overviewEntry.expires > now() ? overviewEntry.value : undefined;
        const known = cachedOverview?.sectors.find(sector => sector.code === code);
        if (known) {
            name = known.name;
            changePercent = known.changePercent;
            amount = known.amount;
            marketCap = known.marketCap;
        }
        else {
            const quotes = await quoteBatch([`pt01${code}`]);
            const fields = quotes.get(`pt01${code}`);
            if (fields) {
                try {
                    const sector = parseBoardQuote(`pt01${code}`, fields, now(), new Map());
                    if (sector) {
                        name = sector.name;
                        changePercent = sector.changePercent;
                        amount = sector.amount;
                        marketCap = sector.marketCap;
                    }
                }
                catch { /* keep the code as the name, no fabricated numbers */ }
            }
        }
        return {
            source: MARKET_SOURCE_NAME,
            fetchedAt: isoNow(now()),
            code,
            name,
            changePercent,
            amount,
            marketCap,
            total: page.total,
            truncated: page.total > stocks.length,
            stocks,
        };
    }
    /**
     * One symbol's daily history. The source returns `qfqday`/`hfqday`/`day`
     * depending on adjustment, and silently falls back to `day` for symbols it
     * cannot adjust (STAR, some ETFs); the key is therefore read, not assumed.
     */
    async function loadHistory(symbol, adjustment, limit) {
        const code = `${symbol.slice(0, 2).toLowerCase()}${symbol.slice(3)}`;
        const parameter = `${code},day,,,${limit},${adjustment === 'none' ? '' : adjustment === 'forward' ? 'qfq' : 'hfq'}`;
        const payload = await requestJson(`${MARKET_HISTORY_ENDPOINT}?param=${parameter}`, MARKET_MAX_BYTES);
        if (payload.code !== 0)
            throw new Error('history request failed');
        const entry = payload.data?.[code];
        if (!entry || typeof entry !== 'object')
            throw new Error('history missing');
        // The source drops qfq/hfq for symbols it cannot adjust and answers with
        // `day`; that fallback is detected, never silently relabelled as adjusted.
        const preferred = adjustment === 'forward' ? 'qfqday' : adjustment === 'backward' ? 'hfqday' : 'day';
        const key = Array.isArray(entry[preferred]) && entry[preferred].length
            ? preferred
            : Array.isArray(entry.day) && entry.day.length ? 'day' : null;
        if (!key)
            throw new Error('history empty');
        const parsed = parseDailyRows(entry[key]);
        const fields = entry.qt?.[code];
        const quotedName = Array.isArray(fields) ? cleanText(fields[1], 64) : null;
        const quotedPrice = Array.isArray(fields) ? finiteNumber(fields[3], 0, 1e9) : null;
        // Sub-10-CNY ETFs quote three decimals; everything else two.
        const precision = quotedPrice !== null && quotedPrice < 10 ? 3 : 2;
        return projectHistory({
            symbol,
            name: quotedName ?? symbol,
            rows: parsed.slice(-limit),
            // Report the adjustment actually returned: the source ignores qfq/hfq for
            // some symbols and sends `day` instead.
            adjustment: key === 'qfqday' ? 'forward' : key === 'hfqday' ? 'backward' : 'none',
            precision,
            now: now(),
        });
    }
    function getOrLoad(key, ttl, loader) {
        const cached = cache.get(key);
        if (cached && cached.expires > now())
            return Promise.resolve(cached.value);
        const pending = inflight.get(key);
        if (pending)
            return pending;
        const promise = loader().then(value => {
            if (cache.size >= 64) {
                const oldest = cache.keys().next().value;
                if (oldest !== undefined)
                    cache.delete(oldest);
            }
            cache.set(key, { expires: now() + ttl, value });
            return value;
        }).finally(() => { inflight.delete(key); });
        inflight.set(key, promise);
        return promise;
    }
    return {
        name: MARKET_SOURCE_NAME,
        overview: () => getOrLoad('overview', overviewTtlMs, loadOverview),
        breadth: () => getOrLoad('breadth', breadthTtlMs, loadBreadth),
        board: (input) => {
            const code = validateBoardCode(input);
            return getOrLoad(`board:${code}`, boardTtlMs, () => loadBoard(code));
        },
        // Deliberately uncached: the bottom bar is the one place that polls for a
        // live price, and a cached snapshot would make it look fresher than it is.
        // Concurrent callers still share a single upstream request.
        quotes: (input) => {
            if (!Array.isArray(input) || !input.length || input.length > MARKET_MAX_QUOTES)
                throw new Error('invalid market quote request');
            const symbols = input.map(validateSymbol);
            if (new Set(symbols).size !== symbols.length)
                throw new Error('invalid market quote request');
            const codes = symbols.map(symbol => `${symbol.slice(0, 2).toLowerCase()}${symbol.slice(3)}`);
            return getOrLoad(`quotes:${codes.join(',')}`, 0, async () => {
                const batch = await quoteBatch(codes, { requireAny: false });
                const stamp = now();
                const quotes = [];
                for (const [key, fields] of batch) {
                    try {
                        quotes.push(parseStockQuote(key, fields, stamp));
                    }
                    catch { /* one bad line must not hide the others */ }
                }
                return quotes;
            });
        },
        // A closed daily bar does not change during the session, so history is
        // cached briefly; the newest (provisional) bar refreshes with it.
        history: (input, options) => {
            const symbol = validateSymbol(input);
            const { adjustment, limit } = (options ?? {});
            const normalized = validateAdjustment(adjustment);
            const count = validateHistoryLimit(limit);
            return getOrLoad(`history:${symbol}:${normalized}:${count}`, overviewTtlMs, () => loadHistory(symbol, normalized, count));
        },
    };
}
export { INDEXES as MARKET_INDEXES };
