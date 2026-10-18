// Optional, opt-in A-share quote adapter backed by Tencent's public
// qt.gtimg.cn endpoint. This is NOT a licensed market-data feed: no SLA, no
// redistribution right, and it can break or block at any time. It exists for
// local, single-user use behind an explicit opt-in (config or env flag) and
// must never become the default source of a distributed build.
//
// The endpoint returns GBK text in a tilde-separated format, e.g.
//   v_sh600519="1~贵州茅台~600519~1329.00~1312.97~...";
// Field order is stable in practice; only the fields below are read, and every
// value is re-validated instead of trusting the upstream payload.
import { validateSymbol } from './watchlist.js';
export const FREE_SOURCE_NAME = 'qt.gtimg.cn (unofficial)';
export const FREE_TIMEOUT_MS = 10_000;
export const FREE_MAX_BYTES = 32_768;
const ENDPOINT = 'https://qt.gtimg.cn/q=';
const LINE = /^v_(sh|sz|bj)(\d{6})="([^"]*)";?$/;
const STAMP = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;
const CONTROL = /[\u0000-\u001f\u007f]/g;
function fail(message) {
    throw new Error(message);
}
export function parseTencentTimestamp(raw, now) {
    const match = typeof raw === 'string' ? STAMP.exec(raw) : null;
    if (!match)
        fail('invalid quote timestamp');
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59)
        fail('invalid quote timestamp');
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day)
        fail('invalid quote timestamp');
    // Exchange timestamps are China Standard Time (UTC+08:00, no DST).
    const stamp = Date.UTC(year, month - 1, day, hour - 8, minute, second);
    const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}+08:00`;
    if (!Number.isFinite(stamp) || Date.parse(iso) !== stamp)
        fail('invalid quote timestamp');
    if (stamp > now + 300_000)
        fail('quote timestamp is in the future');
    return iso;
}
export function parseTencentLine(payload, symbol, now = Date.now()) {
    const normalized = validateSymbol(symbol);
    const [exchange, code] = normalized.split('.');
    if (typeof payload !== 'string')
        fail('invalid quote payload');
    const lines = payload.trim().split(/\r?\n/);
    if (lines.length !== 1)
        fail('expected exactly one quote line');
    const match = LINE.exec(lines[0].trim());
    if (!match)
        fail('invalid quote payload');
    if (match[1].toUpperCase() !== exchange || match[2] !== code)
        fail('quote payload symbol mismatch');
    const fields = match[3].split('~');
    if (fields.length < 34)
        fail('truncated quote payload');
    if (!/^\d{1,3}$/.test(fields[0] ?? ''))
        fail('invalid market flag');
    if (fields[2] !== code)
        fail('quote payload symbol mismatch');
    const name = String(fields[1] ?? '').replace(CONTROL, '').trim();
    if (!name || [...name].length > 64)
        fail('invalid security name');
    const priceText = fields[3] ?? '';
    const percentText = fields[32] ?? '';
    if (!/^\d+(?:\.\d+)?$/.test(priceText))
        fail('invalid price');
    if (!/^-?\d+(?:\.\d+)?$/.test(percentText))
        fail('invalid change percent');
    const price = Number(priceText);
    if (!Number.isFinite(price) || price <= 0 || price >= 1e9)
        fail('invalid price');
    const changePercent = Number(percentText);
    if (!Number.isFinite(changePercent) || Math.abs(changePercent) > 1_000)
        fail('invalid change percent');
    return {
        symbol: normalized,
        name,
        price,
        changePercent,
        quotedAt: parseTencentTimestamp(fields[30], now),
        marketStatus: 'unknown',
    };
}
async function readText(response, signal) {
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > FREE_MAX_BYTES)
        fail('response too large');
    const type = (response.headers.get('content-type') ?? '').toLowerCase();
    if (type && !type.startsWith('text/'))
        fail('unexpected content type');
    if (!response.body)
        fail('empty response');
    const reader = response.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => { }); };
    signal.addEventListener('abort', cancel, { once: true });
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            signal.throwIfAborted();
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > FREE_MAX_BYTES)
                fail('response too large');
            chunks.push(value);
        }
    }
    finally {
        signal.removeEventListener('abort', cancel);
        void reader.cancel().catch(() => { });
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder('gbk').decode(bytes);
}
/**
 * Creates the opt-in adapter expected by `createWatchlistHandler({ provider })`.
 * It never logs, caches or forwards the raw payload: callers receive only the
 * projected quote fields, and failures surface as a generic rejection.
 */
export function createFreeQuoteProvider(options = {}) {
    const { fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = FREE_TIMEOUT_MS } = options;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
        throw new Error('invalid timeout');
    return {
        name: FREE_SOURCE_NAME,
        async quote(input, { signal } = {}) {
            const symbol = validateSymbol(input);
            const [exchange, code] = symbol.split('.');
            if (signal?.aborted)
                throw new Error('cancelled');
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            const cancel = () => controller.abort();
            signal?.addEventListener('abort', cancel, { once: true });
            try {
                const response = await fetchImpl(`${ENDPOINT}${exchange.toLowerCase()}${code}`, {
                    method: 'GET',
                    redirect: 'error',
                    signal: controller.signal,
                    headers: { accept: 'text/plain', 'user-agent': 'dsh-x-stock/0.1 (local-only)' },
                });
                if (!response.ok) {
                    void response.body?.cancel().catch(() => { });
                    fail(`http ${response.status}`);
                }
                const text = await readText(response, controller.signal);
                return parseTencentLine(text, symbol, now());
            }
            finally {
                clearTimeout(timer);
                signal?.removeEventListener('abort', cancel);
                controller.abort();
            }
        },
    };
}
