import React from 'react'
type IconProps = { size?: number }
const base = (size: number) => ({ viewBox: '0 0 16 16', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const })
export function ExplorerIcon({ size = 16 }: IconProps) { return <svg {...base(size)}><path d="M2.5 3.5h4l1.2 1.5h5.8v7.5H2.5z" /></svg> }
export function SearchIcon({ size = 16 }: IconProps) { return <svg {...base(size)}><circle cx="7" cy="7" r="4" /><path d="m10 10 3.5 3.5" /></svg> }
export function ReviewIcon({ size = 16 }: IconProps) { return <svg {...base(size)}><path d="M8 1.8 13 3.6v4.1c0 3.4-2.4 5.4-5 6.5-2.6-1.1-5-3.1-5-6.5V3.6z" /><path d="m5.7 7.8 1.7 1.7 3.1-3.4" /></svg> }
export function HistoryIcon({ size = 16 }: IconProps) { return <svg {...base(size)}><circle cx="8" cy="8" r="5.6" /><path d="M8 4.8V8l2.3 1.5" /></svg> }
export function FilesIcon({ size = 16 }: IconProps) { return <svg {...base(size)}><path d="M4 1.8h5l3 3v9.4H4z" /><path d="M9 1.8v3h3" /></svg> }
export function ChangesIcon({ size = 16 }: IconProps) { return <svg {...base(size)}><circle cx="4" cy="3.4" r="1.5" /><circle cx="4" cy="12.6" r="1.5" /><circle cx="12" cy="8" r="1.5" /><path d="M4 4.9v6.2M5.5 8h5" /></svg> }
export function ChevronIcon({ size = 16 }: IconProps) { return <svg {...base(size)}><path d="m6 4 4 4-4 4" /></svg> }
export function CloseIcon({ size = 16 }: IconProps) { return <svg {...base(size)}><path d="m4.5 4.5 7 7m0-7-7 7" /></svg> }
export function SidebarIcon({ size = 16 }: IconProps) { return <svg {...base(size)}><rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.4" /><path d="M6 2.8v10.4" /></svg> }
export function PanelIcon({ size = 16 }: IconProps) { return <svg {...base(size)}><rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.4" /><path d="M1.8 9.6h12.4" /></svg> }
export function WrapIcon({ size = 14 }: IconProps) { return <svg {...base(size)}><path d="M2.5 4.5h11M2.5 8h8.5a2 2 0 0 1 0 4H8" /><path d="m9.6 10.6-1.6 1.4 1.6 1.4" /></svg> }
export function CodeGlyph({ size = 20 }: IconProps) { return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18" strokeLinecap="round" strokeLinejoin="round" /></svg> }
