/**
 * Host-side fold of the live sessions into what a detached pet window needs.
 *
 * The in-app pet reads the Client's session store (titles, running flags,
 * pending interactions). A separate window cannot: different origin, different
 * store. So the Host derives the same story from the session logs it owns,
 * and the window only renders it.
 */
import { resolvePlayback } from './frames.ts'
import type { Frame, PetState } from './frames.ts'

/** The slice of a live Session this fold reads. */
export interface LiveSessionFacts {
  id: string
  seq?: number
  snapshotEvents(from?: number): readonly FrameEvent[]
}

export interface FrameEvent {
  type: string
  seq?: number
  time?: number
  /** Event payload; each event type narrows it itself. */
  data?: unknown
}

export interface FrameFacts {
  sessionId: string | null
  title: string | null
  /** What the watched conversation is doing right now. */
  phase: 'tool' | 'thinking' | 'working' | 'idle'
  /** The tool in flight, when `phase` is `tool`. */
  tool: string | null
  /** Milliseconds since the running turn started; null when it began out of view. */
  elapsedMs: number | null
  /** How many conversations are running. */
  count: number
  /** The animation the sprite should play. */
  state: PetState
}

/** How many trailing events one fold reads: enough for a turn, never the whole log. */
const TAIL = 128

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined

/**
 * Read one session's tail into the facts the pet narrates.
 *
 * A session is running while its last `turn/start` has no later `turn/end`.
 * The title is the last `session/title` the tail still holds; an older title
 * simply stays unknown rather than scanning a long log on every frame.
 */
export function readSessionFacts(
  session: LiveSessionFacts,
  now = Date.now(),
): Omit<FrameFacts, 'count'> & { startedAt: number | null } {
  const empty = { sessionId: session.id, title: null, phase: 'idle' as const, tool: null, elapsedMs: null, state: 'idle' as PetState, startedAt: null }
  try {
    const last = Number(session.seq ?? 0)
    const events = session.snapshotEvents(Math.max(0, last - TAIL))
    let title: string | null = null
    let running = false
    let turnStart: number | null = null
    let call: { seq: number, name: unknown } | null = null
    let resultSeq = -1
    for (const event of events) {
      if (event.type === 'session/title') {
        const value = asRecord(event.data)?.title
        if (typeof value === 'string' && value.trim()) title = value.trim()
      } else if (event.type === 'turn/start') {
        running = true
        turnStart = typeof event.time === 'number' ? event.time : null
      } else if (event.type === 'turn/end') {
        running = false
        turnStart = null
      } else if (event.type === 'tool/call') {
        call = { seq: Number(event.seq ?? -1), name: asRecord(event.data)?.name }
        resultSeq = -1
      } else if (event.type === 'tool/result') {
        resultSeq = Number(event.seq ?? -1)
      }
    }
    if (!running) return { ...empty, title }
    const phase: FrameFacts['phase'] = call !== null && call.seq > resultSeq ? 'tool' : 'thinking'
    const tool = phase === 'tool' && typeof call?.name === 'string' ? call.name.slice(0, 64) : null
    const elapsedMs = turnStart === null ? null : Math.max(0, now - turnStart)
    return { ...empty, title, phase, tool, elapsedMs, state: 'running', startedAt: turnStart }
  } catch {
    // A log that cannot be read degrades to a quiet pet, never to an error.
    return empty
  }
}

/**
 * Fold every live session into one story: the most recently started turn wins,
 * because that is the conversation the user just touched.
 */
export function readFrameFacts(sessions: readonly LiveSessionFacts[], now = Date.now()): FrameFacts {
  let best: Omit<FrameFacts, 'count'> | null = null
  let bestStart = -1
  let count = 0
  for (const session of sessions) {
    const { startedAt, ...facts } = readSessionFacts(session, now)
    if (facts.state !== 'running') continue
    count += 1
    // The turn that started last is the one the user is watching.
    const start = startedAt ?? -1
    if (start > bestStart) { best = facts; bestStart = start }
  }
  return { ...(best ?? { sessionId: null, title: null, phase: 'idle' as const, tool: null, elapsedMs: null, state: 'idle' as PetState }), count }
}

/** The playback plan a window mirrors until the next poll; every state loops. */
export function playbackFor(state: PetState): { frames: Frame[], loopStart: number | null } {
  try {
    const plan = resolvePlayback(state, { loop: true })
    return { frames: plan.frames, loopStart: plan.loopStart }
  } catch {
    return { frames: [], loopStart: null }
  }
}
