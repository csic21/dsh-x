// Optional, opt-in news adapter. Two public, key-free endpoints sit behind it:
//
//   * zhibo.sina.com.cn  — the 7x24 market flash feed (fast, market-wide, and
//     each entry carries the listings it mentions, which is what lets the stock
//     page show "today's flashes that mention this name").
//   * search-api-web.eastmoney.com — an article search by keyword, filtered to
//     newest first, which is the longer-form layer for one company.
//
// Same posture as every other adapter in this package: NOT licensed, no SLA, no
// right to redistribute, may rate-limit or change shape at any time, and only
// reachable after the single explicit free-source opt-in. Raw payloads and
// upstream errors never leave this module.
import {
  NEWS_FLASH_SOURCE, NEWS_FLASH_TTL_MS, NEWS_MAX_BYTES, NEWS_MAX_ITEMS, NEWS_STOCK_SOURCE,
  NEWS_STOCK_TTL_MS, NEWS_TIMEOUT_MS, mergeNews, parseEastmoneyNews, parseSinaFlash, unwrapJsonp,
} from './news.ts'
import type { NewsItem } from './news.ts'

export interface NewsProvider {
  readonly name: string
  flash(signal?: AbortSignal): Promise<{ source: string; items: NewsItem[] }>
  stock(input: { symbol: string; name: string }, signal?: AbortSignal): Promise<{ source: string; items: NewsItem[]; partial: boolean }>
}

export interface NewsProviderOptions {
  fetchImpl?: typeof fetch
  now?: () => number
  timeoutMs?: number
  flashTtlMs?: number
  stockTtlMs?: number
}

export const NEWS_FLASH_URL = 'https://zhibo.sina.com.cn/api/zhibo/feed?page=1&page_size=60&zhibo_id=152&tag_id=0&dire=f&dpc=1'
const SEARCH_BASE = 'https://search-api-web.eastmoney.com/search/jsonp'
const MAX_CACHE_ENTRIES = 48
/**
 * A stock page only shows stories that name the company. Relevance search
 * returns those but can lag by days; time search is fresh but returns anything
 * that mentions the name in passing. Asking both and keeping the named rows is
 * the only combination that is both current and about this stock.
 */
export const NEWS_ARTICLE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

/** The exact article-search URL, built from the stock name only. */
export function eastmoneySearchUrl(keyword: string, size: number, sort: 'default' | 'time'): string {
  const param = JSON.stringify({
    uid: '',
    keyword,
    type: ['cmsArticleWebOld'],
    client: 'web',
    clientType: 'web',
    clientVersion: 'curr',
    param: { cmsArticleWebOld: { searchScope: 'default', sort, pageIndex: 1, pageSize: size } },
  })
  return `${SEARCH_BASE}?cb=cb&param=${encodeURIComponent(param)}`
}

interface CacheEntry<T> { expires: number; value: T }

export function createSinaNewsProvider(options: NewsProviderOptions = {}): NewsProvider {
  const {
    fetchImpl = fetch,
    now = Date.now,
    timeoutMs = NEWS_TIMEOUT_MS,
    flashTtlMs = NEWS_FLASH_TTL_MS,
    stockTtlMs = NEWS_STOCK_TTL_MS,
  } = options
  if (typeof fetchImpl !== 'function') throw new Error('news fetch unavailable')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('invalid news timeout')

  const cache = new Map<string, CacheEntry<{ source: string; items: NewsItem[]; partial: boolean }>>()
  const inflight = new Map<string, Promise<{ source: string; items: NewsItem[]; partial: boolean }>>()

  function remember(key: string, value: { source: string; items: NewsItem[]; partial: boolean }, ttl: number) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, { expires: now() + ttl, value })
    return value
  }

  async function text(url: string, referer: string, signal?: AbortSignal): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          accept: 'application/json, text/javascript, */*',
          // Both public endpoints answer 403 to a bare request without a page origin.
          referer,
          'user-agent': 'dsh-x-finance/0.22 (local-only)',
        },
      })
      if (!response.ok) throw new Error('news upstream status')
      const type = (response.headers.get('content-type') ?? '').toLowerCase()
      // A WAF challenge page is HTML; treating it as data would mean parsing
      // marketing markup as if it were a headline.
      if (type.includes('text/html')) throw new Error('news upstream not data')
      const length = Number(response.headers.get('content-length'))
      if (Number.isFinite(length) && length > NEWS_MAX_BYTES) throw new Error('news upstream too large')
      const reader = (response.body as ReadableStream<Uint8Array> | null)?.getReader()
      if (!reader) {
        const buffer = await response.text()
        if (buffer.length > NEWS_MAX_BYTES) throw new Error('news upstream too large')
        return buffer
      }
      const chunks: Uint8Array[] = []
      let total = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > NEWS_MAX_BYTES) { await reader.cancel().catch(() => {}); throw new Error('news upstream too large') }
        chunks.push(value)
      }
      const merged = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength }
      return new TextDecoder('utf-8').decode(merged)
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      controller.abort()
    }
  }

  async function flashFeed(signal?: AbortSignal) {
    const key = 'flash'
    const hit = cache.get(key)
    if (hit && hit.expires > now()) return hit.value
    const pending = inflight.get(key)
    if (pending) return pending
    const task = (async () => {
      const body = await text(NEWS_FLASH_URL, 'https://finance.sina.com.cn/', signal)
      const items = parseSinaFlash(JSON.parse(body), now())
      // An empty flash list is not an error condition the panel can explain, so
      // it is reported as an empty feed rather than a fabricated failure.
      return remember(key, { source: NEWS_FLASH_SOURCE, items: mergeNews(items).slice(0, NEWS_MAX_ITEMS), partial: false }, flashTtlMs)
    })()
    inflight.set(key, task)
    try { return await task } finally { inflight.delete(key) }
  }

  async function articleFeed(name: string, signal?: AbortSignal) {
    const key = `stock:${name}`
    const hit = cache.get(key)
    if (hit && hit.expires > now()) return hit.value
    const pending = inflight.get(key)
    if (pending) return pending
    const task = (async () => {
      const search = async (size: number, sort: 'default' | 'time') => {
        const body = await text(eastmoneySearchUrl(name, size, sort), 'https://so.eastmoney.com/', signal)
        return parseEastmoneyNews(unwrapJsonp(body), now())
      }
      const settled = await Promise.allSettled([search(24, 'default'), search(40, 'time')])
      const rows = settled.flatMap(result => result.status === 'fulfilled' ? result.value : [])
      if (!settled.some(result => result.status === 'fulfilled')) throw new Error('news search unavailable')
      const cutoff = now() - NEWS_ARTICLE_WINDOW_MS
      const items = rows.filter(item => item.title.includes(name) && Date.parse(item.at) >= cutoff)
        .map(item => ({ ...item, direct: true }))
      return remember(key, { source: NEWS_STOCK_SOURCE, items, partial: settled.some(result => result.status === 'rejected') }, stockTtlMs)
    })()
    inflight.set(key, task)
    try { return await task } finally { inflight.delete(key) }
  }

  return {
    name: NEWS_STOCK_SOURCE,
    async flash(signal?: AbortSignal) {
      const feed = await flashFeed(signal)
      return { source: feed.source, items: feed.items }
    },
    async stock(input, signal?: AbortSignal) {
      const name = input.name
      // Only an A-share code is a stable identifier inside a headline; a US
      // ticker such as "A" would match nearly every sentence, so the code layer
      // is limited to the six-digit boards.
      const code = /^(SH|SZ|BJ)\.\d{6}$/.test(input.symbol) ? input.symbol.slice(3) : null
      const byCode = (text: string) => code !== null && text.includes(code)
      // Both layers are best-effort on their own: a blocked article search still
      // leaves today's tagged flashes, and the feed says the result is partial.
      const [flashes, articles] = await Promise.allSettled([flashFeed(signal), articleFeed(name, signal)])
      const flashItems = flashes.status === 'fulfilled'
        ? flashes.value.items.map(item => {
          const matched = item.symbols.some(entry => entry.symbol === input.symbol)
          const named = item.title.includes(name) || (item.summary ?? '').includes(name) || byCode(item.title)
          return { ...item, direct: matched || named }
        // A market flash that never mentions this stock is not a mention of it:
        // showing unrelated headlines on a stock page would be pure noise.
        }).filter(item => item.direct)
        : []
      const articleItems = articles.status === 'fulfilled' ? articles.value.items : []
      if (flashes.status === 'rejected' && articles.status === 'rejected') throw new Error('news unavailable')
      const partial = flashes.status === 'rejected' || articles.status === 'rejected'
        || (flashes.status === 'fulfilled' && flashes.value.partial)
        || (articles.status === 'fulfilled' && articles.value.partial)
      const items = mergeNews([...flashItems, ...articleItems])
      return { source: partial ? NEWS_STOCK_SOURCE : `${NEWS_STOCK_SOURCE} + ${NEWS_FLASH_SOURCE}`, items, partial }
    },
  }
}
