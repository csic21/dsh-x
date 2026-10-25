import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** How strong the glass reads: more blur and more fill as it increases. */
export const GLASS_LEVELS = ['clear', 'regular', 'dense'] as const
export type GlassLevel = typeof GLASS_LEVELS[number]

/** One persisted appearance choice. Every field has a defined default. */
export interface UiAppearance {
  version: 1
  /** The whole treatment can be switched off without uninstalling. */
  enabled: boolean
  /** Blur and fill strength. */
  level: GlassLevel
  /** The living gradient behind the columns. Without it the glass has nothing to show. */
  backdrop: boolean
  /** The specular rim and highlight that make a surface read as glass rather than as a flat tint. */
  refraction: boolean
}

export const DEFAULT_APPEARANCE: UiAppearance = Object.freeze({
  version: 1,
  enabled: true,
  level: 'regular',
  backdrop: true,
  refraction: true,
})

/** The fields a user can change; `version` is owned by the store. */
export type UiAppearanceFields = Omit<UiAppearance, 'version'>
export type UiAppearancePatch = Partial<UiAppearanceFields>

export interface UiStore {
  /** What was persisted, or null when this profile has never stored a choice. */
  read(): Promise<UiAppearance | null>
  /** Merge one patch over `base` and persist the complete result. */
  write(patch: UiAppearancePatch, base: UiAppearance): Promise<UiAppearance>
  /** Where the choice lives, for diagnostics. */
  readonly directory: string
}

const STATE_FILE = 'appearance.json'
const MAX_FILE_BYTES = 16 * 1024

const isGlassLevel = (value: unknown): value is GlassLevel =>
  typeof value === 'string' && (GLASS_LEVELS as readonly string[]).includes(value)

/**
 * Normalize an untrusted record into a complete appearance. Unknown fields are
 * dropped and out-of-range values fall back to the default, so a hand-edited or
 * older file never leaves the UI half-styled.
 */
export function normalizeAppearance(value: unknown): UiAppearance {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const flag = (key: keyof UiAppearance, fallback: boolean): boolean =>
    typeof record[key] === 'boolean' ? record[key] as boolean : fallback
  return {
    version: 1,
    enabled: flag('enabled', DEFAULT_APPEARANCE.enabled),
    level: isGlassLevel(record.level) ? record.level : DEFAULT_APPEARANCE.level,
    backdrop: flag('backdrop', DEFAULT_APPEARANCE.backdrop),
    refraction: flag('refraction', DEFAULT_APPEARANCE.refraction),
  }
}

/**
 * Read one patch from an untrusted payload. A key that is present must carry a
 * legal value: silently ignoring a bad value would save less than the user
 * asked for while the UI already showed the change.
 */
export function readPatch(value: unknown): UiAppearancePatch {
  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('UI_PATCH')
  }
  const record = value as Record<string, unknown>
  const patch: UiAppearancePatch = {}
  for (const key of ['enabled', 'backdrop', 'refraction'] as const) {
    if (record[key] === undefined) continue
    if (typeof record[key] !== 'boolean') throw new Error('UI_PATCH')
    patch[key] = record[key] as boolean
  }
  if (record.level !== undefined) {
    if (!isGlassLevel(record.level)) throw new Error('UI_LEVEL')
    patch.level = record.level
  }
  if (Object.keys(patch).length === 0) throw new Error('UI_PATCH')
  return patch
}

/**
 * Resolve the appearance to apply. The shipped default is the floor, the
 * composition's Config seeds the first run, and a stored choice wins over both
 * — so an upgrade that changes the default never flips a user's decision.
 */
export function resolveAppearance(
  stored: UiAppearance | null,
  config: UiAppearancePatch = {},
): UiAppearance {
  const seed = normalizeAppearance({ ...DEFAULT_APPEARANCE, ...config })
  return stored === null ? seed : { ...seed, ...stored, version: 1 }
}

/**
 * A small JSON file under the profile directory. The appearance is one user's
 * choice for this profile, so it never touches the official session store.
 */
export function createUiStore(profileDirectory: string): UiStore {
  const directory = path.join(profileDirectory, '.dsh-x-ui')
  const file = path.join(directory, STATE_FILE)

  const read = async (): Promise<UiAppearance | null> => {
    try {
      const raw = await readFile(file, 'utf8')
      if (Buffer.byteLength(raw, 'utf8') > MAX_FILE_BYTES) return null
      const parsed = JSON.parse(raw) as unknown
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
      return normalizeAppearance(parsed)
    } catch {
      // A missing or unreadable file is the first run, not an error to surface:
      // the UI must still render, with the default treatment.
      return null
    }
  }

  const write = async (patch: UiAppearancePatch, base: UiAppearance): Promise<UiAppearance> => {
    const next = normalizeAppearance({ ...base, ...patch })
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await writeFile(file, JSON.stringify(next), { mode: 0o600 })
    return next
  }

  return { read, write, directory }
}
