import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createInstrumentSearchProvider } from './instrument-search-provider.ts'
import type { InstrumentSearchProvider } from './instrument-search-provider.ts'
import { createTencentMarketProvider } from './market-provider.ts'
import { createMarketPreferenceRoute, createMarketRoute } from './market-rpc.ts'
import { createMarketController, createProfileMarketPreference } from './market-preference.ts'
import type { MarketController } from './market-preference.ts'
import { createSinaGoldProvider } from './gold-provider.ts'
import { createGoldRoute } from './gold-rpc.ts'
import { createSearchRoute } from './search-rpc.ts'
import { createScopeRoute, loadProfileScope } from './scope.ts'
import { financeQuoteTool } from './tool.ts'
import { createWatchSignalScheduler, installWatchScheduleTimer } from './watch-signal-scheduler.ts'
import type { WatchSignalScheduler } from './watch-signal-scheduler.ts'
import { createWatchScheduleRoute } from './watch-signal-scheduler-rpc.ts'
import { createQuantScanScheduler } from './quant-scan-scheduler.ts'
import type { QuantScanScheduler } from './quant-scan-scheduler.ts'
import { createQuantScheduleRoute } from './quant-scan-scheduler-rpc.ts'

export const name = 'dsh-x-finance'
export const inject = ['tools']

export interface FinanceConfig {
  /**
   * Deprecated alias for `marketSource`. There is one free quote source for the
   * market board, the watchlist detail, the bottom bar and the gold panel; this
   * flag used to enable a separate watchlist-only adapter. Off by default;
   * `DSH_X_FINANCE_FREE_SOURCE=1` forces it on for headless compositions.
   */
  freeSource?: boolean
  /**
   * Opt in to the unofficial public adapters (Tencent for A shares, East Money
   * for global indices and intraday, Sina for gold) used by the read-only market
   * board, the global index tab, the stock page, the fixed bottom bar and the
   * gold panel. Off by default;
   * `DSH_X_FINANCE_MARKET_SOURCE=1` forces it on for headless compositions.
   * The pre-rename `DSH_X_STOCK_*` variables keep working as deprecated aliases.
   * Intended for local, single-user use only.
   */
  marketSource?: boolean
}

export function apply(ctx: Context, config: FinanceConfig = {}) {
  // No provider exists unless the user explicitly opts in. A licensed adapter
  // can replace this branch without touching the client or RPC contract: it
  // implements the same MarketProvider interface (including `quotes`).
  const marketForced = config.marketSource === true || config.freeSource === true
    || process.env.DSH_X_FINANCE_MARKET_SOURCE === '1' || process.env.DSH_X_FINANCE_FREE_SOURCE === '1'
    || process.env.DSH_X_STOCK_MARKET_SOURCE === '1' || process.env.DSH_X_STOCK_FREE_SOURCE === '1'
  // The name directory reuses the same explicit opt-in as market data. Without
  // it the search route stays disabled and never fetches.
  let searchProvider: InstrumentSearchProvider | undefined
  try { searchProvider = createInstrumentSearchProvider() } catch { /* No fetch: search reports unavailable. */ }
  ctx.tools.register(defineTool(financeQuoteTool()))
  ctx.inject(['connection', 'profileContext'], (host: any) => {
    let marketController: MarketController | undefined
    let watchScheduler: WatchSignalScheduler | undefined
    let quantScheduler: QuantScanScheduler | undefined
    let sourceChanges = 0
    try {
      const store = createProfileMarketPreference(host.profileContext.dir)
      marketController = createMarketController({
        forced: marketForced,
        store,
        createProvider: () => createTencentMarketProvider(),
      })
      const controller = marketController
      marketController = {
        state: () => controller.state(),
        getProvider: () => controller.getProvider(),
        async setEnabled(enabled) {
          sourceChanges++
          quantScheduler?.sourceChanged()
          if (!enabled) watchScheduler?.sourceChanged()
          try { return await controller.setEnabled(enabled) }
          finally { sourceChanges--; quantScheduler?.sourceChanged() }
        },
      }
    } catch { /* No profile directory: keep the data route in its unconfigured state. */ }
    const sourceEnabled = async () => {
      if (!marketController) return marketForced
      try { return (await marketController.state()).enabled } catch { return false }
    }
    host.connection.fetch.register(createSearchRoute({ enabled: sourceEnabled, provider: searchProvider }))
    // The gold panel shares the same explicit opt-in and the same source name;
    // it never becomes a second, separately switchable feed.
    const goldProvider = createSinaGoldProvider()
    host.connection.fetch.register(createGoldRoute({
      provider: async () => (await sourceEnabled()) ? goldProvider : undefined,
    }))
    if (marketController) {
      host.connection.fetch.register(createMarketRoute({ provider: () => marketController!.getProvider() }))
      host.connection.fetch.register(createMarketPreferenceRoute({ controller: marketController }))
    } else {
      host.connection.fetch.register(createMarketRoute())
    }
    let scopePromise: any
    const readScope = () => scopePromise ??= loadProfileScope(host.profileContext.dir).catch(error => { scopePromise = undefined; throw error })
    host.connection.fetch.register(createScopeRoute(readScope))
    // Timer is an official optional Host service. Its loss disposes this task
    // and its exact Connection route without affecting the other finance APIs.
    host.inject?.(['timer'], (scheduledHost: any) => {
      const scheduler = createWatchSignalScheduler({
        profileDirectory: scheduledHost.profileContext.dir,
        market: () => marketController?.getProvider() ?? Promise.resolve(undefined),
        search: { enabled: sourceEnabled, provider: searchProvider },
        sourceEnabled,
      })
      watchScheduler = scheduler
      const quant = createQuantScanScheduler({
        profileDirectory: scheduledHost.profileContext.dir,
        provider: () => sourceChanges ? Promise.resolve(undefined) : marketController?.getProvider() ?? Promise.resolve(undefined),
        sourceEnabled: async () => !sourceChanges && await sourceEnabled(),
        watchRunning: async scope => (await scheduler.request({ action: 'get', scope })).running,
      })
      quantScheduler = quant
      scheduledHost.connection.fetch.register(createWatchScheduleRoute(scheduler))
      scheduledHost.connection.fetch.register(createQuantScheduleRoute(quant))
      // One official ctx-owned timer: admit the watch task first, then let the
      // market task inspect its running state. Disposal aborts both generations.
      installWatchScheduleTimer(scheduledHost, {
        ...scheduler,
        async tick() {
          try { return await scheduler.tick() } finally { await quant.tick() }
        },
        dispose() { quant.dispose(); scheduler.dispose() },
      })
      scheduledHost.effect(() => () => {
        if (watchScheduler === scheduler) watchScheduler = undefined
        if (quantScheduler === quant) quantScheduler = undefined
      })
    })
  })
}
