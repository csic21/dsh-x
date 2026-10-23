import React, { useMemo } from 'react'
import { computeIndicators } from '../indicators.ts'
import { crossReplay, replaySummary } from '../quant.ts'
import { formatLocale } from './format.ts'

const RULES = [
  { id: 'kdj', fast: 'k', slow: 'd', label: 'quant.kdj' },
  { id: 'macd', fast: 'dif', slow: 'dea', label: 'quant.macd' },
] as const

/** Read-only close-to-close replay of the bars currently on screen. */
export function QuantReplay({ dataset, macd, t, locale }: any) {
  const percent = useMemo(() => new Intl.NumberFormat(formatLocale(locale || 'en'), {
    style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero',
  }), [locale])
  const rows = useMemo(() => {
    try {
      const indicators = computeIndicators(dataset.bars, { macd, historyAnchor: dataset.historyAnchor })
      return RULES.map(rule => {
        const points = dataset.bars.map((bar: any, index: number) => ({
          sessionDate: bar.sessionDate, close: bar.close,
          fast: indicators.rows[index]?.[rule.fast] ?? null, slow: indicators.rows[index]?.[rule.slow] ?? null,
        }))
        return { ...rule, summary: replaySummary(crossReplay(points)) }
      })
    } catch { return null }
  }, [dataset, macd])
  if (!rows) return <section className="dxs-quant"><p role="alert">{t('quant.unavailable')}</p></section>
  return <section className="dxs-quant" aria-label={t('quant.title')}>
    <h3>{t('quant.title')}</h3>
    <p className="dxs-muted">{t('quant.notice', { interval: t(`chart.interval.${dataset.interval ?? '1d'}`) })}</p>
    <div className="dxs-quant-grid">{rows.map(row => <article key={row.id}>
      <h4>{t(row.label)}</h4>
      <p>{t('quant.latest', { state: t(`quant.state.${row.summary.latest}`) })}</p>
      {row.summary.samples
        ? <p>{t('quant.samples', { count: String(row.summary.samples), wins: String(row.summary.wins), average: percent.format(row.summary.average ?? 0) })}</p>
        : <p>{t('quant.none')}</p>}
      {row.summary.open ? <p className="dxs-muted">{t('quant.open')}</p> : null}
    </article>)}</div>
  </section>
}
