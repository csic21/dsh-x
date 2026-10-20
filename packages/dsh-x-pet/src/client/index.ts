import type { ComponentType } from 'react'
import { createPetController } from './controller.ts'
import type { PetController, PetView } from './controller.ts'
import { PetFrame, PetSettings } from './components.tsx'
import type { PetStandardProps } from './components.tsx'
import { NS, zh, en } from './locales.ts'
import { CSS } from './styles.ts'

export interface PetClientContext {
  effect(fn: () => unknown, label?: string): unknown
  /** Opens a conversation in the main view; the pet only navigates. */
  uiWorkspace: { openSession(id: string): void }
  on(event: string, listener: () => void): unknown
  connection: { rpc: { call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<any> } }
  locale: {
    register(namespace: string, dictionaries: { zh: typeof zh, en: typeof en }): unknown
    bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
  }
  slots: {
    inject(name: string, fn: () => () => void): unknown
    register<P>(options: { name: string, id?: string, order?: number, label?: () => string, locale?: string, inject?: () => Record<string, unknown> }, component: ComponentType<P>): () => void
  }
}

export const inject = ['slots', 'connection', 'locale', 'uiWorkspace']

export function apply(ctx: PetClientContext) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')
  const t = ctx.locale.bind(NS)
  const controller = createPetController(ctx.connection.rpc)
  ctx.effect(() => () => controller.dispose(), 'pet: controller')
  ctx.on('connection/reset', () => controller.reset())
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = NS
    style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'pet: styles')

  // The frame owns the pet: it is the one surface that stays above every
  // column without taking a slot away from the host's own layout. The `t`
  // seat and the root standard hooks (useSessions, useSessionStatus,
  // usePanelInfo) arrive from the host; only the controller is ours.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-x-pet',
    order: 40,
    locale: NS,
    label: () => t('title'),
    inject: () => ({ controller, openSession: (id: string) => {
      // A missing service must say so in the bubble, not vanish into a
      // rejected click handler nobody can see.
      const workspace = ctx.uiWorkspace
      if (workspace === undefined || typeof workspace.openSession !== 'function') throw new Error('uiWorkspace.openSession is unavailable')
      workspace.openSession(id)
    } }),
  }, PetFrame as ComponentType<any>))

  // The account menu's Settings entry is where the switch and the character
  // grid live. A fresh section id is added beside the shipped pages.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'dsh-x-pet',
    order: 12,
    locale: NS,
    label: () => t('settings.nav'),
    inject: () => ({ controller, openSession: (id: string) => {
      // A missing service must say so in the bubble, not vanish into a
      // rejected click handler nobody can see.
      const workspace = ctx.uiWorkspace
      if (workspace === undefined || typeof workspace.openSession !== 'function') throw new Error('uiWorkspace.openSession is unavailable')
      workspace.openSession(id)
    } }),
  }, PetSettings as ComponentType<any>))
}
