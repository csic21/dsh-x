import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MAX_PREVIEW_MEDIA_BYTES } from '../formats.ts'
import type { MediaKind } from '../formats.ts'

type Translate = (key: string, params?: Record<string, unknown>) => string
type Zoom = 'fit' | number

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

/** Decode a size-capped base64 payload. Invalid or oversized input is refused. */
export function decodeBase64(value: string): ArrayBuffer {
  if (value.length > Math.ceil(MAX_PREVIEW_MEDIA_BYTES / 3) * 4 || value.length % 4 !== 0 || !BASE64.test(value)) throw new Error('media')
  const binary = atob(value)
  if (binary.length > MAX_PREVIEW_MEDIA_BYTES) throw new Error('media')
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return buffer
}

function useMediaUrl(payload: string | null | undefined, mime: string, encoding: 'text' | 'base64'): string | null {
  const url = useMemo(() => {
    if (!payload) return null
    try {
      const blob = encoding === 'text' ? new Blob([payload], { type: mime }) : new Blob([decodeBase64(payload)], { type: mime })
      return URL.createObjectURL(blob)
    } catch { return null }
  }, [payload, mime, encoding])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return url
}

function stepZoom(current: Zoom, direction: 1 | -1): number {
  const base = current === 'fit' ? 1 : current
  const next = direction > 0 ? base * 1.25 : base / 1.25
  return Math.min(8, Math.max(0.1, Math.round(next * 100) / 100))
}

function ImageView({ src, name, label = 'image', t }: { src: string, name: string, label?: string, t: Translate }) {
  const stage = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<Zoom>('fit')
  const [natural, setNatural] = useState<{ width: number, height: number } | null>(null)
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    const node = stage.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      setMode(current => stepZoom(current, event.deltaY < 0 ? 1 : -1))
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [])
  const sized = mode !== 'fit' && natural && natural.width > 0
  return <div className="dxc-media" data-media={label}>
    <div className="dxc-media-toolbar" role="toolbar" aria-label={t('preview')}>
      <button type="button" aria-label={t('zoomOut')} onClick={() => setMode(current => stepZoom(current, -1))}>−</button>
      <span>{mode === 'fit' ? t('zoomFit') : t('zoomPercent', { percent: Math.round(mode * 100) })}</span>
      <button type="button" aria-label={t('zoomIn')} onClick={() => setMode(current => stepZoom(current, 1))}>+</button>
      <button type="button" aria-pressed={mode === 'fit'} onClick={() => setMode('fit')}>{t('zoomFit')}</button>
      <button type="button" aria-pressed={mode === 1} onClick={() => setMode(1)}>{t('zoomActual')}</button>
      {natural && natural.width > 0 && <span>{t('dimensions', { width: natural.width, height: natural.height })}</span>}
    </div>
    <div className="dxc-media-stage" data-fit={mode === 'fit' || undefined} ref={stage}>
      <img src={src} alt={name} hidden={broken || undefined} data-broken={broken || undefined} style={sized ? { width: Math.round(natural.width * mode) } : undefined} onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setBroken(true)} />
      {broken && <p className="dxc-state">{t('mediaFailed')}</p>}
    </div>
  </div>
}

/** Image, audio, and video preview. SVG is drawn as an image so scripts in the file do not run. */
export function MediaView({ kind, payload, encoding, mime, name, t }: { kind: MediaKind | 'svg', payload: string, encoding: 'text' | 'base64', mime: string, name: string, t: Translate }) {
  const url = useMediaUrl(payload, mime, encoding)
  if (!url) return <p className="dxc-state">{t('mediaFailed')}</p>
  if (kind === 'audio') return <div className="dxc-media dxc-player" data-media="audio"><audio controls src={url} /></div>
  if (kind === 'video') return <div className="dxc-media dxc-player" data-media="video"><video controls src={url} /></div>
  return <ImageView src={url} name={name} label={kind === 'svg' ? 'svg' : 'image'} t={t} />
}
