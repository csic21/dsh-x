import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { inspectAtlas } from './atlas.ts'
import type { AtlasInfo } from './atlas.ts'
import { readAsar } from './asar.ts'
import { discoverBuiltin } from './builtin.ts'
import type { BuiltinPet } from './builtin.ts'

/** One selectable pet, already validated against the Codex atlas contract. */
export interface PetEntry {
  /** Stable id: the folder name for a local pet, or `dsh-x-pet:default`. */
  id: string
  displayName: string
  description: string
  /** `codex` is a built-in pet read from the installed app; `local` is `~/.codex/pets`. */
  source: 'bundled' | 'local' | 'codex'
  rows: 9 | 11
  mime: 'image/png' | 'image/webp'
  bytes: number
}

export interface PetPosition { x: number, y: number }

export interface PetSelection {
  version: 1
  /** Pet id, or `off` when the companion is hidden. */
  active: string
  /** The pet to restore when the switch is turned back on. */
  chosen: string | null
  /** Last dragged position in CSS pixels from the frame's bottom-right corner. */
  position: PetPosition | null
}

export const DEFAULT_PET_ID = 'dsh-x-pet:default'
export const PET_OFF = 'off'
/** One atlas is a few MiB at most; anything larger is not a pet sheet. */
export const MAX_ATLAS_BYTES = 8 * 1024 * 1024
const MAX_MANIFEST_BYTES = 16 * 1024
const FOLDER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const SHEET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(?:png|webp)$/

export interface PetStore {
  /** Every pet the user can pick, bundled first. */
  list(): Promise<PetEntry[]>
  /** The selected pet's atlas bytes plus the header that describes them. */
  atlas(id: string): Promise<{ entry: PetEntry, bytes: Uint8Array }>
  /** Current selection, falling back to the bundled pet. */
  selection(): Promise<PetSelection>
  /** Persist one selection and return what was stored. */
  select(id: string): Promise<PetSelection>
  /** Persist the dragged position (bounded to sane pixel values). */
  move(position: PetPosition): Promise<PetSelection>
  /** Where the selection lives, for diagnostics. */
  readonly directory: string
}

/** A dragged position is two finite pixel offsets; anything else is dropped. */
function readPosition(value: unknown): PetPosition | null {
  if (!value || typeof value !== 'object') return null
  const { x, y } = value as Record<string, unknown>
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x: Math.round(Math.max(-20_000, Math.min(20_000, x as number))), y: Math.round(Math.max(-20_000, Math.min(20_000, y as number))) }
}

const text = (value: unknown, fallback: string, max = 200): string =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : fallback

interface LocalManifest { displayName: string, description: string, sheet: string }

/** Read one local pet manifest. The folder name is the pet identity, as in Codex. */
async function readManifest(directory: string, folder: string): Promise<LocalManifest | null> {
  const manifestPath = path.join(directory, 'pet.json')
  try {
    const info = await stat(manifestPath)
    if (!info.isFile() || info.size > MAX_MANIFEST_BYTES) return null
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    // A manifest that names a different id than its folder is not loadable: the
    // folder is the address, so a mismatched id would shadow another pet.
    if (typeof parsed.id === 'string' && parsed.id !== folder) return null
    const sheet = typeof parsed.spritesheetPath === 'string' ? parsed.spritesheetPath : 'spritesheet.webp'
    // The sheet must be a plain file name inside this folder: no traversal.
    if (!SHEET.test(sheet)) return null
    return {
      displayName: text(parsed.displayName, folder, 48),
      description: text(parsed.description, '', 200),
      sheet,
    }
  } catch { return null }
}

export function createPetStore(options: {
  /** Official profile directory: plugin state lives under it, never in sessions. */
  profileDirectory: string
  /** Where the bundled pet ships inside this package. */
  bundledDirectory: string
  /** `${CODEX_HOME:-~/.codex}`. Absent means local pets are simply unavailable. */
  codexHome: string | undefined
  /** Installed Codex/ChatGPT `app.asar`. Absent means the built-in pets are unavailable. */
  codexAsar?: string
}): PetStore {
  const stateDirectory = path.join(options.profileDirectory, '.dsh-x-pet')
  const selectionPath = path.join(stateDirectory, 'pet.json')
  const localRoot = options.codexHome ? path.join(options.codexHome, 'pets') : undefined
  let cachedBundled: PetEntry | null | undefined
  let cachedBuiltin: BuiltinPet[] | undefined

  const bundled = async (): Promise<PetEntry | null> => {
    if (cachedBundled !== undefined) return cachedBundled
    try {
      const bytes = await readFile(path.join(options.bundledDirectory, 'spritesheet.webp'))
      const atlas: AtlasInfo = inspectAtlas(bytes)
      const manifest = JSON.parse(await readFile(path.join(options.bundledDirectory, 'pet.json'), 'utf8')) as Record<string, unknown>
      cachedBundled = {
        id: DEFAULT_PET_ID,
        displayName: text(manifest.displayName, 'Harness', 48),
        description: text(manifest.description, '', 200),
        source: 'bundled',
        rows: atlas.rows,
        mime: atlas.mime,
        bytes: bytes.byteLength,
      }
    } catch { cachedBundled = null }
    return cachedBundled
  }

  const builtin = async (): Promise<BuiltinPet[]> => {
    if (cachedBuiltin) return cachedBuiltin
    if (!options.codexAsar) { cachedBuiltin = []; return cachedBuiltin }
    try { cachedBuiltin = await discoverBuiltin(options.codexAsar) }
    catch { cachedBuiltin = [] }
    return cachedBuiltin
  }

  const list = async (): Promise<PetEntry[]> => {
    const pets: PetEntry[] = []
    for (const pet of await builtin()) pets.push(pet.entry)
    const base = await bundled()
    if (base) pets.push(base)
    if (!localRoot) return pets
    let folders: string[] = []
    try { folders = await readdir(localRoot) } catch { return pets }
    for (const folder of folders.filter(value => FOLDER.test(value)).sort().slice(0, 200)) {
      const directory = path.join(localRoot, folder)
      try { if (!(await stat(directory)).isDirectory()) continue } catch { continue }
      const manifest = await readManifest(directory, folder)
      if (!manifest) continue
      try {
        const info = await stat(path.join(directory, manifest.sheet))
        if (!info.isFile() || info.size > MAX_ATLAS_BYTES) continue
        const atlas = inspectAtlas(await readFile(path.join(directory, manifest.sheet)))
        pets.push({
          id: folder,
          displayName: manifest.displayName,
          description: manifest.description,
          source: 'local',
          rows: atlas.rows,
          mime: atlas.mime,
          bytes: info.size,
        })
      } catch { /* Not a pet sheet: skip it rather than advertise a broken entry. */ }
    }
    return pets
  }

  const selection = async (): Promise<PetSelection> => {
    try {
      const info = await stat(selectionPath)
      if (info.size > 1024) throw new Error('oversized')
      const parsed = JSON.parse(await readFile(selectionPath, 'utf8')) as Partial<PetSelection>
      if (parsed?.version === 1 && (parsed.active === PET_OFF || typeof parsed.active === 'string')) {
        const active = String(parsed.active).slice(0, 128)
        const chosen = typeof parsed.chosen === 'string' ? parsed.chosen.slice(0, 128) : active === PET_OFF ? null : active
        return { version: 1, active, chosen, position: readPosition(parsed.position) }
      }
    } catch { /* No saved selection yet: the caller picks the first available pet. */ }
    return { version: 1, active: '', chosen: null, position: null }
  }

  const save = async (value: PetSelection): Promise<void> => {
    await mkdir(stateDirectory, { recursive: true, mode: 0o700 })
    await writeFile(selectionPath, JSON.stringify(value), { mode: 0o600 })
  }

  return {
    directory: stateDirectory,
    list,
    async atlas(id) {
      const entry = (await list()).find(pet => pet.id === id)
      if (!entry) throw new Error('PET_UNKNOWN')
      let directory: string
      let sheet: string
      if (entry.source === 'codex') {
        const sheet = (await builtin()).find(pet => pet.entry.id === id)
        if (!sheet || !options.codexAsar) throw new Error('PET_UNKNOWN')
        const bytes = await readAsar(options.codexAsar, sheet.file)
        if (bytes.byteLength > MAX_ATLAS_BYTES) throw new Error('PET_TOO_LARGE')
        const atlas = inspectAtlas(bytes)
        return { entry: { ...entry, rows: atlas.rows, mime: atlas.mime, bytes: bytes.byteLength }, bytes }
      }
      if (entry.source === 'bundled') {
        directory = options.bundledDirectory
        sheet = 'spritesheet.webp'
      } else {
        directory = path.join(localRoot!, entry.id)
        const manifest = await readManifest(directory, entry.id)
        if (!manifest) throw new Error('PET_UNKNOWN')
        sheet = manifest.sheet
      }
      const bytes = await readFile(path.join(directory, sheet))
      if (bytes.byteLength > MAX_ATLAS_BYTES) throw new Error('PET_TOO_LARGE')
      const atlas = inspectAtlas(bytes)
      return { entry: { ...entry, rows: atlas.rows, mime: atlas.mime, bytes: bytes.byteLength }, bytes }
    },
    selection,
    async select(id) {
      if (id !== PET_OFF && !(await list()).some(pet => pet.id === id)) throw new Error('PET_UNKNOWN')
      const current = await selection()
      const chosen = id === PET_OFF ? (current.active === PET_OFF ? current.chosen : current.active) : id
      const value: PetSelection = { version: 1, active: id, chosen, position: current.position }
      await save(value)
      return value
    },
    async move(position) {
      const value: PetSelection = { ...(await selection()), position: readPosition(position) }
      await save(value)
      return value
    },
  }
}
