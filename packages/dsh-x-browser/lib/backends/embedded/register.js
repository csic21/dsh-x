import { createBrowserRoute } from './routes.js';
/** Register the renderer RPC surface of the embedded backend; no model-facing tool lives here. */
export function registerEmbeddedRoutes(ctx, broker) {
    ctx.inject(['connection'], host => {
        const connection = host.connection;
        /** Adapts one untrusted route payload to the capability-bound broker method that validates it. */
        const route = (handler) => (payload) => handler(payload);
        const routes = [
            ['register', route(broker.register), ['sessionId', 'clientTabId']],
            ['sync', route(broker.sync), ['tabId', 'capability', 'epoch', 'visible', 'title', 'url']],
            ['grant', route(broker.grant), ['tabId', 'capability', 'epoch', 'grantRevision']],
            ['revoke', route(broker.revoke), ['tabId', 'capability']],
            ['close', route(broker.close), ['tabId', 'capability']],
            ['poll', route(broker.poll), ['tabId', 'capability']],
            ['confirm', route(broker.confirm), ['tabId', 'capability', 'commandId', 'grantRevision', 'epoch']],
            ['ack', route(broker.acknowledge), ['tabId', 'capability', 'commandId', 'grantRevision', 'epoch', 'result', 'error']],
        ];
        for (const [method, handler, fields] of routes)
            connection.fetch.register(createBrowserRoute(method, handler, fields));
    });
}
