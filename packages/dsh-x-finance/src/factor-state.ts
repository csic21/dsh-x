// Daily self-correction for the limit-up relay screen.
//
// The shipped model is fitted once and then frozen, so every factor keeps the
// centre and spread of its training sample while the market moves underneath
// it: a 20-day return of +25% is extreme in a quiet tape and ordinary in a hot
// one. Two years later the same z-score means something else. That is the drift
// this module removes, once per session, without refitting a single
// coefficient — the structure stays put, the measuring stick is what moves.
//
// Three quantities are corrected, all of them cheap and low-variance:
//   * centre and spread of every factor, as an exponentially weighted
//     cross-section (half-life in sessions, not calendar days);
//   * the rank information coefficient of every factor against realised net
//     return, so the screen can report which factors still carry signal;
//   * a two-parameter logistic recalibration of the frozen model's logit, so
//     "18%" keeps meaning eighteen percent after the base rate drifts.
//   * the net edge of each streak and sentiment bucket, which is what lets the
//     evidence gate open and close by itself instead of reading a frozen table.
//
// Nothing here refits the model. A daily refit on roughly two hundred rows and
// twenty-one factors fits noise, and picking the best of many daily refits is a
// multiple-testing machine. Beliefs update every day; structure changes only
// through an evidence gate that lives outside this file.

export const FACTOR_STATE_VERSION = 2
export const FACTOR_STATE_FILE = 'factor-state.json'
export const FACTOR_STATE_MAX_BYTES = 256 * 1024
/** Sessions for the exponential weight to halve. 60 ≈ one quarter. */
export const FACTOR_HALF_LIFE = 60
/**
 * The state never replaces the frozen statistics outright: it is blended in
 * with `sessions / (sessions + FACTOR_BLEND_SESSIONS)`. One good week should
 * move the ruler a little, not take it over.
 */
export const FACTOR_BLEND_SESSIONS = 10
/** Pseudo-count pulling a bucket edge back toward its shipped prior. */
export const FACTOR_EDGE_PRIOR_WEIGHT = 30
/** A bucket's effective sample count stops growing here. */
export const FACTOR_EDGE_MAX_COUNT = 600
/** Standardised inputs are clipped at five deviations, exactly like the fit. */
export const FACTOR_CLIP = 5
/** A cross-section thinner than this cannot estimate a spread. */
export const FACTOR_MIN_ROWS = 8

export interface FactorCalibration {
  /** Slope on the frozen logit; 1 reproduces the shipped probability. */
  a: number
  /** Intercept on the frozen logit; 0 reproduces the shipped probability. */
  b: number
}

export interface FactorEdgeBucket {
  key: string
  /** Effective sample count after exponential decay, capped. */
  n: number
  /** Exponentially weighted net percent return of this bucket's trades. */
  edge: number
  /** Exponentially weighted variance around that edge. */
  variance: number
}

export interface FactorState {
  version: typeof FACTOR_STATE_VERSION
  /** Last session ingested, `YYYY-MM-DD`. */
  asOf: string
  halfLife: number
  /** Sessions of cross-section observed so far. */
  sessions: number
  features: string[]
  center: number[]
  spread: number[]
  /** Exponentially weighted rank IC against net return. */
  ic: number[]
  /** Exponentially weighted variance of that IC; ic/sqrt gives its stability. */
  icSpread: number[]
  calibration: FactorCalibration
  /** Bucket edges, by dimension; the gate reads these before the shipped table. */
  edges: { streak: FactorEdgeBucket[]; regime: FactorEdgeBucket[] }
}

export interface FactorObservation {
  /** Raw factor vector for one candidate. */
  vector: Record<string, number>
  /** Net percent return of the proposed trade, after cost. */
  netReturn: number
  /** 1 when the next session closed at its limit. */
  label: number
}

/** The frozen structure the state corrects, never replaces. */
export interface FactorCoefficients {
  intercept: number
  coef: number[]
}

export interface FactorBucket {
  key: string
  from: number
  to: number | null
}

export interface FactorBuckets {
  streak: FactorBucket[]
  regime: FactorBucket[]
}

export interface FactorModel extends FactorCoefficients {
  buckets?: FactorBuckets
}

export interface FactorSession {
  sessionDate: string
  rows: FactorObservation[]
}

const fail = (): never => { throw Object.assign(new Error('factor state unavailable'), { code: 'finance/factor-state-invalid' }) }
const CLOCK = /^\d{4}-\d{2}-\d{2}$/

function finite(value: unknown, min = -1e9, max = 1e9): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function exact(value: any, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail()
}

function averageRanks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value)
  const ranks = new Array<number>(values.length)
  for (let start = 0; start < order.length;) {
    let end = start + 1
    while (end < order.length && order[end]!.value === order[start]!.value) end++
    const rank = (start + end - 1) / 2
    for (let cursor = start; cursor < end; cursor++) ranks[order[cursor]!.index] = rank
    start = end
  }
  return ranks
}

function pearson(left: readonly number[], right: readonly number[]): number | null {
  const n = left.length
  if (n < 3 || n !== right.length) return null
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0
  for (let index = 0; index < n; index++) {
    const x = left[index]!, y = right[index]!
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y
  }
  const denominator = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))
  return denominator > 0 ? (n * sxy - sx * sy) / denominator : null
}

function spearman(left: readonly number[], right: readonly number[]): number | null {
  return left.length === right.length && left.length >= 3
    ? pearson(averageRanks(left), averageRanks(right))
    : null
}

function meanOf(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function deviationOf(values: readonly number[]): number {
  if (values.length < 2) return 0
  const mean = meanOf(values)
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/**
 * The weight a new session receives. The first sessions behave like a plain
 * running average, then the weight decays to the half-life weight so a single
 * violent session cannot own the estimate.
 */
export function factorAlpha(sessions: number, halfLife: number): number {
  const decay = 1 - Math.pow(2, -1 / Math.max(1, halfLife))
  return Math.max(1 / (sessions + 1), decay)
}

/**
 * How much of the daily state may be used, from 0 (frozen only) to 1 (fully
 * daily). A hard "20 sessions before it counts" switch left the screen frozen
 * for a month; this ramps instead, so the first week already nudges the ruler.
 */
export function factorWeight(state: FactorState | null | undefined, features: readonly string[]): number {
  if (!state) return 0
  if (state.features.length !== features.length) return 0
  if (state.features.some((name, index) => name !== features[index])) return 0
  if (!(state.sessions > 0)) return 0
  return Math.min(1, state.sessions / (state.sessions + FACTOR_BLEND_SESSIONS))
}

export function emptyFactorState(features: readonly string[], asOf = '1970-01-01'): FactorState {
  return {
    version: FACTOR_STATE_VERSION,
    asOf,
    halfLife: FACTOR_HALF_LIFE,
    sessions: 0,
    features: [...features],
    center: new Array(features.length).fill(0),
    spread: new Array(features.length).fill(1),
    ic: new Array(features.length).fill(0),
    icSpread: new Array(features.length).fill(0),
    calibration: { a: 1, b: 0 },
    edges: { streak: [], regime: [] },
  }
}

function bucketOf(buckets: readonly FactorBucket[], value: number): FactorBucket | null {
  if (!Number.isFinite(value)) return null
  for (const bucket of buckets) {
    if (value >= bucket.from && (bucket.to === null || value <= bucket.to)) return bucket
  }
  return null
}

/**
 * Folds new sessions into the state. Sessions at or before `asOf` are ignored,
 * so replaying the same day twice is a no-op — the caller does not need to
 * deduplicate. A session with a thin cross-section advances nothing.
 */
export function updateFactorState(
  previous: FactorState | null,
  features: readonly string[],
  sessions: readonly FactorSession[],
  model?: FactorModel,
): FactorState {
  if (!features.length) fail()
  const state = previous ? cloneState(previous) : emptyFactorState(features)
  if (state.features.length !== features.length || state.features.some((name, index) => name !== features[index])) fail()
  const ordered = [...sessions].sort((left, right) => left.sessionDate.localeCompare(right.sessionDate))
  for (const session of ordered) {
    if (!CLOCK.test(session.sessionDate)) fail()
    if (session.sessionDate <= state.asOf) continue
    const rows = session.rows.filter(row => finite(row.netReturn) && row.vector)
    if (rows.length < FACTOR_MIN_ROWS) continue
    const alpha = factorAlpha(state.sessions, state.halfLife)
    const net = rows.map(row => row.netReturn)
    for (let index = 0; index < features.length; index++) {
      const name = features[index]!
      const pairs = rows
        .map(row => ({ value: row.vector[name], net: row.netReturn }))
        .filter(pair => finite(pair.value) && finite(pair.net))
      if (pairs.length < FACTOR_MIN_ROWS) continue
      const values = pairs.map(pair => pair.value as number)
      const dayMean = meanOf(values)
      const daySpread = Math.max(1e-6, deviationOf(values))
      state.center[index] = (1 - alpha) * state.center[index]! + alpha * dayMean
      state.spread[index] = Math.sqrt(
        (1 - alpha) * state.spread[index]! ** 2 + alpha * daySpread ** 2,
      )
      const ic = spearman(values, pairs.map(pair => pair.net))
      if (ic === null) continue
      const delta = ic - state.ic[index]!
      state.ic[index] = state.ic[index]! + alpha * delta
      state.icSpread[index] = (1 - alpha) * state.icSpread[index]! + alpha * delta * delta
    }
    if (model?.buckets) updateEdges(state, alpha, rows, model.buckets)
    updateCalibration(state, alpha, rows, features, model)
    state.sessions += 1
    state.asOf = session.sessionDate
  }
  return state
}

/**
 * Exponentially weighted net edge per bucket. A bucket with no trades this
 * session keeps its estimate but loses evidence, so a segment that stops
 * appearing also stops being trusted.
 */
function updateEdges(state: FactorState, alpha: number, rows: readonly FactorObservation[], buckets: FactorBuckets) {
  const dimensions: [keyof FactorState['edges'], FactorBucket[], (row: FactorObservation) => number][] = [
    ['streak', buckets.streak, row => row.vector.streak ?? Number.NaN],
    ['regime', buckets.regime, row => row.vector.hotShare ?? Number.NaN],
  ]
  for (const [dimension, spec, valueOf] of dimensions) {
    const groups = new Map<string, number[]>()
    for (const row of rows) {
      if (!finite(row.netReturn)) continue
      const bucket = bucketOf(spec, valueOf(row))
      if (!bucket) continue
      const list = groups.get(bucket.key) ?? []
      list.push(row.netReturn)
      groups.set(bucket.key, list)
    }
    const previous = new Map(state.edges[dimension].map(bucket => [bucket.key, bucket]))
    const next: FactorEdgeBucket[] = []
    for (const bucket of spec) {
      const values = groups.get(bucket.key)
      const existing = previous.get(bucket.key)
      const decayed = (existing?.n ?? 0) * (1 - alpha)
      if (!values) {
        if (existing && decayed >= 0.5) next.push({ ...existing, n: decayed })
        continue
      }
      const count = values.length
      const total = decayed + count
      const mean = meanOf(values)
      const edge = total > 0 ? ((existing?.edge ?? 0) * decayed + mean * count) / total : mean
      const second = ((existing ? existing.variance + existing.edge ** 2 : 0) * decayed
        + values.reduce((sum, value) => sum + value * value, 0)) / Math.max(1e-9, total)
      next.push({
        key: bucket.key,
        n: Math.min(FACTOR_EDGE_MAX_COUNT, total),
        edge,
        variance: Math.max(0, second - edge * edge),
      })
    }
    state.edges[dimension] = next.filter(bucket => bucket.n >= 0.5)
  }
}

/**
 * One averaged gradient step on (a, b). The learning rate is deliberately
 * small and the parameters are bounded: this is a correction to a fitted
 * probability, not a second model competing with it.
 *
 * The logit is recomputed with the centre and spread this session just
 * installed, so the correction always describes the same score the Host will
 * produce from this state.
 */
function updateCalibration(
  state: FactorState,
  alpha: number,
  rows: readonly FactorObservation[],
  features: readonly string[],
  model?: FactorCoefficients,
) {
  if (!model || model.coef.length !== features.length) return
  const usable = rows.filter(row => row.label === 0 || row.label === 1)
  if (usable.length < FACTOR_MIN_ROWS) return
  const rate = 0.5 * Math.min(0.2, alpha)
  let slope = 0, intercept = 0
  for (const row of usable) {
    let eta = model.intercept
    for (let index = 0; index < features.length; index++) {
      eta += (model.coef[index] ?? 0) * factorStandardise(state, index, row.vector[features[index]!] ?? state.center[index]!)
    }
    const bounded = Math.max(-12, Math.min(12, eta))
    const probability = 1 / (1 + Math.exp(-Math.max(-12, Math.min(12, state.calibration.a * bounded + state.calibration.b))))
    const error = probability - row.label
    slope += error * bounded
    intercept += error
  }
  state.calibration.a = Math.min(4, Math.max(0.25, state.calibration.a - rate * slope / usable.length))
  state.calibration.b = Math.min(2.5, Math.max(-2.5, state.calibration.b - rate * intercept / usable.length))
}

function cloneState(state: FactorState): FactorState {
  return {
    ...state,
    features: [...state.features],
    center: [...state.center],
    spread: [...state.spread],
    ic: [...state.ic],
    icSpread: [...state.icSpread],
    calibration: { ...state.calibration },
    edges: {
      streak: state.edges.streak.map(bucket => ({ ...bucket })),
      regime: state.edges.regime.map(bucket => ({ ...bucket })),
    },
  }
}

/** Standardised, clipped input for one factor, exactly as the fit defined it. */
export function factorStandardise(state: FactorState, index: number, value: number): number {
  const center = state.center[index] ?? 0
  const spread = state.spread[index] || 1
  return Math.max(-FACTOR_CLIP, Math.min(FACTOR_CLIP, (value - center) / spread))
}

/**
 * The bucket's edge pulled back toward its shipped prior. With no observations
 * the answer is exactly the prior; with many it is almost the live estimate.
 */
export function shrunkEdge(
  state: FactorState | null | undefined,
  dimension: keyof FactorState['edges'],
  key: string,
  prior: number,
): number {
  const bucket = state?.edges[dimension].find(entry => entry.key === key)
  if (!bucket || bucket.n <= 0) return prior
  return (bucket.edge * bucket.n + prior * FACTOR_EDGE_PRIOR_WEIGHT) / (bucket.n + FACTOR_EDGE_PRIOR_WEIGHT)
}

export function parseFactorState(value: unknown): FactorState {
  const version = (value as any)?.version
  const versioned = version === 1 || version === FACTOR_STATE_VERSION
  if (!versioned) fail()
  const keys = version === 1
    ? ['version', 'asOf', 'halfLife', 'sessions', 'features', 'center', 'spread', 'ic', 'icSpread', 'calibration']
    : ['version', 'asOf', 'halfLife', 'sessions', 'features', 'center', 'spread', 'ic', 'icSpread', 'calibration', 'edges']
  exact(value, keys)
  const raw = value as any
  if (typeof raw.asOf !== 'string' || !CLOCK.test(raw.asOf) || !Number.isFinite(Date.parse(raw.asOf))) fail()
  if (!finite(raw.halfLife, 5, 250) || !Number.isInteger(raw.sessions) || raw.sessions < 0 || raw.sessions > 20_000) fail()
  if (!Array.isArray(raw.features) || raw.features.length < 1 || raw.features.length > 64) fail()
  const seen = new Set<string>()
  for (const name of raw.features) {
    if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(name) || seen.has(name)) fail()
    seen.add(name)
  }
  const size = raw.features.length
  for (const list of [raw.center, raw.spread, raw.ic, raw.icSpread]) {
    if (!Array.isArray(list) || list.length !== size) fail()
  }
  for (let index = 0; index < size; index++) {
    if (!finite(raw.center[index]!, -1e6, 1e6)) fail()
    if (!finite(raw.spread[index]!, 1e-9, 1e6)) fail()
    if (!finite(raw.ic[index]!, -1, 1)) fail()
    if (!finite(raw.icSpread[index]!, 0, 1)) fail()
  }
  exact(raw.calibration, ['a', 'b'])
  if (!finite(raw.calibration.a, 0.25, 4) || !finite(raw.calibration.b, -2.5, 2.5)) fail()
  const edges = version === 1
    ? { streak: [], regime: [] }
    : { streak: readEdges(raw.edges?.streak), regime: readEdges(raw.edges?.regime) }
  return {
    version: FACTOR_STATE_VERSION,
    asOf: raw.asOf,
    halfLife: raw.halfLife,
    sessions: raw.sessions,
    features: [...raw.features],
    center: [...raw.center],
    spread: [...raw.spread],
    ic: [...raw.ic],
    icSpread: [...raw.icSpread],
    calibration: { a: raw.calibration.a, b: raw.calibration.b },
    edges,
  }
}

function readEdges(raw: any): FactorEdgeBucket[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > 32) fail()
  const seen = new Set<string>()
  return raw.map((entry: any) => {
    exact(entry, ['key', 'n', 'edge', 'variance'])
    if (typeof entry.key !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(entry.key) || seen.has(entry.key)) fail()
    seen.add(entry.key)
    if (!finite(entry.n, 0, 1e6) || !finite(entry.edge, -100, 100) || !finite(entry.variance, 0, 1e4)) fail()
    return { key: entry.key, n: entry.n, edge: entry.edge, variance: entry.variance }
  })
}
