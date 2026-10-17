import React, { useState } from 'react'
import { normalizeAShare, MAX_PINS, quoteLabel } from '../watchlist.js'
import { addressFor } from './resource.js'
const price = value => Number.isFinite(value) ? value.toFixed(2) : '—'
const change = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '—'
const tone = value => value > 0 ? 'dxs-up' : value < 0 ? 'dxs-down' : ''
const time = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) + '（上海）' : '未提供'
function Status({ snapshot }) {
  if (snapshot.status === 'loading') return <span className="dxs-muted">获取中</span>
  if (snapshot.status === 'failed') return <span className="dxs-muted">{snapshot.failure?.message ?? '更新失败 · 旧报价'}</span>
  return <span className="dxs-muted">{quoteLabel(snapshot.value)}</span>
}
function StockChip({ pin, useResource, open }) {
  const snapshot = useResource(addressFor(pin.symbol)), quote = snapshot.value
  return <button className="dxs-chip" onClick={() => open(pin.symbol)} title={`${pin.symbol} · ${quoteLabel(quote)} · 点击查看详情`}>
    <strong>{pin.alias || quote?.name || pin.symbol}</strong><span>{price(quote?.price)}</span>
    {quote?.price != null ? <span className={tone(quote.changePercent)}>{change(quote.changePercent)}</span> : <Status snapshot={snapshot} />}
    {quote?.price != null && (snapshot.status === 'failed' || quoteLabel(quote).startsWith('旧')) ? <span className="dxs-muted">旧</span> : null}
  </button>
}
export function StockBar({ useWatchlist, useResource, collapse, open }) {
  const state = useWatchlist(value => value)
  if (!state.pins.length) return null
  return <section className="dxs dxs-bar" aria-label="固定股票">
    <button onClick={() => collapse(!state.collapsed)} aria-expanded={!state.collapsed} aria-label={state.collapsed ? '展开自选股票' : '收起自选股票'}>{state.collapsed ? '▸' : '▾'} 自选 {state.pins.length}</button>
    {!state.collapsed && <div className="dxs-strip" aria-label="按手动顺序排列的自选股票">
      {state.pins.length ? state.pins.map(pin => <StockChip key={pin.symbol} pin={pin} useResource={useResource} open={open} />) : <span className="dxs-muted">固定常看的 A 股，工作时一眼查看</span>}
    </div>}
    <button onClick={() => open(state.selectedSymbol)}>股票{state.pins.length ? '' : ' · 添加'}</button>
  </section>
}
export function StockIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4v16h16M7 15l4-5 4 3 5-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function AddStock({ add, count, ready }) {
  const [exchange, setExchange] = useState('SH'), [code, setCode] = useState(''), [alias, setAlias] = useState(''), [error, setError] = useState('')
  const submit = event => {
    event.preventDefault()
    try { add({ symbol: normalizeAShare(exchange, code), alias }); setCode(''); setAlias(''); setError('') }
    catch (failure) { setError(failure.message) }
  }
  return <form className="dxs-form" onSubmit={submit}>
    <h2>固定股票</h2>
    <label>交易所<select value={exchange} onChange={event => setExchange(event.target.value)}><option value="SH">上海 · SH</option><option value="SZ">深圳 · SZ</option><option value="BJ">北京 · BJ</option></select></label>
    <label>六位股票代码<input value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" maxLength={6} placeholder="600519" required pattern="[0-9]{6}" /></label>
    <label>显示别名（选填）<input value={alias} onChange={event => setAlias(event.target.value)} maxLength={24} placeholder="自己熟悉的名称" /></label>
    <button type="submit" disabled={!ready || count >= MAX_PINS}>添加到自选 · {count}/{MAX_PINS}</button>
    {error && <p role="alert" className="dxs-error">{error}</p>}
    <p className="dxs-muted">代码仅做格式校验；当前未验证证券名称或上市状态。清单仅保存在此浏览器，不跨设备同步。</p>
  </form>
}
function Detail({ pin, useResource }) {
  const snapshot = useResource(addressFor(pin.symbol)), quote = snapshot.value
  return <article aria-label={`${pin.symbol} 股票详情`}>
    <section className="dxs-section"><h2>{pin.alias || quote?.name || pin.symbol}</h2><p className="dxs-muted">{pin.symbol}{pin.alias ? ' · 自定义别名' : ''}</p>
      <div className="dxs-price">{price(quote?.price)} <span className={tone(quote?.changePercent)} style={{ fontSize: 18 }}>{change(quote?.changePercent)}</span></div>
      <p><Status snapshot={snapshot} /></p>
      <dl><dt>数据来源</dt><dd>{quote?.source || '尚未接入获授权的 A 股数据源'}</dd><dt>报价时间</dt><dd>{time(quote?.quotedAt)}</dd><dt>获取时间</dt><dd>{time(quote?.fetchedAt)}</dd></dl>
      <p className="dxs-muted">获取时间不代表报价时间。不会根据当前时钟猜测休市、节假日或停牌。</p>
    </section>
    <section className="dxs-section"><h2>走势与成交</h2><p>暂无历史行情</p><p className="dxs-muted">接入支持分时、K 线与成交量的数据源后展示。当前没有可验证的数据，不绘制示意走势。</p></section>
    <section className="dxs-section"><h2>基本面</h2><p>暂无已验证的财报与估值数据</p><p className="dxs-muted">接入后将标明报告期、披露日期及来源。</p></section>
    <section className="dxs-section"><h2>分析</h2><p>数据不足，暂不生成分析结论</p><p className="dxs-muted">需要可靠的行情、财务与公告依据；分析应区分事实、推断和风险。不提供交易执行。</p></section>
  </article>
}
export function StockPage({ useWatchlist, useResource, add, remove, move, select, back, retryScope }) {
  const state = useWatchlist(value => value)
  const pin = state.pins.find(item => item.symbol === state.selectedSymbol) ?? state.pins[0]
  return <main className="dxs dxs-page">
    <header className="dxs-heading"><div><h1>股票</h1><p className="dxs-muted">手动自选 · A 股详情与分析</p></div><button onClick={back}>返回对话</button></header>
    <div className="dxs-notice">行情未配置：先整理你的自选清单。当前没有接入获授权的 A 股行情，价格和涨跌幅不会显示为实时数据。</div>
    {state.placement === 'occupied' && <p role="status" className="dxs-notice">底部插槽已有其他插件占用，自选条已让出位置。你仍可在此管理和查看股票。</p>}
    {state.scopeStatus === 'loading' && <p role="status">正在确认此 profile 的自选存储…</p>}
    {state.scopeStatus === 'failed' && <button onClick={retryScope}>重试连接自选存储</button>}
    {state.storageError && <p role="alert" className="dxs-error">{state.storageError}</p>}
    <div className="dxs-layout"><aside aria-label="自选管理"><h2>我的自选</h2>
      {!state.pins.length && <p className="dxs-muted">还没有固定股票。添加一只开始。</p>}
      <ol className="dxs-list">{state.pins.map((item, index) => <li key={item.symbol}>
        <button className="dxs-select" aria-pressed={pin?.symbol === item.symbol} onClick={() => select(item.symbol)}><strong>{item.alias || item.symbol}</strong>{item.alias && <span className="dxs-muted"> · {item.symbol}</span>}</button>
        <div className="dxs-controls"><button disabled={index === 0} aria-label={`上移 ${item.symbol}`} onClick={() => move(item.symbol, -1)}>↑</button><button disabled={index === state.pins.length - 1} aria-label={`下移 ${item.symbol}`} onClick={() => move(item.symbol, 1)}>↓</button><button aria-label={`移除 ${item.symbol}`} onClick={() => remove(item.symbol)}>移除</button></div>
      </li>)}</ol><AddStock add={add} count={state.pins.length} ready={state.scopeStatus === 'ready'} /></aside>
      {pin ? <Detail key={pin.symbol} pin={pin} useResource={useResource} /> : <section className="dxs-section"><h2>选一只股票，看清它的情况</h2><p className="dxs-muted">这里将展示报价、走势、基本面和有依据的分析。底部自选条只负责工作时的快捷查看。</p></section>}
    </div>
  </main>
}
