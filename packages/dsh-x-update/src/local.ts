import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { isVersion } from './semver.ts'
import { targetForPlatform } from './manifests.ts'
import type { LocalPlugin, LocalState, UpdateTarget } from './types.ts'

const TARGETS = new Set<UpdateTarget>(['macos-arm64', 'macos-x64', 'windows-x64'])

function asTarget(value: unknown): UpdateTarget | null {
  return typeof value === 'string' && TARGETS.has(value as UpdateTarget) ? value as UpdateTarget : null
}

function findUp(start: string, file: string, depth = 10): string | null {
  let current = path.resolve(start)
  for (let index = 0; index < depth; index += 1) {
    if (existsSync(path.join(current, file))) return path.join(current, file)
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = JSON.parse(await readFile(file, 'utf8'))
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

export interface DistributionInfo {
  path: string
  appVersion: string
  kernelVersion: string
  target: UpdateTarget
  installRoot: string
  appPath: string
  plugins: LocalPlugin[]
}

/** Read the outer DSH-X distribution manifest when this process runs from it. */
export async function readDistribution(execPath: string, env: NodeJS.ProcessEnv): Promise<DistributionInfo | null> {
  const candidates: string[] = []
  if (env.DSH_X_DISTRIBUTION_PATH) candidates.push(path.resolve(env.DSH_X_DISTRIBUTION_PATH))
  const executable = findUp(path.dirname(execPath), 'distribution.json')
  if (executable) candidates.push(executable)
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (typeof resourcesPath === 'string') {
    const resources = findUp(resourcesPath, 'distribution.json')
    if (resources) candidates.push(resources)
  }
  for (const candidate of [...new Set(candidates)]) {
    const raw = await readJson(candidate)
    if (!raw || raw.schema !== 1) continue
    if (typeof raw.version !== 'string' || !isVersion(raw.version)) continue
    if (typeof raw.kernelVersion !== 'string' || !isVersion(raw.kernelVersion)) continue
    const target = asTarget(raw.target)
    if (!target) continue
    const appPath = target === 'windows-x64' ? path.join(path.dirname(candidate), 'DSH-X.exe') : path.resolve(path.dirname(candidate), '../..')
    const installRoot = target === 'windows-x64' ? path.dirname(candidate) : path.dirname(appPath)
    const plugins: LocalPlugin[] = []
    if (Array.isArray(raw.plugins)) {
      for (const item of raw.plugins) {
        if (!item || typeof item !== 'object') continue
        const entry = item as Record<string, unknown>
        if (typeof entry.name === 'string' && entry.name.startsWith('dsh-x-') && typeof entry.version === 'string' && isVersion(entry.version)) {
          plugins.push({ name: entry.name, version: entry.version })
        }
      }
    }
    return {
      path: candidate,
      appVersion: raw.version,
      kernelVersion: raw.kernelVersion,
      target,
      installRoot,
      appPath,
      plugins,
    }
  }
  return null
}

async function profilePlugins(profileDir: string): Promise<LocalPlugin[] | null> {
  const manifest = await readJson(path.join(profileDir, 'package.json'))
  if (!manifest) return null
  const dependencies = manifest.dependencies
  const names = dependencies !== null && typeof dependencies === 'object' && !Array.isArray(dependencies)
    ? Object.keys(dependencies as Record<string, unknown>).filter(name => name.startsWith('dsh-x-'))
    : []
  const plugins: LocalPlugin[] = []
  for (const name of names) {
    if (!/^dsh-x-[a-z0-9-]+$/.test(name)) continue
    const entry = await readJson(path.join(profileDir, 'node_modules', name, 'package.json'))
    if (entry && typeof entry.version === 'string' && isVersion(entry.version)) plugins.push({ name, version: entry.version })
  }
  return plugins
}

async function profileKernel(profileDir: string): Promise<string | null> {
  const direct = await readJson(path.join(profileDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))
  if (direct && typeof direct.version === 'string' && isVersion(direct.version)) return direct.version
  return null
}

export interface ReadLocalStateOptions {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  arch?: string
  execPath?: string
}

/** Read the running app, kernel and installed plugin versions without writing anything. */
export async function readLocalState(options: ReadLocalStateOptions = {}): Promise<LocalState> {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const execPath = options.execPath ?? process.execPath
  const home = typeof env.DSH_HOME === 'string' && path.isAbsolute(env.DSH_HOME) ? path.resolve(env.DSH_HOME) : null
  const profile = typeof env.DSH_PROFILE === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(env.DSH_PROFILE) ? env.DSH_PROFILE : null
  const profileDir = typeof env.DSH_PROFILE_DIR === 'string' && path.isAbsolute(env.DSH_PROFILE_DIR)
    ? path.resolve(env.DSH_PROFILE_DIR)
    : home && profile ? path.join(home, 'profiles', profile) : null
  const distribution = await readDistribution(execPath, env)
  const installed = profileDir ? await profilePlugins(profileDir) : null
  const kernelVersion = distribution?.kernelVersion ?? (profileDir ? await profileKernel(profileDir) : null)
  return {
    desktop: distribution !== null,
    home,
    profile,
    appVersion: distribution?.appVersion ?? null,
    kernelVersion,
    target: distribution?.target ?? targetForPlatform(platform, arch),
    distributionPath: distribution?.path ?? null,
    installRoot: distribution?.installRoot ?? null,
    appPath: distribution?.appPath ?? null,
    plugins: installed ?? distribution?.plugins ?? [],
  }
}

export function updatesDir(home: string): string {
  return path.join(home, 'updates')
}

export function pendingPluginPath(home: string): string {
  return path.join(updatesDir(home), 'pending-plugins.json')
}

export function pendingAppPath(home: string): string {
  return path.join(updatesDir(home), 'pending-app.json')
}

export function statusPath(home: string): string {
  return path.join(updatesDir(home), 'status.json')
}
