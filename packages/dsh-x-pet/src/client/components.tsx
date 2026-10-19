import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { lookFrame } from '../frames.ts'
import type { LookFrame } from '../frames.ts'
import type { PetState } from '../frames.ts'
import { playSprite, prefersReducedMotion, showLookFrame } from './playback.ts'
import type { PetController, PetView } from './controller.ts'

type Translate = (key: string, params?: Record<string, unknown>) => string

/** The status a session reports, as the root session-status hook publishes it. */
export interface SessionStatus {
  running?: boolean
  pendingInteraction?: { kind?: string } | undefined
  completionUnread?: boolean
}

/** The root-scope standard seats the frame already receives from the host. */
export interface PetStandardProps {
  useSessions: (selector: (state: any) => any) => any
  useSessionStatus: (selector: (state: any) => any) => any
  usePanelInfo: (selector: (state: any) => any) => any
}

const STATE_LABEL: Record<PetState, string> = {
  idle: 'state.idle',
  running: 'state.running',
  'running-right': 'state.running',
  'running-left': 'state.running',
  waving: 'state.idle',
  jumping: 'state.idle',
  failed: 'state.failed',
  waiting: 'state.waiting',
  review: 'state.review',
}

/**
 * The pet's working state, derived from the session the frame is showing.
 * Codex maps the same three facts onto its own rows: a working turn is
 * `running`, a blocked turn is `waiting`, and a finished turn that the user
 * has not looked at yet is `review`.
 */
export function derivePetState(
  list: any,
  statuses: Map<string, SessionStatus> | undefined,
  panelActive: boolean,
): PetState {
  if (panelActive) return 'idle'
  const rows = Object.values((list?.byId ?? {}) as Record<string, any>)
  const current = rows.find(row => (row?.retainedBy?.mainView ?? 0) > 0)
  if (!current?.id) return 'idle'
  const status = statuses?.get(current.id)
  if (!status) return 'idle'
  if (status.pendingInteraction) return 'waiting'
  if (status.running) return 'running'
  if (status.completionUnread) return 'review'
  return 'idle'
}

/** The atlas cell a sheet shows for one idle frame, used by the picker thumbnails. */
export const THUMB_FRAME = { column: 0, row: 0 }

/** How long the pet keeps looking at the pointer after the pointer leaves. */
const LOOK_LINGER_MS = 10_000

export function PetSprite(props: {
  url: string | null
  rows: number
  state: PetState
  reducedMotion: boolean
  label: string
  describedBy?: string
  onPointerEnter: () => void
  onPointerLeave: () => void
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onClick: (event: React.MouseEvent<HTMLElement>) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
}) {
  const { url, rows, state, reducedMotion, label } = props
  const ref = useRef<HTMLButtonElement>(null)
  const [hovered, setHovered] = useState(false)
  const [look, setLook] = useState<LookFrame | null>(null)

  // Codex swaps the whole animation for `jumping` while the pointer is over
  // the pet, and only looks around while the pet is idle.
  const animation = hovered ? 'jumping' : state
  // The look needs a v2 sheet, an idle pet and a pointer that is not a touch.
  const lookable = state === 'idle' && rows >= 11 && !reducedMotion

  // One effect drives the sprite, exactly as Codex does: a look frame replaces
  // the animation while it lasts, and the animation resumes when it ends.
  useEffect(() => {
    const element = ref.current
    if (!element || !url) return
    if (look) { showLookFrame(element, look, rows); return }
    // The Codex character loops its state: a working pet keeps working, and a
    // hovered pet keeps jumping until the pointer leaves.
    return playSprite(element, animation, { rows, reducedMotion, loop: true })
  }, [url, rows, animation, reducedMotion, look])

  // The look follows the pointer while it is over the pet, and for ten
  // seconds after it leaves: the same linger the Codex character uses.
  useEffect(() => {
    if (!lookable) { setLook(null); return }
    let linger: ReturnType<typeof setTimeout> | undefined
    const cancel = () => {
      if (linger !== undefined) { clearTimeout(linger); linger = undefined }
      setLook(null)
    }
    const onMove = (event: PointerEvent) => {
      if (event.isPrimary === false || event.pointerType === 'touch') return
      const element = ref.current
      if (!element) return
      const bounds = element.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return
      const over = event.clientX >= bounds.left && event.clientX <= bounds.right
        && event.clientY >= bounds.top && event.clientY <= bounds.bottom
      if (over) {
        if (linger !== undefined) clearTimeout(linger)
        linger = setTimeout(cancel, LOOK_LINGER_MS)
      } else if (linger === undefined) return
      setLook(lookFrame(event.clientX - (bounds.left + bounds.width / 2), event.clientY - (bounds.top + bounds.height / 2)))
    }
    globalThis.addEventListener?.('pointermove', onMove, { passive: true })
    return () => {
      globalThis.removeEventListener?.('pointermove', onMove)
      if (linger !== undefined) clearTimeout(linger)
    }
  }, [lookable, rows])

  if (!url) {
    return <div className="dxp-fallback" role="img" aria-label={label}>{label}</div>
  }
  return <button
    ref={ref}
    type="button"
    className="dxp-sprite"
    aria-label={label}
    aria-describedby={props.describedBy}
    data-codex-pet-state={animation}
    style={{ backgroundImage: `url(${url})`, backgroundSize: `800% ${rows * 100}%` }}
    onPointerEnter={() => { setHovered(true); props.onPointerEnter() }}
    onPointerLeave={() => { setHovered(false); props.onPointerLeave() }}
    onPointerDown={props.onPointerDown}
    onClick={props.onClick}
    onKeyDown={props.onKeyDown}
  />
}

export function PetPicker(props: {
  view: PetView | null
  t: Translate
  controller: PetController
  onSelect: (id: string) => void
  onHide: () => void
  onClose: () => void
  onRetry: () => void
  failed: boolean
}) {
  const { view, t, onSelect, onHide, onClose, failed } = props
  const dialog = useRef<HTMLDivElement>(null)
  const pets = view?.pets ?? []
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    globalThis.addEventListener?.('keydown', onKey)
    dialog.current?.focus()
    return () => globalThis.removeEventListener?.('keydown', onKey)
  }, [onClose])
  return <div className="dxp-scrim" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="dxp-dialog" role="dialog" aria-modal="true" aria-label={t('picker.title')} ref={dialog} tabIndex={-1}>
      <header>
        <h2>{t('picker.title')}</h2>
        <button type="button" onClick={onClose}>{t('picker.close')}</button>
      </header>
      {failed ? <p className="dxp-notice">{t('frame.failed')}</p> : null}
      {pets.length === 0 && !failed
        ? <p className="dxp-empty">{t('picker.empty', { path: view?.source ?? '~/.codex/pets' })}</p>
        : <ul className="dxp-list">
          {pets.map(pet => <PetRow key={pet.id} pet={pet} active={view?.active === pet.id} t={t} onSelect={onSelect} controller={props.controller} />)}
        </ul>}
      <footer>
        <p>{t('picker.hint')}</p>
        <button type="button" onClick={onHide}>{t('picker.hide')}</button>
      </footer>
    </div>
  </div>
}

function PetRow(props: { pet: any, active: boolean, t: Translate, onSelect: (id: string) => void, controller: PetController }) {
  const { pet, active, t, onSelect, controller } = props
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    // Thumbnails load only while the picker is open; the controller caches one
    // atlas per pet, so switching back and forth costs nothing more.
    controller.atlasUrl(pet.id)
      .then(next => { if (!cancelled) setUrl(next) })
      .catch(() => { if (!cancelled) setUrl(null) })
    return () => { cancelled = true }
  }, [controller, pet.id])
  return <li>
    <button type="button" className="dxp-row" aria-current={active} onClick={() => onSelect(pet.id)}>
      <span
        className="dxp-thumb"
        aria-hidden="true"
        style={url ? { backgroundImage: `url(${url})`, backgroundPosition: '0% 0%' } : undefined}
      />
      <span className="dxp-row-text">
        <strong>{pet.displayName}</strong>
        <span>{pet.description || t('picker.rows', { rows: pet.rows })}</span>
      </span>
      <span className="dxp-tag">{t(pet.source === 'codex' ? 'picker.codex' : pet.source === 'local' ? 'picker.local' : 'picker.bundled')}</span>
    </button>
  </li>
}

export function PetFrame(props: PetStandardProps & {
  controller: PetController
  t: Translate
}) {
  const { controller, t } = props
  const standard = props
  const [pickerOpen, setPickerOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [offset, setOffset] = useState<{ x: number, y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const reducedMotion = useMemo(() => prefersReducedMotion(globalThis.window), [])
  const list = standard.useSessions((state: any) => state)
  const statuses = standard.useSessionStatus((state: any) => state)
  const panelActive = standard.usePanelInfo((info: any) => info.activePanelId !== null)
  const state = derivePetState(list, statuses, panelActive === true)
  const view = useSyncExternalStore(
    useCallback(listener => controller.subscribe(listener), [controller]),
    useCallback(() => controller.getSnapshot(), [controller]),
  )
  const active = view?.active ?? 'off'

  useEffect(() => { void controller.load() }, [controller])

  useEffect(() => {
    if (active === 'off') { setUrl(null); return }
    let cancelled = false
    setUrl(null)
    controller.atlasUrl(active)
      .then(next => { if (!cancelled) { setUrl(next); setFailed(false) } })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [controller, active])

  useEffect(() => { setOffset(view?.selection?.position ?? null) }, [view?.selection?.position?.x, view?.selection?.position?.y])

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const target = event.currentTarget
    const startX = event.clientX
    const startY = event.clientY
    const origin = offset ?? { x: 0, y: 0 }
    const latest = { x: origin.x, y: origin.y }
    let moved = false
    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - startX
      const dy = move.clientY - startY
      if (!moved && Math.hypot(dx, dy) < 4) return
      moved = true
      setDragging(true)
      target.setPointerCapture?.(move.pointerId)
      latest.x = origin.x + dx
      latest.y = origin.y + dy
      setOffset({ x: latest.x, y: latest.y })
    }
    const onUp = () => {
      globalThis.removeEventListener?.('pointermove', onMove)
      globalThis.removeEventListener?.('pointerup', onUp)
      globalThis.removeEventListener?.('pointercancel', onUp)
      setDragging(false)
      if (moved) void controller.move(latest.x, latest.y).catch(() => {})
    }
    globalThis.addEventListener?.('pointermove', onMove)
    globalThis.addEventListener?.('pointerup', onUp)
    globalThis.addEventListener?.('pointercancel', onUp)
  }, [controller, offset])

  const onClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (dragging) { event.preventDefault(); return }
    setPickerOpen(true)
  }, [dragging])

  if (active === 'off') return null

  const label = `${t('frame.label')} · ${t(STATE_LABEL[state])}`
  const style = offset ? ({ '--dxp-x': `${offset.x}px`, '--dxp-y': `${offset.y}px` } as any) : undefined

  return <>
    <div className="dxp" style={style} data-pet-state={state}>
      <div className="dxp-stage">
        <PetSprite
          url={url}
          rows={view?.pets.find(pet => pet.id === active)?.rows ?? 11}
          state={state}
          reducedMotion={reducedMotion}
          label={label}
          onPointerEnter={() => {}}
          onPointerLeave={() => {}}
          onPointerDown={onPointerDown}
          onClick={onClick}
          onKeyDown={() => {}}
        />
        <div className="dxp-status" role="status">{t(STATE_LABEL[state])}</div>
        <div className="dxp-controls">
          <button type="button" onClick={() => setPickerOpen(true)}>{t('frame.open')}</button>
          <button type="button" onClick={() => { void controller.select('off').catch(() => {}) }}>{t('frame.hide')}</button>
        </div>
      </div>
    </div>
    {pickerOpen
      ? <PetPicker
        view={view}
        t={t}
        controller={controller}
        failed={failed}
        onRetry={() => { void controller.load() }}
        onSelect={id => { void controller.select(id).catch(() => {}); setPickerOpen(false) }}
        onHide={() => { void controller.select('off').catch(() => {}); setPickerOpen(false) }}
        onClose={() => setPickerOpen(false)}
      />
      : null}
  </>
}

/** The settings page reached from the account menu's Settings entry. */
export function PetSettings(props: { controller: PetController, t: Translate }) {
  const { controller, t } = props
  const view = useSyncExternalStore(
    useCallback(listener => controller.subscribe(listener), [controller]),
    useCallback(() => controller.getSnapshot(), [controller]),
  )
  useEffect(() => { void controller.load() }, [controller])
  const pets = view?.pets ?? []
  const shown = (view?.active ?? 'off') !== 'off'
  const restore = view?.selection.chosen && view.selection.chosen !== 'off' ? view.selection.chosen : pets[0]?.id
  return <section className="dxp-settings">
    <header className="dxp-settings-head">
      <h2>{t('settings.title')}</h2>
      <p>{t('settings.lead')}</p>
    </header>
    <div className="dxp-switch-row">
      <div>
        <strong>{t('settings.show')}</strong>
        <span>{t('settings.showHint')}</span>
      </div>
      <button
        type="button"
        role="switch"
        className="dxp-switch"
        aria-checked={shown}
        aria-label={t('settings.show')}
        onClick={() => { void controller.select(shown ? 'off' : (restore ?? 'off')).catch(() => {}) }}
      />
    </div>
    <h3>{t('settings.pick')}</h3>
    {pets.length === 0
      ? <p className="dxp-empty">{t('settings.empty')}</p>
      : <ul className="dxp-grid">
        {pets.map(pet => <SettingsCard key={pet.id} pet={pet} active={view?.active === pet.id} t={t} controller={controller} onSelect={id => { void controller.select(id).catch(() => {}) }} />)}
      </ul>}
    <p className="dxp-settings-note">{t('settings.local', { path: view?.source ? `${view.source}/pets` : '~/.codex/pets' })}</p>
  </section>
}

function SettingsCard(props: { pet: any, active: boolean, t: Translate, controller: PetController, onSelect: (id: string) => void }) {
  const { pet, active, t, controller, onSelect } = props
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    controller.atlasUrl(pet.id).then(next => { if (!cancelled) setUrl(next) }).catch(() => { if (!cancelled) setUrl(null) })
    return () => { cancelled = true }
  }, [controller, pet.id])
  return <li>
    <button type="button" className="dxp-card" aria-current={active} onClick={() => onSelect(pet.id)}>
      <span className="dxp-card-art" aria-hidden="true" style={url ? { backgroundImage: `url(${url})`, backgroundSize: `800% ${pet.rows * 100}%` } : undefined} />
      <strong>{pet.displayName}</strong>
      <span>{pet.description || t('picker.rows', { rows: pet.rows })}</span>
    </button>
  </li>
}
