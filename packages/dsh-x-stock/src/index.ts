import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createFreeQuoteProvider } from './free-quote.ts'
import { createWatchlistRoute, createScopeRoute } from './watchlist-rpc.ts'
import { loadProfileScope } from './scope.ts'
import { stockTool } from './tool.ts'

export const name = 'dsh-x-stock'
export const inject = ['tools']

export interface StockConfig {
  /**
   * Opt in to the unofficial qt.gtimg.cn adapter for the A-share watchlist.
   * Off by default; `DSH_X_STOCK_FREE_SOURCE=1` forces it on for headless
   * compositions. Intended for local, single-user use only.
   */
  freeSource?: boolean
}

export function apply(ctx: Context, config: StockConfig = {}) {
  // No provider exists unless the user explicitly opts in. A licensed adapter
  // can replace this branch without touching the client or RPC contract.
  const provider = config.freeSource === true || process.env.DSH_X_STOCK_FREE_SOURCE === '1'
    ? createFreeQuoteProvider()
    : undefined
  ctx.tools.register(defineTool(stockTool()))
  // Optional UI transport: headless tool-only compositions keep working.
  ctx.inject(['connection'], (host: any) => {
    host.connection.fetch.register(createWatchlistRoute({ provider }))
  })
  ctx.inject(['connection', 'profileContext'], (host: any) => {
    let scopePromise
    const readScope = () => scopePromise ??= loadProfileScope(host.profileContext.dir).catch(error => { scopePromise = undefined; throw error })
    host.connection.fetch.register(createScopeRoute(readScope))
  })
}
