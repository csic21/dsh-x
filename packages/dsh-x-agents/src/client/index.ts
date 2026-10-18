import { createAgentsController } from './controller.ts'
import { addressFor, parseAddress, PROTOCOL } from './model.ts'
import { AgentsEntry, AgentsPanel, AgentsToolRow } from './components.tsx'
import { NS, zh, en } from './locales.ts'
import { CSS } from './styles.ts'

export const inject = ['slots', 'connection', 'resources', 'sidebarRight', 'sidebarRightTabs', 'locale']
export function apply(ctx: any) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'agents: dictionaries')
  const t = ctx.locale.bind(NS)
  const controller = createAgentsController(ctx.connection.rpc)
  ctx.effect(() => () => controller.dispose(), 'agents: scoped state')
  ctx.on('connection/reset', () => controller.reset())
  ctx.effect(() => ctx.resources.register(controller.resource), 'agents: resources')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-x-agents'; style.textContent = CSS; document.head.appendChild(style)
    return () => style.remove()
  }, 'agents: styles')
  const previewId = 'dsh-x-agents.workspace'
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: previewId, kind: PROTOCOL, patterns: [`dsh-resource://${PROTOCOL}/**`], priority: 'extension',
    canOpen: (address: any) => parseAddress(address) !== null, title: () => t('title'),
  }), 'agents: sidebar type')
  const formatTime = (value: any) => {
    if (!value || !Number.isFinite(Date.parse(value))) return value || '—'
    const locale = ctx.locale.getLocale().active
    const tag = locale === 'zh' ? 'zh-CN' : locale
    return new Intl.DateTimeFormat(Intl.DateTimeFormat.supportedLocalesOf([tag])[0] ?? 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  }
  const face = (sessionId: any) => ({
    hooks: { agents: controller.source(sessionId) }, formatTime,
    refresh: () => controller.refresh(sessionId),
    cancel: (target: any) => controller.cancel(sessionId, target),
    openAgents: () => {
      const state = controller.source(sessionId).getSnapshot()
      if (state.snapshot) ctx.sidebarRight.openResource(addressFor(state.snapshot.scope, sessionId))
      else controller.refresh(sessionId)
    },
  })
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: previewId, order: -10, locale: NS, inject: face,
  }, AgentsEntry))
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: previewId, locale: NS, inject: face,
  }, AgentsPanel))
  for (const key of ['dsh_x_agents_inspect', 'dsh_x_agents_run', 'dsh_x_agents_models']) ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key, locale: NS, inject: () => ({ operationKind: key === 'dsh_x_agents_models' ? 'models' : null, formatTime, openCurrent: (snapshot: any) => {
      if (ctx.sidebarRight.mounted?.getSnapshot() !== snapshot.sessionId) return
      ctx.sidebarRight.openResource(addressFor(snapshot.scope, snapshot.sessionId))
    } }),
  }, AgentsToolRow))
}
