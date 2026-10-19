import React from 'react'
import { fileIconKind, type FileIconKind } from './file-icon.ts'

const INK = '#fff'
const INK_DARK = '#3a3320'

function Doc({ color, size, label, ink = INK }: { color: string, size: number, label?: string, ink?: string }) {
  return <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
    <path fill={color} d="M3 1.3h6.1L13.2 5.4V14.7H3z" />
    <path fill={INK} fillOpacity=".55" d="M9.1 1.3V5.4h4.1z" />
    {label ? <text x="8" y="12.2" textAnchor="middle" fill={ink} fontSize="5.6" fontWeight="700" fontFamily="ui-sans-serif,system-ui,sans-serif">{label}</text> : <path stroke={INK} strokeWidth="1" strokeLinecap="round" d="M5 8.2h6M5 10.4h4.2" />}
  </svg>
}

function Badge({ color, size, label, ink = INK }: { color: string, size: number, label: string, ink?: string }) {
  return <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
    <rect x="1.2" y="1.2" width="13.6" height="13.6" rx="3" fill={color} />
    <text x="8" y="11.15" textAnchor="middle" fill={ink} fontSize={label.length > 2 ? 4.6 : 6.2} fontWeight="700" fontFamily="ui-sans-serif,system-ui,sans-serif">{label}</text>
  </svg>
}

function Glyph({ kind, size }: { kind: FileIconKind, size: number }) {
  if (kind === 'typescript') return <Badge color="#3178c6" size={size} label="TS" />
  if (kind === 'javascript') return <Badge color="#f0d454" size={size} label="JS" ink={INK_DARK} />
  if (kind === 'json') return <Doc color="#c9b458" size={size} label="{ }" ink={INK_DARK} />
  if (kind === 'markdown') return <Doc color="#519aba" size={size} label="M" />
  if (kind === 'yaml') return <Doc color="#7b5ea7" size={size} />
  if (kind === 'html') return <Badge color="#e44d26" size={size} label="<>" />
  if (kind === 'style') return <Badge color="#2b9fd8" size={size} label="#" />
  if (kind === 'shell') return <Badge color="#3d9a4a" size={size} label="$" />
  if (kind === 'python') return <Badge color="#3776ab" size={size} label="PY" />
  if (kind === 'go') return <Badge color="#00acc1" size={size} label="GO" />
  if (kind === 'rust') return <Badge color="#d4844a" size={size} label="RS" />
  if (kind === 'vue') return <Badge color="#41b883" size={size} label="V" />
  if (kind === 'xml') return <Doc color="#e37933" size={size} label="</>" />
  if (kind === 'package') return <Badge color="#cb3837" size={size} label="npm" />
  if (kind === 'docker') return <Badge color="#2496ed" size={size} label="D" />
  if (kind === 'license') return <Doc color="#c9a227" size={size} label="§" ink={INK_DARK} />
  if (kind === 'lock') return <Doc color="#8b939c" size={size} />
  if (kind === 'text') return <Doc color="#8b939c" size={size} />
  if (kind === 'git') return <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true"><circle cx="4" cy="3.2" r="1.7" fill="#f05133" /><circle cx="4" cy="12.8" r="1.7" fill="#f05133" /><circle cx="12" cy="8" r="1.7" fill="#f05133" /><path d="M4 4.9v6.2M5.6 8.4h4.7" stroke="#f05133" strokeWidth="1.3" fill="none" /></svg>
  if (kind === 'svg' || kind === 'image') return <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true"><rect x="1.4" y="2.2" width="13.2" height="11.6" rx="2" fill={kind === 'svg' ? '#e39b2b' : '#7b6bb5'} /><path d="m2.6 11.2 3-3.2 2.1 2.2 1.8-1.6 3.9 3.4" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" /><circle cx="11.2" cy="5.6" r="1.1" fill="#fff" /></svg>
  if (kind === 'audio') return <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true"><rect x="1.2" y="1.2" width="13.6" height="13.6" rx="3" fill="#1f9d6a" /><path d="M6.2 11.2V5.4l5-1.2v5.6" fill="none" stroke="#fff" strokeWidth="1.2" /><circle cx="5.2" cy="11.2" r="1.3" fill="#fff" /><circle cx="10.2" cy="9.8" r="1.3" fill="#fff" /></svg>
  if (kind === 'video') return <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true"><rect x="1.2" y="3" width="10.2" height="10" rx="1.6" fill="#7b5ea7" /><path d="m11.4 6.2 3.2-1.6v6.8l-3.2-1.6z" fill="#7b5ea7" /></svg>
  return <Doc color="#8b939c" size={size} />
}

/** A colored type mark for a file path. Decorative only; the accessible name stays on the row. */
export function FileTypeIcon({ path, size = 16 }: { path: string, size?: number }) {
  return <span className="dxc-type-icon" data-file-icon={fileIconKind(path)}><Glyph kind={fileIconKind(path)} size={size} /></span>
}

export function FolderIcon({ size = 16 }: { size?: number }) {
  return <span className="dxc-folder-icon" aria-hidden="true"><svg viewBox="0 0 16 16" width={size} height={size}>
    <path fill="#dcb67a" d="M1.4 3.6h4.4l1.15 1.35H14.6V13H1.4z" />
    <path fill="#c4a068" d="M1.4 6h13.2V13H1.4z" />
  </svg></span>
}
