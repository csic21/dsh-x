// Shared browser/host contract. Quotes and credentials are never persisted.
export const MAX_PINS = 8
export const STORAGE_KEY = 'dsh-x-stock:watchlist:v1'
export const QUOTE_CHANNEL = '/api'
export const QUOTE_ENDPOINT = 'dsh-x-stock.quotes'
export function normalizeAShare(exchange, code) {
  const market = String(exchange).trim().toUpperCase()
  const digits = String(code).trim()
  if (!['SH', 'SZ', 'BJ'].includes(market) || !/^\d{6}$/.test(digits)) throw new Error('请选择交易所并输入六位股票代码。')
  return `${market}.${digits}`
}
export function validateSymbol(symbol) {
  if (typeof symbol !== 'string' || !/^(SH|SZ|BJ)\.\d{6}$/.test(symbol)) throw new Error('A 股代码须包含交易所和六位数字。')
  return symbol
}
export function normalizePin(pin) {
  if (!pin || typeof pin !== 'object') throw new Error('无效自选项。')
  const symbol = validateSymbol(pin.symbol)
  const alias = typeof pin.alias === 'string' ? pin.alias.trim().slice(0, 24) : ''
  return { symbol, alias }
}
export function parseSaved(raw) {
  if (!raw) return { pins: [], collapsed: false }
  const value = JSON.parse(raw)
  if (value?.version !== 1 || !Array.isArray(value.pins) || value.pins.length > MAX_PINS) throw new Error('保存的自选清单格式不兼容。')
  const pins = value.pins.map(normalizePin)
  if (new Set(pins.map(p => p.symbol)).size !== pins.length) throw new Error('保存的自选清单含重复代码。')
  return { pins, collapsed: value.collapsed === true }
}
export function quoteLabel(quote, now = Date.now()) {
  if (!quote || quote.status === 'unconfigured') return '未配置行情'
  if (quote.status === 'unavailable') return '暂无报价'
  if (!quote.quotedAt) return '报价时间未知'
  if (now - Date.parse(quote.quotedAt) > 180_000) return '旧报价 · 可能延迟/休市'
  return quote.marketStatus === 'closed' ? '休市 · 最近报价' : '最近报价 · 可能延迟'
}
export const SCOPE_ENDPOINT = 'dsh-x-stock.scope'
export function validateScope(scope) {
  if (typeof scope !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scope)) throw new Error('宿主自选存储标识无效。')
  return scope.toLowerCase()
}
export const scopedStorageKey = scope => `${STORAGE_KEY}:${validateScope(scope)}`
