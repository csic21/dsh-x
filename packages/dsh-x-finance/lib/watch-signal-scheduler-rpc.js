import { createMarketHandler } from './market-rpc.js';
import { MARKET_ENDPOINT } from './market.js';
import { createSearchHandler } from './search-rpc.js';
import { SEARCH_RPC_ENDPOINT } from './instrument-search.js';
import { createRpcRoute, failure } from './rpc.js';
import { MAX_WATCHLIST, validateScope, validateSymbol } from './watchlist.js';
export const WATCH_SCHEDULE_ENDPOINT = 'dsh-x-finance.watch-schedule';
/** Reject, rather than silently truncate, duplicates, extras and oversized lists. */
export function scheduleSymbols(input) {
    if (!Array.isArray(input) || input.length > MAX_WATCHLIST)
        throw new Error('invalid symbols');
    const symbols = input.map(validateSymbol);
    if (new Set(symbols).size !== symbols.length)
        throw new Error('duplicate symbols');
    return symbols;
}
export function parseWatchScheduleRequest(input) {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype)
        throw new Error('invalid request');
    const value = input;
    const scope = validateScope(value.scope);
    const keys = Object.keys(value).sort().join(',');
    if (['get', 'disable', 'run'].includes(String(value.action)) && keys === 'action,scope') {
        return { action: value.action, scope };
    }
    if (value.action === 'enable' && keys === 'action,consent,scope,symbols' && value.consent === true) {
        return { action: 'enable', scope, symbols: scheduleSymbols(value.symbols), consent: true };
    }
    if (value.action === 'sync' && keys === 'action,scope,symbols') {
        return { action: 'sync', scope, symbols: scheduleSymbols(value.symbols) };
    }
    throw new Error('invalid request');
}
/** Only register this exact route on the official shared Connection owner bridge. */
export function createWatchScheduleHandler(scheduler) {
    return async (endpoint, payload, signal, peer) => {
        if (peer?.principal?.kind !== 'owner')
            return failure('finance/forbidden', '只允许宿主所有者管理后台自选分析。');
        if (endpoint !== WATCH_SCHEDULE_ENDPOINT)
            return failure('finance/not-found', '未知后台分析接口。');
        let request;
        try {
            request = parseWatchScheduleRequest(payload);
        }
        catch {
            return failure('finance/invalid-input', '请提交当前 scope 和最多 200 个不重复的自选代码；启用须显式同意。');
        }
        if (signal?.aborted)
            return failure('finance/cancelled', '请求已取消。');
        try {
            return { ok: true, value: await scheduler.request(request, signal) };
        }
        catch (error) {
            if (signal?.aborted)
                return failure('finance/cancelled', '请求已取消。');
            const codes = ['scope-mismatch', 'not-enabled', 'storage-unavailable', 'cancelled', 'disposed'];
            const code = codes.includes(error?.code) ? error.code : 'storage-unavailable';
            return failure(`finance/schedule-${code}`, '后台自选分析请求未完成，请刷新当前 profile 状态。');
        }
    };
}
export function createWatchScheduleRoute(scheduler) {
    return createRpcRoute(WATCH_SCHEDULE_ENDPOINT, createWatchScheduleHandler(scheduler));
}
/** Internal adapter for the SAME scanner as the browser. Never a public route. */
export function createWatchScheduleRpc(options) {
    return {
        async call(channel, endpoint, payload, signal) {
            const check = async () => { signal.throwIfAborted(); if (!await options.allowed())
                throw new Error('disabled'); signal.throwIfAborted(); };
            await check();
            const owner = { principal: { kind: 'owner' } };
            if (channel !== '/api')
                throw new Error('unsupported channel');
            if (endpoint === SEARCH_RPC_ENDPOINT && payload?.action === 'search') {
                const provider = options.search.provider;
                const handler = createSearchHandler({
                    enabled: async () => { await check(); return options.search.enabled(); },
                    provider: provider && { name: provider.name, search: async (query, opts) => { await check(); return provider.search(query, opts); } },
                });
                return handler(endpoint, payload, signal, owner);
            }
            if (endpoint !== MARKET_ENDPOINT || payload?.kind !== 'history')
                throw new Error('unsupported request');
            const handler = createMarketHandler({ now: options.now, provider: async () => {
                    await check();
                    const provider = typeof options.market === 'function' ? await options.market() : options.market;
                    await check();
                    if (!provider)
                        return undefined;
                    // The official history API currently has no AbortSignal. Already issued
                    // I/O can finish, but no later request or cancelled result is accepted.
                    return { name: provider.name, history: provider.history && (async (...args) => {
                            await check();
                            return provider.history(...args);
                        }) };
                } });
            const result = await handler(endpoint, payload, signal, owner);
            await check();
            if (result.ok && 'value' in result && result.value?.status === 'ready' && 'history' in result.value) {
                options.onHistory(result.value.history);
            }
            return result;
        },
    };
}
