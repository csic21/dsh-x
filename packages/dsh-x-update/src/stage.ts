import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pendingAppPath, pendingPluginPath, updatesDir } from './local.ts'
import type { FetchLike } from './releases.ts'
import type { PluginArtifact, PluginRelease, PendingAppUpdate, PendingPluginFile, PendingPluginUpdate, UpdateTarget } from './types.ts'

export interface DownloadOptions {
  url: string
  target: string
  sha256: string
  integrity?: string
  maxBytes: number
  fetchImpl?: FetchLike
  signal?: AbortSignal
  onProgress?: (received: number, total: number | null) => void
}

function parseIntegrity(value: string | undefined): string | null {
  if (!value) return null
  const match = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(value)
  return match ? match[1] : null
}

/** Download to a private temporary file, verify both published digests, then rename into place. */
export async function downloadVerified(options: DownloadOptions): Promise<{ path: string; bytes: number }> {
  const { url, target, sha256, integrity, maxBytes, signal, onProgress } = options
  const client = options.fetchImpl ?? fetch
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('Update asset has no valid SHA-256')
  const timeout = AbortSignal.timeout(10 * 60_000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const response = await client(url, { signal: combined, redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`Update download returned HTTP ${response.status}`)
  const declared = Number(response.headers.get('content-length') ?? '0')
  const total = Number.isFinite(declared) && declared > 0 ? declared : null
  if (total !== null && total > maxBytes) throw new Error('Update asset is larger than the allowed limit')
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
  const temporary = `${target}.${randomUUID()}.tmp`
  const sha256Hash = createHash('sha256')
  const sha512Hash = createHash('sha512')
  const stream = createWriteStream(temporary, { mode: 0o600, flags: 'wx' })
  const reader = response.body.getReader()
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > maxBytes) throw new Error('Update asset is larger than the allowed limit')
      sha256Hash.update(value)
      sha512Hash.update(value)
      if (!stream.write(value)) await once(stream, 'drain')
      onProgress?.(received, total)
    }
    stream.end()
    await once(stream, 'finish')
  } catch (error) {
    stream.destroy()
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
  const actual256 = sha256Hash.digest('hex')
  const actual512 = sha512Hash.digest('base64')
  const expected512 = parseIntegrity(integrity)
  if (actual256 !== sha256) {
    await rm(temporary, { force: true })
    throw new Error('Downloaded update failed SHA-256 verification')
  }
  if (expected512 && actual512 !== expected512) {
    await rm(temporary, { force: true })
    throw new Error('Downloaded update failed SHA-512 verification')
  }
  await rename(temporary, target)
  await chmod(target, 0o600)
  return { path: target, bytes: received }
}

export function sanitizeTag(tag: string): string {
  return tag.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'update'
}

async function writePending(file: string, value: PendingPluginUpdate | PendingAppUpdate): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, file)
}

export async function stagePluginUpdate(options: {
  release: PluginRelease
  installed: Set<string>
  /** Artifacts selected by the decision; defaults to every installed name. */
  targets?: PluginArtifact[]
  home: string
  fetchImpl?: FetchLike
  signal?: AbortSignal
  onProgress?: (file: string, received: number, total: number | null) => void
}): Promise<PendingPluginUpdate> {
  const { release, installed, home, signal, onProgress } = options
  const client = options.fetchImpl ?? fetch
  const targets = options.targets ?? release.artifacts.filter(artifact => installed.has(artifact.name))
  if (targets.some(artifact => !installed.has(artifact.name))) throw new Error('Update target is not installed')
  if (targets.length === 0) throw new Error('No installed plugin is covered by this release')
  const directory = path.join(updatesDir(home), 'plugins', sanitizeTag(release.tag))
  const files: PendingPluginFile[] = []
  for (const artifact of targets) {
    const target = path.join(directory, artifact.file)
    await downloadVerified({
      url: artifact.url,
      target,
      sha256: artifact.sha256,
      integrity: artifact.integrity,
      maxBytes: 64 * 1024 * 1024,
      fetchImpl: client,
      signal,
      onProgress: (received, total) => onProgress?.(artifact.file, received, total),
    })
    files.push({
      name: artifact.name,
      version: artifact.version,
      file: artifact.file,
      path: target,
      sha256: artifact.sha256,
      integrity: artifact.integrity,
    })
  }
  const pending: PendingPluginUpdate = {
    schema: 1,
    kind: 'plugins',
    tag: release.tag,
    version: release.version,
    runtime: release.runtime,
    createdAt: new Date().toISOString(),
    files,
  }
  await writePending(pendingPluginPath(home), pending)
  return pending
}

export async function stageAppUpdate(options: {
  release: { tag: string; version: string; kernelVersion: string; target: UpdateTarget; installer: { file: string; sha256: string; url: string } }
  home: string
  installRoot: string
  appPath: string
  fetchImpl?: FetchLike
  signal?: AbortSignal
  onProgress?: (file: string, received: number, total: number | null) => void
}): Promise<PendingAppUpdate> {
  const { release, home, installRoot, appPath, signal, onProgress } = options
  const client = options.fetchImpl ?? fetch
  if (!path.isAbsolute(installRoot) || !path.isAbsolute(appPath)) throw new Error('Desktop installation path is not absolute')
  const directory = path.join(updatesDir(home), 'app', sanitizeTag(release.tag))
  const installer = path.join(directory, release.installer.file)
  await downloadVerified({
    url: release.installer.url,
    target: installer,
    sha256: release.installer.sha256,
    maxBytes: 512 * 1024 * 1024,
    fetchImpl: client,
    signal,
    onProgress: (received, total) => onProgress?.(release.installer.file, received, total),
  })
  const pending: PendingAppUpdate = {
    schema: 1,
    kind: 'app',
    tag: release.tag,
    version: release.version,
    kernelVersion: release.kernelVersion,
    target: release.target,
    installer,
    sha256: release.installer.sha256,
    installRoot,
    appPath,
    createdAt: new Date().toISOString(),
  }
  await writePending(pendingAppPath(home), pending)
  return pending
}

export async function readPendingPlugin(home: string): Promise<PendingPluginUpdate | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(pendingPluginPath(home), 'utf8'))
    if (!raw || typeof raw !== 'object') return null
    const value = raw as Record<string, unknown>
    if (value.schema !== 1 || value.kind !== 'plugins' || typeof value.runtime !== 'string' || !Array.isArray(value.files)) return null
    const files: PendingPluginFile[] = []
    for (const item of value.files) {
      if (!item || typeof item !== 'object') return null
      const entry = item as Record<string, unknown>
      if (typeof entry.name !== 'string' || typeof entry.version !== 'string' || typeof entry.file !== 'string' || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') return null
      if (!/^[0-9a-f]{64}$/.test(entry.sha256) || !path.isAbsolute(entry.path)) return null
      files.push({ name: entry.name, version: entry.version, file: entry.file, path: entry.path, sha256: entry.sha256, integrity: typeof entry.integrity === 'string' ? entry.integrity : '' })
    }
    return {
      schema: 1,
      kind: 'plugins',
      tag: typeof value.tag === 'string' ? value.tag : '',
      version: typeof value.version === 'string' ? value.version : '',
      runtime: value.runtime,
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
      files,
    }
  } catch { return null }
}

export async function readPendingApp(home: string): Promise<PendingAppUpdate | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(pendingAppPath(home), 'utf8'))
    if (!raw || typeof raw !== 'object') return null
    const value = raw as Record<string, unknown>
    if (value.schema !== 1 || value.kind !== 'app') return null
    if (typeof value.installer !== 'string' || !path.isAbsolute(value.installer)) return null
    if (typeof value.installRoot !== 'string' || !path.isAbsolute(value.installRoot)) return null
    if (typeof value.appPath !== 'string' || !path.isAbsolute(value.appPath)) return null
    if (typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256)) return null
    if (typeof value.target !== 'string' || typeof value.version !== 'string' || typeof value.kernelVersion !== 'string') return null
    return {
      schema: 1,
      kind: 'app',
      tag: typeof value.tag === 'string' ? value.tag : '',
      version: value.version,
      kernelVersion: value.kernelVersion,
      target: value.target as UpdateTarget,
      installer: value.installer,
      sha256: value.sha256,
      installRoot: value.installRoot,
      appPath: value.appPath,
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    }
  } catch { return null }
}

export async function fileDigest(file: string): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash('sha256')
  const info = await stat(file)
  const handle = await open(file, 'r')
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let position = 0
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
      if (bytesRead === 0) break
      hash.update(buffer.subarray(0, bytesRead))
      position += bytesRead
    }
  } finally { await handle.close() }
  return { sha256: hash.digest('hex'), bytes: info.size }
}
