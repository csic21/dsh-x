/**
 * Two chords, both Shift plus the alternate modifier.
 * Windows and Linux call that key Alt; macOS calls it Option. Both set
 * `altKey`. `code` is required because macOS Option rewrites `key`
 * (Shift+Option+S is not the character "S"). Typing in a field keeps the key.
 */
export const FIXED_BAR_SHORTCUT = 'Alt+Shift+S'
/** The boss key: one chord that makes the page read as a neutral workspace. */
export const BOSS_KEY_SHORTCUT = 'Alt+Shift+B'

const APPLE_PLATFORM = /Macintosh|Mac OS X|iPhone|iPad|iPod|MacIntel|MacARM|MacPPC/i

export function isApplePlatform(nav?: { platform?: string, userAgent?: string, userAgentData?: { platform?: string } } | null) {
  const hinted = nav?.userAgentData?.platform ?? ''
  if (/^mac/i.test(hinted)) return true
  return APPLE_PLATFORM.test(`${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`)
}

/** Keycap labels for the current desktop. Apple uses symbols and no plus signs. */
function shortcutKeys(letter: string, nav: any = globalThis.navigator) {
  return isApplePlatform(nav) ? ['⌥', '⇧', letter] : ['Alt', 'Shift', letter]
}

function shortcutLabel(letter: string, nav: any = globalThis.navigator) {
  const keys = shortcutKeys(letter, nav)
  return isApplePlatform(nav) ? keys.join('') : keys.join('+')
}

export const fixedBarShortcutKeys = (nav: any = globalThis.navigator) => shortcutKeys('S', nav)
export const fixedBarShortcutLabel = (nav: any = globalThis.navigator) => shortcutLabel('S', nav)
export const bossKeyShortcutKeys = (nav: any = globalThis.navigator) => shortcutKeys('B', nav)
export const bossKeyShortcutLabel = (nav: any = globalThis.navigator) => shortcutLabel('B', nav)

function matches(event: any, code: string) {
  if (!event || event.repeat || !event.altKey || !event.shiftKey || event.code !== code) return false
  const target = event.target
  if (target?.isContentEditable) return false
  return !['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
}

export function isFixedBarShortcut(event: any) {
  return matches(event, 'KeyS')
}

export function isBossKeyShortcut(event: any) {
  return matches(event, 'KeyB')
}
