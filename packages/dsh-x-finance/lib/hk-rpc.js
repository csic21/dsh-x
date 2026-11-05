import { HK_ENDPOINT, parseHkRequest, projectHkHistory, projectHkQuote } from './hk-market.js';
import { createRpcRoute, failure } from './rpc.js';
const MESSAGES = {
    'finance/forbidden': '只允许宿主所有者查询港股行情。',
    'finance/not-found': '未知港股接口。',
    'finance/hk-symbol': '港股代码无效。',
    'finance/hk-invalid': '港股请求格式无效。',
    'finance/hk-quote-unavailable': '没有这只港股的有效报价。',
    'finance/hk-quote-invalid': '港股报价响应格式无效。',
    'finance/hk-history-unavailable': '这只港股没有可用的日 K 数据。',
    'finance/hk-history-invalid': '港股日 K 响应格式无效。',
    'finance/hk-unavailable': '港股行情暂不可用，请稍后重试。',
    'finance/cancelled': '港股行情请求已取消。',
};
const deny = (code) => failure(code, MESSAGES[code] ?? MESSAGES['finance/hk-unavailable']);
/**
 * Exact-route handler behind the official shared Connection admission bridge.
 * The bridge rejects non-owner peers before this code runs; the explicit check
 * keeps the handler safe when it is called directly in tests or another Host.
 *
 * The HK board is part of the same opt-in local free source: a disabled gate
 * answers `status: 'disabled'` without any network request.
 */
export function createHkHandler({ enabled, provider }) {
    return async (endpoint, payload, signal, peer) => {
        if (peer?.principal?.kind !== 'owner')
            return deny('finance/forbidden');
        if (endpoint !== HK_ENDPOINT)
            return deny('finance/not-found');
        let request;
        try {
            request = parseHkRequest(payload);
        }
        catch (error) {
            return deny(typeof error?.code === 'string' && MESSAGES[error.code] ? error.code : 'finance/hk-invalid');
        }
        if (signal?.aborted)
            return deny('finance/cancelled');
        let on = false;
        try {
            on = Boolean(await enabled());
        }
        catch {
            on = false;
        }
        if (!on)
            return { ok: true, value: { status: 'disabled' } };
        if (!provider)
            return deny('finance/hk-unavailable');
        try {
            if (request.kind === 'quote') {
                const quote = await provider.quote(request.symbol, { signal });
                return { ok: true, value: { status: 'ready', quote: projectHkQuote(quote, request.symbol, Date.now()) } };
            }
            const history = await provider.history(request, { signal });
            return { ok: true, value: { status: 'ready', history: projectHkHistory(history, request.symbol, Date.now()) } };
        }
        catch (error) {
            const code = typeof error?.code === 'string' && MESSAGES[error.code] ? error.code : 'finance/hk-unavailable';
            return deny(code);
        }
    };
}
export function createHkRoute(options) {
    return createRpcRoute(HK_ENDPOINT, createHkHandler(options));
}
