import { NEWS_ENDPOINT, parseNewsRequest, validateNewsFeed } from './news.js';
import { createRpcRoute, failure } from './rpc.js';
// Exact-route handler behind the official shared Connection admission bridge.
// The bridge rejects non-owner peers before this code runs; the explicit check
// keeps the handler safe when it is called directly in tests or another Host.
export function createNewsHandler({ provider, now = Date.now } = {}) {
    return async (endpoint, payload, signal, peer) => {
        if (peer?.principal?.kind !== 'owner')
            return failure('finance/forbidden', '只允许宿主所有者读取资讯。');
        if (endpoint !== NEWS_ENDPOINT)
            return failure('finance/not-found', '未知资讯接口。');
        let request;
        try {
            request = parseNewsRequest(payload);
        }
        catch {
            return failure('finance/invalid-input', '资讯请求参数无效。');
        }
        if (signal?.aborted)
            return failure('finance/cancelled', '资讯请求已取消。');
        try {
            const resolved = typeof provider === 'function' ? await provider() : provider;
            if (!resolved)
                return { ok: true, value: { status: 'unconfigured' } };
            const raw = request.kind === 'flash'
                ? await resolved.flash(signal)
                : await resolved.stock(request, signal);
            return { ok: true, value: { status: 'ready', news: validateNewsFeed(raw, request, now()) } };
        }
        catch {
            // Raw upstream text never reaches the browser: a blocked or reshaped feed
            // is one honest failure, and the panel keeps the list it already shows.
            return failure('finance/news-unavailable', '资讯暂不可用，请稍后重试。');
        }
    };
}
export function createNewsRoute(options = {}) {
    return createRpcRoute(NEWS_ENDPOINT, createNewsHandler(options));
}
