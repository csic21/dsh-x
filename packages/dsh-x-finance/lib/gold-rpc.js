import { GOLD_ENDPOINT, validateGoldSnapshot } from './gold.js';
import { createRpcRoute, failure } from './rpc.js';
// Exact-route handler behind the official shared Connection admission bridge.
// The bridge rejects non-owner peers before this code runs; the explicit check
// keeps the handler safe when it is called directly in tests or another Host.
export function createGoldHandler({ provider, now = Date.now } = {}) {
    return async (endpoint, payload, signal, peer) => {
        if (peer?.principal?.kind !== 'owner')
            return failure('finance/forbidden', '只允许宿主所有者读取黄金行情。');
        if (endpoint !== GOLD_ENDPOINT)
            return failure('finance/not-found', '未知黄金接口。');
        if (!payload || Object.getPrototypeOf(payload) !== Object.prototype || Object.keys(payload).length) {
            return failure('finance/invalid-input', '黄金行情请求参数无效。');
        }
        if (signal?.aborted)
            return failure('finance/cancelled', '黄金行情请求已取消。');
        try {
            const resolved = typeof provider === 'function' ? await provider() : provider;
            if (!resolved)
                return { ok: true, value: { status: 'unconfigured' } };
            const raw = await resolved.snapshot(signal);
            return { ok: true, value: { status: 'ready', snapshot: validateGoldSnapshot(raw, now()) } };
        }
        catch {
            // Raw upstream text never reaches the browser, and a partial failure is
            // still a failure: the panel keeps its last good values instead.
            return failure('finance/gold-unavailable', '黄金行情暂不可用，请稍后重试。');
        }
    };
}
export function createGoldRoute(options = {}) {
    return createRpcRoute(GOLD_ENDPOINT, createGoldHandler(options));
}
