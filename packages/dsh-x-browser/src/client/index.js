import { createBrowserController } from './controller.js'
import { BrowserBody, BrowserEntry, BrowserIcon, BrowserTitle } from './components.jsx'
import { en, zh, NS } from './locales.js'
import { CSS } from './styles.js'
export const inject = ['slots', 'locale', 'connection', 'sidebarRight', 'sidebarRightTabs']
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'browser: dictionaries')
  const t = ctx.locale.bind(NS), controllers = new Set(), factories = new Map()
  ctx.effect(() => { const style = document.createElement('style'); style.dataset.plugin = 'dsh-x-browser'; style.textContent = CSS; document.head.append(style); return () => style.remove() }, 'browser: styles')
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: 'dsh-x-browser', kind: 'dsh-x-browser', multiple: true, keepMounted: true, title: () => t('title'), guide: [{ id: 'new', order: 35, title: () => t('title'), description: () => t('description'), icon: BrowserIcon }] }), 'browser: tab type')
  const createController = options => { const owner = createBrowserController({ ...options, rpc: ctx.connection.rpc }); const dispose = owner.dispose; owner.dispose = async () => { controllers.delete(owner); await dispose() }; controllers.add(owner); return owner }
  const factoryFor = sessionId => { if (!factories.has(sessionId)) factories.set(sessionId, options => createController({ ...options, sessionId })); return factories.get(sessionId) }
  ctx.effect(() => () => { for (const owner of controllers) void owner.dispose(); controllers.clear(); factories.clear() }, 'browser: owned guests')
  ctx.on('connection/reset', () => { for (const owner of controllers) void owner.takeover('disconnected') })
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: 'dsh-x-browser', locale: NS, inject: sessionId => ({ createController: factoryFor(sessionId) }) }, BrowserBody)), 'browser: body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: 'dsh-x-browser' }, BrowserTitle)), 'browser: title')
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'dsh-x-browser', order: -9, locale: NS, inject: () => ({ open: () => ctx.sidebarRight.openTab('dsh-x-browser') }) }, BrowserEntry))
}
