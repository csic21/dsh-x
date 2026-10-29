import type { MarketHistory } from '../src/market.ts'
import { createQuantScanner } from '../src/quant-scan.ts'
import type { QuantStock, QuantPage } from '../src/quant-scan.ts'

export const QUANT_NOW = Date.parse('2026-10-29T12:00:00+08:00')
export function stock(index = 1, options: Partial<QuantStock> = {}): QuantStock {
  return { symbol: `SH.${600000 + index}`, name: `样本${index}`, suspended: false, ...options }
}
export function history(symbol = stock().symbol, options: { count?: number; today?: boolean; growth?: number; amount?: number | null } = {}): MarketHistory {
  const { count = 120, growth = 0.001, amount = 1_000_000 } = options
  const dates: string[] = []
  const date = new Date(options.today ? '2026-10-29' : '2026-10-28')
  while (dates.length < count) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) dates.unshift(date.toISOString().slice(0, 10))
    date.setUTCDate(date.getUTCDate() - 1)
  }
  const bars = dates.map((sessionDate, i) => {
    const close = 10 * (1 + growth) ** i
    return { sessionDate, open: close, high: close + 1, low: close - 1, close, amount, volume: 1000, isFinal: !options.today || i < dates.length - 1 }
  })
  return { symbol, name: '样本', source: 'fixture', fetchedAt: new Date(QUANT_NOW).toISOString(), adjustment: 'forward',
    adjustmentLabel: 'forward-adjusted (qfq)', pricePrecision: 2, volumeUnit: 'shares', volumeBasis: 'shares',
    amountUnit: 'CNY', currency: 'CNY', exchangeTimezone: 'Asia/Shanghai', firstSessionDate: dates[0]!, lastSessionDate: dates.at(-1)!, bars }
}
export function harness(options: {
  size?: number; stocks?: QuantStock[]; expected?: number
  page?: (offset: number, signal: AbortSignal) => Promise<QuantPage>
  history?: (symbol: string, signal: AbortSignal) => Promise<MarketHistory>
} = {}) {
  let clock = QUANT_NOW, calls = 0
  const stocks = options.stocks ?? Array.from({ length: options.size ?? 3 }, (_, i) => stock(i + 1))
  const historyCalls: string[] = [], requestTimes: number[] = []
  const scan = createQuantScanner({ source: 'fixture', now: () => clock, id: () => `scan-${++calls}`,
    wait: async (ms, signal) => { if (signal.aborted) throw new Error('aborted'); clock += ms },
    page: async (offset, signal) => {
      requestTimes.push(clock)
      if (options.page) return options.page(offset, signal)
      const items = stocks.slice(offset, offset + 200)
      return { expected: options.expected ?? stocks.length, stocks: items, invalid: 0, rawCount: items.length }
    },
    history: async (symbol, signal) => {
      historyCalls.push(symbol); requestTimes.push(clock)
      return options.history ? options.history(symbol, signal) : history(symbol)
    },
  })
  return { scan, historyCalls, requestTimes, now: () => clock, advance: (ms: number) => { clock += ms } }
}
