import { createRequire } from 'node:module'
import { open as nodeOpen, stat as nodeStat } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'

/**
 * Electron patches `node:fs` so an `.asar` path reads as a virtual directory.
 * The built-in pets live in ChatGPT's asar, so this uses `original-fs` when
 * the host provides it and plain `node:fs` otherwise (tests, the CLI).
 */
const require = createRequire(import.meta.url)
const raw = (() => {
  try { return require('original-fs') as { promises: { open: typeof nodeOpen, stat: typeof nodeStat } } }
  catch { return null }
})()
const open = raw?.promises.open ?? nodeOpen
const stat = raw?.promises.stat ?? nodeStat

/** One file inside an Electron asar archive. Offsets are relative to the file payload. */
export interface AsarFile {
  path: string
  offset: number
  size: number
}

interface AsarIndex {
  files: AsarFile[]
  /** Byte offset where file payloads begin. */
  base: number
}

const indexes = new Map<string, { key: string, index: AsarIndex }>()

/**
 * Read the ChatGPT/Codex asar header. The JSON listing starts at byte 16;
 * its length is the uint32 at byte 12. Payloads follow, aligned to 4 bytes.
 */
async function loadIndex(file: string): Promise<AsarIndex> {
  const info = await stat(file)
  const key = `${info.mtimeMs}:${info.size}`
  const cached = indexes.get(file)
  if (cached?.key === key) return cached.index
  const handle = await open(file, 'r')
  try {
    const head = Buffer.alloc(16)
    if ((await handle.read(head, 0, 16, 0)).bytesRead !== 16) throw new Error('PET_ASAR')
    const jsonSize = head.readUInt32LE(12)
    if (jsonSize < 2 || jsonSize > 32 * 1024 * 1024) throw new Error('PET_ASAR')
    const json = Buffer.alloc(jsonSize)
    if ((await handle.read(json, 0, jsonSize, 16)).bytesRead !== jsonSize) throw new Error('PET_ASAR')
    const parsed = JSON.parse(json.toString('utf8')) as { files?: Record<string, unknown> }
    const files: AsarFile[] = []
    const walk = (node: { files?: Record<string, unknown> }, prefix: string) => {
      for (const [name, child] of Object.entries(node.files ?? {})) {
        const entry = child as { files?: Record<string, unknown>, size?: number, offset?: string }
        const next = prefix ? `${prefix}/${name}` : name
        if (entry.files) walk(entry, next)
        else if (typeof entry.size === 'number' && entry.offset !== undefined) {
          files.push({ path: next, offset: Number(entry.offset), size: entry.size })
        }
      }
    }
    walk(parsed, '')
    const index = { files, base: 16 + (jsonSize + 3 & ~3) }
    indexes.set(file, { key, index })
    return index
  } finally { await handle.close() }
}

/** List files whose path matches. The archive is indexed once per mtime. */
export async function listAsar(file: string, pattern: RegExp): Promise<AsarFile[]> {
  const index = await loadIndex(file)
  return index.files.filter(entry => pattern.test(entry.path))
}

/** Read one listed file. `entry` must come from {@link listAsar} for the same archive. */
export async function readAsar(file: string, entry: AsarFile): Promise<Uint8Array> {
  if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > 16 * 1024 * 1024) throw new Error('PET_ASAR')
  if (!Number.isSafeInteger(entry.offset) || entry.offset < 0) throw new Error('PET_ASAR')
  const index = await loadIndex(file)
  const known = index.files.find(item => item.path === entry.path && item.offset === entry.offset && item.size === entry.size)
  if (!known) throw new Error('PET_ASAR')
  const handle: FileHandle = await open(file, 'r')
  try {
    const bytes = Buffer.alloc(known.size)
    const read = await handle.read(bytes, 0, known.size, index.base + known.offset)
    if (read.bytesRead !== known.size) throw new Error('PET_ASAR')
    return bytes
  } finally { await handle.close() }
}
