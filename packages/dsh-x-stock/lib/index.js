import { defineTool } from '@deepseek-ai/dsh-tools';
import { createFreeQuoteProvider } from './free-quote.js';
import { createTencentMarketProvider } from './market-provider.js';
import { createMarketRoute } from './market-rpc.js';
import { createWatchlistRoute, createScopeRoute } from './watchlist-rpc.js';
import { loadProfileScope } from './scope.js';
import { stockTool } from './tool.js';
export const name = 'dsh-x-stock';
export const inject = ['tools'];
export function apply(ctx, config = {}) {
    // No provider exists unless the user explicitly opts in. A licensed adapter
    // can replace this branch without touching the client or RPC contract.
    const provider = config.freeSource === true || process.env.DSH_X_STOCK_FREE_SOURCE === '1'
        ? createFreeQuoteProvider()
        : undefined;
    let marketProvider;
    if (config.marketSource === true || process.env.DSH_X_STOCK_MARKET_SOURCE === '1') {
        try {
            marketProvider = createTencentMarketProvider();
        }
        catch { /* Fail closed to the setup state. */ }
    }
    ctx.tools.register(defineTool(stockTool()));
    // Optional UI transport: headless tool-only compositions keep working.
    ctx.inject(['connection'], (host) => {
        host.connection.fetch.register(createWatchlistRoute({ provider }));
        host.connection.fetch.register(createMarketRoute({ provider: marketProvider }));
    });
    ctx.inject(['connection', 'profileContext'], (host) => {
        let scopePromise;
        const readScope = () => scopePromise ??= loadProfileScope(host.profileContext.dir).catch(error => { scopePromise = undefined; throw error; });
        host.connection.fetch.register(createScopeRoute(readScope));
    });
}
