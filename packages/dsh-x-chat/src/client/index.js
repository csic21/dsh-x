import { ChatToolRow } from './ChatToolRow.jsx'
import { NS, zh, en } from './locales.js'
import { CSS } from './styles.js'

export const inject = ['slots', 'locale']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'chat: dictionaries')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-x-chat'
    style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'chat: styles')
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: 'dsh_x_chat', locale: NS,
  }, ChatToolRow))
}
