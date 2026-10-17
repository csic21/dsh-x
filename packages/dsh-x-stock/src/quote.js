export const TIMEOUT_MS = 10_000
export const MAX_RESPONSE_BYTES = 16_384
const ENDPOINT = 'https://finnhub.io/api/v1/quote'

export function normalizeSymbol(input) {
  if (typeof input !== 'string' || input.length > 32) throw new Error('股票代码必须是 1–32 个字符。')
  const symbol = input.trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9.-]{0,31}$/.test(symbol)) {
    throw new Error('股票代码只允许英文字母、数字、点和连字符，例如 AAPL 或 BRK.B。')
  }
  return symbol
}

class QuoteError extends Error {}
function fail(message) { throw new QuoteError(message) }

export function parseQuote(data, symbol, fetchedAt) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('行情响应格式无效。')
  if (Object.hasOwn(data, 'error')) fail('Finnhub 拒绝了行情请求，请检查 API 密钥、订阅权限和代码。')
  if (!Number.isFinite(data.c) || data.c <= 0) fail('没有有效报价，请检查代码、市场覆盖范围和订阅权限。')
  const value = {
    symbol, provider: 'Finnhub', price: data.c,
    fetchedAt: new Date(fetchedAt).toISOString(),
    quotedAt: null,
    notice: '报价可能延迟或来自最近交易时段；抓取时间不是报价时间。接口未提供币种，不能据此推断币种。不构成投资建议。',
  }
  for (const [source, target] of Object.entries({ o: 'open', h: 'high', l: 'low', pc: 'previousClose', d: 'change', dp: 'changePercent' })) {
    if (data[source] == null) { value[target] = null; continue }
    if (!Number.isFinite(data[source]) || (!['d', 'dp'].includes(source) && data[source] < 0)) fail('行情响应包含无效数值。')
    value[target] = data[source]
  }
  if (data.t != null) {
    if (!Number.isSafeInteger(data.t) || data.t <= 0 || data.t * 1000 > fetchedAt + 300_000) fail('行情响应包含无效报价时间。')
    value.quotedAt = new Date(data.t * 1000).toISOString()
  }
  if (value.high != null && value.low != null && value.high < value.low) fail('行情最高价低于最低价。')
  return value
}

async function readJson(response, signal) {
  const length = Number(response.headers.get('content-length'))
  if (length > MAX_RESPONSE_BYTES) fail('行情响应超过大小限制。')
  const type = response.headers.get('content-type') ?? ''
  if (!/^application\/(?:[\w.-]+\+)?json\b/i.test(type)) fail('行情服务没有返回 JSON。')
  if (!response.body) fail('行情响应为空。')
  const reader = response.body.getReader()
  const abortRead = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abortRead, { once: true })
  const chunks = []
  let size = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) fail('行情响应超过大小限制。')
      chunks.push(value)
    }
  } finally {
    signal.removeEventListener('abort', abortRead)
    // Do not allow an uncooperative stream cancellation to delay the deadline.
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { fail('行情服务返回了无效 JSON。') }
}

export async function fetchQuote(input, {
  apiKey = process.env.FINNHUB_API_KEY,
  fetchImpl = globalThis.fetch,
  signal,
  timeoutMs = TIMEOUT_MS,
  now = Date.now,
} = {}) {
  const symbol = normalizeSymbol(input)
  if (signal?.aborted) throw new Error('行情查询已取消。')
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('请在运行环境设置 FINNHUB_API_KEY；不要把密钥发给模型或写进仓库。')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('行情超时必须为 1–30000 毫秒。')
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  let onAbort
  const interrupted = new Promise((_, reject) => {
    onAbort = () => reject(new QuoteError(timedOut ? '行情查询超时。' : '行情查询已取消。'))
    controller.signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([interrupted, (async () => {
      const url = new URL(ENDPOINT)
      url.searchParams.set('symbol', symbol)
      const response = await fetchImpl(url, {
        method: 'GET', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json', 'X-Finnhub-Token': apiKey.trim() },
      })
      if (!response.ok) {
        void response.body?.cancel().catch(() => {})
        if (response.status === 429) fail('Finnhub 请求限流，请稍后重试。')
        if ([401, 403].includes(response.status)) fail('Finnhub 认证失败或订阅无权访问该行情。')
        fail(`行情请求失败（HTTP ${response.status}）。`)
      }
      const data = await readJson(response, controller.signal)
      controller.signal.throwIfAborted()
      return parseQuote(data, symbol, now())
    })()])
  } catch (error) {
    if (error instanceof QuoteError) throw error
    // Never expose upstream error bodies, headers, keys or raw fetch errors.
    if (controller.signal.aborted) throw new Error(timedOut ? '行情查询超时。' : '行情查询已取消。')
    throw new Error('行情查询失败，请检查网络或稍后重试。')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
    controller.signal.removeEventListener('abort', onAbort)
    controller.abort()
  }
}
