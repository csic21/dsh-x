import React, { useEffect, useRef, useState } from 'react'
import { COLLAPSE_SNAP, dragSize, type SizeBounds } from './layout.ts'
interface SplitterProps { value: number, bounds: SizeBounds, label: string, orientation: 'vertical' | 'horizontal', direction: 1 | -1, className?: string, onResize: (value: number) => void, onToggle: () => void, onPreview?: (value: number) => void }
/**
 * A pointer/keyboard separator. Dragging paints the new size every frame and
 * commits once on release, so the tracks follow the pointer without a layout store write per event.
 */
export function Splitter({ value, bounds, label, orientation, direction, className = '', onResize, onToggle, onPreview }: SplitterProps) {
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ at: number, origin: number, pointer: number, latest: number, frame: number } | null>(null)
  const vertical = orientation === 'vertical'
  useEffect(() => () => {
    const state = drag.current
    if (state?.frame) cancelAnimationFrame(state.frame)
    restore()
  }, [])
  const restore = () => { try { document.body.style.cursor = ''; document.body.style.userSelect = '' } catch { /* no document */ } }
  const end = (event: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    const state = drag.current
    if (!state || state.pointer !== event.pointerId) return
    if (state.frame) cancelAnimationFrame(state.frame)
    drag.current = null
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* capture already gone */ }
    restore()
    setDragging(false)
    const next = state.latest
    // Dragging to the minimum collapses the track, like the editor's own split views.
    if (!commit) { onPreview?.(state.origin); return }
    if (next <= bounds.min + COLLAPSE_SNAP) onToggle()
    else onResize(next)
  }
  return <div
    className={`dxc-splitter ${className}`} data-orientation={orientation} role="separator" aria-orientation={orientation}
    aria-label={label} aria-valuemin={bounds.min} aria-valuemax={bounds.max} aria-valuenow={dragging ? undefined : value}
    data-dragging={dragging || undefined} tabIndex={0}
    onPointerDown={event => {
      if (event.button !== 0) return
      drag.current = { at: vertical ? event.clientX : event.clientY, origin: value, pointer: event.pointerId, latest: value, frame: 0 }
      setDragging(true)
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* pointer capture is optional */ }
      document.body.style.cursor = vertical ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
      event.preventDefault()
    }}
    onPointerMove={event => {
      const state = drag.current
      if (!state || state.pointer !== event.pointerId) return
      state.latest = dragSize(state.origin, ((vertical ? event.clientX : event.clientY) - state.at) * direction, bounds)
      if (state.frame) return
      const separator = event.currentTarget
      const paint = () => {
        const active = drag.current
        if (!active) return
        active.frame = 0
        separator.setAttribute('aria-valuenow', String(active.latest))
        onPreview?.(active.latest)
      }
      state.frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(paint) : (paint(), 0)
    }}
    onPointerUp={event => end(event, true)}
    onPointerCancel={event => end(event, false)}
    onDoubleClick={onToggle}
    onKeyDown={event => {
      const back = vertical ? 'ArrowLeft' : 'ArrowUp', forward = vertical ? 'ArrowRight' : 'ArrowDown'
      const step = event.shiftKey ? 48 : 12
      if (event.key === back || event.key === forward) {
        event.preventDefault()
        onResize(dragSize(value, (event.key === forward ? step : -step) * direction, bounds))
      } else if (event.key === 'Home') { event.preventDefault(); onResize(bounds.min) }
      else if (event.key === 'End') { event.preventDefault(); onResize(bounds.max) }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle() }
    }}
  ><span className="dxc-splitter-grip" aria-hidden="true" /></div>
}
