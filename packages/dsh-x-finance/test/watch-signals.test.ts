import test from 'node:test'
import assert from 'node:assert/strict'
import type { MarketDailyBar } from '../src/market.ts'
import {
  evaluateWatchSignal, WATCH_SIGNAL_MIN_SAMPLES, WATCH_SIGNAL_MA20_PERIOD,
  WATCH_SIGNAL_MA60_PERIOD, WATCH_SIGNAL_BREAKOUT_PERIOD,
  type WatchSignal, type WatchSignalBar,
} from '../src/watch-signals.ts'

const repeat = (count: number, close: number) => Array<number>(count).fill(close)
const rising = (count = 120) => Array.from({ length: count }, (_, index) => index + 1)

// Synthetic weekday sessions from a fixed epoch, never live prices or system time.
function series(closes: readonly number[]): MarketDailyBar[] {
  const date = new Date('2025-01-02T00:00:00Z')
  return closes.map(close => {
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1)
    const sessionDate = date.toISOString().slice(0, 10)
    date.setUTCDate(date.getUTCDate() + 1)
    return { sessionDate, close, open: close, high: close + 10, low: close, volume: null, amount: null, isFinal: true }
  })
}

const empty: WatchSignal = {
  status: 'insufficient', reason: 'insufficient', sessionDate: null, samples: 0, isFinal: false,
  close: null, ma20: null, ma60: null, previousClose: null, previousMa20: null, prior20High: null,
}
const invalid: WatchSignal = { ...empty, reason: 'invalid' }

test('exports the fixed sample threshold and daily windows', () => {
  assert.equal(WATCH_SIGNAL_MIN_SAMPLES, 120)
  assert.equal(WATCH_SIGNAL_MA20_PERIOD, 20)
  assert.equal(WATCH_SIGNAL_MA60_PERIOD, 60)
  assert.equal(WATCH_SIGNAL_BREAKOUT_PERIOD, 20)
})

test('buy observation reports hand-calculated windows including today and excluding today from the high', () => {
  const bars = series(rising())
  assert.deepEqual(evaluateWatchSignal(bars), {
    status: 'buy', reason: 'ok', sessionDate: bars.at(-1)!.sessionDate, samples: 120, isFinal: true,
    close: 120, ma20: 110.5, ma60: 90.5, previousClose: 119, previousMa20: 109.5, prior20High: 119,
  })
})

test('sell observation reports two closes below their respective same-day averages', () => {
  const bars = series(Array.from({ length: 120 }, (_, index) => 200 - index))
  assert.deepEqual(evaluateWatchSignal(bars), {
    status: 'sell', reason: 'ok', sessionDate: bars.at(-1)!.sessionDate, samples: 120, isFinal: true,
    close: 81, ma20: 90.5, ma60: 110.5, previousClose: 82, previousMa20: 91.5, prior20High: 101,
  })
})

test('a flat series is watch with an exact, fixed return shape', () => {
  const bars = series(repeat(120, 10))
  assert.deepEqual(evaluateWatchSignal(bars), {
    status: 'watch', reason: 'ok', sessionDate: bars.at(-1)!.sessionDate, samples: 120, isFinal: true,
    close: 10, ma20: 10, ma60: 10, previousClose: 10, previousMa20: 10, prior20High: 10,
  })
})

test('tying the previous high is not a strict breakout even with MA20 above MA60', () => {
  const closes = rising()
  closes[119] = 119
  const result = evaluateWatchSignal(series(closes))
  assert.equal(result.close, result.prior20High)
  assert.ok(result.ma20! > result.ma60!)
  assert.equal(result.status, 'watch')
})

test('a breakout with equal MA20 and MA60 is watch', () => {
  const result = evaluateWatchSignal(series([...repeat(60, 10), ...repeat(40, 21), ...repeat(19, 20), 40]))
  assert.ok(result.close! > result.prior20High!)
  assert.equal(result.ma20, 21)
  assert.equal(result.ma60, 21)
  assert.equal(result.status, 'watch')
})

test('a breakout with MA20 below MA60 is watch', () => {
  const result = evaluateWatchSignal(series([...repeat(99, 100), ...repeat(20, 10), 11]))
  assert.ok(result.close! > result.prior20High!)
  assert.ok(result.ma20! < result.ma60!)
  assert.equal(result.status, 'watch')
})

test('MA20 above MA60 alone does not trigger buy', () => {
  const closes = rising()
  closes[119] = 118
  const result = evaluateWatchSignal(series(closes))
  assert.ok(result.ma20! > result.ma60!)
  assert.ok(result.close! < result.prior20High!)
  assert.equal(result.status, 'watch')
})

test('the high includes the oldest of the prior 20 closes', () => {
  const result = evaluateWatchSignal(series([...repeat(99, 1), 30, ...repeat(19, 10), 20]))
  assert.equal(result.prior20High, 30)
  assert.ok(result.ma20! > result.ma60!)
  assert.equal(result.status, 'watch')
})

test('the high excludes the 21st prior close and ignores OHLC highs', () => {
  const result = evaluateWatchSignal(series([...repeat(98, 1), 30, ...repeat(20, 10), 11]))
  assert.equal(result.prior20High, 10)
  assert.equal(result.status, 'buy')
})

test('sell uses the previous MA20, even when the previous close exceeds today MA20', () => {
  const result = evaluateWatchSignal(series([...repeat(99, 10), 100, ...repeat(18, 10), 12, 9]))
  assert.ok(Math.abs(result.previousMa20! - 14.6) < 1e-12)
  assert.equal(result.ma20, 10.05)
  assert.ok(result.previousClose! > result.ma20!)
  assert.ok(result.previousClose! < result.previousMa20!)
  assert.equal(result.status, 'sell')
})

test('two closes below today MA20 do not imply two closes below their own MA20', () => {
  const result = evaluateWatchSignal(series([...repeat(99, 20), 2, ...repeat(18, 20), 19.5, 16]))
  assert.ok(result.previousClose! < result.ma20!)
  assert.ok(result.close! < result.ma20!)
  assert.ok(result.previousClose! > result.previousMa20!)
  assert.equal(result.status, 'watch')
})

test('risk observation still applies while MA20 is above MA60', () => {
  const result = evaluateWatchSignal(series([...repeat(100, 1), ...repeat(18, 20), 10, 9]))
  assert.ok(result.ma20! > result.ma60!)
  assert.equal(result.status, 'sell')
})

for (const [label, tail] of [
  ['previous close equals its MA20', [20, 19]],
  ['today close equals its MA20', [1, 19]],
  ['only the previous close is below its MA20', [1, 19.5]],
] as const) {
  test(`sell needs both strict comparisons: ${label}`, () => {
    const result = evaluateWatchSignal(series([...repeat(118, 20), ...tail]))
    assert.equal(result.status, 'watch')
  })
}

test('strict breakout does not round small positive differences away', () => {
  const next = 10 + Number.EPSILON * 8
  const result = evaluateWatchSignal(series([...repeat(99, 1), ...repeat(20, 10), next]))
  assert.ok(result.close! > result.prior20High!)
  assert.equal(result.status, 'buy')
})

for (const price of [0.1, 1.1, 12.34, Number.MIN_VALUE, Number.MAX_VALUE]) {
  test(`flat finite positive prices stay watch without artificial strict crossings: ${price}`, () => {
    const result = evaluateWatchSignal(series(repeat(120, price)))
    assert.equal(result.status, 'watch')
    assert.equal(result.ma20, price)
    assert.equal(result.ma60, price)
    assert.equal(result.previousMa20, price)
  })
}

test('large finite prices do not overflow the averages', () => {
  const result = evaluateWatchSignal(series([...repeat(100, Number.MAX_VALUE), ...repeat(20, Number.MAX_VALUE / 2)]))
  assert.equal(result.reason, 'ok')
  for (const value of [result.ma20, result.ma60, result.previousMa20]) {
    assert.ok(value !== null && Number.isFinite(value))
    assert.ok(value >= Number.MAX_VALUE / 2 && value <= Number.MAX_VALUE)
  }
})

for (const count of [0, 1, 2, 19, 20, 21, 59, 60, 119, 120, 121, 180]) {
  test(`${count} samples preserve available fields and require complete indicator windows`, () => {
    const bars = series(repeat(count, 10))
    assert.deepEqual(evaluateWatchSignal(bars), {
      status: count < 120 ? 'insufficient' : 'watch', reason: count < 120 ? 'insufficient' : 'ok',
      sessionDate: bars.at(-1)?.sessionDate ?? null, samples: count, isFinal: count > 0,
      close: count > 0 ? 10 : null, ma20: count >= 20 ? 10 : null, ma60: count >= 60 ? 10 : null,
      previousClose: count >= 2 ? 10 : null, previousMa20: count >= 21 ? 10 : null, prior20High: count >= 21 ? 10 : null,
    })
  })
}

test('119 samples cannot trigger either rule, even when all indicator windows exist', () => {
  for (const closes of [rising(119), rising(119).reverse()]) {
    const result = evaluateWatchSignal(series(closes))
    assert.equal(result.status, 'insufficient')
    assert.equal(result.reason, 'insufficient')
    assert.equal(result.samples, 119)
    assert.notEqual(result.ma60, null)
  }
})

test('all supplied sessions are counted without a history cap', () => {
  const result = evaluateWatchSignal(series(rising(180)))
  assert.equal(result.samples, 180)
  assert.equal(result.close, 180)
  assert.equal(result.ma20, 170.5)
  assert.equal(result.ma60, 150.5)
  assert.equal(result.previousMa20, 169.5)
  assert.equal(result.prior20High, 179)
  assert.equal(result.status, 'buy')
})

test('unknown non-array inputs are invalid, not empty histories', () => {
  for (const input of [undefined, null, false, 0, 'bars', {}, { bars: series(rising()) }, new Set(), new Float64Array(120)]) {
    assert.deepEqual(evaluateWatchSignal(input), invalid)
  }
  assert.deepEqual(evaluateWatchSignal([]), empty)
})

test('malformed rows and sparse arrays invalidate the whole history', () => {
  for (const raw of [null, undefined, false, 3, 'bar', [], {}, new Date('2025-01-01T00:00:00Z')]) {
    const bars: unknown[] = series(rising())
    bars[0] = raw
    assert.deepEqual(evaluateWatchSignal(bars), invalid)
  }
  const sparse = series(rising())
  delete sparse[0]
  assert.deepEqual(evaluateWatchSignal(sparse), invalid)
})

test('non-finite, non-number, zero and negative closes are rejected without coercion', () => {
  for (const close of [undefined, null, '10', true, NaN, Infinity, -Infinity, 0, -0, -1, 10n, new Number(10)]) {
    for (const index of [0, 60, 119]) {
      const bars: unknown[] = series(rising())
      bars[index] = { ...(bars[index] as MarketDailyBar), close }
      assert.deepEqual(evaluateWatchSignal(bars), invalid)
    }
  }
})

test('isFinal is required and must be an explicit boolean', () => {
  for (const isFinal of [undefined, null, 0, 1, 'true', 'false']) {
    const bars = series(rising())
    const input = [...bars.slice(0, -1), { ...bars.at(-1)!, isFinal }]
    assert.deepEqual(evaluateWatchSignal(input), invalid)
  }
})

test('duplicate dates invalidate even identical bars and histories still containing 120 unique days', () => {
  const bars = series(rising())
  for (const close of [bars[0]!.close, 999]) {
    const input = [...bars, { ...bars[0]!, close }]
    assert.deepEqual(evaluateWatchSignal(input), invalid)
    assert.deepEqual(evaluateWatchSignal(input.reverse()), invalid)
  }
})

test('invalid data is not silently discarded or hidden by the minimum-sample gate', () => {
  const bars = series(rising())
  const bad = { sessionDate: '2025-02-30', close: 10, isFinal: true }
  assert.deepEqual(evaluateWatchSignal([bad]), invalid)
  assert.deepEqual(evaluateWatchSignal([...bars, bad]), invalid)
  assert.deepEqual(evaluateWatchSignal([bars[0], bars[0]]), invalid)
})

test('dates must be real Gregorian YYYY-MM-DD values, not normalized timestamps', () => {
  for (const sessionDate of [
    undefined, null, 20250101, '', 'bad', '2025-1-01', '2025-01-1', '25-01-01',
    '2025/01/01', ' 2025-01-01', '2025-01-01 ', '2025-01-01\n', '2025-01-01T00:00:00Z',
    '0000-01-01', '10000-01-01', '2025-00-01', '2025-13-01', '2025-01-00', '2025-01-32',
    '2025-04-31', '2025-06-31', '2025-09-31', '2025-11-31', '2025-02-29', '2024-02-30',
    '1900-02-29', '2100-02-29', '0100-02-29',
  ]) {
    assert.deepEqual(evaluateWatchSignal([{ sessionDate, close: 10, isFinal: true }]), invalid, String(sessionDate))
  }
})

test('valid leap years and year boundaries survive without a clock-based freshness check', () => {
  for (const sessionDate of ['0001-01-01', '0099-12-31', '0400-02-29', '2000-02-29', '2024-02-29', '2025-12-31', '9999-12-31']) {
    assert.deepEqual(evaluateWatchSignal([{ sessionDate, close: 10, isFinal: true }]), {
      ...empty, sessionDate, samples: 1, isFinal: true, close: 10,
    })
  }
})

for (const [status, closes] of [
  ['buy', rising()], ['sell', rising().reverse()], ['watch', repeat(120, 10)], ['insufficient', rising(119)],
] as const) {
  test(`an unfinished latest bar retains all metrics and isFinal=false for ${status}`, () => {
    const bars = series(closes)
    const confirmed = evaluateWatchSignal(bars)
    bars.at(-1)!.isFinal = false
    const result = evaluateWatchSignal(bars)
    assert.equal(result.status, status)
    assert.deepEqual(result, { ...confirmed, isFinal: false })
    // Chronological latest is allowed even when it is the first input element.
    assert.deepEqual(evaluateWatchSignal(bars.reverse()), result)
  })
}

test('any unfinished earlier bar rejects the series, including short and unsorted histories', () => {
  for (const index of [0, 60, 118]) {
    const bars = series(rising())
    bars[index]!.isFinal = false
    assert.deepEqual(evaluateWatchSignal(bars), invalid)
    assert.deepEqual(evaluateWatchSignal(bars.reverse()), invalid)
  }
  const bars = series([10, 11])
  bars[0]!.isFinal = false
  bars[1]!.isFinal = false
  assert.deepEqual(evaluateWatchSignal(bars), invalid)
  assert.deepEqual(evaluateWatchSignal([bars[0]]), { ...empty, sessionDate: bars[0]!.sessionDate, samples: 1, close: 10 })
})

test('extra fields and security names do not change a minimal compatible-bar result', () => {
  const bars = series(rising())
  const minimal: WatchSignalBar[] = bars.map(({ sessionDate, close, isFinal }) => ({ sessionDate, close, isFinal }))
  const expected = evaluateWatchSignal(minimal)
  assert.deepEqual(evaluateWatchSignal(bars), expected)
  for (const name of ['ST示例', '*ST示例', '普通示例', '']) {
    assert.deepEqual(evaluateWatchSignal(minimal.map(bar => ({ ...bar, name, symbol: 'unclassified', high: NaN, volume: null }))), expected)
  }
})

test('sorting is deterministic and does not mutate frozen input arrays or rows', () => {
  const bars = series(rising())
  const expected = evaluateWatchSignal(bars)
  const shuffled = [...bars.filter((_, index) => index % 2), ...bars.filter((_, index) => index % 2 === 0)].reverse()
  const before = structuredClone(shuffled)
  const frozen = Object.freeze(shuffled.map(bar => Object.freeze(bar)))
  assert.deepEqual(evaluateWatchSignal(frozen), expected)
  assert.deepEqual(evaluateWatchSignal(frozen), expected)
  assert.deepEqual(frozen, before)
  const changedResult = evaluateWatchSignal(frozen)
  changedResult.close = -1
  assert.deepEqual(evaluateWatchSignal(frozen), expected)
})

test('invalid input is also unchanged by validation', () => {
  const bars = series(rising()).reverse()
  bars[70]!.isFinal = false
  const before = structuredClone(bars)
  assert.deepEqual(evaluateWatchSignal(bars), invalid)
  assert.deepEqual(bars, before)
})

test('evaluation needs neither system time nor network access', t => {
  const bars = series(rising())
  const expected = evaluateWatchSignal(bars)
  t.mock.method(globalThis, 'Date', () => { throw new Error('clock access is forbidden') })
  t.mock.method(globalThis, 'fetch', () => { throw new Error('network access is forbidden') })
  assert.deepEqual(evaluateWatchSignal(bars), expected)
})
