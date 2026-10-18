import { UpdateSection } from './components.tsx'
import { en, NS, zh } from './locales.ts'
import { CSS } from './styles.ts'

export const inject = ['slots', 'connection', 'locale']

interface UpdateClientContext {
  effect(fn: () => unknown, label?: string): () => void
  locale: {
    register(namespace: string, dictionaries: { zh: typeof zh; en: typeof en }): unknown
    bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
  }
  connection: {
    rpc: {
      call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<any>
    }
  }
  slots: {
    inject(name: string, fn: () => () => void): () => void
    register(options: {
      name: 'settings.section'
      id: string
      order: number
      label: () => string
      locale: string
      inject: () => { rpc: UpdateClientContext['connection']['rpc'] }
    }, component: typeof UpdateSection): () => void
  }
}

export function apply(ctx: UpdateClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-x-update: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-x-update'
    style.textContent = CSS
    document.head.append(style)
    return () => style.remove()
  }, 'dsh-x-update: styles')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'dsh-x-update',
    order: 30,
    label: () => t('title'),
    locale: NS,
    inject: () => ({ rpc: ctx.connection.rpc }),
  }, UpdateSection))
}
