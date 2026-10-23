/**
 * One chord on every desktop: Shift+S with the alternate modifier.
 * Windows and Linux call that key Alt; macOS calls it Option. Both set
 * `altKey`. `code` is required because macOS Option rewrites `key`
 * (Shift+Option+S is not the character "S"). Typing in a field keeps the key.
 */
export const FIXED_BAR_SHORTCUT = 'Alt+Shift+S'

const APPLE_PLATFORM = /Macintosh|Mac OS X|iPhone|iPad|iPod|MacIntel|MacARM|MacPPC/i

export function isApplePlatform(nav?: { platform?: string, userAgent?: string, userAgentData?: { platform?: string } } | null) {
  const hinted = nav?.userAgentData?.platform ?? ''
  if (/^mac/i.test(hinted)) return true
  return APPLE_PLATFORM.test(`${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`)
}

/** Keycap labels for the current desktop. Apple uses symbols and no plus signs. */
export function fixedBarShortcutKeys(nav: any = globalThis.navigator) {
  return isApplePlatform(nav) ? ['⌥', '⇧', 'S'] : ['Alt', 'Shift', 'S']
}

export function fixedBarShortcutLabel(nav: any = globalThis.navigator) {
  const keys = fixedBarShortcutKeys(nav)
  return isApplePlatform(nav) ? keys.join('') : keys.join('+')
}

export function isFixedBarShortcut(event: any) {
  if (!event || event.repeat || !event.altKey || !event.shiftKey || event.code !== 'KeyS') return false
  const target = event.target
  if (target?.isContentEditable) return false
  return !['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
}
