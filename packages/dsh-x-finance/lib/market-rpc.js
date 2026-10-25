import { MARKET_ENDPOINT, MARKET_PREFERENCE_ENDPOINT, isAshareMinute, parseMarketPreferenceRequest, parseMarketRequest, shanghaiToday } from './market.js';
import { projectGlobalOverview } from './global.js';
import { projectTailScan } from './tail-scan.js';
import { projectHotScan } from './hot.js';
import { createRpcRoute, failure } from './rpc.js';
/**
 * Re-validates every quote before it reaches the browser and reports a symbol
 * the source did not answer for as `unavailable`. Raw payloads, extra fields
 * and upstream errors never leave the Host.
 */
export function projectQuotes(raw, symbols, now) {
    const bySymbol = new Map();
    for (const quote of Array.isArray(raw) ? raw : []) {
        if (!quote || typeof quote !== 'object')
            continue;
        if (!symbols.includes(quote.symbol) || bySymbol.has(quote.symbol))
            continue;
        bySymbol.set(quote.symbol, quote);
    }
    const fetchedAt = new Date(now).toISOString();
    return symbols.map(symbol => {
        const quote = bySymbol.get(symbol);
        const usable = quote
            && quote.status === 'available'
            && Number.isFinite(quote.price) && quote.price > 0
            && Number.isFinite(quote.changePercent) && Math.abs(quote.changePercent) <= 1000
            && typeof quote.quotedAt === 'string' && Number.isFinite(Date.parse(quote.quotedAt))
            && Date.parse(quote.quotedAt) <= now + 300_000;
        if (!usable)
            return { symbol, status: 'unavailable', name: '', price: null, pricePrecision: null, changePercent: null, quotedAt: null, fetchedAt: null, marketStatus: 'unknown' };
        // A replacement adapter may omit the width or send nonsense; the browser
        // then falls back to its own two-decimal default instead of trusting it.
        const precision = Number.isInteger(quote.pricePrecision) && quote.pricePrecision >= 0 && quote.pricePrecision <= 6
            ? quote.pricePrecision : null;
        return {
            symbol,
            status: 'available',
            name: typeof quote.name === 'string' ? quote.name.slice(0, 64) : '',
            price: quote.price,
            pricePrecision: precision,
            changePercent: quote.changePercent,
            quotedAt: quote.quotedAt,
            fetchedAt,
            marketStatus: quote.marketStatus === 'closed' ? 'closed' : 'unknown',
        };
    });
}
/**
 * Re-validates a provider's daily history before it reaches the browser. This
 * is the same trust boundary as `projectQuotes`: a replacement adapter cannot
 * inject extra fields, unordered bars or a bar that violates OHLC, and the
 * response is bounded to the requested limit. Nothing is repaired or filled in.
 */
export function projectHistoryResponse(raw, symbol, requested, limit, now) {
    const fail = () => Object.assign(new Error('history unavailable'), { code: 'finance/history-unavailable' });
    const value = raw;
    if (!value || typeof value !== 'object' || value.symbol !== symbol)
        throw fail();
    const bars = Array.isArray(value.bars) ? value.bars.slice(-limit) : null;
    if (!bars || !bars.length)
        throw fail();
    let previous = '';
    const projected = bars.map((bar) => {
        if (!bar || typeof bar !== 'object' || Array.isArray(bar))
            throw fail();
        const { sessionDate, open, high, low, close, volume, amount, isFinal } = bar;
        if (typeof sessionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate) || sessionDate <= previous)
            throw fail();
        previous = sessionDate;
        for (const number of [open, high, low, close]) {
            if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0 || number > 1e12)
                throw fail();
        }
        if (low > Math.min(open, close) || high < Math.max(open, close) || low > high)
            throw fail();
        for (const quantity of [volume, amount]) {
            if (quantity !== null && (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0 || quantity > Number.MAX_SAFE_INTEGER))
                throw fail();
        }
        if (typeof isFinal !== 'boolean')
            throw fail();
        return { sessionDate, open, high, low, close, volume, amount, isFinal };
    });
    const text = (input, max) => typeof input === 'string' && input.trim() && input.length <= max
        ? input.replace(/[\u0000-\u001f\u007f]/g, '').trim() : null;
    const name = text(value.name, 64), source = text(value.source, 64);
    const precision = value.pricePrecision;
    if (!name || !source || !Number.isInteger(precision) || precision < 0 || precision > 8)
        throw fail();
    if (!['shares', 'lots', 'unknown', 'reported'].includes(value.volumeBasis))
        throw fail();
    // The adapter reports what the source actually returned; the requested
    // adjustment is only a fallback. Claiming qfq for unadjusted rows would be a
    // provenance lie on the chart.
    const adjustment = ['none', 'forward', 'backward'].includes(value.adjustment) ? value.adjustment : requested;
    return {
        symbol,
        name,
        source,
        fetchedAt: new Date(now).toISOString(),
        adjustment,
        adjustmentLabel: typeof value.adjustmentLabel === 'string' && value.adjustmentLabel.length <= 64
            ? value.adjustmentLabel : adjustment,
        pricePrecision: precision,
        volumeUnit: 'shares',
        volumeBasis: value.volumeBasis,
        amountUnit: 'CNY',
        currency: 'CNY',
        exchangeTimezone: 'Asia/Shanghai',
        firstSessionDate: projected[0].sessionDate,
        lastSessionDate: projected.at(-1).sessionDate,
        bars: projected,
    };
}
/** Re-validates a minute line before it reaches the browser. No point is filled in. */
export function projectIntradayResponse(raw, symbol, now) {
    const fail = () => Object.assign(new Error('intraday unavailable'), { code: 'finance/intraday-unavailable' });
    const value = raw;
    if (!value || typeof value !== 'object' || value.symbol !== symbol)
        throw fail();
    const sessionDate = value.sessionDate;
    if (typeof sessionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate) || sessionDate > shanghaiToday(now))
        throw fail();
    const points = Array.isArray(value.points) ? value.points : null;
    if (!points || !points.length || points.length > 300)
        throw fail();
    let previous = '';
    const projected = points.map((point) => {
        if (!point || typeof point !== 'object' || Array.isArray(point))
            throw fail();
        const { time, price, volume, average } = point;
        if (typeof time !== 'string' || !isAshareMinute(time) || time <= previous)
            throw fail();
        previous = time;
        if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 1e12)
            throw fail();
        if (volume !== null && (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > Number.MAX_SAFE_INTEGER))
            throw fail();
        if (average !== null && (typeof average !== 'number' || !Number.isFinite(average) || average <= 0 || average > 1e12))
            throw fail();
        return { time, price, volume, average };
    });
    const text = (input, max) => typeof input === 'string' && input.trim() && input.length <= max
        ? input.replace(/[\u0000-\u001f\u007f]/g, '').trim() : null;
    const name = text(value.name, 64), source = text(value.source, 64);
    const precision = value.pricePrecision;
    const previousClose = value.previousClose;
    if (!name || !source || !Number.isInteger(precision) || precision < 0 || precision > 8)
        throw fail();
    if (value.volumeBasis !== 'lots' || typeof value.closed !== 'boolean')
        throw fail();
    if (previousClose !== null && (typeof previousClose !== 'number' || !Number.isFinite(previousClose) || previousClose <= 0 || previousClose > 1e12))
        throw fail();
    return {
        symbol, name, source, fetchedAt: new Date(now).toISOString(), sessionDate, previousClose,
        pricePrecision: precision, volumeBasis: 'lots', currency: 'CNY', exchangeTimezone: 'Asia/Shanghai',
        closed: value.closed, points: projected,
    };
}
// Exact-route handler behind the official shared Connection admission bridge.
// The bridge rejects non-owner peers before this code runs; the explicit check
// keeps the handler safe when it is called directly in tests or another Host.
export function createMarketHandler({ provider, now = Date.now } = {}) {
    return async (endpoint, payload, signal, peer) => {
        if (peer?.principal?.kind !== 'owner')
            return failure('finance/forbidden', '只允许宿主所有者读取市场数据。');
        if (endpoint !== MARKET_ENDPOINT)
            return failure('finance/not-found', '未知市场接口。');
        let request;
        try {
            request = parseMarketRequest(payload);
        }
        catch {
            return failure('finance/invalid-input', '市场数据请求参数无效。');
        }
        if (signal?.aborted)
            return failure('finance/cancelled', '市场数据请求已取消。');
        try {
            const resolved = typeof provider === 'function' ? await provider() : provider;
            if (!resolved)
                return { ok: true, value: { status: 'unconfigured', source: null } };
            if (request.kind === 'overview')
                return { ok: true, value: { status: 'ready', overview: await resolved.overview() } };
            if (request.kind === 'breadth')
                return { ok: true, value: { status: 'ready', breadth: await resolved.breadth() } };
            if (request.kind === 'quotes') {
                const source = String(resolved.name).slice(0, 64);
                return { ok: true, value: { status: 'ready', source, quotes: projectQuotes(await resolved.quotes(request.symbols), request.symbols, now()) } };
            }
            if (request.kind === 'history') {
                // A replacement adapter may have no daily bars. That is an honest
                // "unavailable" for the chart, not a failure of the quote source.
                if (typeof resolved.history !== 'function')
                    return failure('finance/history-unavailable', '当前行情源不提供历史日 K。');
                const raw = await resolved.history(request.symbol, { adjustment: request.adjustment, limit: request.limit });
                return { ok: true, value: { status: 'ready', history: projectHistoryResponse(raw, request.symbol, request.adjustment, request.limit, now()) } };
            }
            if (request.kind === 'intraday') {
                if (typeof resolved.intraday !== 'function')
                    return failure('finance/intraday-unavailable', '当前行情源不提供分时。');
                const raw = await resolved.intraday(request.symbol);
                return { ok: true, value: { status: 'ready', intraday: projectIntradayResponse(raw, request.symbol, now()) } };
            }
            if (request.kind === 'global') {
                // A replacement adapter may cover A shares only. That is an honest
                // "unavailable" for this tab, not a failure of the shared source.
                if (typeof resolved.globalOverview !== 'function')
                    return failure('finance/global-unavailable', '当前行情源不提供全球指数。');
                return { ok: true, value: { status: 'ready', global: projectGlobalOverview(await resolved.globalOverview(), now()) } };
            }
            if (request.kind === 'hot-scan') {
                // The history layer is an optional capability of a replacement source;
                // its absence disables this panel, not the market board.
                if (typeof resolved.hotScan !== 'function')
                    return failure('finance/hot-scan-unavailable', '当前行情源不提供热点扫描。');
                return { ok: true, value: { status: 'ready', hotScan: projectHotScan(await resolved.hotScan({ board: request.board }), now()) } };
            }
            if (request.kind === 'tail-scan') {
                // Minute data and daily history are optional capabilities. A source
                // that has neither leaves this panel unavailable without breaking the
                // market board.
                if (typeof resolved.tailScan !== 'function')
                    return failure('finance/tail-scan-unavailable', '当前行情源不提供尾盘扫描。');
                return { ok: true, value: { status: 'ready', tailScan: projectTailScan(await resolved.tailScan(), now()) } };
            }
            return { ok: true, value: { status: 'ready', board: await resolved.board(request.board) } };
        }
        catch (error) {
            if (error?.code === 'finance/history-unavailable')
                return failure('finance/history-unavailable', '该股票暂无历史日 K 数据。');
            if (error?.code === 'finance/intraday-unavailable')
                return failure('finance/intraday-unavailable', '该股票暂无分时数据。');
            if (error?.code === 'finance/tail-scan-unavailable')
                return failure('finance/tail-scan-unavailable', '该行情源暂不提供尾盘扫描。');
            if (typeof error?.message === 'string' && error.message.startsWith('tail-scan '))
                return failure('finance/tail-scan-unavailable', '尾盘扫描结果无效，请稍后重试。');
            if (error?.code === 'finance/hot-scan-invalid' || (typeof error?.message === 'string' && error.message.startsWith('hot scan'))) {
                return failure('finance/hot-scan-unavailable', '热点扫描暂不可用，请稍后重试。');
            }
            return failure('finance/market-unavailable', '市场数据暂不可用，请稍后重试。');
        }
    };
}
export function createMarketRoute(options = {}) {
    return createRpcRoute(MARKET_ENDPOINT, createMarketHandler(options));
}
export function createMarketPreferenceHandler({ controller } = {}) {
    return async (endpoint, payload, signal, peer) => {
        if (peer?.principal?.kind !== 'owner')
            return failure('finance/forbidden', '只允许宿主所有者修改市场源。');
        if (endpoint !== MARKET_PREFERENCE_ENDPOINT)
            return failure('finance/not-found', '未知市场源接口。');
        let request;
        try {
            request = parseMarketPreferenceRequest(payload);
        }
        catch {
            return failure('finance/invalid-input', '市场源请求参数无效。');
        }
        if (!controller)
            return failure('finance/market-preference-unavailable', '当前宿主未提供市场源开关。');
        if (signal?.aborted)
            return failure('finance/cancelled', '市场源请求已取消。');
        try {
            const value = request.action === 'get'
                ? await controller.state()
                : await controller.setEnabled(request.enabled);
            return { ok: true, value };
        }
        catch {
            return failure('finance/market-preference-unavailable', '无法保存市场源开关，请检查 profile 目录权限。');
        }
    };
}
export function createMarketPreferenceRoute(options = {}) {
    return createRpcRoute(MARKET_PREFERENCE_ENDPOINT, createMarketPreferenceHandler(options));
}
