import test from 'node:test'
import assert from 'node:assert/strict'
import { createQuantScanner, quantSample, quantPercentiles, rankQuantSamples, projectQuantScan, QUANT_SCAN_LIMITS as L } from '../src/quant-scan.ts'
import { harness, history, stock, QUANT_NOW } from './quant-scan-fixture.ts'

test('120 valid bars, exact MA / 20 & 60 returns / population volatility; never fill turnover', () => {
  const h = history(), sample = quantSample(h, stock(), QUANT_NOW)!
  const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  assert.equal(sample.factors.ma20, average(h.bars.slice(-20).map(b => b.close)))
  assert.equal(sample.factors.ma60, average(h.bars.slice(-60).map(b => b.close)))
  assert.ok(Math.abs(sample.factors.return20 - (1.001 ** 20 - 1)) < 1e-12)
  assert.ok(Math.abs(sample.factors.return60 - (1.001 ** 60 - 1)) < 1e-12)
  assert.ok(sample.factors.volatility20 < 1e-12)
  assert.equal(sample.provisional, false)
  assert.equal(quantSample(history(stock().symbol, { count: 119 }), stock(), QUANT_NOW), null)
  h.bars[1]!.high = 0
  assert.equal(quantSample(h, stock(), QUANT_NOW), null, 'invalid OHLC is not a valid observation')
  const missing = quantSample(history(stock().symbol, { amount: null }), stock(), QUANT_NOW)!
  assert.equal(missing.factors.amountMedian20, null)
  assert.equal(missing.factors.amountSamples20, 0)
  assert.deepEqual(rankQuantSamples([missing]), [])
  const sparse = history(stock().symbol, { amount: null })
  sparse.bars.at(-1)!.amount = 10
  sparse.bars.at(-2)!.amount = 20
  const sparseSample = quantSample(sparse, stock(), QUANT_NOW)!
  assert.equal(sparseSample.factors.amountMedian20, 15)
  assert.equal(sparseSample.factors.amountSamples20, 2)
  assert.deepEqual(rankQuantSamples([sparseSample]), [], 'a 2/20 turnover sample cannot be ranked')
  for (let i = 3; i <= L.minAmountSamples; i++) sparse.bars.at(-i)!.amount = i * 10
  const adequateSample = quantSample(sparse, stock(), QUANT_NOW)!
  assert.equal(adequateSample.factors.amountSamples20, L.minAmountSamples)
  assert.equal(rankQuantSamples([adequateSample]).length, 1)
  const zero = quantSample(history(stock().symbol, { amount: 0 }), stock(), QUANT_NOW)!
  assert.equal(zero.factors.amountMedian20, 0, 'reported zero differs from missing')
})

test('date validity, duplicates and future rows do not create sample history; actual adjustment and provisional persist', () => {
  for (const invalid of ['2026-02-30', '2027-01-01', 'bad']) {
    const h = history(); h.bars.at(-1)!.sessionDate = invalid
    assert.equal(quantSample(h, stock(), QUANT_NOW), null)
  }
  const h = history(); h.bars[1]!.sessionDate = h.bars[0]!.sessionDate
  assert.equal(quantSample(h, stock(), QUANT_NOW), null)
  const today = history(stock().symbol, { today: true })
  today.adjustment = 'none'; today.bars.at(-1)!.isFinal = true
  const s = quantSample(today, stock(), QUANT_NOW)!
  assert.equal(s.adjustment, 'none')
  assert.equal(s.provisional, true, 'today has no confirmed closing flag even if adapter asserts it')
  today.bars.at(-1)!.sessionDate = '2026-10-28'; today.bars.at(-2)!.sessionDate = '2026-10-27'
  today.bars.at(-1)!.isFinal = false
  // The duplicated penultimate date reduces the valid sample below 120.
  assert.equal(quantSample(today, stock(), QUANT_NOW), null)
  assert.throws(() => quantSample({ ...history(), adjustment: 'invented' } as any, stock(), QUANT_NOW))
  const damaged = history(stock().symbol, { count: 150 })
  damaged.bars[30]!.close = 0
  assert.equal(quantSample(damaged, stock(), QUANT_NOW), null, 'a bad bar cannot be silently skipped even when 120 remain')
  const unconfirmed = history(stock().symbol, { count: 150 })
  unconfirmed.bars[30]!.isFinal = false
  assert.equal(quantSample(unconfirmed, stock(), QUANT_NOW), null, 'a non-final historical bar invalidates the series')
})

test('midrank percentiles handle extremes, ties, singleton and order deterministically', () => {
  assert.deepEqual(quantPercentiles([]), [])
  assert.deepEqual(quantPercentiles([7]), [0.5])
  assert.deepEqual(quantPercentiles([7, 7, 7]), [0.5, 0.5, 0.5])
  assert.deepEqual(quantPercentiles([3, 1, 2, 2]), [1, 0, 0.5, 0.5])
  assert.throws(() => quantPercentiles([NaN]))
  const a = quantSample(history(stock(1).symbol), stock(1), QUANT_NOW)!
  const b = quantSample(history(stock(2).symbol), stock(2), QUANT_NOW)!
  a.factors = { close: 20, ma20: 15, ma60: 10, return20: 0.2, return60: 0.3, amountMedian20: 100, amountSamples20: 20, volatility20: 0.01 }
  b.factors = { close: 10, ma20: 15, ma60: 20, return20: -0.2, return60: -0.3, amountMedian20: 10, amountSamples20: 20, volatility20: 0.1 }
  const rows = rankQuantSamples([b, a])
  assert.deepEqual(rows.map(r => r.score), [100, 0])
  assert.deepEqual(rows[0]!.scores, { trend: 30, momentum: 30, liquidity: 20, risk: 20 })
  assert.equal(rows[0]!.explanation.length, 4)
  b.factors = { ...a.factors }
  assert.deepEqual(rankQuantSamples([b, a]).map(r => r.symbol), [a.symbol, b.symbol])
  assert.equal(rankQuantSamples([a])[0]!.score, 65)
})

test('moving clocks preserve exact creation and cooldown boundaries for Host projection', async () => {
  let time = QUANT_NOW
  const now = () => time++
  const stocks = Array.from({ length: L.batchStocks + 1 }, (_, index) => stock(index + 1))
  const scan = createQuantScanner({ source: 'fixture', now, id: () => 'moving-clock', wait: async () => {},
    page: async offset => ({ expected: stocks.length, stocks: stocks.slice(offset, offset + L.pageSize), invalid: 0, rawCount: stocks.slice(offset, offset + L.pageSize).length }),
    history: async symbol => history(symbol),
  })
  const result = (await scan({ action: 'start' }))!
  assert.equal(result.canContinue, true)
  assert.equal(Date.parse(result.expiresAt) - Date.parse(result.startedAt), L.sessionMs)
  assert.equal(Date.parse(result.nextAllowedAt) - Date.parse(result.updatedAt), L.cooldownMs)
  assert.doesNotThrow(() => projectQuantScan(result, now()))
})

test('manual start/status/continue: all identities, bounded batches, cooldown, stable cache and top30 only', async () => {
  const h = harness({ size: 180 })
  assert.equal(await h.scan({ action: 'status' }), null)
  assert.equal(h.historyCalls.length, 0)
  const [first, duplicate] = await Promise.all([h.scan({ action: 'start' }), h.scan({ action: 'start' })])
  assert.equal(first!.scanId, duplicate!.scanId)
  assert.equal(first!.counts.attempted, L.batchStocks)
  assert.equal(first!.counts.expected, 180)
  assert.equal(first!.counts.coverage, 150 / 180)
  assert.equal(first!.counts.notAttempted, 30)
  assert.equal(first!.status, 'incomplete'); assert.equal(first!.canContinue, true)
  assert.equal(first!.rows.length, 30)
  assert.ok(JSON.stringify(first).length < 45_000)
  assert.equal(JSON.stringify(first).includes('"bars"'), false)
  assert.deepEqual(projectQuantScan(first, h.now()), first)
  first!.rows.length = 0
  assert.equal((await h.scan({ action: 'status' }))!.rows.length, 30, 'caller cannot mutate cache')
  await h.scan({ action: 'continue', scanId: first!.scanId })
  assert.equal(h.historyCalls.length, 150, 'cooldown does not perform I/O')
  h.advance(L.cooldownMs)
  await assert.rejects(h.scan({ action: 'continue', scanId: 'wrong-id' }))
  const last = (await h.scan({ action: 'continue', scanId: first!.scanId }))!
  assert.equal(last.status, 'complete'); assert.equal(last.canContinue, false)
  assert.equal(last.counts.coverage, 1); assert.equal(last.requests, 181)
  assert.equal(new Set(h.historyCalls).size, 180)
  assert.deepEqual(h.historyCalls, [...h.historyCalls].sort())
  assert.ok(h.requestTimes.slice(1).every((time, i) => time - h.requestTimes[i]! >= L.requestGapMs))
  assert.deepEqual(projectQuantScan(last, h.now()), last)
  assert.equal((await h.scan({ action: 'start' }))!.updatedAt, last.updatedAt)
  assert.equal(h.historyCalls.length, 180)
})

test('coverage distinguishes history success, insufficient, failure, status filters, missing factors, and date mismatch', async () => {
  const stocks = Array.from({ length: 10 }, (_, i) => stock(i + 1))
  stocks[1]!.suspended = true; stocks[2]!.name = '*ST样本'; stocks[3]!.name = null
  const h = harness({ stocks, history: async symbol => {
    const i = Number(symbol.slice(-2))
    if (i === 5) throw new Error('raw secret')
    if (i === 6) return history(symbol, { count: 119 })
    if (i === 7) return history(symbol, { amount: null })
    if (i === 8) return history(symbol, { today: true })
    return history(symbol)
  } })
  const r = (await h.scan({ action: 'start' }))!, c = r.counts
  assert.equal(h.historyCalls.length, 10, 'no candidate prefilter, including ST and suspended')
  assert.equal(c.dailySucceeded, 8); assert.equal(c.dailyInsufficient, 1); assert.equal(c.dailyFailed, 1)
  assert.equal(c.covered, 9); assert.equal(c.coverage, 0.9); assert.equal(c.sampleCoverage, 0.8)
  assert.equal(c.excludedSuspended, 1); assert.equal(c.excludedST, 1); assert.equal(c.excludedStatusUnknown, 1)
  assert.equal(c.missingFactors, 1); assert.equal(c.excludedDateMismatch, 3); assert.equal(c.ranked, 1)
  assert.equal(r.provisional, true); assert.equal(r.partial, true); assert.equal(r.status, 'incomplete')
  assert.equal(r.canContinue, false)
  assert.equal(r.rows[0]!.symbol, stock(8).symbol)
  assert.deepEqual(projectQuantScan(r, h.now()), r)
})

test('large upstream failure stops without retry, and cached start cannot hammer the source', async () => {
  const h = harness({ size: 200, history: async () => { throw new Error('throttled') } })
  const r = (await h.scan({ action: 'start' }))!
  assert.equal(r.stopReason, 'upstream-failures'); assert.equal(r.status, 'incomplete')
  assert.ok(r.counts.dailyFailed >= 5 && r.counts.dailyFailed <= 6)
  assert.equal(r.counts.attempted, h.historyCalls.length)
  assert.equal(r.counts.covered, 0); assert.equal(r.canContinue, false)
  assert.equal(r.counts.notAttempted, 200 - h.historyCalls.length)
  await h.scan({ action: 'start' }); await h.scan({ action: 'continue', scanId: r.scanId })
  assert.equal(r.counts.attempted, h.historyCalls.length)
  assert.deepEqual(projectQuantScan(r, h.now()), r)
})

test('failed pages, unknown total, duplicate lists, hard stock/page bounds, and empty source are honest incomplete results', async () => {
  const failed = harness({ page: async () => { throw new Error('captcha') } })
  const empty = (await failed.scan({ action: 'start' }))!
  assert.equal(empty.counts.expected, null); assert.equal(empty.counts.failedPages, 1)
  assert.equal(empty.status, 'incomplete'); assert.equal(empty.requests, 1)
  assert.deepEqual(projectQuantScan(empty, failed.now()), empty)
  const duplicate = harness({ page: async () => ({ expected: 400, stocks: [stock()], invalid: 0, rawCount: 200 }) })
  const d = (await duplicate.scan({ action: 'start' }))!
  assert.equal(d.counts.discovered, 1); assert.equal(d.counts.duplicateListRows, 1)
  assert.equal(d.counts.listCoverage, 1 / 400); assert.equal(d.partial, true)
  const secondFailed = harness({ page: async offset => {
    if (offset) throw new Error('403')
    return { expected: 400, stocks: [stock()], invalid: 1, rawCount: 200 }
  } })
  const f = (await secondFailed.scan({ action: 'start' }))!
  assert.equal(f.counts.discovered, 1); assert.equal(f.counts.notAttempted, 1); assert.equal(f.canContinue, false)
  const bounded = harness({ page: async offset => ({ expected: 99_999,
    stocks: Array.from({ length: 200 }, (_, i) => stock(offset + i + 1)), invalid: 0, rawCount: 200 }) })
  const b = (await bounded.scan({ action: 'start' }))!
  assert.equal(b.counts.discovered, L.stocks)
  assert.ok(b.requests <= L.pages + L.batchStocks); assert.equal(b.partial, true)
  assert.deepEqual(projectQuantScan(b, bounded.now()), b)
  assert.equal((await harness({ size: 0 }).scan({ action: 'start' }))!.status, 'incomplete')
})

test('cancellation interrupts requests, expiration invalidates continuation, and a new start resets only expired progress', async () => {
  const controller = new AbortController()
  const h = harness({ history: async () => { controller.abort(); return new Promise(() => {}) } })
  const r = (await h.scan({ action: 'start' }, controller.signal))!
  assert.equal(r.stopReason, 'cancelled'); assert.equal(r.canContinue, false)
  assert.equal(r.counts.attempted, r.counts.dailyFailed)
  assert.deepEqual(projectQuantScan(r, h.now()), r)
  const progress = harness({ size: 160 })
  const first = (await progress.scan({ action: 'start' }))!
  progress.advance(L.sessionMs)
  const expired = (await progress.scan({ action: 'continue', scanId: first.scanId }))!
  assert.equal(expired.stopReason, 'expired'); assert.equal(expired.canContinue, false)
  assert.equal(progress.historyCalls.length, 150)
  assert.deepEqual(projectQuantScan(expired, progress.now()), expired)
  const newRun = (await progress.scan({ action: 'start' }))!
  assert.notEqual(newRun.scanId, first.scanId)
})

test('a batch deadline stops admission without counting unissued histories as failures and can resume manually', async () => {
  let slow = true
  const h = harness({ size: 6, history: async symbol => {
    if (slow) { slow = false; h.advance(L.batchMs) }
    return history(symbol)
  } })
  const r = (await h.scan({ action: 'start' }))!
  assert.equal(r.stopReason, 'deadline'); assert.equal(r.canContinue, true)
  assert.equal(r.counts.attempted, h.historyCalls.length)
  assert.equal(r.counts.dailyFailed, 0)
  assert.equal(r.counts.notAttempted, 6 - h.historyCalls.length)
  assert.deepEqual(projectQuantScan(r, h.now()), r)
  h.advance(L.cooldownMs)
  const last = (await h.scan({ action: 'continue', scanId: r.scanId }))!
  assert.equal(last.status, 'complete')
  assert.equal(new Set(h.historyCalls).size, 6); assert.equal(h.historyCalls.length, 6)
})

test('concurrency is limited to two even for slow histories; intermittent widespread failure also trips the circuit', async () => {
  let active = 0, maxActive = 0
  const concurrent = harness({ size: 8, history: async symbol => {
    active++; maxActive = Math.max(active, maxActive)
    await new Promise(resolve => setTimeout(resolve, 1))
    active--; return history(symbol)
  } })
  await concurrent.scan({ action: 'start' })
  assert.equal(maxActive, 2)
  const h = harness({ size: 100, history: async symbol => {
    if (Number(symbol.slice(-3)) % 2) throw new Error('failure')
    return history(symbol)
  } })
  const r = (await h.scan({ action: 'start' }))!
  assert.equal(r.stopReason, 'upstream-failures')
  assert.ok(r.counts.attempted >= 20 && r.counts.attempted <= 22)
  assert.ok(r.counts.dailySucceeded > 0)
  assert.equal(r.canContinue, false)
})

test('drifting rank totals do not rewrite the initial expected count or claim full market coverage', async () => {
  const h = harness({ page: async offset => offset === 0
    ? { expected: 201, stocks: Array.from({ length: 200 }, (_, i) => stock(i + 1)), invalid: 0, rawCount: 200 }
    : { expected: 202, stocks: [stock(201), stock(202)], invalid: 0, rawCount: 2 } })
  const r = (await h.scan({ action: 'start' }))!
  assert.equal(r.counts.expected, 201); assert.equal(r.counts.discovered, 202)
  assert.equal(r.listPartial, true)
  assert.deepEqual(projectQuantScan(r, h.now()), r)
})
