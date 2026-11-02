import React, { useEffect, useState } from 'react'
import { MARKET_ENDPOINT } from '../market.ts'
import { isExchangeFund } from '../holdings.ts'
import type { Fundamentals, FundamentalsValuation } from '../fundamentals.ts'

interface FundamentalsState {
  status: 'idle' | 'loading' | 'ready' | 'unconfigured' | 'error'
  value: Fundamentals | null
}

/**
 * One read per open symbol. A filing changes quarterly and the multiples move
 * with the price, so this does not poll: it refreshes when the symbol changes
 * or the reader retries, not on a timer.
 */
function useFundamentals(rpc: any, symbol: string): FundamentalsState & { retry: () => void } {
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<FundamentalsState>(() => ({
    status: isExchangeFund(symbol) ? 'idle' : 'loading',
    value: null,
  }))
  useEffect(() => {
    if (isExchangeFund(symbol)) {
      setState({ status: 'idle', value: null })
      return
    }
    let disposed = false
    const controller = new AbortController()
    setState({ status: 'loading', value: null })
    const run = async () => {
      try {
        if (!rpc?.call) throw new Error('finance/connection')
        const result = await rpc.call('/api', MARKET_ENDPOINT, { kind: 'fundamentals', symbol }, controller.signal)
        if (disposed || controller.signal.aborted) return
        if (!result?.ok) {
          setState({ status: 'error', value: null })
          return
        }
        if (result.value?.status === 'unconfigured') {
          setState({ status: 'unconfigured', value: null })
          return
        }
        const fundamentals = result.value?.fundamentals
        if (!fundamentals || fundamentals.symbol !== symbol) throw new Error('finance/invalid')
        setState({ status: 'ready', value: fundamentals })
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

/** A multiple is never a percent: two decimals, and a negative one is a loss. */
function multiple(value: number | null | undefined, t: any, format: any) {
  if (value === null || value === undefined) return '—'
  return value < 0 ? t('fundamentals.loss') : format.ratio(value)
}

function multipleTitle(value: number | null | undefined, format: any) {
  return value === null || value === undefined ? undefined : format.ratio(value)
}

function Valuation({ valuation, t, format }: { valuation: FundamentalsValuation, t: any, format: any }) {
  const cells = [
    { key: 'cap', label: t('fundamentals.cap'), value: valuation.totalMarketCap === null ? '—' : format.compact(valuation.totalMarketCap), title: valuation.totalMarketCap === null ? undefined : format.count(valuation.totalMarketCap) },
    { key: 'float-cap', label: t('fundamentals.float-cap'), value: valuation.floatMarketCap === null ? '—' : format.compact(valuation.floatMarketCap), title: valuation.floatMarketCap === null ? undefined : format.count(valuation.floatMarketCap) },
    { key: 'pe-static', label: t('fundamentals.pe-static'), value: multiple(valuation.peStatic, t, format), title: multipleTitle(valuation.peStatic, format) },
    { key: 'pe-ttm', label: t('fundamentals.pe-ttm'), value: multiple(valuation.peTtm, t, format), title: multipleTitle(valuation.peTtm, format) },
    { key: 'pe-dynamic', label: t('fundamentals.pe-dynamic'), value: multiple(valuation.peDynamic, t, format), title: multipleTitle(valuation.peDynamic, format) },
    // A negative P/B is negative book value, not a loss, so it keeps its sign.
    { key: 'pb', label: t('fundamentals.pb'), value: valuation.pb === null ? '—' : format.ratio(valuation.pb), title: multipleTitle(valuation.pb, format) },
  ]
  return <div className="dxs-fundamentals-block">
    <h4>{t('fundamentals.valuation')}</h4>
    <div className="dxs-fundamentals-grid">
      {cells.map(cell => <div className="dxs-fundamentals-cell" key={cell.key}>
        <span>{cell.label}</span>
        <strong title={cell.title}>{cell.value}</strong>
      </div>)}
    </div>
    <p className="dxs-muted">{t('fundamentals.valuation-note')}</p>
  </div>
}

function ReportTable({ fundamentals, t, format }: { fundamentals: Fundamentals, t: any, format: any }) {
  const periods = fundamentals.periods
  if (!periods.length) return <p className="dxs-muted">{t(fundamentals.partial ? 'fundamentals.reports-unavailable' : 'fundamentals.empty')}</p>
  return <div className="dxs-fundamentals-block">
    <div className="dxs-fundamentals-subhead">
      <h4>{t('fundamentals.reports')}</h4>
      <span className="dxs-muted">{t('fundamentals.cumulative')}</span>
    </div>
    <div className="dxs-fundamentals-scroll">
      <table>
        <caption className="dxs-sr-only">{t('fundamentals.reports')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('fundamentals.report')}</th>
            <th scope="col">{t('fundamentals.revenue')}</th>
            <th scope="col">{t('fundamentals.revenue-yoy')}</th>
            <th scope="col">{t('fundamentals.net-profit')}</th>
            <th scope="col">{t('fundamentals.net-profit-yoy')}</th>
            <th scope="col">{t('fundamentals.eps')}</th>
            <th scope="col">{t('fundamentals.roe')}</th>
            <th scope="col">{t('fundamentals.gross-margin')}</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((period, index) => <tr key={period.reportDate} className={index === 0 ? 'is-latest' : undefined}>
            <td>
              <span>{period.reportName}</span>
              <small>{period.noticeDate ? `${t('fundamentals.notice')} ${period.noticeDate}` : `${t('fundamentals.notice')} —`}</small>
            </td>
            <td title={period.revenue === null ? undefined : format.count(period.revenue)}>{format.compact(period.revenue)}</td>
            <td>{format.change(period.revenueYoY)}</td>
            <td title={period.netProfit === null ? undefined : format.count(period.netProfit)}>{format.compact(period.netProfit)}</td>
            <td>{format.change(period.netProfitYoY)}</td>
            <td>{format.ratio(period.eps)}</td>
            <td>{format.percent(period.roe)}</td>
            <td>{format.percent(period.grossMargin)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <p className="dxs-muted">{t('fundamentals.reports-note')}</p>
  </div>
}

/** An ETF's periodic disclosure is a holdings book, so this panel stays out of its detail page. */
export function FundamentalsPanel({ symbol, rpc, t, format }: { symbol: string, rpc: any, t: any, format: any }) {
  const state = useFundamentals(rpc, symbol)
  if (isExchangeFund(symbol)) return null
  const value = state.value
  const hasValuation = value ? Object.values(value.valuation).some(item => item !== null) : false
  return <section className="dxs-fundamentals" aria-label={t('detail.fundamentals')}>
    <header>
      <div>
        <h3>{t('detail.fundamentals')}</h3>
        {value ? <p className="dxs-muted">{value.source}</p> : null}
      </div>
    </header>
    {state.status === 'loading' ? <p role="status" className="dxs-muted">{t('fundamentals.loading')}</p> : null}
    {state.status === 'unconfigured' ? <p className="dxs-muted">{t('fundamentals.unconfigured')}</p> : null}
    {state.status === 'error' ? <p role="alert" className="dxs-error">{t('fundamentals.error')} <button type="button" onClick={state.retry}>{t('fundamentals.retry')}</button></p> : null}
    {state.status === 'ready' && value?.applicable ? <>
      {hasValuation ? <Valuation valuation={value.valuation} t={t} format={format} /> : null}
      <ReportTable fundamentals={value} t={t} format={format} />
      {value.partial ? <p role="status" className="dxs-muted">{t('fundamentals.partial')}</p> : null}
      <p className="dxs-muted dxs-fundamentals-disclaimer">{t('fundamentals.disclaimer')}</p>
    </> : null}
  </section>
}
