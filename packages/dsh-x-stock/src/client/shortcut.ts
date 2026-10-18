/**
 * Alt+Shift+S shows or hides the fixed bottom bar. `code` is used instead of
 * `key` because macOS turns the combination into a different character. Typing
 * in a field keeps the key for the field.
 */
export const FIXED_BAR_SHORTCUT = 'Alt+Shift+S'
export function isFixedBarShortcut(event: any) {
  if (!event || event.repeat || !event.altKey || !event.shiftKey || event.code !== 'KeyS') return false
  const target = event.target
  if (target?.isContentEditable) return false
  return !['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
}
