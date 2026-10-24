import type { MacdParams } from '../../indicators.ts'
import { CHART_MA_PERIODS } from '../../indicators.ts'
export interface ChartConfig { maVisible: Record<number, boolean>; macd: MacdParams; difVisible: boolean; deaVisible: boolean; kdjVisible: boolean }
/**
 * The short trio stays on by default because it is what the chart always showed.
 * MA50/MA250 are opt-in: they need 50 and 250 bars of warm-up, so a fresh view
 * should not open with two blank lines the reader has to explain away.
 */
const DEFAULT_MA_VISIBLE = Object.freeze({ 5: true, 10: true, 20: true, 50: false, 250: false })
export const DEFAULT_CHART_CONFIG = Object.freeze({
  maVisible: DEFAULT_MA_VISIBLE,
  macd: Object.freeze({ fast: 12, slow: 26, signal: 9, histScale: 2 }),
  difVisible: true,
  deaVisible: true,
  kdjVisible: true,
})
export function normalizeChartConfig(raw: unknown = {}): ChartConfig {
  const value = raw as Record<string, any>
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('chart.parameters-invalid')
  if (value.macd !== undefined && (!value.macd || typeof value.macd !== 'object' || Array.isArray(value.macd))) throw new Error('chart.parameters-invalid')
  // Storage is untrusted. Pick known fields so extra persisted keys cannot leak
  // into the strict indicator engine contract.
  const macd = Object.fromEntries(Object.entries(DEFAULT_CHART_CONFIG.macd).map(([key, fallback]) => [key, Object.hasOwn(value.macd ?? {}, key) ? value.macd[key] : fallback])) as unknown as MacdParams
  if (![macd.fast, macd.slow, macd.signal].every(n => Number.isInteger(n) && n >= 1 && n <= 250)
    || macd.fast >= macd.slow || ![1, 2].includes(macd.histScale)) throw new Error('chart.parameters-invalid')
  // A setting saved before MA50/MA250 existed has no keys for them; those fall
  // back to their own defaults instead of being read as "hidden by the user".
  return {
    maVisible: Object.fromEntries(CHART_MA_PERIODS.map(n => [n, Object.hasOwn(value.maVisible ?? {}, n) ? value.maVisible[n] !== false : DEFAULT_MA_VISIBLE[n as keyof typeof DEFAULT_MA_VISIBLE]])),
    macd,
    difVisible: value.difVisible !== false,
    deaVisible: value.deaVisible !== false,
    kdjVisible: value.kdjVisible !== false,
  }
}
