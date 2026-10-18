import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createWatchlistRoute, createScopeRoute } from './watchlist-rpc.ts'
import { loadProfileScope } from './scope.ts'
import { stockTool } from './tool.ts'

export const name = 'dsh-x-stock'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool(stockTool()))
  // Optional UI transport: headless tool-only compositions keep working.
  ctx.inject(['connection'], (host: any) => {
    host.connection.fetch.register(createWatchlistRoute())
  })
  ctx.inject(['connection', 'profileContext'], (host: any) => {
    let scopePromise
    const readScope = () => scopePromise ??= loadProfileScope(host.profileContext.dir).catch(error => { scopePromise = undefined; throw error })
    host.connection.fetch.register(createScopeRoute(readScope))
  })
}
