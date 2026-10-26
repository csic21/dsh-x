import test from 'node:test'
import assert from 'node:assert/strict'
import { createTencentMarketProvider, parseSinaMinutePayload } from '../src/market-provider.ts'

const NOW = Date.parse('2026-10-23T20:00:00+08:00')
const STAMP = '20261023150000'
const SESSION = '2026-10-23'
const CODES = ['sh600001', 'sh600002', 'sh600003', 'sh600004']

function quoteFields(code: string, name: string): string[] {
  const fields = Array(63).fill('0')
  fields[1] = name
  fields[2] = code.slice(2)
  fields[3] = '10'
  fields[4] = '10.64'
  fields[6] = '100000'
  fields[30] = STAMP
  fields[32] = '-6'
  fields[37] = '5000'
  fields[38] = '5'
  fields[49] = '2.5'
  return fields
}

function rankPayload() {
  return {
    code: 0,
    msg: 'ok',
    data: {
      total: CODES.length,
      offset: 0,
      rank_list: CODES.map((code, index) => ({
        code,
        name: `Stock ${index + 1}`,
        zxj: '10',
        zdf: '-6',
        turnover: '5000',
        zsz: '100',
        state: '',
      })),
    },
  }
}

function minutePayload(code: string, options: { tailVolume?: number; morningTail?: boolean } = {}) {
  const { tailVolume = 300, morningTail = false } = options
  const rows: string[] = []
  let cumulativeVolume = 0
  let cumulativeAmount = 0
  const push = (time: string) => {
    const tail = time > '14:30'
    const morning = morningTail && time > '11:00' && time <= '11:30'
    const price = tail || morning ? 9.5 : 10
    const volume = tail || morning ? tailVolume : 100
    cumulativeVolume += volume
    cumulativeAmount += price * volume * 100
    rows.push(`${time.replace(':', '')} ${price.toFixed(2)} ${cumulativeVolume} ${cumulativeAmount.toFixed(2)}`)
  }
  for (let minutes = 9 * 60 + 30; minutes <= 11 * 60 + 30; minutes++) {
    push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`)
  }
  for (let minutes = 13 * 60; minutes <= 15 * 60; minutes++) {
    push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`)
  }
  const fields = quoteFields(code, `Stock ${code.slice(-1)}`)
  return { data: { [code]: { data: { date: '20261023', data: rows }, qt: { [code]: fields } } } }
}

function historyPayload(code: string) {
  const rows: unknown[][] = []
  for (let index = 0; index < 30; index++) {
    const date = new Date(Date.UTC(2026, 8, 24 + index)).toISOString().slice(0, 10)
    const close = index >= 29 ? 9.5 : index === 28 ? 9.8 : 10
    const volume = index === 29 ? 250 : index === 28 ? 150 : 100
    const open = close
    const high = close + 0.1
    const low = close - 0.1
    rows.push([date, String(open), String(close), String(high), String(low), String(volume), {}, '1.0', String(volume * close / 100), ''])
  }
  const fields = quoteFields(code, `Stock ${code.slice(-1)}`)
  return { code: 0, data: { [code]: { qfqday: rows, qt: { [code]: fields } } } }
}

function sinaPayload() {
  const rows: any[] = []
  const push = (time: string) => {
    const tail = time > '14:30'
    rows.push({
      day: `2026-10-23 ${time}:00`,
      open: String(tail ? 9.5 : 10),
      high: String(tail ? 9.5 : 10),
      low: String(tail ? 9.5 : 10),
      close: String(tail ? 9.5 : 10),
      volume: String(tail ? 300 : 100),
      amount: String((tail ? 9.5 : 10) * (tail ? 300 : 100) * 100),
    })
  }
  for (let minutes = 9 * 60 + 30; minutes <= 11 * 60 + 30; minutes++) {
    push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`)
  }
  for (let minutes = 13 * 60; minutes <= 15 * 60; minutes++) {
    push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`)
  }
  return `/*<script>location.href='//sina.com';</script>*/\nvar _data=(${JSON.stringify(rows)});`
}

function makeFetch(options: { failMinute?: string; failAllTencentMinutes?: boolean; failSinaCode?: string; failAllSina?: boolean; morningTail?: boolean } = {}) {
  let calls = 0
  const fetchImpl = (async (input: any) => {
    calls++
    const url = String(input)
    if (url.includes('getBoardRankList')) return json(rankPayload())
    if (url.startsWith('https://qt.gtimg.cn/q=')) {
      return text(CODES.map(code => `v_${code}="${quoteFields(code, `Stock ${code.slice(-1)}`).join('~')}";`).join('\n'))
    }
    if (url.includes('web.ifzq.gtimg.cn')) {
      const code = new URL(url).searchParams.get('code')!
      if (options.failAllTencentMinutes || code === options.failMinute) return json({ code: 1, msg: 'broken' }, 501)
      return json(minutePayload(code, { morningTail: options.morningTail === true }))
    }
    if (url.includes('quotes.sina.cn')) {
      const code = new URL(url).searchParams.get('symbol')!
      if (options.failAllSina || code === options.failSinaCode) return json({ code: 1, msg: 'broken' }, 500)
      return text(sinaPayload(), 'application/javascript; charset=gbk')
    }
    if (url.includes('newfqkline')) {
      const code = new URL(url).searchParams.get('param')!.split(',')[0]!
      return json(historyPayload(code))
    }
    return json({ code: 1, msg: 'unexpected' }, 404)
  }) as typeof fetch
  return { fetchImpl, calls: () => calls }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function text(body: string, type = 'text/html; charset=GBK') {
  return new Response(body, { status: 200, headers: { 'content-type': type } })
}

test('the provider scans the market, confirms the falling tail and computes daily context', async () => {
  const fake = makeFetch()
  const provider = createTencentMarketProvider({ fetchImpl: fake.fetchImpl, now: () => NOW, concurrency: 2 })
  const scan = await provider.tailScan!()
  assert.equal(scan.sessionDate, SESSION)
  assert.equal(scan.sessionIsToday, true)
  assert.equal(scan.complete, true)
  assert.equal(scan.source.includes('腾讯'), true)
  assert.deepEqual(scan.universe, {
    expected: 4, covered: 4, screened: 4, intradayChecked: 4,
    tailConfirmed: 4, historyChecked: 4, failedIntraday: 0, failedHistory: 0, partial: false,
  })
  assert.equal(scan.candidates.length, 4)
  assert.equal(scan.window, 'afternoon')
  assert.equal(scan.windowStart, '14:30')
  assert.equal(scan.windowEnd, '15:00')
  const candidate = scan.candidates[0]!
  assert.equal(candidate.symbol, 'SH.600001')
  assert.equal(candidate.changePercent, -6)
  assert.equal(candidate.tail.complete, true)
  assert.equal(candidate.tail.tailVolumeRatio, 3)
  assert.ok(Math.abs(candidate.tail.tailReturn! - -0.05) < 1e-12)
  assert.equal(candidate.daily?.volumeRatio5, 250 / 110)
  assert.equal(candidate.daily?.volumeExpansionDownStreak, 2)
  assert.equal(candidate.daily?.volumeDeclineStreak, 2)
  assert.equal(candidate.flags.consecutive, true)
  assert.equal(candidate.score, 87)
  assert.equal(candidate.adjustment, 'forward')
  assert.equal(candidate.historyAvailable, true)
  const calls = fake.calls()
  await provider.tailScan!()
  assert.equal(fake.calls(), calls, 'the scan result is cached')
})

test('the morning window scans 11:00–11:30 with its own cache entry', async () => {
  const fake = makeFetch({ morningTail: true })
  const provider = createTencentMarketProvider({ fetchImpl: fake.fetchImpl, now: () => NOW, concurrency: 2 })
  const scan = await provider.tailScan!({ window: 'morning' })
  assert.equal(scan.window, 'morning')
  assert.equal(scan.windowStart, '11:00')
  assert.equal(scan.windowEnd, '11:30')
  assert.equal(scan.complete, true)
  assert.equal(scan.universe.tailConfirmed, 4)
  assert.equal(scan.candidates.length, 4)
  const candidate = scan.candidates[0]!
  assert.equal(candidate.tail.tailStart, '11:00')
  assert.equal(candidate.tail.tailEnd, '11:30')
  assert.equal(candidate.tail.tailVolumeRatio, 3)
  assert.ok(Math.abs(candidate.tail.tailReturn! - -0.05) < 1e-12)

  // The afternoon entry must not answer a morning request, and each window is
  // cached on its own.
  const calls = fake.calls()
  await provider.tailScan!({ window: 'morning' })
  assert.equal(fake.calls(), calls, 'the morning result is cached')
  await provider.tailScan!({ window: 'afternoon' })
  assert.notEqual(fake.calls(), calls, 'the afternoon window is fetched separately')
})

test('a failed minute line is counted and does not become a candidate', async () => {
  const fake = makeFetch({ failMinute: 'sh600002', failSinaCode: 'sh600002' })
  const provider = createTencentMarketProvider({ fetchImpl: fake.fetchImpl, now: () => NOW, concurrency: 2 })
  const scan = await provider.tailScan!()
  assert.equal(scan.universe.intradayChecked, 4)
  assert.equal(scan.universe.failedIntraday, 1)
  assert.equal(scan.universe.tailConfirmed, 3)
  assert.equal(scan.universe.partial, true)
  assert.equal(scan.candidates.length, 3)
  assert.equal(scan.complete, true)
})

test('the Sina minute fallback keeps the tail scan working when the Tencent feed is challenged', async () => {
  const fake = makeFetch({ failAllTencentMinutes: true })
  const provider = createTencentMarketProvider({ fetchImpl: fake.fetchImpl, now: () => NOW, concurrency: 2 })
  const scan = await provider.tailScan!()
  assert.equal(scan.sessionDate, SESSION)
  assert.equal(scan.universe.failedIntraday, 0)
  assert.equal(scan.universe.tailConfirmed, 4)
  assert.equal(scan.candidates.length, 4)
  assert.equal(scan.candidates[0]!.tail.tailVolumeRatio, 3)
  assert.equal(scan.candidates[0]!.flags.consecutive, true)
})

test('when every minute line fails the scan is empty, partial and not called complete', async () => {
  const failingSina = makeFetch({ failAllTencentMinutes: true, failAllSina: true })
  const provider = createTencentMarketProvider({ fetchImpl: failingSina.fetchImpl, now: () => NOW, concurrency: 2 })
  const scan = await provider.tailScan!()
  assert.equal(scan.candidates.length, 0)
  assert.equal(scan.universe.failedIntraday, 4)
  assert.equal(scan.universe.partial, true)
  assert.equal(scan.complete, false)
})

test('the Sina JSONP parser keeps only the newest session and per-minute values', () => {
  const series = parseSinaMinutePayload(sinaPayload(), 'SH.600293', NOW, 10.64)
  assert.equal(series.sessionDate, SESSION)
  assert.equal(series.previousClose, 10.64)
  assert.equal(series.points.length, 242)
  assert.equal(series.points[0]!.time, '09:30')
  assert.equal(series.points.at(-1)!.time, '15:00')
  assert.equal(series.points.at(-1)!.volume, 300)
  assert.equal(series.points.at(-1)!.amount, 9.5 * 300 * 100)
})
