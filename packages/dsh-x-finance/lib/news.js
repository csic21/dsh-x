// Read-only market news for the stock page. Two public, key-free sources answer
// here: Sina's 7x24 flash feed (market-wide, the fastest text a retail reader
// gets) and East Money's article search (longer pieces about one name). Both are
// unofficial, have no SLA and may change or disappear; nothing in this module
// treats their text as verified fact, and no sentiment or cause is computed.
//
// Everything below is a trust boundary: the provider parses upstream text into
// NewsItem, and `validateNewsFeed` re-checks what the provider produced before
// the Host returns it to the browser. Raw payloads and upstream errors never
// leave the Host.
import { marketOf } from './watchlist.js';
export const NEWS_ENDPOINT = 'dsh-x-finance.news';
export const NEWS_FLASH_SOURCE = '新浪财经 7x24 (unofficial)';
export const NEWS_STOCK_SOURCE = '东方财富资讯 (unofficial)';
export const NEWS_TIMEOUT_MS = 8_000;
export const NEWS_MAX_BYTES = 512 * 1024;
export const NEWS_FLASH_TTL_MS = 60_000;
export const NEWS_STOCK_TTL_MS = 120_000;
export const NEWS_MAX_ITEMS = 60;
/** Older than this and the item is not "news" for a session view any more. */
export const NEWS_MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const SHANGHAI_OFFSET = '+08:00';
const HOST_ALLOWLIST = ['eastmoney.com', 'sina.com.cn', 'sina.cn'];
const SHANGHAI_STAMP = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;
const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#160': ' ' };
function newsError(code) {
    return Object.assign(new Error(`news ${code}`), { code: `finance/news-${code}` });
}
/** Strip markup, decode the few entities these feeds use, and bound the length. */
export function sanitizeText(input, max) {
    if (typeof input !== 'string')
        return '';
    // Inline markup (the search API highlights the keyword with <em>) carries no
    // word boundary, so it is removed rather than turned into a space.
    let text = input.replace(/<\/?(?:em|b|i|strong|span|font|a|u|sup|sub|small|label)\b[^>]{0,200}>/gi, '');
    text = text.replace(/<[^>]{0,300}>/g, ' ');
    text = text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => ENTITIES[body.toLowerCase()] ?? match);
    text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    if (!text)
        return '';
    return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}
/**
 * Only http(s) links on a known finance host survive. A search result may carry
 * anything; the page must never render an arbitrary scheme or an unknown
 * destination as "read the original".
 */
export function safeNewsUrl(input) {
    if (typeof input !== 'string' || !input.trim() || input.length > 512)
        return null;
    let url;
    try {
        url = new URL(input.trim());
    }
    catch {
        return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:')
        return null;
    const host = url.hostname.toLowerCase();
    if (!HOST_ALLOWLIST.some(allowed => host === allowed || host.endsWith(`.${allowed}`)))
        return null;
    url.protocol = 'https:';
    url.hash = '';
    return url.toString();
}
/** Sina prints Shanghai wall clock without a zone; interpret it as UTC+08:00. */
export function parseShanghaiStamp(value) {
    if (typeof value !== 'string')
        return null;
    const match = SHANGHAI_STAMP.exec(value.trim());
    if (!match)
        return null;
    const [, year, month, day, hour, minute, second] = match;
    if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59)
        return null;
    const ms = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${SHANGHAI_OFFSET}`);
    if (!Number.isFinite(ms))
        return null;
    // `new Date` rolls 2026-02-30 forward to March; a stamp that does not survive
    // the round trip is not a date the feed actually printed.
    const back = new Date(ms + 8 * 60 * 60 * 1000);
    if (back.getUTCFullYear() !== Number(year) || back.getUTCMonth() + 1 !== Number(month) || back.getUTCDate() !== Number(day))
        return null;
    return new Date(ms).toISOString();
}
/**
 * A feed entry is either bracketed (【headline】body) or a bare sentence. Both
 * shapes become a headline plus an optional body; nothing is generated.
 */
export function splitFlash(text) {
    const bracketed = /^【([^】]{2,140})】\s*([\s\S]*)$/.exec(text);
    if (bracketed) {
        const title = bracketed[1].trim();
        const body = sanitizeText(bracketed[2], 320);
        return { title, summary: body || null };
    }
    if (text.length <= 96)
        return { title: text, summary: null };
    const stop = text.search(/[。！？]/);
    if (stop > 8 && stop <= 96) {
        const body = sanitizeText(text.slice(stop + 1), 320);
        return { title: text.slice(0, stop + 1), summary: body || null };
    }
    return { title: `${text.slice(0, 80)}…`, summary: sanitizeText(text.slice(80), 320) || null };
}
/** Map a Sina `ext.stocks` entry onto the identity this plugin already uses. */
export function newsSymbolRef(market, raw) {
    if (typeof market !== 'string' || typeof raw !== 'string')
        return null;
    const key = market.toLowerCase();
    const value = raw.trim();
    if (key === 'cn') {
        const match = /^(sh|sz|bj)(\d{6})$/.exec(value);
        return match ? `${match[1].toUpperCase()}.${match[2]}` : null;
    }
    if (key === 'hk')
        return /^\d{5}$/.test(value) ? `HK.${value}` : null;
    if (key === 'us')
        return /^[A-Za-z][A-Za-z.\-]{0,15}$/.test(value) ? `US.${value.toUpperCase()}` : null;
    // fund / foreign / global / futures rows are real Sina tags but are not a
    // watchable listing on any of the three boards this plugin covers.
    return null;
}
function symbolRefs(raw) {
    let ext = raw;
    if (typeof ext === 'string') {
        try {
            ext = JSON.parse(ext);
        }
        catch {
            return [];
        }
    }
    const list = ext && typeof ext === 'object' ? ext.stocks : null;
    if (!Array.isArray(list))
        return [];
    const refs = [];
    const seen = new Set();
    for (const entry of list.slice(0, 12)) {
        if (!entry || typeof entry !== 'object')
            continue;
        const record = entry;
        const symbol = newsSymbolRef(record.market, record.symbol);
        if (!symbol || seen.has(symbol))
            continue;
        seen.add(symbol);
        refs.push({ symbol, name: sanitizeText(record.key, 32) || symbol });
    }
    return refs;
}
function tags(raw) {
    if (!Array.isArray(raw))
        return [];
    const names = [];
    for (const entry of raw.slice(0, 4)) {
        const name = sanitizeText(entry && typeof entry === 'object' ? entry.name : null, 12);
        if (name && !names.includes(name))
            names.push(name);
    }
    return names;
}
function fresh(at, now) {
    const ms = Date.parse(at);
    return Number.isFinite(ms) && ms <= now + 300_000 && ms >= now - NEWS_MAX_AGE_MS;
}
/** Parse the 7x24 flash list. A malformed envelope is a failure, not an empty feed. */
export function parseSinaFlash(payload, now) {
    const list = payload?.result?.data?.feed?.list;
    if (!Array.isArray(list))
        throw new Error('news flash malformed');
    const items = [];
    const seen = new Set();
    for (const entry of list) {
        if (!entry || typeof entry !== 'object')
            continue;
        const record = entry;
        const rawId = typeof record.id === 'number' || typeof record.id === 'string' ? String(record.id) : '';
        const at = parseShanghaiStamp(record.create_time);
        if (!rawId || !/^[0-9]{1,24}$/.test(rawId) || !at || !fresh(at, now))
            continue;
        const id = `sina:${rawId}`;
        if (seen.has(id))
            continue;
        const text = sanitizeText(record.rich_text, 1_200);
        if (!text)
            continue;
        const { title, summary } = splitFlash(text);
        if (!title)
            continue;
        seen.add(id);
        items.push({
            id,
            at,
            title,
            summary,
            media: '新浪财经',
            url: safeNewsUrl(record.docurl),
            tags: tags(record.tag),
            direct: false,
            symbols: symbolRefs(record.ext),
        });
    }
    return items;
}
/** Parse the JSONP article search. Titles arrive with `<em>` markers. */
export function parseEastmoneyNews(payload, now) {
    const list = payload?.result?.cmsArticleWebOld;
    if (!Array.isArray(list))
        throw new Error('news search malformed');
    const items = [];
    const seen = new Set();
    for (const entry of list) {
        if (!entry || typeof entry !== 'object')
            continue;
        const record = entry;
        const at = parseShanghaiStamp(record.date);
        if (!at || !fresh(at, now))
            continue;
        const title = sanitizeText(record.title, 160);
        if (!title)
            continue;
        const code = sanitizeText(record.code, 48);
        const url = safeNewsUrl(record.url);
        const id = code ? `em:${code}` : url ? `em:${url}` : '';
        if (!id || seen.has(id))
            continue;
        seen.add(id);
        items.push({
            id,
            at,
            title,
            summary: sanitizeText(record.content, 320) || null,
            media: sanitizeText(record.mediaName, 32) || '东方财富',
            url,
            tags: [],
            direct: false,
            symbols: [],
        });
    }
    return items;
}
/** `cb({...})` -> the parsed object. Any other shape is rejected. */
export function unwrapJsonp(text) {
    const start = text.indexOf('(');
    const end = text.lastIndexOf(')');
    if (start < 0 || end <= start || end - start > 4 * 1024 * 1024)
        throw new Error('news jsonp malformed');
    return JSON.parse(text.slice(start + 1, end));
}
export function parseNewsRequest(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype)
        throw newsError('invalid-input');
    const record = payload;
    const keys = Object.keys(record).sort().join(',');
    if (record.kind === 'flash') {
        if (keys !== 'kind')
            throw newsError('invalid-input');
        return { kind: 'flash' };
    }
    if (record.kind === 'stock') {
        if (keys !== 'kind,name,symbol')
            throw newsError('invalid-input');
        const symbol = typeof record.symbol === 'string' ? record.symbol : '';
        // The same three-board identity the rest of the plugin stores, so a news
        // request can never address a symbol the quote routes would reject.
        try {
            marketOf(symbol);
        }
        catch {
            throw newsError('invalid-input');
        }
        const name = sanitizeText(record.name, 32);
        if (!name)
            throw newsError('invalid-input');
        return { kind: 'stock', symbol, name };
    }
    throw newsError('invalid-input');
}
const isIso = (value) => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
function projectItem(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return null;
    const record = raw;
    const id = sanitizeText(record.id, 96);
    const title = sanitizeText(record.title, 200);
    if (!id || !title || !isIso(record.at))
        return null;
    const summary = sanitizeText(record.summary, 400) || null;
    const media = sanitizeText(record.media, 40) || null;
    const symbols = [];
    for (const entry of Array.isArray(record.symbols) ? record.symbols.slice(0, 12) : []) {
        const symbol = entry && typeof entry === 'object' ? entry.symbol : null;
        let valid = '';
        try {
            valid = typeof symbol === 'string' ? (marketOf(symbol), symbol) : '';
        }
        catch { /* not a watchable listing */ }
        if (!valid)
            continue;
        symbols.push({ symbol: valid, name: sanitizeText(entry.name, 40) || valid });
    }
    const itemTags = [];
    for (const entry of Array.isArray(record.tags) ? record.tags.slice(0, 4) : []) {
        const tag = sanitizeText(entry, 12);
        if (tag && !itemTags.includes(tag))
            itemTags.push(tag);
    }
    return {
        id,
        at: new Date(Date.parse(record.at)).toISOString(),
        title,
        summary,
        media,
        url: safeNewsUrl(record.url),
        tags: itemTags,
        direct: record.direct === true,
        symbols,
    };
}
/**
 * Deduplicate by id, then by normalized headline. Items that name the security
 * come first, newest first inside each group: a stock page must lead with the
 * stories about the stock, not with a market flash that merely ships nearby.
 */
export function mergeNews(items, limit = NEWS_MAX_ITEMS) {
    const byId = new Set();
    const byTitle = new Set();
    const merged = [];
    const ordered = [...items].sort((left, right) => {
        if (left.direct !== right.direct)
            return left.direct ? -1 : 1;
        return Date.parse(right.at) - Date.parse(left.at);
    });
    for (const item of ordered) {
        const normalized = item.title.replace(/[\s，。！？、：；""''()（）【】\[\]…—\-·]/g, '');
        const key = normalized.slice(0, 48);
        if (byId.has(item.id) || (key && byTitle.has(key)))
            continue;
        byId.add(item.id);
        if (key)
            byTitle.add(key);
        merged.push(item);
    }
    return merged.slice(0, limit);
}
/**
 * Re-validate the provider's feed at the same boundary as the quote projectors.
 * Individual malformed rows are dropped (a news list has no numeric contract to
 * protect), but a malformed envelope is a failure rather than an empty feed.
 */
export function validateNewsFeed(raw, request, now) {
    const fail = () => newsError('invalid');
    const value = raw;
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw fail();
    const source = sanitizeText(value.source, 64);
    if (!source)
        throw fail();
    if (!Array.isArray(value.items))
        throw fail();
    const items = [];
    for (const entry of value.items.slice(0, 200)) {
        const item = projectItem(entry);
        if (item)
            items.push(item);
    }
    // An empty list is a legitimate answer ("nothing mentions this name today");
    // only a malformed envelope is a failure, which the checks above already cover.
    return {
        scope: request.kind,
        symbol: request.kind === 'stock' ? request.symbol : null,
        source,
        fetchedAt: new Date(now).toISOString(),
        partial: value.partial === true,
        items: mergeNews(items),
    };
}
