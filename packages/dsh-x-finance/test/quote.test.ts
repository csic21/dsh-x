import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchQuote, normalizeSymbol, parseQuote, MAX_RESPONSE_BYTES } from '../src/quote.ts'
import { financeQuoteTool } from '../src/tool.ts'

const timestamp = 1_792_166_400_000
const fixture: any = { c: 123.45, o: 120, h: 125, l: 119, pc: 121, d: 2.45, dp: 2.0248, t: timestamp / 1000 }
const json = (data = fixture, options: any = {}) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' }, ...options })
const options = (fetchImpl: any) => ({ apiKey: 'test-key', fetchImpl, now: () => timestamp })

test('normalizes symbols, rejects URLs, control characters and multiple symbols', () => {
  for (const [input, expected] of [[' aapl ', 'AAPL'], ['brk.b', 'BRK.B'], ['000001.SZ', '000001.SZ']] as const) assert.equal(normalizeSymbol(input), expected)
  for (const invalid of ['', 'https://example.com', 'AAPL,MSFT', 'AAPL\nMSFT', 'x'.repeat(33), null, 1, '苹果', 'AAPL?token=x'] as const) assert.throws(() => normalizeSymbol(invalid))
})

test('sends fixed HTTPS GET with header credential, forbids redirects and returns provenance', async () => {
  const quote = await fetchQuote('aapl', options(async (url: any, init: any) => {
    assert.equal(url.href, 'https://finnhub.io/api/v1/quote?symbol=AAPL')
    assert.equal(init.method, 'GET')
    assert.equal(init.redirect, 'error')
    assert.equal(init.headers['X-Finnhub-Token'], 'test-key')
    assert.equal(init.signal.aborted, false)
    return json()
  }))
  assert.equal(quote.price, 123.45)
  assert.equal(quote.provider, 'Finnhub')
  assert.equal(quote.quotedAt, new Date(timestamp).toISOString())
  assert.equal(quote.fetchedAt, quote.quotedAt)
  assert.match(quote.notice, /可能延迟/)
  assert.equal('currency' in quote, false)
})

test('missing key does not issue a request', async () => {
  await assert.rejects(fetchQuote('AAPL', { apiKey: '', fetchImpl: () => assert.fail('must not fetch') }), /FINNHUB_API_KEY/)
})

test('optional values remain unknown rather than invented', () => {
  const result = parseQuote({ c: 3 }, 'AAPL', timestamp)
  assert.equal(result.quotedAt, null)
  assert.equal(result.change, null)
  assert.equal(result.previousClose, null)
})

test('rejects invalid or empty provider data', () => {
  for (const data of [null, [], {}, { c: 0 }, { c: -1 }, { c: '123' }, { c: Infinity }, { ...fixture, error: 'secret-key' }, { ...fixture, h: 100 }, { ...fixture, o: -1 }, { ...fixture, dp: '2' }, { ...fixture, t: 0 }, { ...fixture, t: 1e20 }, { ...fixture, t: timestamp / 1000 + 301 }] as const) {
    assert.throws(() => parseQuote(data, 'AAPL', timestamp))
  }
})

for (const [status, message] of [[429, /限流/], [401, /认证/], [403, /认证/], [500, /HTTP 500/]] as const) {
  test(`handles HTTP ${status} without exposing server body`, async () => {
    await assert.rejects(fetchQuote('AAPL', options(async () => new Response('secret-key', { status }))), message)
  })
}

test('rejects non-JSON and malformed JSON', async () => {
  await assert.rejects(fetchQuote('AAPL', options(async () => new Response('<html>'))), /没有返回 JSON/)
  await assert.rejects(fetchQuote('AAPL', options(async () => new Response('{', { headers: { 'content-type': 'application/json' } }))), /无效 JSON/)
})

test('limits body with and without content-length', async () => {
  await assert.rejects(fetchQuote('AAPL', options(async () => json(fixture, { headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) } }))), /大小限制/)
  await assert.rejects(fetchQuote('AAPL', options(async () => json({ text: 'x'.repeat(MAX_RESPONSE_BYTES) }))), /大小限制/)
})

test('sanitizes transport errors, including credential-containing messages', async () => {
  await assert.rejects(fetchQuote('AAPL', options(async () => { throw new Error('test-key https://bad') })), error => {
    assert.doesNotMatch((error as any).message, /test-key|https:/)
    return true
  })
})

test('pre-cancelled requests never fetch', async () => {
  const signal = AbortSignal.abort()
  await assert.rejects(fetchQuote('AAPL', { ...options(() => assert.fail()), signal }), /取消/)
})

test('cancellation aborts active requests, even if fetch ignores abort', async () => {
  const controller = new AbortController()
  let requestSignal: any
  const promise = fetchQuote('AAPL', { ...options((_url: any, init: any) => { requestSignal = init.signal; return new Promise<any>(() => {}) }), signal: controller.signal })
  controller.abort()
  await assert.rejects(promise, /取消/)
  assert.equal(((requestSignal)! as any).aborted, true)
})

test('deadline bounds a fetch that ignores abort', async () => {
  await assert.rejects(fetchQuote('AAPL', { ...options(() => new Promise<any>(() => {})), timeoutMs: 10 }), /超时/)
})

test('deadline also bounds a stalled response body', async () => {
  const stream = new ReadableStream({ start() {} })
  await assert.rejects(fetchQuote('AAPL', { ...options(async () => new Response(stream, { headers: { 'content-type': 'application/json' } })), timeoutMs: 10 }), /超时/)
})

test('tool declares schema and forwards execution cancellation', async () => {
  const signal = new AbortController().signal
  const tool = financeQuoteTool(async (symbol, opts) => {
    assert.equal(symbol, 'AAPL')
    assert.equal(opts.signal, signal)
    return parseQuote(fixture, symbol, timestamp)
  })
  assert.equal(tool.name, 'dsh_x_finance_quote')
  assert.equal(tool.parameters.symbol.required, true)
  assert.equal(tool.isConcurrencySafe(), true)
  const result = await tool.execute({ symbol: 'AAPL' }, { signal })
  assert.deepEqual(Object.keys(tool.output.schema.properties).sort(), Object.keys(result).sort())
  assert.equal(JSON.parse(tool.output.render({}, result)[0].text).price, 123.45)
})
