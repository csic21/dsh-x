import React, { useCallback, useSyncExternalStore } from 'react'
import type { UiAppearance, UiAppearancePatch } from '../store.ts'
import type { UiController } from './controller.ts'

type Translate = (key: string, params?: Record<string, unknown>) => string

export interface SettingsRowProps {
  controller: UiController
  t: Translate
}

const LEVELS = ['clear', 'regular', 'dense'] as const

/**
 * One preference row in the General section.
 *
 * The row owns its own copy and controls: the owner passes no props, so every
 * visible string comes from this plugin's locale namespace, and the write path
 * is the controller's RPC. Nothing here reaches into another plugin's DOM.
 */
export function GlassSettings({ controller, t }: SettingsRowProps) {
  const snapshot = useSyncExternalStore(
    useCallback((listener: () => void) => controller.subscribe(listener), [controller]),
    useCallback(() => controller.getSnapshot(), [controller]),
  )
  const saving = useSyncExternalStore(
    useCallback((listener: () => void) => controller.subscribe(listener), [controller]),
    useCallback(() => controller.isSaving(), [controller]),
  )
  const error = useSyncExternalStore(
    useCallback((listener: () => void) => controller.subscribe(listener), [controller]),
    useCallback(() => controller.error(), [controller]),
  )
  const update = useCallback((patch: UiAppearancePatch) => { void controller.update(patch) }, [controller])

  // Before the first read settles there is nothing honest to show, and the row
  // must not render a switch in a state the user never chose.
  if (snapshot === null) {
    return React.createElement('div', { className: 'dxu-row' },
      React.createElement('div', { className: 'dxu-rowText' },
        React.createElement('div', { className: 'dxu-title' }, t('settings.title')),
        React.createElement('div', { className: 'dxu-desc' }, t('settings.lead'))),
      React.createElement('span', { className: 'dxu-muted' }, t('settings.saving')))
  }

  const appearance: UiAppearance = snapshot
  const disabled = saving

  return React.createElement('div', { className: 'dxu-row', 'data-disabled': disabled },
    React.createElement('div', { className: 'dxu-rowText' },
      React.createElement('div', { className: 'dxu-title' }, t('settings.title')),
      React.createElement('div', { className: 'dxu-desc' }, t('settings.lead'))),

    React.createElement('div', { className: 'dxu-controls' },
      React.createElement('div', { className: 'dxu-line' },
        React.createElement('span', { className: 'dxu-label' }, t('settings.enable')),
        React.createElement('button', {
          type: 'button',
          role: 'switch',
          className: 'dxu-switch',
          'aria-checked': appearance.enabled,
          'aria-label': t('settings.enable'),
          disabled,
          onClick: () => update({ enabled: !appearance.enabled }),
        }, React.createElement('span', { className: 'dxu-thumb' }))),

      React.createElement('div', { className: 'dxu-field' },
        React.createElement('span', { className: 'dxu-label' }, t('settings.level')),
        React.createElement('div', {
          className: 'dxu-segments',
          role: 'group',
          'aria-label': t('settings.level'),
          style: {
            '--dxu-segment-count': LEVELS.length,
            '--dxu-segment-index': LEVELS.indexOf(appearance.level),
          } as React.CSSProperties,
        },
        React.createElement('span', { className: 'dxu-indicator', 'aria-hidden': 'true' }),
        LEVELS.map(level => React.createElement('button', {
          key: level,
          type: 'button',
          className: 'dxu-segment',
          'aria-pressed': appearance.level === level,
          disabled,
          onClick: () => update({ level }),
        }, t(`settings.level.${level}`)))),
        React.createElement('div', { className: 'dxu-hint' }, t('settings.levelHint'))),

      React.createElement('div', { className: 'dxu-line' },
        React.createElement('span', { className: 'dxu-label' }, t('settings.backdrop')),
        React.createElement('button', {
          type: 'button',
          role: 'switch',
          className: 'dxu-switch',
          'aria-checked': appearance.backdrop,
          'aria-label': t('settings.backdrop'),
          disabled,
          onClick: () => update({ backdrop: !appearance.backdrop }),
        }, React.createElement('span', { className: 'dxu-thumb' }))),
      React.createElement('div', { className: 'dxu-hint' }, t('settings.backdropHint')),

      React.createElement('div', { className: 'dxu-line' },
        React.createElement('span', { className: 'dxu-label' }, t('settings.refraction')),
        React.createElement('button', {
          type: 'button',
          role: 'switch',
          className: 'dxu-switch',
          'aria-checked': appearance.refraction,
          'aria-label': t('settings.refraction'),
          disabled,
          onClick: () => update({ refraction: !appearance.refraction }),
        }, React.createElement('span', { className: 'dxu-thumb' }))),
      React.createElement('div', { className: 'dxu-hint' }, t('settings.refractionHint'))),

    error === null ? null : React.createElement('div', { className: 'dxu-error', role: 'status' }, t('settings.failed', { message: error })),
    React.createElement('div', { className: 'dxu-note' }, t('settings.systemReduce')))
}
