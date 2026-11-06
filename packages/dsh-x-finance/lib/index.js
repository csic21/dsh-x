import { defineTool } from '@deepseek-ai/dsh-tools';
import { createInstrumentSearchProvider } from './instrument-search-provider.js';
import { createTencentMarketProvider } from './market-provider.js';
import { createMarketPreferenceRoute, createMarketRoute } from './market-rpc.js';
import { createMarketController, createProfileMarketPreference } from './market-preference.js';
import { createSinaGoldProvider } from './gold-provider.js';
import { createGoldRoute } from './gold-rpc.js';
import { createSinaNewsProvider } from './news-provider.js';
import { createNewsRoute } from './news-rpc.js';
import { createSearchRoute } from './search-rpc.js';
import { createUsRoute } from './us-rpc.js';
import { createTencentUsProvider } from './us-provider.js';
import { createHkRoute } from './hk-rpc.js';
import { createTencentHkProvider } from './hk-provider.js';
import { createScopeRoute, loadProfileScope } from './scope.js';
import { financeQuoteTool } from './tool.js';
import { createWatchSignalScheduler, installWatchScheduleTimer } from './watch-signal-scheduler.js';
import { createWatchScheduleRoute } from './watch-signal-scheduler-rpc.js';
import { createFactorEvolve } from './factor-evolve.js';
import { createQuantScanScheduler } from './quant-scan-scheduler.js';
import { createQuantScheduleRoute } from './quant-scan-scheduler-rpc.js';
export const name = 'dsh-x-finance';
export const inject = ['tools'];
export function apply(ctx, config = {}) {
    // No provider exists unless the user explicitly opts in. A licensed adapter
    // can replace this branch without touching the client or RPC contract: it
    // implements the same MarketProvider interface (including `quotes`).
    const marketForced = config.marketSource === true || config.freeSource === true
        || process.env.DSH_X_FINANCE_MARKET_SOURCE === '1' || process.env.DSH_X_FINANCE_FREE_SOURCE === '1'
        || process.env.DSH_X_STOCK_MARKET_SOURCE === '1' || process.env.DSH_X_STOCK_FREE_SOURCE === '1';
    // The name directory reuses the same explicit opt-in as market data. Without
    // it the search route stays disabled and never fetches.
    let searchProvider;
    try {
        searchProvider = createInstrumentSearchProvider();
    }
    catch { /* No fetch: search reports unavailable. */ }
    // The US quote/history route is the same opt-in source, not a second switch.
    // Without a fetch implementation the route answers uncompiled.
    let usProvider;
    try {
        usProvider = createTencentUsProvider();
    }
    catch { /* No fetch: US quotes report unavailable. */ }
    // Hong Kong reuses the same switch and host family as the US board.
    let hkProvider;
    try {
        hkProvider = createTencentHkProvider();
    }
    catch { /* No fetch: HK quotes report unavailable. */ }
    // News shares the same opt-in. Without a fetch implementation the route stays
    // unconfigured instead of failing the page.
    let newsProvider;
    try {
        newsProvider = createSinaNewsProvider();
    }
    catch { /* No fetch: news reports unavailable. */ }
    ctx.tools.register(defineTool(financeQuoteTool()));
    ctx.inject(['connection', 'profileContext'], (host) => {
        let marketController;
        let watchScheduler;
        let quantScheduler;
        let sourceChanges = 0;
        try {
            const store = createProfileMarketPreference(host.profileContext.dir);
            marketController = createMarketController({
                forced: marketForced,
                store,
                // The daily factor state lives in the profile store; without it the
                // screen falls back to the frozen model unchanged.
                createProvider: () => createTencentMarketProvider({ profileDirectory: host.profileContext.dir }),
            });
            const controller = marketController;
            marketController = {
                state: () => controller.state(),
                getProvider: () => controller.getProvider(),
                async setEnabled(enabled) {
                    sourceChanges++;
                    quantScheduler?.sourceChanged();
                    if (!enabled)
                        watchScheduler?.sourceChanged();
                    try {
                        return await controller.setEnabled(enabled);
                    }
                    finally {
                        sourceChanges--;
                        quantScheduler?.sourceChanged();
                    }
                },
            };
        }
        catch { /* No profile directory: keep the data route in its unconfigured state. */ }
        const sourceEnabled = async () => {
            if (!marketController)
                return marketForced;
            try {
                return (await marketController.state()).enabled;
            }
            catch {
                return false;
            }
        };
        host.connection.fetch.register(createSearchRoute({ enabled: sourceEnabled, provider: searchProvider }));
        host.connection.fetch.register(createUsRoute({ enabled: sourceEnabled, provider: usProvider }));
        host.connection.fetch.register(createHkRoute({ enabled: sourceEnabled, provider: hkProvider }));
        // The gold panel shares the same explicit opt-in and the same source name;
        // it never becomes a second, separately switchable feed.
        const goldProvider = createSinaGoldProvider();
        host.connection.fetch.register(createGoldRoute({
            provider: async () => (await sourceEnabled()) ? goldProvider : undefined,
        }));
        // The news feed is text, not a quote, but it is the same explicit opt-in:
        // closing the source stops the browser from receiving anything at all.
        host.connection.fetch.register(createNewsRoute({
            provider: async () => (await sourceEnabled()) ? newsProvider : undefined,
        }));
        if (marketController) {
            host.connection.fetch.register(createMarketRoute({ provider: () => marketController.getProvider() }));
            host.connection.fetch.register(createMarketPreferenceRoute({ controller: marketController }));
        }
        else {
            host.connection.fetch.register(createMarketRoute());
        }
        let scopePromise;
        const readScope = () => scopePromise ??= loadProfileScope(host.profileContext.dir).catch(error => { scopePromise = undefined; throw error; });
        host.connection.fetch.register(createScopeRoute(readScope));
        // Timer is an official optional Host service. Its loss disposes this task
        // and its exact Connection route without affecting the other finance APIs.
        host.inject?.(['timer'], (scheduledHost) => {
            const scheduler = createWatchSignalScheduler({
                profileDirectory: scheduledHost.profileContext.dir,
                market: () => marketController?.getProvider() ?? Promise.resolve(undefined),
                search: { enabled: sourceEnabled, provider: searchProvider },
                sourceEnabled,
            });
            watchScheduler = scheduler;
            const quant = createQuantScanScheduler({
                profileDirectory: scheduledHost.profileContext.dir,
                provider: () => sourceChanges ? Promise.resolve(undefined) : marketController?.getProvider() ?? Promise.resolve(undefined),
                sourceEnabled: async () => !sourceChanges && await sourceEnabled(),
                watchRunning: async (scope) => (await scheduler.request({ action: 'get', scope })).running,
            });
            quantScheduler = quant;
            // The daily correction rides the same official timer: it only labels
            // sessions the journal already holds, so it costs at most a bounded
            // number of history requests and catches up by itself after a restart.
            const evolve = createFactorEvolve({
                profileDirectory: scheduledHost.profileContext.dir,
                provider: () => sourceChanges ? Promise.resolve(undefined) : marketController?.getProvider() ?? Promise.resolve(undefined),
                sourceEnabled: async () => !sourceChanges && await sourceEnabled(),
            });
            scheduledHost.connection.fetch.register(createWatchScheduleRoute(scheduler));
            scheduledHost.connection.fetch.register(createQuantScheduleRoute(quant));
            // One official ctx-owned timer: admit the watch task first, then let the
            // market task inspect its running state. Disposal aborts both generations.
            installWatchScheduleTimer(scheduledHost, {
                ...scheduler,
                async tick() {
                    try {
                        return await scheduler.tick();
                    }
                    finally {
                        await quant.tick();
                        await evolve.tick();
                    }
                },
                dispose() { evolve.dispose(); quant.dispose(); scheduler.dispose(); },
            });
            scheduledHost.effect(() => () => {
                if (watchScheduler === scheduler)
                    watchScheduler = undefined;
                if (quantScheduler === quant)
                    quantScheduler = undefined;
            });
        });
    });
}
