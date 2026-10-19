import React, { useEffect, useRef, useState } from 'react'
import { dragSize, type SizeBounds } from './layout.ts'
interface SplitterProps { value: number, bounds: SizeBounds, label: string, orientation: 'vertical' | 'horizontal', direction: 1 | -1, onResize: (value: number) => void, onToggle: () => void }
/**
 * A pointer/keyboard separator that previews a size while dragging and commits
 * once on release, so a drag never publishes dozens of layout writes.
 */
export function Splitter({ value, bounds, label, orientation, direction, onResize, onToggle }: SplitterProps) {
  const [preview, setPreview] = useState<number | null>(null)
  const drag = useRef<{ at: number, origin: number, pointer: number } | null>(null)
  const shown = preview ?? value, vertical = orientation === 'vertical'
  useEffect(() => () => { if (drag.current) restore() }, [])
  const restore = () => { try { document.body.style.cursor = '' } catch { /* no document */ } }
  const end = (event: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    const state = drag.current
    if (!state || state.pointer !== event.pointerId) return
    drag.current = null
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* capture already gone */ }
    restore()
    setPreview(null)
    if (commit) onResize(preview ?? state.origin)
  }
  return <div
    className="dxc-splitter" data-orientation={orientation} role="separator" aria-orientation={orientation}
    aria-label={label} aria-valuemin={bounds.min} aria-valuemax={bounds.max} aria-valuenow={shown}
    data-dragging={preview != null || undefined} tabIndex={0}
    onPointerDown={event => {
      if (event.button !== 0) return
      drag.current = { at: vertical ? event.clientX : event.clientY, origin: value, pointer: event.pointerId }
      setPreview(value)
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* pointer capture is optional */ }
      document.body.style.cursor = vertical ? 'col-resize' : 'row-resize'
      event.preventDefault()
    }}
    onPointerMove={event => {
      const state = drag.current
      if (!state || state.pointer !== event.pointerId) return
      setPreview(dragSize(state.origin, ((vertical ? event.clientX : event.clientY) - state.at) * direction, bounds))
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
