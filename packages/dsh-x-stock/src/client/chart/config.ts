import type { MacdParams } from '../../indicators.ts'
export interface ChartConfig { maVisible: Record<number, boolean>; macd: MacdParams; difVisible: boolean; deaVisible: boolean; kdjVisible: boolean }
export const DEFAULT_CHART_CONFIG = Object.freeze({
  maVisible: Object.freeze({ 5: true, 10: true, 20: true }),
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
  return {
    maVisible: Object.fromEntries([5, 10, 20].map(n => [n, value.maVisible?.[n] !== false])),
    macd,
    difVisible: value.difVisible !== false,
    deaVisible: value.deaVisible !== false,
    kdjVisible: value.kdjVisible !== false,
  }
}
