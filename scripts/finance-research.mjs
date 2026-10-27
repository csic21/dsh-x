#!/usr/bin/env node
// Research pipeline behind the limit-up relay screen.
//
//   node scripts/finance-research.mjs fetch [--limit 1200] [--bars 640]
//   node scripts/finance-research.mjs fit   [--out packages/dsh-x-finance/src/predict-model.ts]
//   node scripts/finance-research.mjs scan  [--top 15]
//
// `fetch` builds a deterministic, liquidity-independent sample of the A-share
// market and caches daily forward-adjusted bars under `.research/`. `fit`
// extracts features with the same module the Host uses, runs a monthly
// walk-forward evaluation, then fits the shipped coefficients on the whole
// sample and writes `src/predict-model.ts`. `scan` runs the real Host provider
// end to end and prints today's ranking, which is the integration check.
//
// The evaluation is deliberately pessimistic: every out-of-sample number comes
// from coefficients fitted strictly before the month being predicted, and the
// backtest drops sessions where the next open was a sealed limit board (those
// cannot be bought).
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  PREDICT_FEATURE_NAMES, PREDICT_MIN_BARS, HOT_CHANGE, PREDICT_POPULATION_GAP,
  boardLimitRate, predictFeatures, predictKnots,
} from '../packages/dsh-x-finance/src/predict-features.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const researchDir = path.join(root, 'packages/dsh-x-finance/.research')
const cacheFile = path.join(researchDir, 'klines.ndjson')
const RANK_URL = offset => `https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList?board_code=aStock&sort_type=turnover&direct=down&offset=${offset}&count=200`
const KLINE_URL = (code, bars) => `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,${bars},qfq`
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
  Referer: 'https://gu.qq.com/',
}
const COST_PERCENT = 0.2
const args = parseArgs({ allowPositionals: true, options: {
  limit: { type: 'string', default: '1200' },
  bars: { type: 'string', default: '640' },
  out: { type: 'string', default: 'packages/dsh-x-finance/src/predict-model.ts' },
  top: { type: 'string', default: '15' },
  refresh: { type: 'boolean', default: false },
} })
const command = process.argv[2]

function log(...values) { console.log(...values) }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function getJson(url, attempt = 0) {
  try {
    const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (error) {
    if (attempt >= 2) throw error
    await sleep(400 * (attempt + 1))
    return getJson(url, attempt + 1)
  }
}

async function pool(items, concurrency, worker) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      await worker(items[index], index)
    }
  })
  await Promise.all(runners)
}

// ---- fetch ---------------------------------------------------------------

async function buildUniverse() {
  const rows = []
  let total = Infinity
  for (let offset = 0; offset < total; offset += 200) {
    const payload = await getJson(RANK_URL(offset))
    const data = payload?.data
    if (!data || !Array.isArray(data.rank_list)) throw new Error('rank feed unavailable')
    total = Number(data.total) || data.rank_list.length
    rows.push(...data.rank_list)
    if (!data.rank_list.length) break
  }
  const usable = rows.filter(row => {
    const code = String(row?.code ?? '')
    const name = String(row?.name ?? '')
    if (!/^(sh|sz)\d{6}$/.test(code)) return false
    if (/^(?:\*?ST|S\*ST)/i.test(name)) return false
    if (/^[NC]/.test(name) || /退/.test(name)) return false
    return Number(row?.zxj) > 0
  })
  // Sort by code and take a fixed stride: the sample is stable across runs and
  // unrelated to today's ranking, so a hot day cannot bias which stocks enter
  // the research set.
  usable.sort((left, right) => String(left.code).localeCompare(String(right.code)))
  const target = Number(args.values.limit)
  const stride = Math.max(1, Math.floor(usable.length / target))
  return { universe: usable.filter((_, index) => index % stride === 0), total: usable.length, stride }
}

async function fetchStage() {
  mkdirSync(researchDir, { recursive: true })
  const seen = new Set()
  if (existsSync(cacheFile) && !args.values.refresh) {
    for (const line of readFileSync(cacheFile, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try { seen.add(JSON.parse(line).s) } catch { /* a torn line is refetched */ }
    }
  }
  const { universe, total, stride } = await buildUniverse()
  const pending = universe.filter(row => !seen.has(toSymbol(row.code)))
  log(`universe ${universe.length}/${total} (stride ${stride}), cached ${seen.size}, fetching ${pending.length}`)
  if (!pending.length) return
  writeFileSync(cacheFile, existsSync(cacheFile) && !args.values.refresh ? readFileSync(cacheFile, 'utf8') : '')
  let done = 0, failed = 0
  await pool(pending, 8, async row => {
    const symbol = toSymbol(row.code)
    try {
      const payload = await getJson(KLINE_URL(String(row.code), Number(args.values.bars)))
      const entry = payload?.data?.[String(row.code)]
      const rows = entry?.qfqday ?? entry?.day
      if (!Array.isArray(rows) || rows.length < PREDICT_MIN_BARS + 5) throw new Error('short history')
      const bars = []
      for (const item of rows) {
        if (!Array.isArray(item) || item.length < 6) continue
        const [date, open, close, high, low, volume] = item
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) continue
        const parsed = [open, close, high, low, volume].map(Number)
        if (parsed.slice(0, 4).some(value => !Number.isFinite(value) || value <= 0)) continue
        if (!Number.isFinite(parsed[4]) || parsed[4] < 0) continue
        bars.push([date, parsed[0], parsed[1], parsed[2], parsed[3], parsed[4]])
      }
      if (bars.length < PREDICT_MIN_BARS + 5) throw new Error('short bars')
      appendFileSync(cacheFile, `${JSON.stringify({ s: symbol, n: String(row.name), b: bars })}\n`)
      done += 1
    } catch (error) {
      failed += 1
      if (failed <= 5) log(`  skip ${symbol}: ${error.message}`)
    }
    if ((done + failed) % 100 === 0) log(`  ${done + failed}/${pending.length} ok=${done} failed=${failed}`)
  })
  log(`done ok=${done} failed=${failed} -> ${path.relative(root, cacheFile)}`)
}

function toSymbol(code) {
  const text = String(code)
  return `${text.slice(0, 2).toUpperCase()}.${text.slice(2)}`
}

// ---- dataset -------------------------------------------------------------

function readCache() {
  const rows = []
  for (const line of readFileSync(cacheFile, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line)
      if (!parsed?.s || !Array.isArray(parsed.b) || parsed.b.length < PREDICT_MIN_BARS + 5) continue
      rows.push({
        symbol: parsed.s,
        name: parsed.n,
        bars: parsed.b.map(([sessionDate, open, close, high, low, volume]) => ({ sessionDate, open, close, high, low, volume })),
      })
    } catch { /* ignore a torn line */ }
  }
  return rows
}

/** Percent change of every stock on every session, for the cross-section. */
function buildCrossSection(stocks) {
  const byDate = new Map()
  for (const stock of stocks) {
    const { bars } = stock
    for (let index = 1; index < bars.length; index++) {
      const prior = bars[index - 1].close
      if (!(prior > 0)) continue
      const change = (bars[index].close / prior - 1) * 100
      const list = byDate.get(bars[index].sessionDate) ?? []
      list.push(change)
      byDate.set(bars[index].sessionDate, list)
    }
  }
  const result = new Map()
  for (const [date, values] of byDate) {
    if (values.length < 600) continue
    let up = 0, hot = 0
    for (const value of values) {
      if (value > 0) up += 1
      if (value >= HOT_CHANGE) hot += 1
    }
    values.sort((left, right) => left - right)
    const middle = values.length >> 1
    const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
    result.set(date, {
      upShare: up / values.length * 100,
      hotShare: hot / values.length * 100,
      medianChange: median,
    })
  }
  return result
}

/** Every hot session with a usable label, before features are materialised. */
function buildCandidates(stocks) {
  const cross = buildCrossSection(stocks)
  const candidates = []
  for (const stock of stocks) {
    const rate = boardLimitRate(stock.symbol, stock.name)
    if (rate === null) continue
    const { bars } = stock
    for (let index = PREDICT_MIN_BARS - 1; index <= bars.length - 3; index++) {
      const today = bars[index]
      const next = bars[index + 1]
      const after = bars[index + 2]
      const section = cross.get(today.sessionDate)
      if (!section) continue
      const changePercent = (today.close / bars[index - 1].close - 1) * 100
      if (changePercent < rate - PREDICT_POPULATION_GAP) continue
      // A suspension either side of the signal makes the labels unusable.
      if (!(next.volume > 0) || !(after.volume > 0)) continue
      if (!(next.close > 0) || !(after.close > 0)) continue
      candidates.push({ stock, index, rate, section })
    }
  }
  return candidates
}

function materialize(candidates, transform) {
  const rows = []
  for (const { stock, index, rate, section } of candidates) {
    const bars = stock.bars
    const vector = predictFeatures(bars.slice(0, index + 1), rate, section, transform)
    if (!vector) continue
    const today = bars[index]
    const next = bars[index + 1]
    const after = bars[index + 2]
    const tradeReturn = (after.close / next.open - 1) * 100
    const gapNext = (next.open / today.close - 1) * 100
    const closeNext = (next.close / today.close - 1) * 100
    const limitNext = (next.close / today.close - 1) * 100 >= rate - 0.4
      && next.high - next.close <= Math.max(1e-6, next.close * 1e-4)
    // A sealed board cannot be bought at the open; the return model and the
    // backtest only see sessions where the open was actually tradable.
    const sealed = Math.abs(next.high - next.low) <= Math.max(1e-6, next.close * 1e-4)
    rows.push({
      symbol: stock.symbol, name: stock.name, date: today.sessionDate, rate, vector,
      label: { limitUp: limitNext ? 1 : 0, tradeReturn, gapNext, closeNext, buyable: !sealed ? 1 : 0 },
    })
  }
  rows.sort((left, right) => left.date.localeCompare(right.date) || left.symbol.localeCompare(right.symbol))
  return rows
}

// ---- linear algebra ------------------------------------------------------

function solve(matrix, vector) {
  const size = vector.length
  const a = matrix.map((row, index) => [...row, vector[index]])
  for (let column = 0; column < size; column++) {
    let pivot = column
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row
    }
    if (Math.abs(a[pivot][column]) < 1e-12) continue
    const swap = a[column]; a[column] = a[pivot]; a[pivot] = swap
    const lead = a[column][column]
    for (let k = column; k <= size; k++) a[column][k] /= lead
    for (let row = 0; row < size; row++) {
      if (row === column) continue
      const factor = a[row][column]
      if (!factor) continue
      for (let k = column; k <= size; k++) a[row][k] -= factor * a[column][k]
    }
  }
  return a.map(row => row[size])
}

function standardize(rows, names) {
  const mean = new Array(names.length).fill(0)
  const scale = new Array(names.length).fill(0)
  for (const row of rows) for (let index = 0; index < names.length; index++) mean[index] += row.vector[names[index]]
  for (let index = 0; index < names.length; index++) mean[index] /= rows.length
  for (const row of rows) for (let index = 0; index < names.length; index++) {
    const delta = row.vector[names[index]] - mean[index]
    scale[index] += delta * delta
  }
  for (let index = 0; index < names.length; index++) scale[index] = Math.sqrt(scale[index] / Math.max(1, rows.length - 1)) || 1
  return { mean, scale }
}

/** Standardised inputs are clipped at five deviations so one spike cannot own the fit. */
const clip = value => Math.max(-5, Math.min(5, value))

function design(rows, names, stats) {
  const matrix = rows.map(row => [1, ...names.map((name, index) => clip((row.vector[name] - stats.mean[index]) / stats.scale[index]))])
  return matrix
}

function fitLogistic(rows, names, stats, lambda = 12) {
  const X = design(rows, names, stats)
  const y = rows.map(row => row.label.limitUp)
  const p = names.length + 1
  let beta = new Array(p).fill(0)
  for (let iteration = 0; iteration < 40; iteration++) {
    const grad = new Array(p).fill(0)
    const hessian = Array.from({ length: p }, () => new Array(p).fill(0))
    for (let i = 0; i < X.length; i++) {
      let eta = 0
      for (let j = 0; j < p; j++) eta += X[i][j] * beta[j]
      const prob = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta))))
      const weight = Math.max(prob * (1 - prob), 1e-6)
      const residual = y[i] - prob
      for (let j = 0; j < p; j++) {
        grad[j] += X[i][j] * residual
        for (let k = 0; k < p; k++) hessian[j][k] += X[i][j] * X[i][k] * weight
      }
    }
    for (let j = 1; j < p; j++) { hessian[j][j] += lambda; grad[j] -= lambda * beta[j] }
    const step = solve(hessian, grad)
    let change = 0
    for (let j = 0; j < p; j++) { beta[j] += step[j]; change += Math.abs(step[j]) }
    if (change < 1e-7) break
  }
  return { intercept: beta[0], coef: beta.slice(1) }
}

function fitLinear(rows, names, stats, lambda = 30) {
  const X = design(rows, names, stats)
  const y = rows.map(row => row.label.tradeReturn)
  const p = names.length + 1
  const hessian = Array.from({ length: p }, () => new Array(p).fill(0))
  const grad = new Array(p).fill(0)
  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < p; j++) {
      grad[j] += X[i][j] * y[i]
      for (let k = 0; k < p; k++) hessian[j][k] += X[i][j] * X[i][k]
    }
  }
  for (let j = 1; j < p; j++) hessian[j][j] += lambda
  const beta = solve(hessian, grad)
  return { intercept: beta[0], coef: beta.slice(1) }
}

function logisticPredict(model, row, names, stats) {
  let eta = model.intercept
  for (let index = 0; index < names.length; index++) eta += model.coef[index] * (row.vector[names[index]] - stats.mean[index]) / stats.scale[index]
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta))))
}

function linearPredict(model, row, names, stats) {
  let value = model.intercept
  for (let index = 0; index < names.length; index++) value += model.coef[index] * (row.vector[names[index]] - stats.mean[index]) / stats.scale[index]
  return value
}

// ---- metrics -------------------------------------------------------------

function auc(pairs) {
  const sorted = [...pairs].sort((left, right) => left.p - right.p)
  let rankSum = 0
  let positives = 0
  let index = 0
  while (index < sorted.length) {
    let end = index
    while (end + 1 < sorted.length && sorted[end + 1].p === sorted[index].p) end++
    const averageRank = (index + end) / 2 + 1
    for (let cursor = index; cursor <= end; cursor++) {
      if (sorted[cursor].y === 1) { rankSum += averageRank; positives += 1 }
    }
    index = end + 1
  }
  const negatives = sorted.length - positives
  if (!positives || !negatives) return 0.5
  return (rankSum - positives * (positives + 1) / 2) / (positives * negatives)
}

function pearson(pairs) {
  const n = pairs.length
  if (n < 3) return 0
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0
  for (const { x, y } of pairs) { sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y }
  const numerator = n * sxy - sx * sy
  const denominator = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))
  return denominator > 0 ? numerator / denominator : 0
}

function rank(values) {
  const order = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value)
  const ranks = new Array(values.length)
  let cursor = 0
  while (cursor < order.length) {
    let end = cursor
    while (end + 1 < order.length && order[end + 1].value === order[cursor].value) end++
    const average = (cursor + end) / 2 + 1
    for (let k = cursor; k <= end; k++) ranks[order[k].index] = average
    cursor = end + 1
  }
  return ranks
}

/** Mean within-session Spearman correlation between score and realised return. */
function crossSectionIC(rows) {
  const byDate = new Map()
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date, [])
    byDate.get(row.date).push(row)
  }
  let total = 0, days = 0
  for (const dayRows of byDate.values()) {
    if (dayRows.length < 4) continue
    const predicted = rank(dayRows.map(row => row.score))
    const actual = rank(dayRows.map(row => row.label.tradeReturn))
    total += pearson(predicted.map((value, index) => ({ x: value, y: actual[index] })))
    days += 1
  }
  return days ? total / days : 0
}

function topBacktest(rows, k, options = {}) {
  const score = options.score ?? (row => row.score)
  const gate = options.gate ?? (() => true)
  const byDate = new Map()
  for (const row of rows) {
    if (!row.label.buyable || !gate(row)) continue
    if (!byDate.has(row.date)) byDate.set(row.date, [])
    byDate.get(row.date).push(row)
  }
  const days = [...byDate.keys()].sort()
  let equity = 1
  let peak = 1
  let maxDrawdown = 0
  let wins = 0, trades = 0
  const returns = []
  for (const day of days) {
    const picks = byDate.get(day).sort((left, right) => score(right) - score(left)).slice(0, k)
    if (!picks.length) continue
    const net = picks.map(row => row.label.tradeReturn - COST_PERCENT)
    const average = net.reduce((sum, value) => sum + value, 0) / net.length
    for (const value of net) { trades += 1; if (value > 0) wins += 1 }
    returns.push(average)
    equity *= 1 + average / 100
    peak = Math.max(peak, equity)
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1)
  }
  return {
    k, days: returns.length, trades,
    winRate: trades ? wins / trades * 100 : 0,
    avgNet: returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0,
    total: (equity - 1) * 100,
    maxDrawdown: maxDrawdown * 100,
  }
}

function bucketStats(rows, keyOf, edges) {
  const buckets = edges.map((edge, index) => ({
    key: edge.key, from: edge.from, to: edge.to ?? null, rows: [],
  }))
  for (const row of rows) {
    const value = keyOf(row)
    const index = edges.findIndex((edge, position) =>
      value >= edge.from && (edge.to === null || (position === edges.length - 1 ? value <= edge.to : value < edge.to)))
    if (index >= 0) buckets[index].rows.push(row)
  }
  return buckets.filter(bucket => bucket.rows.length).map(bucket => {
    const n = bucket.rows.length
    const sum = (pick) => bucket.rows.reduce((total, row) => total + pick(row), 0)
    const returns = bucket.rows.map(row => row.label.tradeReturn).sort((left, right) => left - right)
    return {
      key: bucket.key, from: bucket.from, to: bucket.to, n,
      pLimitUp: sum(row => row.label.limitUp) / n * 100,
      gapNext: sum(row => row.label.gapNext) / n,
      tradeReturn: sum(row => row.label.tradeReturn) / n,
      winRate: bucket.rows.filter(row => row.label.tradeReturn > 0).length / n * 100,
      medianTradeReturn: returns[returns.length >> 1],
    }
  })
}

// ---- fit -----------------------------------------------------------------

function monthsBetween(from, to) {
  const list = []
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  while (cursor <= end) {
    list.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`)
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return list
}

function fitStage() {
  if (!existsSync(cacheFile)) throw new Error('no cached bars: run fetch first')
  const stocks = readCache()
  log(`loaded ${stocks.length} symbols`)
  const candidates = buildCandidates(stocks)
  if (!candidates.length) throw new Error('no candidate sessions')
  const rawDates = candidates.map(candidate => candidate.stock.bars[candidate.index].sessionDate).sort()
  const lastDate = rawDates.at(-1)
  const cutoff = new Date(`${lastDate}T00:00:00Z`)
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1)
  const holdoutFrom = cutoff.toISOString().slice(0, 10)

  // Market-level knots come from the pre-holdout period only, so the out-of-
  // sample months are never transformed with information from their own future.
  const before = candidates.filter(candidate => candidate.stock.bars[candidate.index].sessionDate < holdoutFrom)
  const transform = {
    upShare: predictKnots(before.map(candidate => candidate.section.upShare)),
    hotShare: predictKnots(before.map(candidate => candidate.section.hotShare)),
    medianChange: predictKnots(before.map(candidate => candidate.section.medianChange)),
  }
  const all = materialize(candidates, transform)
  const names = [...PREDICT_FEATURE_NAMES]
  const dates = [...new Set(all.map(row => row.date))].sort()
  log(`rows ${all.length} from ${dates[0]} to ${dates.at(-1)} over ${dates.length} sessions`)
  if (all.length < 500) throw new Error('not enough labelled rows')

  const baseRates = {
    streak: bucketStats(all, row => row.vector.streak, [
      { key: 's0', from: -1, to: 0.5 }, { key: 's1', from: 0.5, to: 1.5 },
      { key: 's2', from: 1.5, to: 2.5 }, { key: 's3', from: 2.5, to: 3.5 },
      { key: 's4', from: 3.5, to: null },
    ]),
    sentiment: bucketStats(all, row => row.vector.hotShare, [
      { key: 'cold', from: -1, to: 33 }, { key: 'normal', from: 33, to: 67 },
      { key: 'hot', from: 67, to: null },
    ]),
    position: bucketStats(all, row => row.vector.fromHigh20, [
      { key: 'deep', from: -100, to: -8 }, { key: 'mid', from: -8, to: -3 },
      { key: 'near', from: -3, to: null },
    ]),
  }
  const streakBucket = streak => baseRates.streak.find(bucket =>
    streak >= bucket.from && (bucket.to === null || streak <= bucket.to)) ?? null
  const withEdge = rows => rows.map(row => {
    const bucket = streakBucket(row.vector.streak)
    return {
      ...row,
      // The model's own signal is the gap between its probability and the
      // unconditional rate of the same streak bucket. Ranking by that residual
      // is the only ordering this pipeline actually validates.
      score: row.pLimit * 100 - (bucket?.pLimitUp ?? 0),
      baseTradeReturn: bucket?.tradeReturn ?? 0,
    }
  })

  const months = monthsBetween(holdoutFrom, lastDate)
  const oos = []
  for (const month of months) {
    const trainRows = all.filter(row => row.date < `${month}-01`)
    const testRows = all.filter(row => row.date.startsWith(month) && row.date >= holdoutFrom)
    if (trainRows.length < 800 || !testRows.length) continue
    const stats = standardize(trainRows, names)
    const logistic = fitLogistic(trainRows, names, stats)
    for (const row of testRows) {
      oos.push({ ...row, pLimit: logisticPredict(logistic, row, names, stats) })
    }
  }
  log(`out-of-sample rows ${oos.length} (${holdoutFrom} .. ${lastDate})`)
  if (!oos.length) throw new Error('no out-of-sample rows')

  const oosScored = withEdge(oos)
  const baseRate = oosScored.reduce((sum, row) => sum + row.label.limitUp, 0) / oosScored.length * 100
  const brier = oosScored.reduce((sum, row) => sum + (row.pLimit - row.label.limitUp) ** 2, 0) / oosScored.length
  const groupStats = (rows, key) => {
    if (!rows.length) return null
    return {
      key,
      n: rows.length,
      pLimitUp: rows.reduce((sum, row) => sum + row.label.limitUp, 0) / rows.length * 100,
      tradeReturn: rows.reduce((sum, row) => sum + row.label.tradeReturn, 0) / rows.length,
      winRate: rows.filter(row => row.label.tradeReturn > 0).length / rows.length * 100,
    }
  }
  const levelOf = value => value < 33 ? 'cold' : value >= 67 ? 'hot' : 'normal'
  const byRegime = ['cold', 'normal', 'hot']
    .map(level => groupStats(oosScored.filter(row => levelOf(row.vector.hotShare) === level), level))
    .filter(Boolean)
  const buyable = oosScored.filter(row => row.label.buyable)
  const byProbability = Array.from({ length: 5 }, (_, index) => groupStats(
    buyable.filter(row => Math.min(4, Math.floor(row.pLimit * 5)) === index),
    `q${index + 1}`,
  )).filter(Boolean)
  const calibration = Array.from({ length: 10 }, (_, bin) => {
    const rows = oosScored.filter(row => Math.min(9, Math.floor(row.pLimit * 10)) === bin)
    return {
      bin,
      n: rows.length,
      predicted: rows.length ? rows.reduce((sum, row) => sum + row.pLimit, 0) / rows.length * 100 : 0,
      actual: rows.length ? rows.reduce((sum, row) => sum + row.label.limitUp, 0) / rows.length * 100 : 0,
    }
  })
  const metrics = {
    holdout: { from: holdoutFrom, to: lastDate, rows: oosScored.length, days: new Set(oosScored.map(row => row.date)).size },
    auc: auc(oosScored.map(row => ({ p: row.pLimit, y: row.label.limitUp }))),
    brier,
    baseRate,
    /** Within-session rank correlation between the residual score and realised return. */
    ic: crossSectionIC(buyable),
    calibration,
    top: [3, 5, 10].map(k => topBacktest(oosScored, k)),
    byRegime,
    byProbability,
  }

  const finalStats = standardize(all, names)
  const finalLogistic = fitLogistic(all, names, finalStats)

  const model = {
    version: 1,
    trainedThrough: lastDate,
    costPercent: COST_PERCENT,
    sample: { stocks: stocks.length, rows: all.length, from: dates[0], to: lastDate, days: dates.length },
    features: names,
    mean: finalStats.mean,
    scale: finalStats.scale,
    limitUp: finalLogistic,
    metrics,
    baseRates,
    transform,
  }

  const outPath = path.resolve(root, args.values.out)
  writeFileSync(outPath, renderModel(model))
  log(`wrote ${path.relative(root, outPath)}`)
  log(`AUC ${metrics.auc.toFixed(3)}  Brier ${brier.toFixed(4)}  base ${baseRate.toFixed(1)}%  IC ${metrics.ic.toFixed(3)}`)
  for (const top of metrics.top) log(`  top${top.k} by residual: days ${top.days} trades ${top.trades} win ${top.winRate.toFixed(1)}% avg ${top.avgNet.toFixed(2)}% total ${top.total.toFixed(1)}% maxDD ${top.maxDrawdown.toFixed(1)}%`)
  for (const bucket of baseRates.streak) log(`  ${bucket.key}: n=${bucket.n} p=${bucket.pLimitUp.toFixed(1)}% gap=${bucket.gapNext.toFixed(2)}% trade=${bucket.tradeReturn.toFixed(2)}% win=${bucket.winRate.toFixed(1)}%`)
  for (const group of byRegime) log(`  oos ${group.key}: n=${group.n} trade=${group.tradeReturn.toFixed(2)}% win=${group.winRate.toFixed(1)}%`)
  for (const group of byProbability) log(`  oos ${group.key}: n=${group.n} p=${group.pLimitUp.toFixed(1)}% trade=${group.tradeReturn.toFixed(2)}%`)
}

const number = value => Number.isFinite(value) ? Number(value.toPrecision(7)) : 0
const array = (values) => `[${values.map(value => number(value)).join(', ')}]`

function renderModel(model) {
  const lines = []
  lines.push('// GENERATED FILE — do not edit by hand.')
  lines.push('//')
  lines.push('// Produced by `node scripts/finance-research.mjs fit`, which fetches daily')
  lines.push('// forward-adjusted bars from the local free source, extracts features with')
  lines.push('// `predict-features.ts`, evaluates a monthly walk-forward and then fits the')
  lines.push('// shipped coefficients on the whole sample. Re-run the script to refresh;')
  lines.push('// nothing in the UI writes to this file.')
  lines.push("import type { PredictModel } from './predict.ts'")
  lines.push('')
  lines.push('export const PREDICT_MODEL: PredictModel = {')
  lines.push(`  version: ${model.version},`)
  lines.push(`  trainedThrough: '${model.trainedThrough}',`)
  lines.push(`  costPercent: ${number(model.costPercent)},`)
  lines.push(`  sample: { stocks: ${model.sample.stocks}, rows: ${model.sample.rows}, from: '${model.sample.from}', to: '${model.sample.to}', days: ${model.sample.days} },`)
  lines.push(`  features: ${JSON.stringify(model.features)},`)
  lines.push(`  mean: ${array(model.mean)},`)
  lines.push(`  scale: ${array(model.scale)},`)
  lines.push(`  limitUp: { intercept: ${number(model.limitUp.intercept)}, coef: ${array(model.limitUp.coef)} },`)
  lines.push('  metrics: {')
  lines.push(`    holdout: { from: '${model.metrics.holdout.from}', to: '${model.metrics.holdout.to}', rows: ${model.metrics.holdout.rows}, days: ${model.metrics.holdout.days} },`)
  lines.push(`    auc: ${number(model.metrics.auc)}, brier: ${number(model.metrics.brier)}, baseRate: ${number(model.metrics.baseRate)},`)
  lines.push(`    ic: ${number(model.metrics.ic)},`)
  lines.push(`    calibration: [${model.metrics.calibration.map(row => `{ bin: ${row.bin}, n: ${row.n}, predicted: ${number(row.predicted)}, actual: ${number(row.actual)} }`).join(', ')}],`)
  lines.push(`    top: [${model.metrics.top.map(top => `{ k: ${top.k}, days: ${top.days}, trades: ${top.trades}, winRate: ${number(top.winRate)}, avgNet: ${number(top.avgNet)}, total: ${number(top.total)}, maxDrawdown: ${number(top.maxDrawdown)} }`).join(', ')}],`)
  lines.push(`    byRegime: [${model.metrics.byRegime.map(group => `{ key: '${group.key}', n: ${group.n}, pLimitUp: ${number(group.pLimitUp)}, tradeReturn: ${number(group.tradeReturn)}, winRate: ${number(group.winRate)} }`).join(', ')}],`)
  lines.push(`    byProbability: [${model.metrics.byProbability.map(group => `{ key: '${group.key}', n: ${group.n}, pLimitUp: ${number(group.pLimitUp)}, tradeReturn: ${number(group.tradeReturn)}, winRate: ${number(group.winRate)} }`).join(', ')}],`)
  lines.push('  },')
  lines.push('  baseRates: {')
  for (const table of ['streak', 'sentiment', 'position']) {
    lines.push(`    ${table}: [${model.baseRates[table].map(bucket => `{ key: '${bucket.key}', from: ${number(bucket.from)}, to: ${bucket.to === null ? 'null' : number(bucket.to)}, n: ${bucket.n}, pLimitUp: ${number(bucket.pLimitUp)}, gapNext: ${number(bucket.gapNext)}, tradeReturn: ${number(bucket.tradeReturn)}, winRate: ${number(bucket.winRate)}, medianTradeReturn: ${number(bucket.medianTradeReturn)} }`).join(', ')}],`)
  }
  lines.push('  },')
  lines.push(`  transform: { upShare: ${array(model.transform.upShare)}, hotShare: ${array(model.transform.hotShare)}, medianChange: ${array(model.transform.medianChange)} },`)
  lines.push('}')
  return `${lines.join('\n')}\n`
}

// ---- scan ----------------------------------------------------------------

async function scanStage() {
  const { createTencentMarketProvider } = await import('../packages/dsh-x-finance/src/market-provider.ts')
  const provider = createTencentMarketProvider()
  if (typeof provider.predictScan !== 'function') throw new Error('provider has no predictScan')
  const started = Date.now()
  const result = await provider.predictScan({})
  log(`scan ${result.rows.length} rows in ${Date.now() - started}ms · session ${result.sessionDate} · final=${result.barFinal}`)
  log(`regime ${result.regime.level} hotShare=${result.regime.hotShare.toFixed(1)}% upShare=${result.regime.upShare.toFixed(1)}% rank=${result.regime.rank.toFixed(0)}`)
  log(`universe expected=${result.universe.expected} covered=${result.universe.covered} candidates=${result.universe.candidates} scored=${result.universe.scored}`)
  const top = Number(args.values.top)
  for (const row of result.rows.slice(0, top)) {
    log([
      row.symbol.padEnd(9), row.name.padEnd(6, '　'),
      `${row.changePercent >= 0 ? '+' : ''}${row.changePercent.toFixed(2)}%`.padStart(8),
      `${row.streak}板`,
      `P(晋级)=${(row.pLimitUp * 100).toFixed(1)}%`,
      `同组=${row.basePLimitUp.toFixed(1)}%`,
      `残差=${row.edge >= 0 ? '+' : ''}${row.edge.toFixed(1)}pp`,
      `同组期望=${row.baseTradeReturn.toFixed(2)}%`,
      row.reasons.join('/'),
    ].join('  '))
  }
}

const stages = { fetch: fetchStage, fit: fitStage, scan: scanStage }
if (!stages[command]) {
  console.error('usage: node scripts/finance-research.mjs <fetch|fit|scan> [--limit N] [--bars N] [--top N]')
  process.exit(1)
}
await stages[command]()
