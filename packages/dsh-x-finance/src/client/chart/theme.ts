export const PALETTES = {
  light: { background: '#ffffff', text: '#26334a', grid: '#edf0f5', border: '#d9dfea', crosshair: '#78879b', reference: '#9aa5b5' },
  dark: { background: '#151c2a', text: '#d6dfef', grid: '#253044', border: '#38465e', crosshair: '#8e9cb5', reference: '#7d8aa3' },
}
export function resolveChartTheme(element: any, requested = 'auto') {
  if (requested === 'dark' || requested === 'light') return requested
  const view = element.ownerDocument.defaultView
  // Read the actual host surface first: OS preference must not override an
  // explicitly selected light shell. Host aliases are inherited by this node.
  const css = view?.getComputedStyle(element)
  const background = css?.getPropertyValue('--dsw-alias-bg-layer-1').trim()
  if (background) {
    const probe = element.ownerDocument.createElement('span')
    probe.style.color = background; probe.style.display = 'none'; element.appendChild(probe)
    const rgb = view.getComputedStyle(probe).color.match(/[\d.]+/g)?.slice(0, 3).map(Number)
    probe.remove()
    if (rgb?.length === 3) return (rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722) < 128 ? 'dark' : 'light'
  }
  for (let node = element; node; node = node.parentElement) {
    if (node.classList.contains('dark') || /dark/i.test(node.getAttribute('data-theme') ?? '')) return 'dark'
    if (node.classList.contains('light') || /light/i.test(node.getAttribute('data-theme') ?? '')) return 'light'
  }
  return view?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
export function observeChartTheme(element: any, requested: any, callback: any) {
  const view = element.ownerDocument.defaultView, media = view?.matchMedia?.('(prefers-color-scheme: dark)')
  let previous: any
  const update = () => { const value = resolveChartTheme(element, requested); if (previous !== value) { previous = value; callback(value) } }
  const observer = view?.MutationObserver ? new view.MutationObserver(update) : null
  for (let node = element.parentElement; node; node = node.parentElement) observer?.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
  media?.addEventListener?.('change', update); update()
  return () => { observer?.disconnect(); media?.removeEventListener?.('change', update) }
}
