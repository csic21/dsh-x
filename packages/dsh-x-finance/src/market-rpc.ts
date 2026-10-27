import {
  CSI300_FUND_TYPES, MARKET_ENDPOINT, MARKET_PREFERENCE_ENDPOINT, TAIL_SCAN_DEFAULT_WINDOW, isAshareMinute,
  historyMarket, parseMarketPreferenceRequest, parseMarketRequest, shanghaiToday,
} from './market.ts'
import type { MarketIntraday } from './market.ts'
import type { Csi300FundShare, MarketHistory, MarketPreference, MarketProvider, MarketQuote } from './market.ts'
import type { MarketController } from './market-preference.ts'
import { projectGlobalOverview } from './global.ts'
import { projectTailScan } from './tail-scan.ts'
import { projectHotScan } from './hot.ts'
import { projectPredictScan } from './predict.ts'
import { createRpcRoute, failure } from './rpc.ts'

// A provider can be replaced or switched at runtime; a function is resolved on
// every request, while a plain provider keeps the existing test/headless seam.
export type MarketProviderSource = MarketProvider | (() => Promise<MarketProvider | undefined>)

/**
 * Re-validates every quote before it reaches the browser and reports a symbol
 * the source did not answer for as `unavailable`. Raw payloads, extra fields
 * and upstream errors never leave the Host.
 */
export function projectQuotes(raw: unknown, symbols: string[], now: number): MarketQuote[] {
  const bySymbol = new Map<string, any>()
  for (const quote of Array.isArray(raw) ? raw : []) {
    if (!quote || typeof quote !== 'object') continue
    if (!symbols.includes(quote.symbol) || bySymbol.has(quote.symbol)) continue
    bySymbol.set(quote.symbol, quote)
  }
  const fetchedAt = new Date(now).toISOString()
  return symbols.map(symbol => {
    const quote = bySymbol.get(symbol)
    const usable = quote
      && quote.status === 'available'
      && Number.isFinite(quote.price) && quote.price > 0
      && Number.isFinite(quote.changePercent) && Math.abs(quote.changePercent) <= 1000
      && typeof quote.quotedAt === 'string' && Number.isFinite(Date.parse(quote.quotedAt))
      && Date.parse(quote.quotedAt) <= now + 300_000
    if (!usable) return { symbol, status: 'unavailable' as const, name: '', price: null, pricePrecision: null, changePercent: null, quotedAt: null, fetchedAt: null, marketStatus: 'unknown' as const }
    // A replacement adapter may omit the width or send nonsense; the browser
    // then falls back to its own two-decimal default instead of trusting it.
    const precision = Number.isInteger(quote.pricePrecision) && quote.pricePrecision >= 0 && quote.pricePrecision <= 6
      ? quote.pricePrecision : null
    return {
      symbol,
      status: 'available' as const,
      name: typeof quote.name === 'string' ? quote.name.slice(0, 64) : '',
      price: quote.price,
      pricePrecision: precision,
      changePercent: quote.changePercent,
      quotedAt: quote.quotedAt,
      fetchedAt,
      marketStatus: quote.marketStatus === 'closed' ? 'closed' as const : 'unknown' as const,
    }
  })
}

const CSI300_FUND_TYPE_SET = new Set<string>(CSI300_FUND_TYPES)
const CSI300_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Re-validates the CSI 300 fund-share payload at the same trust boundary as
 * the other projectors. Totals and ratios are recomputed from the fund list
 * and the float capitalisation, so a replacement adapter cannot ship an
 * inconsistent headline. The trend's float capitalisation stays an estimate;
 * the flag that says so is required rather than optional.
 */
export function projectCsi300FundShare(raw: unknown, now: number): Csi300FundShare {
  const fail = () => Object.assign(new Error('csi300 fund share unavailable'), { code: 'finance/csi300-funds-unavailable' })
  const value = raw as Record<string, any>
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail()
  const source = typeof value.source === 'string' ? value.source.replace(/[\u0000-\u001f\u007f]/g, '').trim() : ''
  if (!source || source.length > 64) throw fail()
  const reportDate = value.reportDate === null ? null : value.reportDate
  if (reportDate !== null && (typeof reportDate !== 'string' || !CSI300_DATE.test(reportDate))) throw fail()
  const indexFloatCap = value.indexFloatCap
  const indexClose = value.indexClose
  if (typeof indexFloatCap !== 'number' || !Number.isFinite(indexFloatCap) || indexFloatCap <= 0 || indexFloatCap > 1e15) throw fail()
  if (typeof indexClose !== 'number' || !Number.isFinite(indexClose) || indexClose <= 0 || indexClose > 1e9) throw fail()
  const quotedAt = value.indexQuotedAt === null ? null
    : typeof value.indexQuotedAt === 'string' && Number.isFinite(Date.parse(value.indexQuotedAt)) ? value.indexQuotedAt : undefined
  if (quotedAt === undefined) throw fail()
  const rows = Array.isArray(value.funds) ? value.funds.slice(0, 500) : null
  if (!rows || !rows.length) throw fail()
  const funds: Csi300FundShare['funds'] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw fail()
    const code = typeof row.code === 'string' && /^\d{6}$/.test(row.code) ? row.code : null
    const name = typeof row.name === 'string' ? row.name.replace(/[\u0000-\u001f\u007f]/g, '').trim() : ''
    const type = row.type
    const aum = row.aum
    if (!code || seen.has(code) || !name || name.length > 120) throw fail()
    if (!CSI300_FUND_TYPE_SET.has(type)) throw fail()
    if (typeof aum !== 'number' || !Number.isFinite(aum) || aum <= 0 || aum > 1e13) throw fail()
    seen.add(code)
    funds.push({ code, name, type, aum })
  }
  funds.sort((left, right) => right.aum - left.aum)
  const totalAum = funds.reduce((sum, fund) => sum + fund.aum, 0)
  if (!(totalAum > 0)) throw fail()
  const points = Array.isArray(value.history) ? value.history.slice(-12) : []
  let previous = ''
  const history: Csi300FundShare['history'] = []
  for (const point of points) {
    if (!point || typeof point !== 'object' || Array.isArray(point)) throw fail()
    const date = point.date
    const fundAum = point.fundAum
    const floatCap = point.floatCap
    if (typeof date !== 'string' || !CSI300_DATE.test(date) || date <= previous) throw fail()
    if (typeof fundAum !== 'number' || !Number.isFinite(fundAum) || fundAum <= 0 || fundAum > 1e14) throw fail()
    if (typeof floatCap !== 'number' || !Number.isFinite(floatCap) || floatCap <= 0 || floatCap > 1e15) throw fail()
    previous = date
    history.push({ date, fundAum, floatCap, ratio: Math.min(1, fundAum / floatCap) })
  }
  if (value.estimatedFloatCap !== true) throw fail()
  const coverage = value.historyCoverage
  if (typeof coverage !== 'number' || !Number.isFinite(coverage) || coverage < 0 || coverage > 1) throw fail()
  return {
    source,
    fetchedAt: new Date(now).toISOString(),
    reportDate,
    indexFloatCap,
    indexClose,
    indexQuotedAt: quotedAt,
    totalAum,
    ratio: Math.min(1, totalAum / indexFloatCap),
    fundCount: funds.length,
    funds,
    history,
    historyCoverage: coverage,
    estimatedFloatCap: true,
  }
}

/**
 * Re-validates a provider's daily history before it reaches the browser. This
 * is the same trust boundary as `projectQuotes`: a replacement adapter cannot
 * inject extra fields, unordered bars or a bar that violates OHLC, and the
 * response is bounded to the requested limit. Nothing is repaired or filled in.
 */
export function projectHistoryResponse(
  raw: unknown, symbol: string, requested: 'none' | 'forward' | 'backward', limit: number, now: number,
): MarketHistory {
  const fail = () => Object.assign(new Error('history unavailable'), { code: 'finance/history-unavailable' })
  const value = raw as Record<string, any>
  if (!value || typeof value !== 'object' || value.symbol !== symbol) throw fail()
  const bars = Array.isArray(value.bars) ? value.bars.slice(-limit) : null
  if (!bars || !bars.length) throw fail()
  let previous = ''
  const projected = bars.map((bar: any) => {
    if (!bar || typeof bar !== 'object' || Array.isArray(bar)) throw fail()
    const { sessionDate, open, high, low, close, volume, amount, isFinal } = bar
    if (typeof sessionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate) || sessionDate <= previous) throw fail()
    previous = sessionDate
    for (const number of [open, high, low, close]) {
      if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0 || number > 1e12) throw fail()
    }
    if (low > Math.min(open, close) || high < Math.max(open, close) || low > high) throw fail()
    for (const quantity of [volume, amount]) {
      if (quantity !== null && (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0 || quantity > Number.MAX_SAFE_INTEGER)) throw fail()
    }
    if (typeof isFinal !== 'boolean') throw fail()
    return { sessionDate, open, high, low, close, volume, amount, isFinal }
  })
  const text = (input: unknown, max: number) => typeof input === 'string' && input.trim() && input.length <= max
    ? input.replace(/[\u0000-\u001f\u007f]/g, '').trim() : null
  const name = text(value.name, 64), source = text(value.source, 64)
  const precision = value.pricePrecision
  if (!name || !source || !Number.isInteger(precision) || precision < 0 || precision > 8) throw fail()
  if (!['shares', 'lots', 'unknown', 'reported'].includes(value.volumeBasis)) throw fail()
  // The adapter reports what the source actually returned; the requested
  // adjustment is only a fallback. Claiming qfq for unadjusted rows would be a
  // provenance lie on the chart.
  const adjustment = ['none', 'forward', 'backward'].includes(value.adjustment) ? value.adjustment : requested
  // Currency and session zone come from the symbol, not from the adapter: a
  // Hang Seng index is HKD on the Hong Kong session even if a replacement
  // adapter copied the A-share pair into its payload.
  const { currency, timeZone } = historyMarket(symbol)
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
    amountUnit: currency,
    currency,
    exchangeTimezone: timeZone,
    firstSessionDate: projected[0]!.sessionDate,
    lastSessionDate: projected.at(-1)!.sessionDate,
    bars: projected,
  }
}

/** Re-validates a minute line before it reaches the browser. No point is filled in. */
export function projectIntradayResponse(raw: unknown, symbol: string, now: number): MarketIntraday {
  const fail = () => Object.assign(new Error('intraday unavailable'), { code: 'finance/intraday-unavailable' })
  const value = raw as Record<string, any>
  if (!value || typeof value !== 'object' || value.symbol !== symbol) throw fail()
  const sessionDate = value.sessionDate
  if (typeof sessionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate) || sessionDate > shanghaiToday(now)) throw fail()
  const points = Array.isArray(value.points) ? value.points : null
  if (!points || !points.length || points.length > 300) throw fail()
  let previous = ''
  const projected = points.map((point: any) => {
    if (!point || typeof point !== 'object' || Array.isArray(point)) throw fail()
    const { time, price, volume, average } = point
    if (typeof time !== 'string' || !isAshareMinute(time) || time <= previous) throw fail()
    previous = time
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 1e12) throw fail()
    if (volume !== null && (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > Number.MAX_SAFE_INTEGER)) throw fail()
    if (average !== null && (typeof average !== 'number' || !Number.isFinite(average) || average <= 0 || average > 1e12)) throw fail()
    return { time, price, volume, average }
  })
  const text = (input: unknown, max: number) => typeof input === 'string' && input.trim() && input.length <= max
    ? input.replace(/[\u0000-\u001f\u007f]/g, '').trim() : null
  const name = text(value.name, 64), source = text(value.source, 64)
  const precision = value.pricePrecision
  const previousClose = value.previousClose
  if (!name || !source || !Number.isInteger(precision) || precision < 0 || precision > 8) throw fail()
  if (value.volumeBasis !== 'lots' || typeof value.closed !== 'boolean') throw fail()
  if (previousClose !== null && (typeof previousClose !== 'number' || !Number.isFinite(previousClose) || previousClose <= 0 || previousClose > 1e12)) throw fail()
  return {
    symbol, name, source, fetchedAt: new Date(now).toISOString(), sessionDate, previousClose,
    pricePrecision: precision, volumeBasis: 'lots', currency: 'CNY', exchangeTimezone: 'Asia/Shanghai',
    closed: value.closed, points: projected,
  }
}

// Exact-route handler behind the official shared Connection admission bridge.
// The bridge rejects non-owner peers before this code runs; the explicit check
// keeps the handler safe when it is called directly in tests or another Host.
export function createMarketHandler({ provider, now = Date.now }: { provider?: MarketProviderSource; now?: () => number } = {}) {
  return async (endpoint: any, payload: any, signal: any, peer: any) => {
    if (peer?.principal?.kind !== 'owner') return failure('finance/forbidden', '只允许宿主所有者读取市场数据。')
    if (endpoint !== MARKET_ENDPOINT) return failure('finance/not-found', '未知市场接口。')
    let request
    try { request = parseMarketRequest(payload) }
    catch { return failure('finance/invalid-input', '市场数据请求参数无效。') }
    if (signal?.aborted) return failure('finance/cancelled', '市场数据请求已取消。')
    try {
      const resolved = typeof provider === 'function' ? await provider() : provider
      if (!resolved) return { ok: true, value: { status: 'unconfigured', source: null } }
      if (request.kind === 'overview') return { ok: true, value: { status: 'ready', overview: await resolved.overview() } }
      if (request.kind === 'breadth') return { ok: true, value: { status: 'ready', breadth: await resolved.breadth() } }
      if (request.kind === 'quotes') {
        const source = String(resolved.name).slice(0, 64)
        return { ok: true, value: { status: 'ready', source, quotes: projectQuotes(await resolved.quotes(request.symbols), request.symbols, now()) } }
      }
      if (request.kind === 'history') {
        // A replacement adapter may have no daily bars. That is an honest
        // "unavailable" for the chart, not a failure of the quote source.
        if (typeof resolved.history !== 'function') return failure('finance/history-unavailable', '当前行情源不提供历史日 K。')
        const raw = await resolved.history(request.symbol, { adjustment: request.adjustment, limit: request.limit })
        return { ok: true, value: { status: 'ready', history: projectHistoryResponse(raw, request.symbol, request.adjustment, request.limit, now()) } }
      }
      if (request.kind === 'intraday') {
        if (typeof resolved.intraday !== 'function') return failure('finance/intraday-unavailable', '当前行情源不提供分时。')
        const raw = await resolved.intraday(request.symbol)
        return { ok: true, value: { status: 'ready', intraday: projectIntradayResponse(raw, request.symbol, now()) } }
      }
      if (request.kind === 'csi300-funds') {
        if (typeof resolved.csi300Funds !== 'function') return failure('finance/csi300-funds-unavailable', '当前行情源不提供沪深300基金占比。')
        return { ok: true, value: { status: 'ready', csi300Funds: projectCsi300FundShare(await resolved.csi300Funds(), now()) } }
      }
      if (request.kind === 'global') {
        // A replacement adapter may cover A shares only. That is an honest
        // "unavailable" for this tab, not a failure of the shared source.
        if (typeof resolved.globalOverview !== 'function') return failure('finance/global-unavailable', '当前行情源不提供全球指数。')
        return { ok: true, value: { status: 'ready', global: projectGlobalOverview(await resolved.globalOverview(), now()) } }
      }
      if (request.kind === 'hot-scan') {
        // The history layer is an optional capability of a replacement source;
        // its absence disables this panel, not the market board.
        if (typeof resolved.hotScan !== 'function') return failure('finance/hot-scan-unavailable', '当前行情源不提供热点扫描。')
        return { ok: true, value: { status: 'ready', hotScan: projectHotScan(await resolved.hotScan({ board: request.board }), now()) } }
      }
      if (request.kind === 'predict-scan') {
        // Daily bars and a full-market snapshot are both optional capabilities;
        // without them this panel is unavailable, not the whole board.
        if (typeof resolved.predictScan !== 'function') return failure('finance/predict-scan-unavailable', '当前行情源不提供涨停接力预测。')
        // Every failure inside this panel is attributed to the panel: a broken
        // snapshot or a rejected projection must not read as a dead market board.
        try {
          const scan = await resolved.predictScan({ board: request.board })
          return { ok: true, value: { status: 'ready', predictScan: projectPredictScan(scan, now()) } }
        } catch (error: any) {
          if (error?.code === 'finance/predict-scan-invalid') throw error
          throw Object.assign(new Error('predict scan failed'), { code: 'finance/predict-scan-invalid' })
        }
      }
      if (request.kind === 'tail-scan') {
        // Minute data and daily history are optional capabilities. A source
        // that has neither leaves this panel unavailable without breaking the
        // market board.
        if (typeof resolved.tailScan !== 'function') return failure('finance/tail-scan-unavailable', '当前行情源不提供尾盘扫描。')
        // A request without a window keeps the afternoon tail, so an older
        // client that has never sent one is unchanged.
        const window = request.window ?? TAIL_SCAN_DEFAULT_WINDOW
        return { ok: true, value: { status: 'ready', tailScan: projectTailScan(await resolved.tailScan({ window }), now()) } }
      }
      return { ok: true, value: { status: 'ready', board: await resolved.board(request.board) } }
    } catch (error: any) {
      if (error?.code === 'finance/history-unavailable') return failure('finance/history-unavailable', '该股票暂无历史日 K 数据。')
      if (error?.code === 'finance/intraday-unavailable') return failure('finance/intraday-unavailable', '该股票暂无分时数据。')
      if (error?.code === 'finance/tail-scan-unavailable') return failure('finance/tail-scan-unavailable', '该行情源暂不提供尾盘扫描。')
      if (error?.code === 'finance/csi300-funds-unavailable') return failure('finance/csi300-funds-unavailable', '沪深300基金占比暂不可用。')
      if (typeof error?.message === 'string' && error.message.startsWith('tail-scan ')) return failure('finance/tail-scan-unavailable', '尾盘扫描结果无效，请稍后重试。')
      if (error?.code === 'finance/hot-scan-invalid' || (typeof error?.message === 'string' && error.message.startsWith('hot scan'))) {
        return failure('finance/hot-scan-unavailable', '热点扫描暂不可用，请稍后重试。')
      }
      if (error?.code === 'finance/predict-scan-invalid' || (typeof error?.message === 'string' && error.message.startsWith('predict scan'))) {
        return failure('finance/predict-scan-unavailable', '涨停接力预测暂不可用，请稍后重试。')
      }
      return failure('finance/market-unavailable', '市场数据暂不可用，请稍后重试。')
    }
  }
}

export function createMarketRoute(options: { provider?: MarketProviderSource; now?: () => number } = {}) {
  return createRpcRoute(MARKET_ENDPOINT, createMarketHandler(options))
}

export function createMarketPreferenceHandler({ controller }: { controller?: MarketController } = {}) {
  return async (endpoint: any, payload: any, signal: any, peer: any) => {
    if (peer?.principal?.kind !== 'owner') return failure('finance/forbidden', '只允许宿主所有者修改市场源。')
    if (endpoint !== MARKET_PREFERENCE_ENDPOINT) return failure('finance/not-found', '未知市场源接口。')
    let request
    try { request = parseMarketPreferenceRequest(payload) }
    catch { return failure('finance/invalid-input', '市场源请求参数无效。') }
    if (!controller) return failure('finance/market-preference-unavailable', '当前宿主未提供市场源开关。')
    if (signal?.aborted) return failure('finance/cancelled', '市场源请求已取消。')
    try {
      const value: MarketPreference = request.action === 'get'
        ? await controller.state()
        : await controller.setEnabled(request.enabled)
      return { ok: true, value }
    } catch {
      return failure('finance/market-preference-unavailable', '无法保存市场源开关，请检查 profile 目录权限。')
    }
  }
}

export function createMarketPreferenceRoute(options: { controller?: MarketController } = {}) {
  return createRpcRoute(MARKET_PREFERENCE_ENDPOINT, createMarketPreferenceHandler(options))
}
