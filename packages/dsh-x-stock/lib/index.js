import { defineTool } from '@deepseek-ai/dsh-tools';
import { createWatchlistRoute, createScopeRoute } from './watchlist-rpc.js';
import { loadProfileScope } from './scope.js';
import { stockTool } from './tool.js';
export const name = 'dsh-x-stock';
export const inject = ['tools'];
export function apply(ctx) {
    ctx.tools.register(defineTool(stockTool()));
    // Optional UI transport: headless tool-only compositions keep working.
    ctx.inject(['connection'], (host) => {
        host.connection.fetch.register(createWatchlistRoute());
    });
    ctx.inject(['connection', 'profileContext'], (host) => {
        let scopePromise;
        const readScope = () => scopePromise ??= loadProfileScope(host.profileContext.dir).catch(error => { scopePromise = undefined; throw error; });
        host.connection.fetch.register(createScopeRoute(readScope));
    });
}
