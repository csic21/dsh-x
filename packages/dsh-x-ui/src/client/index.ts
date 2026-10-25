import type { ComponentType } from 'react'
import { createUiController } from './controller.ts'
import type { UiController } from './controller.ts'
import { GlassSettings } from './components.tsx'
import type { SettingsRowProps } from './components.tsx'
import { NS, en, zh } from './locales.ts'
import { stylesheet } from './material.ts'
import { SETTINGS_CSS } from './styles.ts'
import { GLASS_TOKENS, TOKEN_SOURCE } from './tokens.ts'
import type { UiAppearance } from '../store.ts'

export interface UiClientContext {
  effect(fn: () => unknown, label?: string): unknown
  on(event: string, listener: () => void): unknown
  connection: { rpc: { call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<any> } }
  locale: {
    register(namespace: string, dictionaries: { zh: typeof zh, en: typeof en }): unknown
    bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
  }
  theme: {
    /** Stacks a token layer over the active theme; returns its disposer. */
    overrideTokens(source: string, tokens: Record<string, { light: string, dark: string }>): () => void
  }
  slots: {
    inject(name: string, fn: () => () => void): unknown
    register<P>(options: { name: string, id?: string, order?: number, label?: () => string, locale?: string, inject?: () => Record<string, unknown> }, component: ComponentType<P>): () => void
  }
}

export const inject = ['slots', 'connection', 'locale', 'theme']

export function apply(ctx: UiClientContext) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'glass: dictionaries')
  const t = ctx.locale.bind(NS)
  const controller = createUiController(ctx.connection.rpc)
  ctx.effect(() => () => controller.dispose?.(), 'glass: controller')
  ctx.on('connection/reset', () => { void controller.load() })

  // The row's own styles are plugin-owned and removed with the plugin.
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = NS
    style.dataset.pluginCss = `${NS}/settings`
    style.textContent = SETTINGS_CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'glass: settings styles')

  // The material sheet is rebuilt whenever the appearance changes, because the
  // level and the two switches change the values it declares. It is one owned
  // <style> node: replacing its text is cheaper than re-registering the theme
  // layer, and removal restores the shipped look exactly.
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = NS
    style.dataset.pluginCss = `${NS}/material`
    document.head.appendChild(style)

    let painted: UiAppearance | null = null
    let tokenDispose: (() => void) | null = null
    const paint = (appearance: UiAppearance | null) => {
      // Nothing read yet, or the treatment is off: drop both layers so the
      // shipped palette is authoritative again.
      if (appearance === null || !appearance.enabled) {
        style.textContent = ''
        tokenDispose?.()
        tokenDispose = null
        painted = appearance
        return
      }
      if (painted !== null
        && painted.enabled === appearance.enabled
        && painted.level === appearance.level
        && painted.backdrop === appearance.backdrop
        && painted.refraction === appearance.refraction) return
      painted = appearance
      style.textContent = stylesheet(appearance)
      // `overrideTokens` replaces a source's whole layer on every call, so one
      // stable source keeps the layer's identity across repaints.
      tokenDispose = ctx.theme.overrideTokens(TOKEN_SOURCE, GLASS_TOKENS as Record<string, { light: string, dark: string }>)
    }

    paint(controller.getSnapshot())
    const unsubscribe = controller.subscribe(() => paint(controller.getSnapshot()))
    void controller.load()
    return () => {
      unsubscribe()
      tokenDispose?.()
      style.remove()
    }
  }, 'glass: material')

  // The General section's additive seat: one row, a fresh id, no page.
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'dsh-x-ui',
    order: 13,
    locale: NS,
    label: () => t('settings.nav'),
    inject: () => ({ controller, t }),
  }, GlassSettings as ComponentType<SettingsRowProps>))
}
