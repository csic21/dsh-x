import { US_ENDPOINT, parseUsRequest, projectUsHistory, projectUsQuote } from './us-market.js';
import { createRpcRoute, failure } from './rpc.js';
const MESSAGES = {
    'finance/forbidden': '只允许宿主所有者查询美股行情。',
    'finance/not-found': '未知美股接口。',
    'finance/us-symbol': '美股代码无效。',
    'finance/us-invalid': '美股请求格式无效。',
    'finance/us-quote-unavailable': '没有这只美股的有效报价。',
    'finance/us-quote-invalid': '美股报价响应格式无效。',
    'finance/us-history-unavailable': '这只美股没有可用的日 K 数据。',
    'finance/us-history-invalid': '美股日 K 响应格式无效。',
    'finance/us-unavailable': '美股行情暂不可用，请稍后重试。',
    'finance/cancelled': '美股行情请求已取消。',
};
const deny = (code) => failure(code, MESSAGES[code] ?? MESSAGES['finance/us-unavailable']);
/**
 * Exact-route handler behind the official shared Connection admission bridge.
 * The bridge rejects non-owner peers before this code runs; the explicit check
 * keeps the handler safe when it is called directly in tests or another Host.
 *
 * The US board is part of the same opt-in local free source: a disabled gate
 * answers `status: 'disabled'` without any network request.
 */
export function createUsHandler({ enabled, provider }) {
    return async (endpoint, payload, signal, peer) => {
        if (peer?.principal?.kind !== 'owner')
            return deny('finance/forbidden');
        if (endpoint !== US_ENDPOINT)
            return deny('finance/not-found');
        let request;
        try {
            request = parseUsRequest(payload);
        }
        catch (error) {
            return deny(typeof error?.code === 'string' && MESSAGES[error.code] ? error.code : 'finance/us-invalid');
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
            return deny('finance/us-unavailable');
        try {
            if (request.kind === 'quote') {
                const quote = await provider.quote(request.symbol, { signal });
                return { ok: true, value: { status: 'ready', quote: projectUsQuote(quote, request.symbol, Date.now()) } };
            }
            const history = await provider.history(request, { signal });
            return { ok: true, value: { status: 'ready', history: projectUsHistory(history, request.symbol, Date.now()) } };
        }
        catch (error) {
            const code = typeof error?.code === 'string' && MESSAGES[error.code] ? error.code : 'finance/us-unavailable';
            return deny(code);
        }
    };
}
export function createUsRoute(options) {
    return createRpcRoute(US_ENDPOINT, createUsHandler(options));
}
