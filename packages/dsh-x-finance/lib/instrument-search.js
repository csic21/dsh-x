// Shared instrument-directory contract for the page lookup. The directory is
// a symbol-resolution aid, not a quote feed: it never carries prices, and
// nothing here fetches the network. The Host provider projects the upstream
// suggestion payload into the fields below before it reaches clients.
//
// Two markets share the same upstream host. A-share entries resolve to an
// exchange-qualified `SH.600519` identity; US entries resolve to `US.AAPL`
// plus the venue-qualified code (`AAPL.OQ`) the US daily endpoint requires.
// The US directory does not distinguish stocks from ETFs, so a US match keeps
// `kind: 'stock'` and the UI labels the market instead of the class.
import { isHkSymbol, normalizeHkSymbol, parseHkDirectoryCode } from './hk-market.js';
import { normalizeUsCode, normalizeUsSymbol, parseUsDirectoryCode } from './us-market.js';
export const SEARCH_RPC_ENDPOINT = 'dsh-x-finance.search';
export const SEARCH_SOURCE_NAME = 'smartbox.gtimg.cn (unofficial)';
export const SEARCH_MAX_QUERY = 24;
export const SEARCH_MAX_RESULTS = 10;
const SEARCH_MARKETS = new Set(['cn', 'us', 'hk']);
/** Total upstream probes one query may trigger, including the relax step. */
export const SEARCH_MAX_PROBES = 4;
/** Always-run probe slots; the last one is reserved for the relax step. */
const STRICT_PROBES = SEARCH_MAX_PROBES - 1;
/** A query is "thin" below this many candidates and earns the relax probe. */
export const SEARCH_RELAX_BELOW = 4;
const SEPARATOR = /[\s,，、;；/·+]+/u;
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
/**
 * Words that say what an instrument is rather than which one. They stay in the
 * ranking tokens but are never probed alone: `etf` alone returns the first ten
 * ETFs on the directory, which is noise, and it would burn a probe on every
 * query that happens to contain it.
 */
const CLASS_WORDS = new Set([
    'etf', 'etfs', 'lof', 'lofs', 'reit', 'reits', 'qdii',
    '基金', '指数', '联接', '场内', '场外',
]);
const charLength = (value) => [...value].length;
/**
 * Splits on separators and on CJK / non-CJK boundaries, so `红利低波动etf`
 * becomes `红利低波动` + `etf` and `300ETF` stays one token. Splitting parts
 * that the directory could have matched together is safe: the untouched query
 * is always probe number one.
 */
function segmentQuery(query) {
    const tokens = [];
    for (const part of query.split(SEPARATOR)) {
        if (!part)
            continue;
        let buffer = '';
        let cjk;
        for (const char of part) {
            const next = CJK.test(char);
            if (cjk !== undefined && next !== cjk) {
                tokens.push(buffer);
                buffer = '';
            }
            cjk = next;
            buffer += char;
        }
        if (buffer)
            tokens.push(buffer);
    }
    return tokens.filter(token => token.length > 0);
}
/**
 * Builds the probe ladder for one query.
 *
 * `push` caps the strict probes and drops duplicates case-insensitively, so the
 * whole ladder stays inside `SEARCH_MAX_PROBES` requests no matter what the
 * user typed.
 */
export function planSearch(query) {
    const tokens = segmentQuery(query);
    const probes = [];
    const push = (raw) => {
        const probe = raw.trim();
        if (!probe || probe.length > SEARCH_MAX_QUERY || probes.length >= STRICT_PROBES)
            return;
        if (probes.some(existing => existing.toLowerCase() === probe.toLowerCase()))
            return;
        probes.push(probe);
    };
    // Probe one is always the untouched query, so a query that the directory
    // already resolved keeps resolving exactly as before.
    push(query);
    if (tokens.length > 1)
        push(tokens.join(''));
    const content = tokens
        .filter(token => charLength(token) >= 2 && !CLASS_WORDS.has(token.toLowerCase()))
        // A bare number is only meaningful inside a name: `300` alone returns
        // `600300 维维股份` and a page of indices for a user typing 沪深300. A real
        // code is the whole query, so it is already probe number one.
        .filter(token => !/^\d+$/.test(token))
        .sort((left, right) => charLength(right) - charLength(left));
    for (const token of content)
        push(token);
    // A long CJK token often names the index while the instrument abbreviates it
    // (`红利低波动` index → `红利低波` fund). Retrying without its last character
    // is the cheapest bridge, and it only runs when the strict probes came back
    // thin, so it never widens a query that already answered.
    let relax;
    for (const token of content) {
        const chars = [...token];
        if (chars.length < 4 || !CJK.test(chars[chars.length - 1]))
            continue;
        const shortened = chars.slice(0, -1).join('');
        if (probes.some(probe => probe.toLowerCase() === shortened.toLowerCase()))
            continue;
        relax = shortened;
        break;
    }
    return {
        query,
        tokens: tokens.length ? tokens : [query],
        probes,
        ...(relax ? { relax } : {}),
    };
}
const tokenWeight = (token) => CLASS_WORDS.has(token.toLowerCase()) ? 0.5 : CJK.test(token) ? 2 : 1;
/** Longest common contiguous run, in code points. */
function longestRun(left, right) {
    const a = [...left], b = [...right];
    let best = 0;
    let previous = new Uint16Array(b.length + 1);
    for (let i = 1; i <= a.length; i++) {
        const current = new Uint16Array(b.length + 1);
        for (let j = 1; j <= b.length; j++) {
            if (a[i - 1] !== b[j - 1])
                continue;
            current[j] = previous[j - 1] + 1;
            if (current[j] > best)
                best = current[j];
        }
        previous = current;
    }
    return best;
}
/**
 * How much of one token the name accounts for. A name that contains the token
 * scores 1; a CJK token gives partial credit for a near miss (`红利低波动` vs
 * `红利低波` = 0.8), which is what lets the intended fund outrank a weaker
 * match that merely shares one word.
 */
function nameCoverage(token, name) {
    if (name.toUpperCase().includes(token.toUpperCase()))
        return 1;
    if (!CJK.test(token))
        return 0;
    return longestRun(token, name) / charLength(token);
}
/**
 * Orders the merged pool so the row that answers the whole query comes first.
 *
 * Scores are additive per token and the sort falls back to probe/insertion
 * order, so a pinyin query (whose letters never appear in a CJK name) keeps the
 * directory's own ranking rather than being shuffled by the tie-break.
 */
export function rankCandidates(candidates, plan) {
    const tokens = plan.tokens;
    return candidates
        .map(candidate => {
        let score = 0;
        for (const token of tokens) {
            const coverage = nameCoverage(token, candidate.match.name);
            if (coverage >= 0.5)
                score += tokenWeight(token) * coverage;
            // Pinyin initials and directory aliases never appear in the name, so a
            // row won by that exact probe keeps partial credit for it.
            else if (candidate.via.toLowerCase() === token.toLowerCase())
                score += tokenWeight(token) * 0.5;
        }
        // A typed code wins outright. Only an exact code (or an unambiguously
        // long prefix like `6005`) counts: the exchange part is not user input,
        // and a loose `includes` would promote `600300 维维股份` for `300`.
        const code = candidate.match.symbol.slice(candidate.match.symbol.indexOf('.') + 1).toUpperCase();
        if (tokens.some(token => code === token.toUpperCase()))
            score += 10;
        else if (tokens.some(token => token.length >= 4 && /^\d+$/.test(token) && code.startsWith(token)))
            score += 2;
        if (candidate.match.name.toUpperCase().startsWith((tokens[0] ?? '').toUpperCase()))
            score += 1;
        return { match: candidate.match, score, order: candidate.order };
    })
        .sort((left, right) => right.score - left.score || left.order - right.order)
        .map(entry => entry.match);
}
// Only exchange-tradable classes are acceptlisted. `GP` (HK/US), `ZS`
// (indices), `KJ`/`KJ-CX` (off-exchange funds) and `QZ` are deliberately out of
// scope: the watchlist is an A-share page, and a price-free directory should
// not silently widen which instruments it can pin.
const KIND_BY_CLASS = {
    'GP-A': 'stock',
    'ETF': 'etf',
    'QDII-ETF': 'etf',
    'LOF': 'fund',
    'QDII-LOF': 'fund',
    'FJ': 'reit',
};
const MARKETS = new Set(['sh', 'sz', 'bj']);
const CONTROL = /[\u0000-\u001f\u007f]/g;
const HINT = /^v_hint="([^"]*)"\s*;?\s*$/u;
function fail(code) {
    throw Object.assign(new Error(code), { code });
}
/** Trims, NFC-normalises and bounds a user query before it is sent upstream. */
export function normalizeSearchQuery(raw) {
    if (typeof raw !== 'string')
        fail('invalid-query');
    const query = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (!query || [...query].length > SEARCH_MAX_QUERY || /[\u0000-\u001f\u007f]/u.test(query))
        fail('invalid-query');
    // Reject punctuation-only probes; every real query (name fragment, pinyin
    // initials or code) contains at least one letter or digit.
    if (!/[\p{L}\p{N}]/u.test(query))
        fail('invalid-query');
    return query;
}
function normalizeMarket(raw) {
    return raw === 'us' ? 'us' : raw === 'hk' ? 'hk' : 'cn';
}
export function parseSearchRequest(payload) {
    if (!payload || Object.getPrototypeOf(payload) !== Object.prototype)
        fail('invalid-request');
    const value = payload;
    const keys = Object.keys(value).sort();
    if (keys.length === 1 && keys[0] === 'action' && value.action === 'status')
        return { action: 'status' };
    const search = keys.length === 2
        ? keys[0] === 'action' && keys[1] === 'query'
        : keys.length === 3 && keys[0] === 'action' && keys[1] === 'market' && keys[2] === 'query';
    if (value.action === 'search' && search) {
        // An absent market is the pre-existing A-share behaviour; an explicit value
        // must be one of the known markets rather than any string.
        if (keys.length === 3 && (typeof value.market !== 'string' || !SEARCH_MARKETS.has(value.market)))
            fail('invalid-request');
        return { action: 'search', query: normalizeSearchQuery(value.query), market: normalizeMarket(value.market) };
    }
    fail('invalid-request');
}
function decodeName(raw) {
    if (typeof raw !== 'string')
        return '';
    // The endpoint escapes CJK as \uXXXX inside a JavaScript string literal.
    const text = raw
        .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
        .replace(CONTROL, '')
        .trim();
    if (!text || [...text].length > 64)
        return '';
    return text;
}
/** Splits the `v_hint="..."` body into `~`-separated entries. */
function hintEntries(payload) {
    if (typeof payload !== 'string' || payload.length > 262_144)
        fail('invalid-search-payload');
    const match = HINT.exec(payload.trim());
    if (!match)
        fail('invalid-search-payload');
    const body = match[1];
    if (!body || body === 'N')
        return [];
    return body.split('^').map(raw => raw.split('~'));
}
/**
 * Parses the A-share `v_hint="..."` suggestion payload. Entries are
 * `^`-separated and fields are `~`-separated: market, code, escaped name,
 * pinyin, class. Malformed entries are skipped rather than trusted; a
 * `v_hint="N"` body means no match. Exported for offline tests.
 */
export function parseInstrumentHints(payload) {
    const results = [];
    const seen = new Set();
    for (const fields of hintEntries(payload)) {
        if (fields.length < 5)
            continue;
        const market = (fields[0] ?? '').toLowerCase();
        const code = fields[1] ?? '';
        const kind = KIND_BY_CLASS[fields[4] ?? ''];
        if (!kind || !MARKETS.has(market) || !/^\d{6}$/.test(code))
            continue;
        const name = decodeName(fields[2]);
        if (!name)
            continue;
        const symbol = `${market.toUpperCase()}.${code}`;
        if (seen.has(symbol))
            continue;
        seen.add(symbol);
        results.push({ symbol, name, kind, market: 'cn' });
        if (results.length >= SEARCH_MAX_RESULTS)
            break;
    }
    return results;
}
/**
 * Parses the US entries of the same payload: market `us`, class `GP`, and a
 * venue-qualified code (`aapl.oq`, `brk.a.n`). The venue is stripped from the
 * identity and kept as `code`, because the quote host takes the bare ticker
 * while the daily host takes the qualified one. Unknown venues are skipped
 * instead of being guessed. Exported for offline tests.
 */
export function parseUsInstrumentHints(payload) {
    const results = [];
    const seen = new Set();
    for (const fields of hintEntries(payload)) {
        if (fields.length < 5)
            continue;
        if ((fields[0] ?? '').toLowerCase() !== 'us' || fields[4] !== 'GP')
            continue;
        const parsed = parseUsDirectoryCode(fields[1]);
        if (!parsed)
            continue;
        const name = decodeName(fields[2]);
        if (!name)
            continue;
        const symbol = `US.${parsed.ticker}`;
        if (seen.has(symbol))
            continue;
        seen.add(symbol);
        results.push({ symbol, name, kind: 'stock', market: 'us', code: parsed.code });
        if (results.length >= SEARCH_MAX_RESULTS)
            break;
    }
    return results;
}
/**
 * Parses the Hong Kong entries of the same payload: market `hk`, class `GP`
 * and a five-digit code written with its leading zeros. ETFs and stocks share
 * the `GP` class on this directory, so the row is carried as a stock rather
 * than guessing a class from the name. Warrants and CBBCs are `QZ` and are not
 * projected, and the RMB counter of a dual-counter listing is dropped in
 * `parseHkDirectoryCode`. Exported for offline tests.
 */
export function parseHkInstrumentHints(payload) {
    const results = [];
    const seen = new Set();
    for (const fields of hintEntries(payload)) {
        if (fields.length < 5)
            continue;
        if ((fields[0] ?? '').toLowerCase() !== 'hk' || fields[4] !== 'GP')
            continue;
        const symbol = parseHkDirectoryCode(fields[1]);
        if (!symbol)
            continue;
        const name = decodeName(fields[2]);
        if (!name)
            continue;
        if (seen.has(symbol))
            continue;
        seen.add(symbol);
        results.push({ symbol, name, kind: 'stock', market: 'hk' });
        if (results.length >= SEARCH_MAX_RESULTS)
            break;
    }
    return results;
}
export function normalizeMatch(raw) {
    const match = raw;
    if (!match || typeof match !== 'object')
        fail('invalid-match');
    const symbol = match.symbol;
    const name = typeof match.name === 'string' ? match.name.replace(CONTROL, '').trim() : '';
    const kind = match.kind;
    // An absent market is the pre-existing A-share behaviour, so a provider
    // compiled against the previous contract keeps working; an explicit unknown
    // value is still rejected rather than silently read as A-share.
    const market = match.market === undefined || match.market === 'cn' ? 'cn'
        : match.market === 'us' || match.market === 'hk' ? match.market : null;
    if (typeof symbol !== 'string' || !name || [...name].length > 64)
        fail('invalid-match');
    if (kind !== 'stock' && kind !== 'etf' && kind !== 'fund' && kind !== 'reit')
        fail('invalid-match');
    if (market === null)
        fail('invalid-match');
    if (market === 'cn') {
        if (!/^(SH|SZ|BJ)\.\d{6}$/.test(symbol))
            fail('invalid-match');
        return { symbol, name, kind, market };
    }
    if (market === 'hk') {
        if (!isHkSymbol(symbol) || match.code !== undefined)
            fail('invalid-match');
        try {
            return { symbol: normalizeHkSymbol(symbol), name, kind, market };
        }
        catch {
            fail('invalid-match');
        }
    }
    try {
        const canonical = normalizeUsSymbol(symbol);
        if (match.code === undefined)
            return { symbol: canonical, name, kind, market };
        return { symbol: canonical, name, kind, market, code: normalizeUsCode(match.code, canonical) };
    }
    catch {
        fail('invalid-match');
    }
}
