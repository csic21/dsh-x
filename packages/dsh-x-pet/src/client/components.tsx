import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { lookFrame } from '../frames.ts'
import type { LookFrame } from '../frames.ts'
import type { PetState } from '../frames.ts'
import { playSprite, prefersReducedMotion, showLookFrame } from './playback.ts'
import type { PetController, PetView, SessionActivity } from './controller.ts'

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

/** How far the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 6

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
  /** Whether the state keeps repeating; a greeting plays once. */
  loop?: boolean
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
  const loop = props.loop ?? true
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
    // A working pet keeps working and a hovered pet keeps jumping; a greeting
    // plays through and hands the sprite back to the session state.
    return playSprite(element, animation, { rows, reducedMotion, loop })
  }, [url, rows, animation, reducedMotion, look, loop])

  // The look follows the pointer while it is over the pet, and for ten
  // seconds after it leaves: the same linger the Codex character uses.
  useEffect(() => {
    if (!lookable) { setLook(null); return }
    const element = ref.current
    if (!element) return
    const host = element.ownerDocument?.defaultView ?? globalThis
    let linger: ReturnType<typeof setTimeout> | undefined
    const cancel = () => {
      if (linger !== undefined) { host.clearTimeout(linger); linger = undefined }
      setLook(null)
    }
    const onMove = (event: PointerEvent) => {
      if (event.isPrimary === false || event.pointerType === 'touch') return
      const bounds = element.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return
      const over = event.clientX >= bounds.left && event.clientX <= bounds.right
        && event.clientY >= bounds.top && event.clientY <= bounds.bottom
      if (over) {
        if (linger !== undefined) host.clearTimeout(linger)
        linger = host.setTimeout(cancel, LOOK_LINGER_MS)
      } else if (linger === undefined) return
      const next = lookFrame(event.clientX - (bounds.left + bounds.width / 2), event.clientY - (bounds.top + bounds.height / 2))
      setLook(current => current && next && current.row === next.row && current.column === next.column ? current : next)
    }
    host.addEventListener?.('pointermove', onMove, { passive: true })
    return () => {
      host.removeEventListener?.('pointermove', onMove)
      if (linger !== undefined) host.clearTimeout(linger)
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
    draggable={false}
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
  const { view, t, controller, onSelect, onHide, onClose, failed } = props
  const dialog = useRef<HTMLDivElement>(null)
  const pets = view?.pets ?? []
  const activeRef = useRef(view?.active ?? 'off')
  activeRef.current = view?.active ?? 'off'
  useEffect(() => () => {
    const active = activeRef.current
    controller.release(active === 'off' ? [] : [active])
  }, [controller])
  useEffect(() => {
    const host = dialog.current?.ownerDocument?.defaultView ?? globalThis
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    host.addEventListener?.('keydown', onKey)
    dialog.current?.focus()
    return () => host.removeEventListener?.('keydown', onKey)
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
  const [thumb, setThumb] = useState<{ src: string, cropped: boolean } | null>(null)
  const url = thumb?.src ?? null
  useEffect(() => {
    let cancelled = false
    // Thumbnails load only while the picker is open; the controller caches one
    // cropped cell per pet, so switching back and forth costs nothing more.
    controller.thumbnail(pet.id, pet.rows)
      .then(next => { if (!cancelled) setThumb(next) })
      .catch(() => { if (!cancelled) setThumb(null) })
    return () => { cancelled = true }
  }, [controller, pet.id])
  return <li>
    <button type="button" className="dxp-row" aria-current={active} onClick={() => onSelect(pet.id)}>
      <span
        className="dxp-thumb"
        aria-hidden="true"
        style={url ? (thumb?.cropped
          ? { backgroundImage: `url(${url})`, backgroundSize: '100% 100%' }
          : { backgroundImage: `url(${url})`, backgroundSize: '800% 1100%', backgroundPosition: '0% 0%' }) : undefined}
      />
      <span className="dxp-row-text">
        <strong>{pet.displayName}</strong>
        <span>{pet.description || t('picker.rows', { rows: pet.rows })}</span>
      </span>
      <span className="dxp-tag">{t(pet.source === 'codex' ? 'picker.codex' : pet.source === 'local' ? 'picker.local' : 'picker.bundled')}</span>
    </button>
  </li>
}

/** One line the pet says about the conversation it is watching. */
export interface NarrationLine {
  title: string
  detail: string
  tone: 'working' | 'waiting' | 'done'
}

export interface Narration {
  line: NarrationLine | null
  /** How many conversations want attention right now. */
  count: number
  /** True for a short while after a turn finishes, when the pet waves. */
  celebrate: boolean
  busy: boolean
  /** Move the pet's attention to the next conversation that is working. */
  next: () => void
  /** Hide this line until the same conversation says something new. */
  dismiss: () => void
}

const NOTIFY_KEY = 'dsh-x-pet:notify'
const ACTIVITY_POLL_MS = 4_000

function notificationsAllowed(): boolean {
  try {
    if (globalThis.localStorage?.getItem(NOTIFY_KEY) === 'off') return false
    return notificationPermission() === 'granted'
  } catch { return false }
}

function notificationPermission(): string {
  try { return (globalThis as any).Notification?.permission ?? 'denied' } catch { return 'denied' }
}

/** One notification per finished turn, and only when the window is in the background. */
function notifyFinished(title: string | null, t: Translate): void {
  try {
    if (!notificationsAllowed()) return
    if (globalThis.document?.visibilityState === 'visible') return
    const Ctor = (globalThis as any).Notification
    if (!Ctor) return
    new Ctor(t('notify.owner'), { body: title ? t('notify.doneTitle', { title }) : t('notify.done'), tag: 'dsh-x-pet' })
  } catch { /* A refused notification never breaks the frame. */ }
}

const formatElapsed = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total % 3600 / 60)
  const seconds = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

interface Candidate {
  id: string
  title: string | null
  running: boolean
  pending: string | null
  main: boolean
  updatedAt: number
}

/** The conversations that are working or waiting, the one being read first. */
function activeCandidates(list: any, statuses: Map<string, SessionStatus> | undefined): Candidate[] {
  if (!statuses) return []
  const rows = (list?.byId ?? {}) as Record<string, any>
  const candidates: Candidate[] = []
  for (const [id, value] of statuses) {
    const pending = value.pendingInteraction?.kind ?? null
    if (!value.running && pending === null) continue
    const row = rows[id] ?? {}
    const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim().slice(0, 80) : null
    candidates.push({
      id,
      title,
      running: value.running === true,
      pending,
      main: (row.retainedBy?.mainView ?? 0) > 0,
      updatedAt: Number(row.updatedAt ?? 0),
    })
  }
  // The conversation on screen first, then the most recently touched one.
  candidates.sort((left, right) => Number(right.main) - Number(left.main) || right.updatedAt - left.updatedAt)
  return candidates
}

/**
 * Turn the live session facts into one spoken line: which conversation, what it
 * is doing, and how long it has been at it. With more than one conversation the
 * pet watches one at a time and `next` hands it to the following one.
 */
export function usePetNarration(
  list: any,
  statuses: Map<string, SessionStatus> | undefined,
  controller: PetController,
  t: Translate,
  /**
   * Whether anyone is looking at the narration. A hidden pet still tracks turn
   * endings (notifications are the point of that), but it must not keep a clock
   * or poll the host for a bubble nobody renders.
   */
  enabled = true,
): Narration {
  // The host publishes a fresh status Map on every change; the derived key keeps
  // the memo honest even when a caller hands back the same Map instance.
  const statusKey = statuses
    ? [...statuses].map(([id, value]) => `${id}:${value.running ? 1 : 0}:${value.pendingInteraction?.kind ?? ''}`).join(',')
    : ''
  const candidates = useMemo(() => activeCandidates(list, statuses), [list, statuses, statusKey])
  const [focusId, setFocusId] = useState<string | null>(null)
  const [activities, setActivities] = useState<Record<string, SessionActivity>>({})
  const [finished, setFinished] = useState<{ title: string | null, id: number } | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  /** The line the user closed, so only that exact line stays quiet. */
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const since = useRef<Map<string, number>>(new Map())
  const previous = useRef<Map<string, boolean>>(new Map())
  const turns = useRef<Map<string, number>>(new Map())
  const finishedSeq = useRef(0)

  const primary = candidates.find(candidate => candidate.id === focusId) ?? candidates[0] ?? null
  const anyRunning = candidates.some(candidate => candidate.running)
  const ids = candidates.map(candidate => candidate.id)
  const idKey = ids.join(',')

  // Watch every session so a turn finishing in the background still counts.
  useEffect(() => {
    if (!statuses) return
    const done: { title: string | null }[] = []
    const rows = (list?.byId ?? {}) as Record<string, any>
    for (const [id, value] of statuses) {
      const was = previous.current.get(id)
      const now = value.running === true
      // Each new turn gets its own identity, so a line the user closed stays
      // closed for that turn and comes back on the next one.
      if (now && was !== true) turns.current.set(id, (turns.current.get(id) ?? 0) + 1)
      if (was === true && !now) {
        const title = rows[id]?.title
        done.push({ title: typeof title === 'string' && title.trim() ? title.trim() : null })
      }
      previous.current.set(id, now)
    }
    for (const id of [...previous.current.keys()]) if (!statuses.has(id)) previous.current.delete(id)
    for (const id of [...turns.current.keys()]) if (!statuses.has(id)) turns.current.delete(id)
    if (done.length === 0) return
    // A turn that already wants the user's attention is not a celebration:
    // the waiting state says more than a finished one.
    if ([...statuses.values()].some(item => item.pendingInteraction)) return
    setFinished({ ...done[0], id: ++finishedSeq.current })
    setCelebrate(true)
    notifyFinished(done[0].title, t)
  }, [statuses, list, t])

  useEffect(() => {
    if (!celebrate) return
    const timer = globalThis.setTimeout(() => setCelebrate(false), 2_100)
    return () => globalThis.clearTimeout(timer)
  }, [celebrate])

  useEffect(() => {
    if (!finished) return
    const timer = globalThis.setTimeout(() => setFinished(null), 9_000)
    return () => globalThis.clearTimeout(timer)
  }, [finished])

  // One clock for every conversation, so switching focus keeps each elapsed
  // time truthful instead of restarting it.
  useEffect(() => {
    const map = since.current
    const now = Date.now()
    for (const candidate of candidates) if (candidate.running && !map.has(candidate.id)) map.set(candidate.id, now)
    for (const id of [...map.keys()]) if (!candidates.some(candidate => candidate.id === id && candidate.running)) map.delete(id)
  }, [candidates])

  useEffect(() => {
    if (!enabled || !anyRunning) return
    const timer = globalThis.setInterval(() => setTick(value => value + 1), 1_000)
    return () => globalThis.clearInterval(timer)
  }, [enabled, anyRunning])

  // Ask the host what the running conversations are doing, while they run.
  useEffect(() => {
    if (!enabled || ids.length === 0) {
      // Keep the previous object when there is nothing to clear: a fresh `{}`
      // would re-render for no new information.
      setActivities(current => Object.keys(current).length === 0 ? current : {})
      return
    }
    let cancelled = false
    let inFlight = false
    const load = () => {
      // One request at a time: a slow host must not queue a backlog of polls.
      if (inFlight) return
      // A hidden window has no reader; skip the round trip until it returns.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      inFlight = true
      void controller.activity(ids)
        .then(next => { if (!cancelled) setActivities(next) })
        .catch(() => {})
        .finally(() => { inFlight = false })
    }
    load()
    const timer = anyRunning ? globalThis.setInterval(load, ACTIVITY_POLL_MS) : undefined
    return () => {
      cancelled = true
      if (timer !== undefined) globalThis.clearInterval(timer)
    }
  }, [controller, idKey, anyRunning, enabled])

  const next = useCallback(() => {
    if (candidates.length < 2) return
    const index = candidates.findIndex(candidate => candidate.id === primary?.id)
    const target = candidates[(index + 1) % candidates.length]
    setFocusId(target.id)
  }, [candidates, primary?.id])

  let line: NarrationLine | null = null
  if (primary) {
    const title = primary.title ?? t('bubble.untitled')
    if (primary.pending) {
      line = { title, detail: t(primary.pending === 'question' ? 'bubble.question' : 'bubble.blocked'), tone: 'waiting' }
    } else {
      const activity = activities[primary.id]
      const activityText = activity?.phase === 'tool'
        ? t('bubble.tool', { tool: activity.tool ?? '—' })
        : activity?.phase === 'thinking' ? t('bubble.thinking') : t('bubble.busy')
      const elapsed = formatElapsed(Date.now() - (since.current.get(primary.id) ?? Date.now()))
      line = { title, detail: t('bubble.detail', { activity: activityText, elapsed }), tone: 'working' }
    }
  } else if (finished) {
    line = { title: finished.title ?? t('bubble.untitled'), detail: t('bubble.done'), tone: 'done' }
  }

  // What identifies this exact line. Closing the bubble silences only this key:
  // a new turn (new `turns` entry), a state change, or switching conversations
  // all produce a different one and speak again.
  const lineKey = primary
    ? `${primary.id}:${line?.tone ?? 'working'}:${turns.current.get(primary.id) ?? 0}`
    : finished ? `done:${finished.id}` : ''
  const visible = line !== null && lineKey !== dismissed

  return {
    line: visible ? line : null,
    count: candidates.length,
    celebrate,
    busy: primary?.running === true,
    next,
    dismiss: () => setDismissed(lineKey),
  }
}

/**
 * Open the detached pet document in a window of its own.
 *
 * That page reads `/api/dsh-x-pet/state`, so it needs no Client store and no
 * bundle. The Desktop shell denies `window.open` for its main window, so there
 * this stays a quiet no-op until the shell ships a pet window; a browser opens
 * it right away.
 */
async function openDetachedFrame(controller: PetController): Promise<void> {
  // 1. A Desktop shell that ships a pet window owns placement and stacking.
  try {
    const bridge = (globalThis as any).dshDesktop?.petWindow
    if (bridge !== undefined && typeof bridge.open === 'function') { void bridge.open(); return }
  } catch { /* Fall through to the plugin's own window. */ }
  // 2. The plugin's native shell: a floating panel the app window cannot clip.
  try { if (await controller.detach()) return } catch { /* Fall through to a popup. */ }
  // 3. A browser tab, which at least leaves the app window.
  try {
    globalThis.open?.('/api/dsh-x-pet/frame', 'dsh-x-pet-frame', 'width=280,height=340,menubar=no,toolbar=no,location=no,status=no')
  } catch { /* A denied popup never breaks the frame. */ }
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
  const dragged = useRef(false)
  const dragTeardown = useRef<(() => void) | null>(null)
  useEffect(() => () => { dragTeardown.current?.() }, [])
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
  // The frame renders `null` while the pet is off, so the narration behind it
  // must not keep a clock or poll the host either.
  const narration = usePetNarration(list, statuses, controller, t, active !== 'off')
  const animation = narration.celebrate ? 'waving' : state

  useEffect(() => { void controller.load() }, [controller])

  useEffect(() => {
    controller.release(active === 'off' ? [] : [active])
  }, [controller, active])

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
    const host = target.ownerDocument?.defaultView ?? globalThis
    const startX = event.clientX
    const startY = event.clientY
    const origin = offset ?? { x: 0, y: 0 }
    // Offset zero parks the sprite 20px inside the corner, so the clamp only
    // has to absorb the sprite itself: an offset past 12px would push its edge
    // beyond the window, where the OS clips it and the pet half-disappears.
    const box = target.getBoundingClientRect()
    const limit = (size: number, viewport: number) => Math.min(12, Math.round(size) + 28 - viewport)
    const minX = limit(box.width, host.innerWidth ?? 0)
    const minY = limit(box.height, host.innerHeight ?? 0)
    const clampX = (value: number) => Math.max(minX, Math.min(12, value))
    const clampY = (value: number) => Math.max(minY, Math.min(12, value))
    const latest = { x: origin.x, y: origin.y }
    let moved = false
    dragged.current = false
    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - startX
      const dy = move.clientY - startY
      // A drag starts only after a real move, so a click never turns into one.
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      moved = true
      dragged.current = true
      target.setPointerCapture?.(move.pointerId)
      latest.x = clampX(origin.x + dx)
      latest.y = clampY(origin.y + dy)
      setOffset({ x: latest.x, y: latest.y })
    }
    const teardown = () => {
      host.removeEventListener?.('pointermove', onMove)
      host.removeEventListener?.('pointerup', onUp)
      host.removeEventListener?.('pointercancel', onUp)
      host.removeEventListener?.('blur', teardown)
      if (dragTeardown.current === teardown) dragTeardown.current = null
    }
    // A press that never saw its release (the pointer left the window, the OS
    // ate the event) would otherwise leave this drag's listeners on the host.
    dragTeardown.current?.()
    dragTeardown.current = teardown
    const onUp = () => {
      teardown()
      if (!moved) return
      void controller.move(latest.x, latest.y).catch(() => {})
      // The click that follows this release is the tail of the drag, not a
      // request to open the picker. Clear the flag after it has passed.
      host.setTimeout(() => { dragged.current = false }, 0)
    }
    host.addEventListener?.('pointermove', onMove)
    host.addEventListener?.('pointerup', onUp)
    host.addEventListener?.('pointercancel', onUp)
    host.addEventListener?.('blur', teardown)
  }, [controller, offset])

  const onClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (dragged.current) { dragged.current = false; event.preventDefault(); return }
    setPickerOpen(true)
  }, [])

  if (active === 'off') return null

  const label = `${t('frame.label')} · ${t(STATE_LABEL[animation])}`
  const style = offset ? ({ '--dxp-x': `${offset.x}px`, '--dxp-y': `${offset.y}px` } as any) : undefined

  return <>
    <div className="dxp" style={style} data-pet-state={animation}>
      <div className="dxp-stage">
        <div className="dxp-bubble" data-show={narration.line !== null} data-tone={narration.line?.tone}>
          <span className="dxp-bubble-text" role="status" aria-live="polite">
            <strong className="dxp-bubble-title">
              {narration.line?.tone === 'done'
                ? <span className="dxp-bubble-check" aria-hidden="true">✓</span>
                : null}
              {narration.line?.title}
            </strong>
            <span className="dxp-bubble-detail">{narration.line?.detail}</span>
          </span>
          {narration.count > 1
            ? <button
              type="button"
              className="dxp-bubble-more"
              title={t('bubble.more', { count: narration.count })}
              aria-label={t('bubble.switch', { count: narration.count })}
              onClick={narration.next}
            >+{narration.count - 1}</button>
            : null}
          <button
            type="button"
            className="dxp-bubble-close"
            title={t('bubble.close')}
            aria-label={t('bubble.close')}
            onClick={narration.dismiss}
          >×</button>
        </div>
        <PetSprite
          url={url}
          rows={view?.pets.find(pet => pet.id === active)?.rows ?? 11}
          state={animation}
          loop={animation !== 'waving'}
          reducedMotion={reducedMotion}
          label={label}
          onPointerEnter={() => {}}
          onPointerLeave={() => {}}
          onPointerDown={onPointerDown}
          onClick={onClick}
          onKeyDown={() => {}}
        />
        <div className="dxp-status">{t(STATE_LABEL[state])}</div>
        <div className="dxp-controls">
          <button type="button" onClick={() => setPickerOpen(true)}>{t('frame.open')}</button>
          <button type="button" onClick={() => { void openDetachedFrame(controller) }}>{t('frame.popout')}</button>
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
  const activeRef = useRef(view?.active ?? 'off')
  activeRef.current = view?.active ?? 'off'
  useEffect(() => () => {
    const active = activeRef.current
    controller.release(active === 'off' ? [] : [active])
  }, [controller])
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
    <NotifyRow t={t} />
    <h3>{t('settings.pick')}</h3>
    {pets.length === 0
      ? <p className="dxp-empty">{t('settings.empty')}</p>
      : <ul className="dxp-grid">
        {pets.map(pet => <SettingsCard key={pet.id} pet={pet} active={view?.active === pet.id} t={t} controller={controller} onSelect={id => { void controller.select(id).catch(() => {}) }} />)}
      </ul>}
    <p className="dxp-settings-note">{t('settings.local', { path: view?.source ? `${view.source}/pets` : '~/.codex/pets' })}</p>
  </section>
}

/** Completion notifications are a browser permission, so they get their own switch. */
function NotifyRow(props: { t: Translate }) {
  const { t } = props
  const [permission, setPermission] = useState(notificationPermission)
  const [enabled, setEnabled] = useState(() => {
    try { return notificationsAllowed() } catch { return false }
  })
  const toggle = async () => {
    if (enabled) {
      try { globalThis.localStorage?.setItem(NOTIFY_KEY, 'off') } catch { /* private mode */ }
      setEnabled(false)
      return
    }
    let state = notificationPermission()
    if (state === 'default') {
      try { state = await (globalThis as any).Notification.requestPermission() } catch { state = 'denied' }
      setPermission(state)
    }
    if (state !== 'granted') { setEnabled(false); return }
    try { globalThis.localStorage?.setItem(NOTIFY_KEY, 'on') } catch { /* private mode */ }
    setEnabled(true)
  }
  return <div className="dxp-switch-row">
    <div>
      <strong>{t('settings.notify')}</strong>
      <span>{permission === 'denied' ? t('settings.notifyDenied') : t('settings.notifyHint')}</span>
    </div>
    <button
      type="button"
      role="switch"
      className="dxp-switch"
      aria-checked={enabled && permission === 'granted'}
      aria-label={t('settings.notify')}
      onClick={() => { void toggle() }}
    />
  </div>
}

function SettingsCard(props: { pet: any, active: boolean, t: Translate, controller: PetController, onSelect: (id: string) => void }) {
  const { pet, active, t, controller, onSelect } = props
  const [thumb, setThumb] = useState<{ src: string, cropped: boolean } | null>(null)
  useEffect(() => {
    let cancelled = false
    controller.thumbnail(pet.id, pet.rows).then(next => { if (!cancelled) setThumb(next) }).catch(() => { if (!cancelled) setThumb(null) })
    return () => { cancelled = true }
  }, [controller, pet.id])
  const art = thumb
    ? (thumb.cropped
      ? { backgroundImage: `url(${thumb.src})`, backgroundSize: '100% 100%' }
      : { backgroundImage: `url(${thumb.src})`, backgroundSize: `800% ${pet.rows * 100}%` })
    : undefined
  return <li>
    <button type="button" className="dxp-card" aria-current={active} onClick={() => onSelect(pet.id)}>
      <span className="dxp-card-art" aria-hidden="true" style={art} />
      <strong>{pet.displayName}</strong>
      <span>{pet.description || t('picker.rows', { rows: pet.rows })}</span>
    </button>
  </li>
}
