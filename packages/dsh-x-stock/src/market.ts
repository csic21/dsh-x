// Shared market-board contract. Everything here is plain data and pure
// functions so the Host, the browser bundle and tests can use the same
// identities, taxonomy and arithmetic. No prices are invented here.
export const MARKET_ENDPOINT = 'dsh-x-stock.market'
export const MARKET_PREFERENCE_ENDPOINT = 'dsh-x-stock.market-preference'
export const MARKET_SOURCE_NAME = '腾讯行情 (unofficial)'
export const MARKET_MAX_BOARD_STOCKS = 200
export const MARKET_MAX_SECTORS = 200
export const MARKET_MAX_STOCKS = 12_000
export const MARKET_MAX_PAGES = 60
export const MARKET_PAGE_SIZE = 200
export const MARKET_CACHE_TTL_MS = 5 * 60_000
export const MARKET_OVERVIEW_TTL_MS = 60_000
export const MARKET_BOARD_TTL_MS = 2 * 60_000

export interface MarketIndex {
  code: string
  name: string
  price: number
  change: number
  changePercent: number
  open: number | null
  high: number | null
  low: number | null
  previousClose: number | null
  amount: number | null
  quotedAt: string
}

export interface MarketTopStock {
  code: string
  name: string
  changePercent: number
}

export interface MarketSector {
  code: string
  name: string
  level: 1 | 2
  /** Level-1 industry code for a level-2 board, null for a level-1 board. */
  parent: string | null
  changePercent: number
  amount: number | null
  /** Total market capitalisation in CNY, when the source provides it. */
  marketCap: number | null
  topStock: MarketTopStock | null
  quotedAt: string | null
}

export interface MarketOverview {
  source: string
  fetchedAt: string
  quotedAt: string | null
  indices: MarketIndex[]
  sectors: MarketSector[]
}

export interface MarketStock {
  code: string
  name: string
  price: number
  changePercent: number
  /** Turnover in CNY. */
  amount: number
  /** Total market capitalisation in CNY, when the source provides it. */
  marketCap: number | null
  suspended: boolean
}

export interface MarketBucket {
  /** Inclusive lower bound in percent; null means -infinity. */
  from: number | null
  /** Exclusive upper bound in percent; null means +infinity. */
  to: number | null
  count: number
}

export interface MarketBreadth {
  source: string
  fetchedAt: string
  /** Expected number of A-share rows reported by the upstream first page. */
  expected: number
  /** Number of distinct valid rows used for the counts. */
  covered: number
  up: number
  down: number
  flat: number
  suspended: number
  /** covered / expected, clamped to 0..1. */
  coverage: number
  partial: boolean
  /** Total turnover in CNY for the covered rows. */
  amount: number
  distribution: MarketBucket[]
  topGainers: MarketStock[]
  topLosers: MarketStock[]
  topAmount: MarketStock[]
}

export interface BoardDetail {
  source: string
  fetchedAt: string
  code: string
  name: string
  changePercent: number | null
  amount: number | null
  marketCap: number | null
  total: number
  truncated: boolean
  stocks: MarketStock[]
}

export interface MarketUnconfigured {
  status: 'unconfigured'
  source: null
}

export type MarketOverviewResult = MarketUnconfigured | { status: 'ready'; overview: MarketOverview }
export type MarketBreadthResult = MarketUnconfigured | { status: 'ready'; breadth: MarketBreadth }
export type MarketBoardResult = MarketUnconfigured | { status: 'ready'; board: BoardDetail }
export type MarketResult = MarketOverviewResult | MarketBreadthResult | MarketBoardResult

export type MarketRequest =
  | { kind: 'overview' }
  | { kind: 'breadth' }
  | { kind: 'board'; board: string }

export interface MarketPreference {
  enabled: boolean
  forced: boolean
}

export type MarketPreferenceRequest =
  | { action: 'get' }
  | { action: 'set'; enabled: boolean }

export interface MarketProvider {
  name: string
  overview(): Promise<MarketOverview>
  breadth(): Promise<MarketBreadth>
  board(code: string): Promise<BoardDetail>
}

export function validateBoardCode(value: unknown): string {
  if (typeof value !== 'string' || !/^801\d{3}$/.test(value)) throw stockMarketError('invalid-board')
  return value
}

export function stockMarketError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code })
}

// Shenwan industry taxonomy, level 1. These are identities, not estimates.
// The source quotes each board under `pt01<code>`.
export const MARKET_LEVEL1 = [
  { code: '801010', name: '农林牧渔' },
  { code: '801030', name: '基础化工' },
  { code: '801040', name: '钢铁' },
  { code: '801050', name: '有色金属' },
  { code: '801080', name: '电子' },
  { code: '801880', name: '汽车' },
  { code: '801110', name: '家用电器' },
  { code: '801120', name: '食品饮料' },
  { code: '801130', name: '纺织服饰' },
  { code: '801140', name: '轻工制造' },
  { code: '801150', name: '医药生物' },
  { code: '801160', name: '公用事业' },
  { code: '801170', name: '交通运输' },
  { code: '801180', name: '房地产' },
  { code: '801200', name: '商贸零售' },
  { code: '801210', name: '社会服务' },
  { code: '801780', name: '银行' },
  { code: '801790', name: '非银金融' },
  { code: '801230', name: '综合' },
  { code: '801710', name: '建筑材料' },
  { code: '801720', name: '建筑装饰' },
  { code: '801730', name: '电力设备' },
  { code: '801890', name: '机械设备' },
  { code: '801740', name: '国防军工' },
  { code: '801750', name: '计算机' },
  { code: '801760', name: '传媒' },
  { code: '801770', name: '通信' },
  { code: '801950', name: '煤炭' },
  { code: '801960', name: '石油石化' },
  { code: '801970', name: '环保' },
  { code: '801980', name: '美容护理' },
] as const

export const MARKET_LEVEL1_CODES: readonly string[] = MARKET_LEVEL1.map(item => item.code)
const level1Names = new Map<string, string>(MARKET_LEVEL1.map(item => [item.code, item.name]))
export function level1Name(code: string): string | null {
  return level1Names.get(code) ?? null
}

// Level-2 board name -> level-1 board code. Names are the source's Shenwan
// labels (including the Ⅱ/Ⅲ suffix when present); unknown future labels fall
// back to a dedicated "other" bucket at render time.
export const MARKET_LEVEL2_PARENT: Readonly<Record<string, string>> = {
  // 农林牧渔
  '种植业': '801010', '渔业': '801010', '饲料': '801010', '农产品加工': '801010', '养殖业': '801010', '动物保健Ⅱ': '801010',
  // 基础化工
  '化学原料': '801030', '化学制品': '801030', '化学纤维': '801030', '塑料': '801030', '橡胶': '801030', '农化制品': '801030', '非金属材料Ⅱ': '801030',
  // 钢铁
  '普钢': '801040', '特钢Ⅱ': '801040', '冶钢原料': '801040',
  // 有色金属
  '工业金属': '801050', '贵金属': '801050', '小金属': '801050', '能源金属': '801050', '金属新材料': '801050',
  // 电子
  '半导体': '801080', '元件': '801080', '光学光电子': '801080', '消费电子': '801080', '电子化学品Ⅱ': '801080', '其他电子Ⅱ': '801080',
  // 汽车
  '乘用车': '801880', '商用车': '801880', '汽车零部件': '801880', '汽车服务': '801880', '摩托车及其他': '801880',
  // 家用电器
  '白色家电': '801110', '黑色家电': '801110', '小家电': '801110', '厨卫电器': '801110', '家电零部件Ⅱ': '801110', '照明设备Ⅱ': '801110',
  // 食品饮料
  '白酒Ⅱ': '801120', '非白酒': '801120', '饮料乳品': '801120', '休闲食品': '801120', '调味发酵品Ⅱ': '801120', '食品加工': '801120',
  // 纺织服饰
  '纺织制造': '801130', '服装家纺': '801130', '饰品': '801130',
  // 轻工制造
  '造纸': '801140', '包装印刷': '801140', '家居用品': '801140', '文娱用品': '801140',
  // 医药生物
  '化学制药': '801150', '中药Ⅱ': '801150', '生物制品': '801150', '医药商业': '801150', '医疗器械': '801150', '医疗服务': '801150',
  // 公用事业
  '电力': '801160', '燃气Ⅱ': '801160',
  // 交通运输
  '铁路公路': '801170', '物流': '801170', '航运港口': '801170', '航空机场': '801170',
  // 房地产
  '房地产开发': '801180', '房地产服务': '801180',
  // 商贸零售
  '一般零售': '801200', '专业连锁Ⅱ': '801200', '贸易Ⅱ': '801200', '互联网电商': '801200',
  // 社会服务
  '旅游及景区': '801210', '酒店餐饮': '801210', '教育': '801210', '专业服务': '801210',
  // 银行
  '国有大型银行Ⅱ': '801780', '股份制银行Ⅱ': '801780', '城商行Ⅱ': '801780', '农商行Ⅱ': '801780',
  // 非银金融
  '证券Ⅱ': '801790', '保险Ⅱ': '801790', '多元金融': '801790',
  // 综合
  '综合Ⅱ': '801230',
  // 建筑材料
  '水泥': '801710', '玻璃玻纤': '801710', '装修建材': '801710',
  // 建筑装饰
  '房屋建设Ⅱ': '801720', '装修装饰Ⅱ': '801720', '基础建设': '801720', '专业工程': '801720', '工程咨询服务Ⅱ': '801720',
  // 电力设备
  '电机Ⅱ': '801730', '电网设备': '801730', '风电设备': '801730', '光伏设备': '801730', '电池': '801730', '其他电源设备Ⅱ': '801730',
  // 机械设备
  '通用设备': '801890', '专用设备': '801890', '工程机械': '801890', '自动化设备': '801890', '轨交设备Ⅱ': '801890',
  // 国防军工
  '航天装备Ⅱ': '801740', '航空装备Ⅱ': '801740', '地面兵装Ⅱ': '801740', '航海装备Ⅱ': '801740', '军工电子Ⅱ': '801740',
  // 计算机
  '计算机设备': '801750', 'IT服务Ⅱ': '801750', '软件开发': '801750',
  // 传媒
  '出版': '801760', '电视广播Ⅱ': '801760', '影视院线': '801760', '数字媒体': '801760', '广告营销': '801760', '游戏Ⅱ': '801760',
  // 通信
  '通信设备': '801770', '通信服务': '801770',
  // 煤炭
  '煤炭开采': '801950', '焦炭Ⅱ': '801950',
  // 石油石化
  '炼化及贸易': '801960', '油服工程': '801960',
  // 环保
  '环境治理': '801970', '环保设备Ⅱ': '801970',
  // 美容护理
  '个护用品': '801980', '化妆品': '801980',
}

export function level2Parent(name: string): string | null {
  return MARKET_LEVEL2_PARENT[name] ?? null
}

export function normalizeMarketCode(code: string): string | null {
  if (typeof code !== 'string') return null
  const match = /^(sh|sz|bj)(\d{6})$/.exec(code.trim().toLowerCase())
  if (!match) return null
  return `${match[1].toUpperCase()}.${match[2]}`
}

export interface BreadthInput {
  up: number
  down: number
  flat: number
}

export interface SentimentFactor {
  key: 'index' | 'breadth' | 'sector' | 'momentum'
  score: number
  weight: number
}

export interface Sentiment {
  score: number
  label: 'extreme-fear' | 'fear' | 'neutral' | 'greed' | 'extreme-greed'
  factors: SentimentFactor[]
  partial: boolean
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const round1 = (value: number) => Math.round(value * 10) / 10

/** A deliberately simple, auditable local score. Not an official index. */
export function computeSentiment(input: {
  indexChanges: number[]
  breadth?: BreadthInput | null
  sectorChanges: number[]
}): Sentiment | null {
  const indexAverage = average(input.indexChanges.filter(Number.isFinite))
  const sectorAverage = average(input.sectorChanges.filter(Number.isFinite))
  const sectors = input.sectorChanges.filter(Number.isFinite)
  const breadth = input.breadth
  const breadthTotal = breadth ? breadth.up + breadth.down + breadth.flat : 0
  const factors: SentimentFactor[] = []
  let missing = false
  if (indexAverage !== null) factors.push({ key: 'index', score: round1(clamp(50 + indexAverage * 10)), weight: 0.2 })
  else missing = true
  if (breadth && breadthTotal > 0) factors.push({ key: 'breadth', score: round1(clamp(50 + ((breadth.up - breadth.down) / breadthTotal) * 50)), weight: 0.45 })
  else missing = true
  if (sectors.length) factors.push({ key: 'sector', score: round1((sectors.filter(value => value > 0).length / sectors.length) * 100), weight: 0.25 })
  else missing = true
  if (sectorAverage !== null) factors.push({ key: 'momentum', score: round1(clamp(50 + sectorAverage * 10)), weight: 0.1 })
  else missing = true
  if (!factors.length) return null
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0)
  const score = factors.reduce((sum, factor) => sum + factor.score * (factor.weight / totalWeight), 0)
  const value = clamp(score)
  return {
    score: Math.round(value),
    label: value < 25 ? 'extreme-fear' : value < 45 ? 'fear' : value <= 55 ? 'neutral' : value < 75 ? 'greed' : 'extreme-greed',
    factors: factors.map(factor => ({ ...factor, weight: factor.weight / totalWeight })),
    partial: missing,
  }
}

export type MarketPhase = 'weekend' | 'preopen' | 'auction' | 'open' | 'lunch' | 'closed'

export interface MarketClock {
  phase: MarketPhase
  quoteToday: boolean
  stale: boolean
}

function shanghaiParts(at: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(at)
  const pick = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    hour: Number(pick('hour')),
    minute: Number(pick('minute')),
    weekday: pick('weekday'),
  }
}

/**
 * Infers a session from the wall clock and the newest quote. It deliberately
 * does not claim a statutory holiday calendar: if there is no quote dated
 * today, the UI says the feed has no today snapshot rather than "trading".
 */
export function marketClock(now: Date, quotedAt: string | null): MarketClock {
  const current = shanghaiParts(now)
  const weekend = current.weekday === 'Sat' || current.weekday === 'Sun'
  const minutes = current.hour * 60 + current.minute
  const phase: MarketPhase = weekend ? 'weekend'
    : minutes < 9 * 60 + 15 ? 'preopen'
      : minutes < 9 * 60 + 30 ? 'auction'
        : minutes < 11 * 60 + 30 ? 'open'
          : minutes < 13 * 60 ? 'lunch'
            : minutes < 15 * 60 ? 'open'
              : 'closed'
  let quoteToday = false
  let stale = true
  if (typeof quotedAt === 'string' && Number.isFinite(Date.parse(quotedAt))) {
    const quote = shanghaiParts(new Date(quotedAt))
    quoteToday = quote.date === current.date
    stale = !quoteToday || now.getTime() - Date.parse(quotedAt) > 10 * 60_000
  }
  return { phase, quoteToday, stale }
}

export const MARKET_DISTRIBUTION: readonly { from: number | null; to: number | null }[] = [
  { from: null, to: -7 },
  { from: -7, to: -5 },
  { from: -5, to: -3 },
  { from: -3, to: -1 },
  { from: -1, to: 0 },
  { from: 0, to: 0 },
  { from: 0, to: 1 },
  { from: 1, to: 3 },
  { from: 3, to: 5 },
  { from: 5, to: 7 },
  { from: 7, to: null },
]

export function distributionBucket(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < -7) return 0
  if (value < -5) return 1
  if (value < -3) return 2
  if (value < -1) return 3
  if (value < 0) return 4
  if (value === 0) return 5
  if (value < 1) return 6
  if (value < 3) return 7
  if (value < 5) return 8
  if (value < 7) return 9
  return 10
}

export function parseMarketPreferenceRequest(payload: unknown): MarketPreferenceRequest {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) throw stockMarketError('invalid-input')
  const keys = Object.keys(payload).sort()
  const action = (payload as { action?: unknown }).action
  if (action === 'get') {
    if (keys.join(',') !== 'action') throw stockMarketError('invalid-input')
    return { action: 'get' }
  }
  if (action === 'set') {
    if (keys.join(',') !== 'action,enabled' || typeof (payload as { enabled?: unknown }).enabled !== 'boolean') throw stockMarketError('invalid-input')
    return { action: 'set', enabled: (payload as { enabled: boolean }).enabled }
  }
  throw stockMarketError('invalid-input')
}

export function parseMarketRequest(payload: unknown): MarketRequest {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) throw stockMarketError('invalid-input')
  const keys = Object.keys(payload).sort()
  const kind = (payload as { kind?: unknown }).kind
  if (kind === 'overview') {
    if (keys.join(',') !== 'kind') throw stockMarketError('invalid-input')
    return { kind: 'overview' }
  }
  if (kind === 'breadth') {
    if (keys.join(',') !== 'kind') throw stockMarketError('invalid-input')
    return { kind: 'breadth' }
  }
  if (kind === 'board') {
    if (keys.join(',') !== 'board,kind') throw stockMarketError('invalid-input')
    return { kind: 'board', board: validateBoardCode((payload as { board?: unknown }).board) }
  }
  throw stockMarketError('invalid-input')
}
