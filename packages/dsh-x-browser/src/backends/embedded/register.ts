import type { Context } from '@deepseek-ai/cordis'
import { createBrowserRoute } from './routes.ts'
import type { BrowserRoutePayload } from './routes.ts'
import type { EmbeddedBroker } from './broker.ts'

/** Route payloads are untrusted JSON; each capability-bound broker method validates every field it reads. */
type BrowserRouteEntry = [string, (payload: BrowserRoutePayload) => unknown, readonly string[]]
/** Minimal official connection surface used to register the renderer routes. */
type ConnectionHost = Context & { connection: { fetch: { register(route: ReturnType<typeof createBrowserRoute>): () => void } } }

/** Register the renderer RPC surface of the embedded backend; no model-facing tool lives here. */
export function registerEmbeddedRoutes(ctx: Context, broker: EmbeddedBroker): void {
  ctx.inject(['connection'], host => {
    const connection = (host as ConnectionHost).connection
    /** Adapts one untrusted route payload to the capability-bound broker method that validates it. */
    const route = <A extends object>(handler: (payload: A) => unknown) => (payload: BrowserRoutePayload): unknown => handler(payload as A)
    const routes: BrowserRouteEntry[] = [
      ['register', route(broker.register), ['sessionId', 'clientTabId']],
      ['open', route(broker.takeOpen), ['sessionId']],
      ['sync', route(broker.sync), ['tabId', 'capability', 'epoch', 'visible', 'title', 'url']],
      ['grant', route(broker.grant), ['tabId', 'capability', 'epoch', 'grantRevision']],
      ['revoke', route(broker.revoke), ['tabId', 'capability']],
      ['close', route(broker.close), ['tabId', 'capability']],
      ['poll', route(broker.poll), ['tabId', 'capability']],
      ['confirm', route(broker.confirm), ['tabId', 'capability', 'commandId', 'grantRevision', 'epoch']],
      ['ack', route(broker.acknowledge), ['tabId', 'capability', 'commandId', 'grantRevision', 'epoch', 'result', 'error']],
    ]
    for (const [method, handler, fields] of routes) connection.fetch.register(createBrowserRoute(method, handler, fields))
  })
}
