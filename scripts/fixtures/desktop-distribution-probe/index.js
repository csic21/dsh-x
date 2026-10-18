// Test-only introspection. Never included in the distributable installer.
export const inject = ['loader', 'connection', 'pluginManager', 'clientModules']
const names = new Set(['dsh-x-code', 'dsh-x-agents', 'dsh-x-chat', 'dsh-x-plan', 'dsh-x-stock', 'dsh-x-browser', 'dsh-x-update'])
export function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/dsh-x-distribution-proof', methods: ['POST'], requestBody: 'buffered',
    fetch: async () => Response.json({
      entries: [...ctx.loader.entries()].filter(entry => names.has(entry.options.name)).map(entry => ({ name: entry.options.name, active: Boolean(entry.fiber && !entry.disabled) })),
      clients: ctx.clientModules.graph().entries.filter(entry => names.has(entry.id)).map(entry => ({ id: entry.id })),
      plugins: (await ctx.pluginManager.listPlugins()).filter(entry => names.has(entry.moduleName)).map(entry => ({ name: entry.moduleName, enabled: entry.enabled, phase: entry.fiberPhase })),
    }),
  }), 'desktop distribution proof fixture')
}
