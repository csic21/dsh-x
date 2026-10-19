import { columnPercent, resolvePlayback, rowPercent } from '../frames.ts'
import type { Frame, LookFrame, PetState } from '../frames.ts'

/**
 * Drive one sprite element through the Codex frame plan. Returns a disposer.
 * The element is positioned with `background-position`, exactly like Codex:
 * one percentage per axis, so a sheet scales to any rendered size.
 */
export function playSprite(
  element: HTMLElement,
  state: PetState,
  options: { rows: number, reducedMotion: boolean, loop?: boolean, onFrame?: (frame: Frame) => void },
): () => void {
  const plan = resolvePlayback(state, { reducedMotion: options.reducedMotion, loop: options.loop })
  const set = (frame: Frame) => {
    element.style.backgroundPosition = `${columnPercent(frame.column)}% ${rowPercent(frame.row, options.rows)}%`
    options.onFrame?.(frame)
  }
  let index = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  set(plan.frames[0])
  if (plan.frames.length === 1) return () => { disposed = true }
  const tick = () => {
    if (disposed) return
    const next = index + 1
    if (next >= plan.frames.length) {
      if (plan.loopStart === null) return
      index = plan.loopStart
      set(plan.frames[index])
      timer = setTimeout(tick, plan.frames[index].durationMs)
      return
    }
    index = next
    set(plan.frames[index])
    timer = setTimeout(tick, plan.frames[index].durationMs)
  }
  timer = setTimeout(tick, plan.frames[0].durationMs)
  return () => { disposed = true; if (timer !== undefined) clearTimeout(timer) }
}

/** Show one look frame; Codex paints it over the animation while it lasts. */
export function showLookFrame(element: HTMLElement, look: LookFrame, rows: number): void {
  element.style.backgroundPosition = `${columnPercent(look.column)}% ${rowPercent(look.row, rows)}%`
}

/** True when the user asked the operating system for reduced motion. */
export function prefersReducedMotion(view: Window | undefined): boolean {
  try { return view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true } catch { return false }
}
