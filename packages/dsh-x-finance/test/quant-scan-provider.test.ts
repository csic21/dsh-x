import test from 'node:test'
import assert from 'node:assert/strict'
import { createTencentMarketProvider, parseQuantRankPage, MARKET_STOCK_RANK_ENDPOINT, MARKET_HISTORY_ENDPOINT } from '../src/market-provider.ts'
import { projectQuantScan } from '../src/quant-scan.ts'
import { history, QUANT_NOW } from './quant-scan-fixture.ts'

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
test('rank identity parsing is independent of quote, turnover, name and suspension availability', () => {
  const page = parseQuantRankPage({ code: 0, data: { total: 7, rank_list: [
    { code: 'sh600001', name: '样本1', state: '' }, { code: 'sz000001', name: '*ST样本', state: 'S', zxj: '' },
    { code: 'bj920001', name: null }, { code: 'sz300001', name: '样本4', state: 'unknown' },
    { code: 'sh000300' }, { code: 'sh510300' }, { code: 'https://evil' },
  ] } })
  assert.equal(page.expected, 7); assert.equal(page.rawCount, 7); assert.equal(page.invalid, 3)
  assert.deepEqual(page.stocks.map(s => [s.symbol, s.suspended]), [
    ['SH.600001', false], ['SZ.000001', true], ['BJ.920001', null], ['SZ.300001', null],
  ])
  assert.equal(page.stocks[2]!.name, null)
  for (const payload of [ {}, { code: 1, data: { total: 1, rank_list: [] } },
    { code: 0, data: { total: null, rank_list: [] } }, { code: 0, data: { total: '', rank_list: [] } },
    { code: 0, data: { total: -1, rank_list: [] } }, { code: 0, data: { total: 1, rank_list: new Array(201) } },
  ]) assert.throws(() => parseQuantRankPage(payload))
})

test('same Tencent source requests daily history for every identity, actual fallback adjustment, cached results and no automatic requests', async () => {
  const urls: string[] = [], starts: number[] = []
  let active = 0, maxActive = 0
  const fetchImpl = (async (input: any, init: any) => {
    const url = String(input); urls.push(url); starts.push(Date.now()); active++; maxActive = Math.max(maxActive, active)
    assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal)
    try {
      if (url.startsWith(MARKET_STOCK_RANK_ENDPOINT)) return json({ code: 0, data: { total: 3, rank_list: [
        { code: 'sh600003', name: '样本3', state: '' }, { code: 'sh600001', name: '*ST样本1', state: '' },
        { code: 'sh600002', name: '样本2', state: 'S' },
      ] } })
      assert.ok(url.startsWith(MARKET_HISTORY_ENDPOINT))
      const parameter = new URL(url).searchParams.get('param')!
      assert.equal(parameter.slice(8), ',day,,,250,qfq')
      const code = parameter.split(',')[0]!, fixture = history(`SH.${code.slice(2)}`)
      const rows = fixture.bars.map(b => [b.sessionDate, b.open, b.close, b.high, b.low, b.volume, {}, '1', b.amount! / 10000])
      return json({ code: 0, data: { [code]: { day: rows } } })
    } finally { active-- }
  }) as typeof fetch
  const provider = createTencentMarketProvider({ fetchImpl, now: () => QUANT_NOW, concurrency: 12 })
  assert.equal(urls.length, 0)
  assert.equal(await provider.quantScan!({ action: 'status' }), null)
  assert.equal(urls.length, 0)
  const result = (await provider.quantScan!({ action: 'start' }))!
  assert.equal(result.counts.attempted, 3); assert.equal(result.counts.covered, 3)
  assert.equal(result.counts.excludedST, 1); assert.equal(result.counts.excludedSuspended, 1)
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0]!.adjustment, 'none')
  assert.equal(result.rows[0]!.symbol, 'SH.600003')
  assert.equal(urls.length, 4); assert.ok(maxActive <= 2)
  assert.ok(starts.slice(1).every((stamp, i) => stamp - starts[i]! >= 490))
  assert.deepEqual(projectQuantScan(result, QUANT_NOW), result)
  await provider.quantScan!({ action: 'start' }); await provider.quantScan!({ action: 'status' })
  assert.equal(urls.length, 4)
  assert.throws(() => provider.quantScan!({ action: 'start', url: 'https://evil' } as any))
})

test('verification/challenge/HTTP failures terminate the scan without retries or alternate endpoints', async () => {
  for (const response of [
    () => new Response('<html>captcha</html>', { headers: { 'content-type': 'text/html' } }),
    () => json({ code: 1, message: 'verify' }), () => json({}, 429),
  ]) {
    let calls = 0
    const provider = createTencentMarketProvider({ fetchImpl: (async () => { calls++; return response() }) as typeof fetch, now: () => QUANT_NOW })
    const result = (await provider.quantScan!({ action: 'start' }))!
    assert.equal(result.status, 'incomplete'); assert.equal(result.stopReason, 'upstream-failures')
    assert.equal(result.counts.expected, null); assert.equal(result.counts.failedPages, 1)
    assert.equal(result.canContinue, false); assert.equal(calls, 1)
    await provider.quantScan!({ action: 'start' }); assert.equal(calls, 1)
  }
})
