// Formatting follows the official locale service at render time. No separate
// preference, browser-language lookup, or currency inference is introduced.
export function formatLocale(locale: any) {
  const tag = locale === 'zh' ? 'zh-CN' : locale
  try { return Intl.NumberFormat.supportedLocalesOf([tag])[0] ?? 'en' } catch { return 'en' }
}
/**
 * A quoted width is a fact from the source, not a formatting preference: an ETF
 * quoted at `4.027` must keep three decimals. Out-of-range or missing widths
 * fall back to two, and nothing is rounded to a narrower width.
 */
export const quoteDigits = (precision: any): number =>
  Number.isInteger(precision) && precision >= 0 && precision <= 6 ? precision : 2

export function createFormatters(getLocale: any) {
  const number = (value: any, options: any) => new Intl.NumberFormat(formatLocale(getLocale()), options).format(value)
  return {
    count: (value: any) => number(value, { maximumFractionDigits: 0 }),
    compact: (value: any) => Number.isFinite(value)
      ? new Intl.NumberFormat(formatLocale(getLocale()), { notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 2 }).format(value)
      : '—',
    price: (value: any) => Number.isFinite(value) ? number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—',
    /** Formats at the source's quoted width; never rounds to a narrower one. */
    priceAt: (value: any, precision?: any) => {
      if (!Number.isFinite(value)) return '—'
      const digits = quoteDigits(precision)
      return number(value, { minimumFractionDigits: digits, maximumFractionDigits: digits })
    },
    change: (value: any) => Number.isFinite(value) ? number(value / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' }) : '—',
    percent: (value: any) => Number.isFinite(value) ? number(value / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—',
    signed: (value: any) => Number.isFinite(value) ? number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' }) : '—',
    signedAt: (value: any, precision?: any) => {
      if (!Number.isFinite(value)) return '—'
      const digits = quoteDigits(precision)
      return number(value, { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: 'exceptZero' })
    },
    time(value: any, t: any) {
      const date = value ? new Date(value) : null
      if (!date || !Number.isFinite(date.getTime())) return t('time.missing')
      return t('time.shanghai', { time: new Intl.DateTimeFormat(formatLocale(getLocale()), { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(date) })
    },
    /**
     * A quote from another exchange is only meaningful in that exchange's own
     * local time. The zone comes from the reviewed instrument catalogue, never
     * from the browser locale, so a US index is not shown in Beijing time.
     */
    zoneTime(value: any, timeZone: any, t: any) {
      const date = value ? new Date(value) : null
      if (!date || !Number.isFinite(date.getTime())) return t('time.missing')
      try {
        return new Intl.DateTimeFormat(formatLocale(getLocale()), {
          timeZone: typeof timeZone === 'string' && timeZone ? timeZone : 'Asia/Shanghai',
          year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
          hourCycle: 'h23', timeZoneName: 'short',
        }).format(date)
      } catch {
        // An unsupported zone is not silently replaced with a guessed one.
        return t('time.missing')
      }
    },
  }
}
