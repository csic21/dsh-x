import type { ComponentType } from 'react'
import { ChatToolRow } from './ChatToolRow.tsx'
import type { ChatToolRowProps } from './ChatToolRow.tsx'
import { NS, zh, en } from './locales.ts'
import { CSS } from './styles.ts'

export const inject = ['slots', 'locale']

/** Client services this plugin consumes; the shell composes the full client Context. */
export interface ChatClientContext {
  effect(fn: () => unknown, label?: string): () => void
  locale: {
    register(namespace: string, dictionaries: { zh: typeof zh; en: typeof en }): unknown
  }
  slots: {
    inject(name: string, fn: () => () => void): () => void
    register(options: { name: string; key: string; locale: string }, component: ComponentType<ChatToolRowProps>): () => void
  }
}

export function apply(ctx: ChatClientContext): void {
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
