import test from 'node:test'
import assert from 'node:assert/strict'
import { createFreeQuoteProvider, parseTencentLine, FREE_MAX_BYTES, FREE_SOURCE_NAME } from '../src/free-quote.ts'

const now = Date.parse('2026-10-18T09:40:00+08:00')
const NAME = '贵州茅台'

function line(overrides: Record<number, string> = {}) {
  const fields = Array.from({ length: 50 }, () => '')
  Object.assign(fields, {
    0: '1', 1: NAME, 2: '600519', 3: '1329.00', 4: '1312.97', 5: '1311.57',
    6: '38502', 29: '', 30: '20261016161447', 31: '16.03', 32: '1.22', 33: '1329.88', 34: '1301.68',
    ...overrides,
  })
  return `v_sh600519="${fields.join('~')}";`
}

function gbk(payload: string) {
  // Node has no GBK encoder; the security name is spliced in as its known GBK bytes.
  const start = payload.indexOf(NAME)
  return Buffer.concat([
    Buffer.from(payload.slice(0, start), 'ascii'),
    Buffer.from('b9f3d6ddc3a9cca8', 'hex'),
    Buffer.from(payload.slice(start + NAME.length), 'ascii'),
  ])
}

function stamp(ms: number) {
  return new Date(ms + 8 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14)
}

test('parses a Tencent quote line into the projected A-share contract', () => {
  const quote = parseTencentLine(line(), 'SH.600519', now)
  assert.deepEqual(quote, {
    symbol: 'SH.600519',
    name: NAME,
    price: 1329,
    changePercent: 1.22,
    quotedAt: '2026-10-16T16:14:47+08:00',
    marketStatus: 'unknown',
  })
})

test('keeps the exchange prefix and code from the canonical symbol', () => {
  const payload = line().replace('v_sh600519', 'v_sz000001').replace('~600519~', '~000001~')
  assert.equal(parseTencentLine(payload, 'SZ.000001', now).symbol, 'SZ.000001')
  assert.throws(() => parseTencentLine(payload, 'SH.600519', now))
  assert.throws(() => parseTencentLine(line(), 'sz600519', now))
})

test('rejects malformed, truncated, mismatched or unbounded payloads', () => {
  const cases: any[] = [
    null, 42, '', 'v_sh600519="";', 'v_pv_none_match="1";',
    line({ 3: '0' }), line({ 3: '-1' }), line({ 3: 'abc' }), line({ 3: '1e12' }),
    line({ 32: '' }), line({ 32: 'x' }), line({ 32: '2000' }),
    line({ 1: '' }), line({ 1: '   ' }), line({ 1: 'x'.repeat(65) }),
    line({ 30: '' }), line({ 30: '20261332161447' }), line({ 30: '20260230161447' }),
    line({ 30: stamp(now + 3_600_000) }),
    `v_sh600519="1~${NAME}`,
    `${line()}\n${line()}`,
  ]
  for (const payload of cases) assert.throws(() => parseTencentLine(payload, 'SH.600519', now))
})

test('decodes GBK bytes, fixes the endpoint and forbids redirects', async () => {
  const provider = createFreeQuoteProvider({
    now: () => now,
    fetchImpl: async (url: any, init: any) => {
      assert.equal(String(url), 'https://qt.gtimg.cn/q=sh600519')
      assert.equal(init.method, 'GET')
      assert.equal(init.redirect, 'error')
      assert.equal(init.signal.aborted, false)
      return new Response(gbk(line()), { headers: { 'content-type': 'text/html; charset=GBK' } })
    },
  })
  assert.equal(provider.name, FREE_SOURCE_NAME)
  const quote = await provider.quote('SH.600519')
  assert.equal(quote.name, NAME)
  assert.equal(quote.price, 1329)
})

test('maps exchanges to the endpoint spelling without accepting other symbols', async () => {
  for (const [symbol, suffix] of [['SZ.000001', 'sz000001'], ['BJ.430047', 'bj430047']] as const) {
    const code = symbol.slice(3)
    const provider = createFreeQuoteProvider({
      now: () => now,
      fetchImpl: async (url: any) => {
        assert.equal(String(url), `https://qt.gtimg.cn/q=${suffix}`)
        const payload = line().replace('v_sh600519', `v_${suffix}`).replace('~600519~', `~${code}~`)
        return new Response(gbk(payload), { headers: { 'content-type': 'text/html' } })
      },
    })
    assert.equal((await provider.quote(symbol)).symbol, symbol)
  }
  await assert.rejects(createFreeQuoteProvider({ fetchImpl: () => assert.fail('must not fetch') }).quote('600519.SH'))
})

test('surfaces upstream failures as generic rejections without leaking bodies', async () => {
  const options = (fetchImpl: any) => ({ now: () => now, fetchImpl })
  await assert.rejects(createFreeQuoteProvider(options(async () => new Response('secret', { status: 500 }))).quote('SH.600519'))
  await assert.rejects(createFreeQuoteProvider(options(async () => new Response('x', { headers: { 'content-type': 'application/json' } }))).quote('SH.600519'))
  await assert.rejects(createFreeQuoteProvider(options(async () => new Response('x'.repeat(FREE_MAX_BYTES + 1), { headers: { 'content-type': 'text/plain' } }))).quote('SH.600519'))
  await assert.rejects(createFreeQuoteProvider(options(async () => new Response(null, { headers: { 'content-type': 'text/plain' } }))).quote('SH.600519'))
})

test('honours cancellation and its own deadline', async () => {
  const abort = new AbortController()
  abort.abort()
  await assert.rejects(createFreeQuoteProvider({ fetchImpl: () => assert.fail('must not fetch') }).quote('SH.600519', { signal: abort.signal }))

  const hanging = (_url: any, init: any) => new Promise<Response>((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')))
  })
  await assert.rejects(createFreeQuoteProvider({ fetchImpl: hanging, timeoutMs: 10 }).quote('SH.600519'))
  await assert.rejects(createFreeQuoteProvider({ fetchImpl: hanging }).quote('SH.600519', { signal: abort.signal }))

  const controller = new AbortController()
  const pending = createFreeQuoteProvider({ fetchImpl: hanging, timeoutMs: 10_000 }).quote('SH.600519', { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending)
})
