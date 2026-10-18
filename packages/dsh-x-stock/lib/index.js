import { defineTool } from '@deepseek-ai/dsh-tools';
import { createInstrumentSearchProvider } from './instrument-search-provider.js';
import { createTencentMarketProvider } from './market-provider.js';
import { createMarketPreferenceRoute, createMarketRoute } from './market-rpc.js';
import { createMarketController, createProfileMarketPreference } from './market-preference.js';
import { createSearchRoute } from './search-rpc.js';
import { createScopeRoute, loadProfileScope } from './scope.js';
import { stockTool } from './tool.js';
export const name = 'dsh-x-stock';
export const inject = ['tools'];
export function apply(ctx, config = {}) {
    // No provider exists unless the user explicitly opts in. A licensed adapter
    // can replace this branch without touching the client or RPC contract: it
    // implements the same MarketProvider interface (including `quotes`).
    const marketForced = config.marketSource === true || config.freeSource === true
        || process.env.DSH_X_STOCK_MARKET_SOURCE === '1' || process.env.DSH_X_STOCK_FREE_SOURCE === '1';
    // The name directory reuses the same explicit opt-in as market data. Without
    // it the search route stays disabled and never fetches.
    let searchProvider;
    try {
        searchProvider = createInstrumentSearchProvider();
    }
    catch { /* No fetch: search reports unavailable. */ }
    ctx.tools.register(defineTool(stockTool()));
    ctx.inject(['connection', 'profileContext'], (host) => {
        let marketController;
        try {
            const store = createProfileMarketPreference(host.profileContext.dir);
            marketController = createMarketController({
                forced: marketForced,
                store,
                createProvider: () => createTencentMarketProvider(),
            });
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
    });
}
