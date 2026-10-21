import type { ComponentType } from 'react'
import { createBrowserController } from './controller.ts'
import type { BrowserController, BrowserControllerOptions, BrowserPaneControllerOptions } from './controller.ts'
import { BrowserBody, BrowserEntry, BrowserIcon, BrowserTitle } from './components.tsx'
import type { BrowserBodyProps, BrowserEntryProps, BrowserTitleProps } from './components.tsx'
import { en, zh, NS } from './locales.ts'
import { CSS } from './styles.ts'
export const inject = ['slots', 'locale', 'connection', 'sidebarRight', 'sidebarRightTabs']

/** Locale service the shell composes for this client. */
interface BrowserClientLocale {
  register(namespace: string, dictionaries: { zh: typeof zh, en: typeof en }): unknown
  bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
}
/** Sidebar tab definition the shell renders for this plugin. */
interface BrowserTabDefinition {
  id: string
  kind: string
  multiple: boolean
  keepMounted: boolean
  title: () => string
  guide: Array<{ id: string, order: number, title: () => string, description: () => string, icon: () => JSX.Element }>
}
/** Slot payload one registered pane receives from the shell. */
interface BrowserPaneOptions { name: string, key: string, locale?: string, inject?: (sessionId: string) => Record<string, unknown> }
/** Client services this plugin consumes; the shell composes the full client Context. */
export interface BrowserClientContext {
  effect(fn: () => unknown, label?: string): () => void
  on(event: string, listener: () => void): unknown
  locale: BrowserClientLocale
  connection: { rpc: BrowserControllerOptions['rpc'] }
  sidebarRight: {
    openTab(kind: string, options?: { params?: { url: string }, revealIfOpened?: boolean }): unknown
    /** Observable of the Session on screen; `undefined` while no conversation is shown. */
    mounted?: { getSnapshot(): string | undefined }
  }
  sidebarRightTabs: { register(definition: BrowserTabDefinition): () => void }
  slots: {
    inject(name: string, fn: () => () => void): () => void
    register(options: BrowserPaneOptions & { name: 'sidebar.right.pane.tab' }, component: ComponentType<BrowserBodyProps>): () => void
    register(options: BrowserPaneOptions & { name: 'sidebar.right.pane.tab.title' }, component: ComponentType<BrowserTitleProps>): () => void
    register(options: { name: 'conversation.input.dock', id: string, order: number, locale: string, inject: () => { open: () => unknown } }, component: ComponentType<BrowserEntryProps>): () => void
  }
}

export function apply(ctx: BrowserClientContext) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'browser: dictionaries')
  const t = ctx.locale.bind(NS), controllers = new Set<BrowserController>(), factories = new Map<string, (options: BrowserPaneControllerOptions) => BrowserController>()
  ctx.effect(() => { const style = document.createElement('style'); style.dataset.plugin = 'dsh-x-browser'; style.textContent = CSS; document.head.append(style); return () => style.remove() }, 'browser: styles')
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: 'dsh-x-browser', kind: 'dsh-x-browser', multiple: true, keepMounted: true, title: () => t('title'), guide: [{ id: 'new', order: 35, title: () => t('title'), description: () => t('description'), icon: BrowserIcon }] }), 'browser: tab type')
  const createController = (options: BrowserPaneControllerOptions) => { const owner = createBrowserController({ ...options, rpc: ctx.connection.rpc }); const dispose = owner.dispose; owner.dispose = async () => { controllers.delete(owner); await dispose() }; controllers.add(owner); return owner }
  const factoryFor = (sessionId: string) => { if (!factories.has(sessionId)) factories.set(sessionId, options => createController({ ...options, sessionId })); return factories.get(sessionId)! }
  ctx.effect(() => () => { for (const owner of controllers) void owner.dispose(); controllers.clear(); factories.clear() }, 'browser: owned guests')
  ctx.on('connection/reset', () => { for (const owner of controllers) void owner.takeover('disconnected') })
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: 'dsh-x-browser', locale: NS, inject: sessionId => ({ createController: factoryFor(sessionId) }) }, BrowserBody)), 'browser: body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: 'dsh-x-browser' }, BrowserTitle)), 'browser: title')
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'dsh-x-browser', order: -9, locale: NS, inject: () => ({ open: () => ctx.sidebarRight.openTab('dsh-x-browser') }) }, BrowserEntry))
  // An unattended profile lets the model ask for the tab, so the pane polls the
  // host for one pending request per session and opens it here. The request carries
  // only an HTTP(S) URL; the renderer still owns the tab, the guest and the grant.
  ctx.effect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, busy = false
    const tick = async () => {
      if (stopped || busy) return
      const sessionId = ctx.sidebarRight.mounted?.getSnapshot?.() as string | undefined
      if (sessionId) {
        busy = true
        try {
          const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 8000)
          const reply = await ctx.connection.rpc.call('/api', 'browser/open', { sessionId }, abort.signal).finally(() => clearTimeout(timeout))
          const url = (reply?.ok ? (reply.value as { url?: unknown } | undefined)?.url : undefined)
          // Reveal an already-open pane instead of focusing it quietly: an invisible tab
          // is revoked by design, so a model-initiated open must make it visible or the
          // request can never succeed.
          if (!stopped && typeof url === 'string' && url) ctx.sidebarRight.openTab('dsh-x-browser', { params: { url }, revealIfOpened: true })
        } catch { /* A closed connection is retried on the next tick. */ }
        finally { busy = false }
      }
      if (!stopped) timer = setTimeout(tick, 2000)
    }
    void tick()
    return () => { stopped = true; clearTimeout(timer) }
  }, 'browser: automatic tab opening')
}
