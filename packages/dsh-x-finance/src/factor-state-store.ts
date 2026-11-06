// Host-side persistence for the daily factor state.
//
// Reads are deliberately forgiving: a missing, oversized, symlinked or
// malformed file returns null and the caller keeps the frozen statistics. A
// corrupt correction must never take the screen down, and it must never half
// apply: parseFactorState either returns a complete state or throws.
//
// Writes are atomic and private: a temporary file in the same directory is
// fsynced and renamed over the target, so a crash leaves the previous state
// intact instead of a truncated one.
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { FACTOR_STATE_FILE, FACTOR_STATE_MAX_BYTES, parseFactorState } from './factor-state.ts'
import type { FactorState } from './factor-state.ts'

/** Null on every failure: the frozen model is always a valid fallback. */
export async function readFactorState(directory: string): Promise<FactorState | null> {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) return null
  const target = path.join(directory, FACTOR_STATE_FILE)
  try {
    const info = await lstat(target)
    if (!info.isFile() || info.isSymbolicLink() || info.size > FACTOR_STATE_MAX_BYTES) return null
    return parseFactorState(JSON.parse(await readFile(target, 'utf8')))
  } catch {
    return null
  }
}

export async function writeFactorState(directory: string, state: FactorState): Promise<void> {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('invalid factor state directory')
  const parsed = parseFactorState(state)
  const text = `${JSON.stringify(parsed)}\n`
  if (Buffer.byteLength(text) > FACTOR_STATE_MAX_BYTES) throw new Error('factor state too large')
  await mkdir(directory, { recursive: true })
  const target = path.join(directory, FACTOR_STATE_FILE)
  const temporary = path.join(directory, `.${FACTOR_STATE_FILE}.${process.pid}.${Date.now()}.tmp`)
  const handle = await open(temporary, 'wx', 0o600)
  try {
    try {
      await handle.writeFile(text, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}
