import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isVersion } from './semver.ts'
import type { LocalPlugin, LocalState } from './types.ts'

const OWN_PACKAGE = fileURLToPath(new URL('../package.json', import.meta.url))

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = JSON.parse(await readFile(file, 'utf8'))
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

/**
 * The running DSH version for this build. The plugin declares an exact
 * `engines.dsh`, and the official loader only mounts it on that same runtime,
 * so the manifest is the one value available in both npm and Desktop profiles.
 */
export async function readOwnRuntimeVersion(): Promise<string | null> {
  const manifest = await readJson(OWN_PACKAGE)
  const engines = manifest?.engines
  const version = engines !== null && typeof engines === 'object' && !Array.isArray(engines)
    ? (engines as Record<string, unknown>).dsh
    : undefined
  return typeof version === 'string' && isVersion(version) ? version : null
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

export interface ReadLocalStateOptions {
  env?: NodeJS.ProcessEnv
  profileContext?: { name?: string; dir?: string; home?: string }
  runtimeVersion?: string | null
}

/** Read the running profile and installed plugin versions without writing anything. */
export async function readLocalState(options: ReadLocalStateOptions = {}): Promise<LocalState> {
  const env = options.env ?? process.env
  const context = options.profileContext ?? {}
  const home = typeof context.home === 'string' && path.isAbsolute(context.home)
    ? path.resolve(context.home)
    : typeof env.DSH_HOME === 'string' && path.isAbsolute(env.DSH_HOME) ? path.resolve(env.DSH_HOME) : null
  const profile = typeof context.name === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(context.name)
    ? context.name
    : typeof env.DSH_PROFILE === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(env.DSH_PROFILE) ? env.DSH_PROFILE : null
  const profileDir = typeof context.dir === 'string' && path.isAbsolute(context.dir)
    ? path.resolve(context.dir)
    : typeof env.DSH_PROFILE_DIR === 'string' && path.isAbsolute(env.DSH_PROFILE_DIR)
      ? path.resolve(env.DSH_PROFILE_DIR)
      : home && profile ? path.join(home, 'profiles', profile) : null
  return {
    home,
    profile,
    runtimeVersion: options.runtimeVersion !== undefined ? options.runtimeVersion : await readOwnRuntimeVersion(),
    plugins: profileDir ? await profilePlugins(profileDir) ?? [] : [],
  }
}
