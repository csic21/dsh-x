import test from 'node:test'
import assert from 'node:assert/strict'
import { createTencentMarketProvider } from '../src/market-provider.ts'
import { parseMarketRequest } from '../src/market.ts'
import { createMarketHandler } from '../src/market-rpc.ts'
import {
  ETF_HOLDINGS_MAX_ROWS, ETF_HOLDINGS_SOURCE, emptyEtfHoldings, isExchangeFund, parseEtfHoldingsScript, projectEtfHoldings,
} from '../src/holdings.ts'

const NOW = Date.parse('2026-10-27T08:00:00+08:00')

const row = (rank: number, code: string, name: string, weight: string, market = '1') =>
  `<tr><td>${rank}</td><td><a href='//quote.eastmoney.com/unify/r/${market}.${code}'>${code}</a></td><td class='tol'><a href='//quote.eastmoney.com/unify/r/${market}.${code}'>${name}</a></td><td class='tor'><span></span></td><td class='tor'><span></span></td><td class='xglj'>变动详情</td><td class='tor'>${weight}</td><td class='tor'>12.50</td><td class='tor'>1,234.50</td></tr>`

function section(label: string, date: string, rows: string) {
  return `<h4 class='t'><label>${label}股票投资明细</label><label>截止至：<font class='px12'>${date}</font></label></h4><table><tbody>${rows}</tbody></table>`
}

function script(html: string) {
  return `var apidata={ content:"${html}",arryear:[2026,2025],curyear:2026};`
}

test('only exchange-traded fund and LOF codes ask for a holdings book', () => {
  assert.equal(isExchangeFund('SH.510300'), true)
  assert.equal(isExchangeFund('SH.513100'), true)
  assert.equal(isExchangeFund('SH.588000'), true)
  assert.equal(isExchangeFund('SH.501001'), true)
  assert.equal(isExchangeFund('SZ.159915'), true)
  assert.equal(isExchangeFund('SZ.160706'), true)
  assert.equal(isExchangeFund('SH.600519'), false)
  assert.equal(isExchangeFund('SZ.000001'), false)
  assert.equal(isExchangeFund('SH.508000'), false)
  assert.equal(isExchangeFund('BJ.430047'), false)
})

test('the disclosure script keeps the newest top 10 and the newest full book', () => {
  const top = Array.from({ length: 10 }, (_, index) => row(index + 1, String(600000 + index), index === 0 ? '*贵州茅台' : `股票${index}`, '3.56%')).join('')
  const full = Array.from({ length: 30 }, (_, index) => row(index + 1, String(600100 + index), `成分${index}`, '1.20%')).join('')
  const qdii = `<tr><td>1</td><td class='toc'><a href='//quote.eastmoney.com/unify/r/105.NVDA' >NVDA</a></td><td class='toc'><a href='//quote.eastmoney.com/unify/r/105.NVDA'>英伟达</a></td><td class='toc'><span>--</span></td><td class='toc'><span>--</span></td><td class='xglj'>股吧</td><td class='toc'>7.55%</td><td class='toc'>96.98</td><td class='toc'>149,166.04</td></tr>`
  const html = [
    section('2026年3季度', '2026-09-30', top + row(99, '600519', '坏行', 'nope')),
    section('2026年2季度', '2026-06-30', full),
    section('2026年1季度', '2026-06-30', row(1, '600519', '日期不在该季', '1%')),
    section('2026年3季度', '2026-09-30', qdii),
  ].join('')
  const parsed = parseEtfHoldingsScript(script(html), 'SH.510300', NOW)
  assert.equal(parsed.applicable, true)
  assert.equal(parsed.source, ETF_HOLDINGS_SOURCE)
  assert.equal(parsed.latest?.reportDate, '2026-09-30')
  assert.equal(parsed.latest?.complete, false)
  assert.equal(parsed.latest?.holdings.length, 10)
  assert.equal(parsed.latest?.holdings[0]?.name, '贵州茅台')
  assert.equal(parsed.latest?.holdings[0]?.code, '600000')
  assert.equal(parsed.latest?.holdings[0]?.market, '1')
  assert.equal(parsed.latest?.holdings[0]?.weight, 3.56)
  assert.equal(parsed.latest?.holdings[0]?.marketValue, 1234.5)
  assert.equal(parsed.full?.reportDate, '2026-06-30')
  assert.equal(parsed.full?.holdings.length, 30)
  assert.equal(parsed.full?.complete, true)
  const overseas = parseEtfHoldingsScript(script(section('2026年3季度', '2026-09-30', qdii)), 'SH.513100', NOW)
  assert.equal(overseas.latest?.holdings[0]?.code, 'NVDA')
  assert.equal(overseas.latest?.holdings[0]?.market, '105')
  assert.equal(overseas.latest?.holdings[0]?.shares, 96.98)
  assert.equal(overseas.latest?.holdings[0]?.marketValue, 149166.04)
})

test('an empty disclosure is applicable but has no invented book', () => {
  const parsed = parseEtfHoldingsScript('var apidata={ content:"",arryear:[],curyear:2026};', 'SH.518880', NOW)
  assert.equal(parsed.applicable, true)
  assert.equal(parsed.latest, null)
  assert.equal(parsed.full, null)
  assert.equal(parseEtfHoldingsScript('not a script', 'SH.600519', NOW).applicable, false)
  assert.throws(() => parseEtfHoldingsScript('<html>404</html>', 'SH.510300', NOW), { code: 'finance/holdings-unavailable' })
})

test('a book longer than the cap is truncated instead of growing without bound', () => {
  const rows = Array.from({ length: ETF_HOLDINGS_MAX_ROWS + 5 }, (_, index) => row(index + 1, String(100000 + index).slice(0, 6), `名称${index}`, '0.10%')).join('')
  const parsed = parseEtfHoldingsScript(script(section('2026年2季度', '2026-06-30', rows)), 'SZ.159915', NOW)
  assert.equal(parsed.latest?.holdings.length, ETF_HOLDINGS_MAX_ROWS)
  assert.equal(parsed.latest?.truncated, true)
})

test('the request parser accepts only a symbol for holdings', () => {
  assert.deepEqual(parseMarketRequest({ kind: 'holdings', symbol: 'SH.510300' }), { kind: 'holdings', symbol: 'SH.510300' })
  for (const payload of [
    { kind: 'holdings' },
    { kind: 'holdings', symbol: 'AAPL' },
    { kind: 'holdings', symbol: 'SH.510300', extra: true },
  ]) assert.throws(() => parseMarketRequest(payload), { code: 'invalid-input' })
})

test('projection recomputes completeness and rejects a book that contradicts itself', () => {
  const period = (count: number, date: string) => ({
    label: date.startsWith('2026-09') ? '2026年3季度' : '2026年2季度',
    reportDate: date,
    complete: false,
    truncated: false,
    holdings: Array.from({ length: count }, (_, index) => ({
      code: String(600000 + index), name: `名称${index}`, market: '1', weight: 1, shares: 1, marketValue: 1,
    })),
  })
  const raw = {
    symbol: 'SH.510300', applicable: true, source: ETF_HOLDINGS_SOURCE, fetchedAt: 'nope',
    latest: period(10, '2026-09-30'), full: period(30, '2026-06-30'), extra: 'drop me',
  }
  const projected = projectEtfHoldings(raw, 'SH.510300', NOW)
  assert.equal(projected.latest?.complete, false)
  assert.equal(projected.full?.complete, true)
  assert.equal(projected.fetchedAt, new Date(NOW).toISOString())
  assert.equal('extra' in projected, false)
  assert.throws(() => projectEtfHoldings({ ...raw, full: period(10, '2026-09-30') }, 'SH.510300', NOW), { code: 'finance/holdings-unavailable' })
  assert.throws(() => projectEtfHoldings({ ...raw, symbol: 'SZ.159915' }, 'SH.510300', NOW), { code: 'finance/holdings-unavailable' })
  assert.deepEqual(projectEtfHoldings(emptyEtfHoldings('SH.600519', NOW), 'SH.600519', NOW).applicable, false)
})

test('a stock never reaches the fund host, and an ETF script is projected through the route', async () => {
  const calls: string[] = []
  const html = script(section('2026年3季度', '2026-09-30', row(1, '600519', '贵州茅台', '3.56%')))
  const fetchImpl = async (url: string) => {
    calls.push(String(url))
    return new Response(html, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
  const provider = createTencentMarketProvider({ fetchImpl: fetchImpl as any, now: () => NOW })
  const stock = await provider.holdings!('SH.600519')
  assert.equal(stock.applicable, false)
  assert.deepEqual(calls, [])
  const etf = await provider.holdings!('SH.510300')
  await provider.holdings!('SH.510300')
  assert.equal(calls.length, 1)
  assert.match(calls[0]!, /fundf10\.eastmoney\.com\/FundArchivesDatas\.aspx\?type=jjcc&code=510300&topline=400/)
  assert.equal(etf.latest?.holdings[0]?.name, '贵州茅台')

  const owner = { principal: { kind: 'owner' } }
  const handler = createMarketHandler({ provider, now: () => NOW })
  const answer: any = await handler('dsh-x-finance.market', { kind: 'holdings', symbol: 'SH.510300' }, undefined, owner)
  assert.equal(answer.ok, true)
  assert.equal(answer.value.holdings.latest.holdings[0].code, '600519')
  const stub: any = { name: 'stub', overview: async () => ({}), breadth: async () => ({}), board: async () => ({}), quotes: async () => [] }
  const without = createMarketHandler({ provider: stub, now: () => NOW })
  const missing: any = await without('dsh-x-finance.market', { kind: 'holdings', symbol: 'SH.510300' }, undefined, owner)
  assert.equal(missing.ok, false)
  assert.equal(missing.error.code, 'finance/holdings-unavailable')
})
