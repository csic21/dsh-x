import React, { useEffect, useState } from 'react'
import { MARKET_ENDPOINT } from '../market.ts'
import { isExchangeFund } from '../holdings.ts'
import type { EtfHoldingPeriod, EtfHoldings } from '../holdings.ts'

interface HoldingsState {
  status: 'loading' | 'ready' | 'unconfigured' | 'error'
  value: EtfHoldings | null
}

/**
 * One read per open symbol. Reported holdings move with the quarterly filing,
 * so this does not poll; turning the shared source on remounts the detail page.
 */
function useEtfHoldings(rpc: any, symbol: string): HoldingsState & { retry: () => void } {
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<HoldingsState>({ status: 'loading', value: null })
  useEffect(() => {
    if (!isExchangeFund(symbol)) return
    let disposed = false
    const controller = new AbortController()
    setState({ status: 'loading', value: null })
    const run = async () => {
      try {
        if (!rpc?.call) throw new Error('finance/connection')
        const result = await rpc.call('/api', MARKET_ENDPOINT, { kind: 'holdings', symbol }, controller.signal)
        if (disposed || controller.signal.aborted) return
        if (!result?.ok) {
          setState({ status: 'error', value: null })
          return
        }
        if (result.value?.status === 'unconfigured') {
          setState({ status: 'unconfigured', value: null })
          return
        }
        const holdings = result.value?.holdings
        if (!holdings || holdings.symbol !== symbol) throw new Error('finance/invalid')
        setState({ status: 'ready', value: holdings })
      } catch {
        if (disposed || controller.signal.aborted) return
        setState({ status: 'error', value: null })
      }
    }
    void run()
    return () => { disposed = true; controller.abort() }
  }, [rpc, symbol, tick])
  return { ...state, retry: () => setTick(value => value + 1) }
}

function HoldingTable({ period, query, t, format }: { period: EtfHoldingPeriod, query: string, t: any, format: any }) {
  const needle = query.trim().toLowerCase()
  const rows = needle
    ? period.holdings.filter(row => row.name.toLowerCase().includes(needle) || row.code.toLowerCase().includes(needle))
    : period.holdings
  const max = rows.reduce((peak, row) => Math.max(peak, row.weight), 0)
  if (!rows.length) return <p className="dxs-muted">{t('detail.holdings.empty-filter')}</p>
  return <div className="dxs-holdings-scroll">
    <table>
      <caption className="dxs-sr-only">{t('detail.holdings')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('detail.holdings.name')}</th>
          <th scope="col">{t('detail.holdings.weight')}</th>
          <th scope="col">{t('detail.holdings.shares')}</th>
          <th scope="col">{t('detail.holdings.value')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => <tr key={`${row.market ?? ''}:${row.code}`}>
          <td><span>{row.name}</span><small>{row.code}</small></td>
          <td>
            <span className="dxs-holdings-weight">
              <span className="dxs-holdings-bar" aria-hidden="true"><span style={{ width: `${max > 0 ? (row.weight / max) * 100 : 0}%` }} /></span>
              <span>{format.percent(row.weight)}</span>
            </span>
          </td>
          <td>{format.ratio(row.shares)}</td>
          <td>{format.compact(row.marketValue == null ? null : row.marketValue * 10_000)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>
}

function PeriodBlock({ period, heading, t, format }: { period: EtfHoldingPeriod, heading: string, t: any, format: any }) {
  const [query, setQuery] = useState('')
  return <section className="dxs-holdings-block">
    <h4>{heading}</h4>
    {period.truncated ? <p className="dxs-muted">{t('detail.holdings.truncated', { count: format.count(period.holdings.length) })}</p> : null}
    {period.holdings.length > 12 ? <input className="dxs-holdings-filter" type="search" value={query} placeholder={t('detail.holdings.filter-placeholder')} aria-label={t('detail.holdings.filter')} onChange={event => setQuery(event.target.value)} /> : null}
    <HoldingTable period={period} query={query} t={t} format={format} />
  </section>
}

/** Stock details stay unchanged. An ETF or LOF shows the latest filing, plus the newest full book when the quarter only published the top 10. */
export function EtfHoldingsPanel({ symbol, rpc, t, format }: { symbol: string, rpc: any, t: any, format: any }) {
  const holdings = useEtfHoldings(rpc, symbol)
  if (!isExchangeFund(symbol)) return null
  const value = holdings.value
  const latest = value?.latest ?? null
  const full = value?.full && value.full.reportDate !== latest?.reportDate ? value.full : null
  return <section className="dxs-holdings" aria-label={t('detail.holdings')}>
    <header>
      <h3>{t('detail.holdings')}</h3>
      {value?.source ? <p className="dxs-muted">{value.source}</p> : null}
    </header>
    {holdings.status === 'loading' ? <p role="status" className="dxs-muted">{t('detail.holdings.loading')}</p> : null}
    {holdings.status === 'unconfigured' ? <p className="dxs-muted">{t('detail.holdings.unconfigured')}</p> : null}
    {holdings.status === 'error' ? <p role="alert" className="dxs-error">{t('detail.holdings.error')} <button type="button" onClick={holdings.retry}>{t('detail.holdings.retry')}</button></p> : null}
    {holdings.status === 'ready' && value?.applicable && !latest && !full ? <p className="dxs-muted">{t('detail.holdings.empty')}</p> : null}
    {latest ? <PeriodBlock
      period={latest}
      t={t}
      format={format}
      heading={t('detail.holdings.latest', {
        date: latest.reportDate,
        count: format.count(latest.holdings.length),
        coverage: t(latest.complete
          ? 'detail.holdings.coverage.all'
          : latest.holdings.length <= 15
            ? 'detail.holdings.coverage.top'
            : 'detail.holdings.coverage.partial'),
      })}
    /> : null}
    {full ? <PeriodBlock period={full} t={t} format={format} heading={t('detail.holdings.full', { date: full.reportDate, count: format.count(full.holdings.length) })} /> : null}
    {holdings.status === 'ready' && latest ? <p className="dxs-muted">{t('detail.holdings.notice')}</p> : null}
  </section>
}
