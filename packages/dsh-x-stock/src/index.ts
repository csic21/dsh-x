import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createFreeQuoteProvider } from './free-quote.ts'
import { createInstrumentSearchProvider } from './instrument-search-provider.ts'
import type { InstrumentSearchProvider } from './instrument-search-provider.ts'
import { createTencentMarketProvider } from './market-provider.ts'
import { createMarketPreferenceRoute, createMarketRoute } from './market-rpc.ts'
import { createMarketController, createProfileMarketPreference } from './market-preference.ts'
import type { MarketController } from './market-preference.ts'
import { createSearchRoute } from './search-rpc.ts'
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
  /**
   * Opt in to the unofficial Tencent adapter for the read-only market board.
   * Off by default; `DSH_X_STOCK_MARKET_SOURCE=1` forces it on for headless
   * compositions. Intended for local, single-user use only.
   */
  marketSource?: boolean
}

export function apply(ctx: Context, config: StockConfig = {}) {
  // No provider exists unless the user explicitly opts in. A licensed adapter
  // can replace this branch without touching the client or RPC contract.
  const freeEnabled = config.freeSource === true || process.env.DSH_X_STOCK_FREE_SOURCE === '1'
  const provider = freeEnabled ? createFreeQuoteProvider() : undefined
  const marketForced = config.marketSource === true || process.env.DSH_X_STOCK_MARKET_SOURCE === '1'
  // The directory reuses the same explicit opt-in as the rest of the local free
  // source. Without it the search route stays disabled and never fetches.
  let searchProvider: InstrumentSearchProvider | undefined
  try { searchProvider = createInstrumentSearchProvider() } catch { /* No fetch: search reports unavailable. */ }
  ctx.tools.register(defineTool(stockTool()))
  // Optional UI transport: headless tool-only compositions keep working.
  ctx.inject(['connection'], (host: any) => {
    host.connection.fetch.register(createWatchlistRoute({ provider }))
  })
  ctx.inject(['connection', 'profileContext'], (host: any) => {
    let marketController: MarketController | undefined
    try {
      const store = createProfileMarketPreference(host.profileContext.dir)
      marketController = createMarketController({
        forced: marketForced,
        store,
        createProvider: () => createTencentMarketProvider(),
      })
    } catch { /* No profile directory: keep the data route in its unconfigured state. */ }
    const searchEnabled = async () => {
      if (freeEnabled) return true
      if (!marketController) return false
      try { return (await marketController.state()).enabled } catch { return false }
    }
    host.connection.fetch.register(createSearchRoute({ enabled: searchEnabled, provider: searchProvider }))
    if (marketController) {
      host.connection.fetch.register(createMarketRoute({ provider: () => marketController.getProvider() }))
      host.connection.fetch.register(createMarketPreferenceRoute({ controller: marketController }))
    } else {
      host.connection.fetch.register(createMarketRoute())
    }
    let scopePromise
    const readScope = () => scopePromise ??= loadProfileScope(host.profileContext.dir).catch(error => { scopePromise = undefined; throw error })
    host.connection.fetch.register(createScopeRoute(readScope))
  })
}
