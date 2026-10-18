// Formatting follows the official locale service at render time. No separate
// preference, browser-language lookup, or currency inference is introduced.
export function formatLocale(locale: any) {
  const tag = locale === 'zh' ? 'zh-CN' : locale
  try { return Intl.NumberFormat.supportedLocalesOf([tag])[0] ?? 'en' } catch { return 'en' }
}
export function createFormatters(getLocale: any) {
  const number = (value: any, options: any) => new Intl.NumberFormat(formatLocale(getLocale()), options).format(value)
  return {
    count: (value: any) => number(value, { maximumFractionDigits: 0 }),
    price: (value: any) => Number.isFinite(value) ? number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—',
    change: (value: any) => Number.isFinite(value) ? number(value / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' }) : '—',
    time(value: any, t: any) {
      const date = value ? new Date(value) : null
      if (!date || !Number.isFinite(date.getTime())) return t('time.missing')
      return t('time.shanghai', { time: new Intl.DateTimeFormat(formatLocale(getLocale()), { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(date) })
    },
  }
}
