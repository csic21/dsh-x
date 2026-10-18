import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, link, unlink } from 'node:fs/promises'
import path from 'node:path'
import { SCOPE_ENDPOINT, validateScope } from './watchlist.ts'
import { createRpcRoute, failure } from './rpc.ts'

// The launcher-owned profile directory is the authority. The browser sees only
// this ordinary random identifier, never a home path or credential-derived hash.
export async function loadProfileScope(profileDirectory: any) {
  if (typeof profileDirectory !== 'string' || !path.isAbsolute(profileDirectory)) throw new Error('缺少有效的宿主 profile 目录。')
  const directory = path.join(profileDirectory, '.dsh-x-stock')
  const target = path.join(directory, 'scope.json')
  const read = async () => {
    const text = await readFile(target, 'utf8')
    if (text.length > 1024) throw new Error('自选存储标识无效。')
    const value = JSON.parse(text)
    if (value?.version !== 1) throw new Error('自选存储标识版本无效。')
    return validateScope(value.scope)
  }
  try { return await read() } catch (error: any) { if (error.code !== 'ENOENT') throw error }
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = path.join(directory, `${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, scope: randomUUID() }), { flag: 'wx', mode: 0o600 })
    // Atomic exclusive publication: concurrent Host starts never overwrite an
    // established identity or observe a partially written destination.
    try { await link(temporary, target) } catch (error: any) { if (error.code !== 'EEXIST') throw error }
  } finally { await unlink(temporary).catch(() => {}) }
  return read()
}

export function createScopeRoute(readScope: any) {
  return createRpcRoute(SCOPE_ENDPOINT, async (_endpoint: any, payload: any) => {
    if (!payload || Object.getPrototypeOf(payload) !== Object.prototype || Object.keys(payload).length) return failure('stock/invalid-input', '存储标识请求参数无效。')
    try { return { ok: true, value: { scope: await readScope() } } }
    catch { return failure('stock/scope-unavailable', '无法打开此 profile 的自选存储，请检查宿主目录权限后重试。') }
  })
}
