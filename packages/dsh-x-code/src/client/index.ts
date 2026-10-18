import type { ComponentType } from 'react'
import type { CodeRpc, FileTarget } from './controller.ts'
export interface CodeClientContext {
  effect(fn: () => unknown, label?: string): unknown
  on(event: string, listener: () => void): unknown
  connection: { rpc: CodeRpc }
  layout: { selectPanel(id: string | null): unknown }
  locale: { register(namespace: string, dictionaries: { zh: typeof zh, en: typeof en }): unknown, bind(namespace: string): (key: string, params?: Record<string, unknown>) => string, getLocale(): { active: string } }
  slots: {
    inject(name: string, fn: () => () => void): unknown
    register<P>(options: { name: string, key?: string, id?: string, order?: number, label?: () => string, locale?: string, children?: Record<string, { kind: string, scope: string }>, inject?: (sessionId: string | null) => Record<string, unknown> }, component: ComponentType<P>): () => void
  }
}
import { createCodeController, empty as emptyState } from './controller.ts'
import { CodeEntry, CodeIcon, CodePanel, CodeToolRow, CodeWorkspace } from './components.tsx'
import { NS, zh, en } from './locales.ts'
import { CSS } from './styles.ts'

export const inject = ['slots', 'connection', 'layout', 'locale']
export function apply(ctx: CodeClientContext) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'code: dictionaries')
  const t = ctx.locale.bind(NS), controller = createCodeController(ctx.connection.rpc)
  const absent = { ...emptyState(), status: 'idle' }, empty = { getSnapshot: () => absent, subscribe: () => () => {} }
  ctx.effect(() => () => controller.dispose(), 'code: session state')
  ctx.on('connection/reset', () => controller.reset())
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset.plugin = 'dsh-x-code'; style.textContent = CSS; document.head.appendChild(style)
    return () => style.remove()
  }, 'code: styles')
  const open = () => ctx.layout.selectPanel('dsh-x-code'), back = () => ctx.layout.selectPanel(null)
  const formatTime = (value: string) => {
    if (!value || !Number.isFinite(Date.parse(value))) return '—'
    const active = ctx.locale.getLocale().active, tag = active === 'zh' ? 'zh-CN' : active
    return new Intl.DateTimeFormat(Intl.DateTimeFormat.supportedLocalesOf([tag])[0] ?? 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  }
  ctx.slots.inject('main', () => {
    const parent = ctx.slots.register({ name: 'main', key: 'dsh-x-code', children: { 'dsh-x-code.workspace': { kind: 'single', scope: 'session-maybe' } } }, CodePanel)
    const child = ctx.slots.register({ name: 'dsh-x-code.workspace', locale: NS, inject: sessionId => ({
      hooks: { code: sessionId ? controller.source(sessionId) : empty }, back, formatTime,
      refresh: () => sessionId && controller.refresh(sessionId),
      selectTarget: (mode: string, base?: string) => sessionId && controller.selectTarget(sessionId, mode, base),
      loadReview: (reviewId: string | null) => sessionId && controller.loadReview(sessionId, reviewId),
      loadFile: (target: FileTarget) => sessionId && controller.loadFile(sessionId, target),
      clearFile: () => sessionId && controller.clearFile(sessionId),
      cancel: () => controller.cancel(sessionId!),
    }) }, CodeWorkspace)
    return () => { child(); parent() }
  })
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'dsh-x-code', order: 70, label: () => t('title') }, CodeIcon))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'dsh-x-code', order: -11, locale: NS, inject: () => ({ open }) }, CodeEntry))
  for (const key of ['dsh_x_code_inspect', 'dsh_x_code_file', 'dsh_x_code_review', 'dsh_x_code_repair']) ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key, locale: NS, inject: () => ({ open }) }, CodeToolRow))
}
