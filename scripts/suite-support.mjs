import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('..', import.meta.url))
export const suiteName = 'dsh-x-suite'
export const components = Object.freeze(['dsh-x-agents', 'dsh-x-code'])
export const readJson = file => JSON.parse(readFileSync(file, 'utf8'))

export function validateSuite(directory = root) {
  const suite = readJson(path.join(directory, 'packages', suiteName, 'package.json'))
  if (suite.name !== suiteName || suite.dsh?.bundle?.patch !== './cordis.patch.yml') throw new Error('Invalid suite bundle declaration.')
  const runtime = suite.engines?.dsh
  if (typeof runtime !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(runtime)) throw new Error('Suite must declare one qualified exact DSH version.')
  if (Object.keys(suite.dependencies ?? {}).sort().join(',') !== [...components].sort().join(',')) throw new Error('The developer suite must contain only Code and Agents.')
  if (Object.keys(suite.scripts ?? {}).some(key => ['install', 'preinstall', 'postinstall', 'prepare'].includes(key))) throw new Error('Suite must not run installation hooks.')
  for (const name of components) {
    const manifest = readJson(path.join(directory, 'packages', name, 'package.json'))
    if (suite.dependencies[name] !== manifest.version) throw new Error(`Suite must pin the exact built ${name} version.`)
    if (manifest.engines?.dsh !== runtime) throw new Error(`${name} does not declare the suite runtime.`)
    if (!existsSync(path.join(directory, 'packages', name, 'lib/client.js'))) throw new Error(`Build ${name} before packaging.`)
    if (Object.keys(manifest.scripts ?? {}).some(key => ['install', 'preinstall', 'postinstall', 'prepare'].includes(key))) throw new Error(`${name} must not initialize software during installation.`)
  }
  return { suite, runtime, components: [...components] }
}

export function inspectSuiteTarget({ home, profile = 'web', runtime, directory = root }) {
  if (typeof home !== 'string' || !path.isAbsolute(home)) throw new Error('Use an explicit absolute home directory.')
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(profile)) throw new Error('Invalid profile name.')
  if (profile.toLowerCase() === 'desktop') profile = 'desktop'
  const expected = validateSuite(directory).runtime
  if (runtime !== expected) return { ready: false, reason: 'unqualified-runtime', expected, actual: runtime, conflicts: [] }
  const manifestPath = path.join(home, 'profiles', profile, 'package.json')
  if (!existsSync(manifestPath)) return { ready: profile !== 'desktop', reason: profile === 'desktop' ? 'desktop-not-initialized' : null, expected, actual: runtime, conflicts: [] }
  const manifest = readJson(manifestPath)
  const selected = manifest.dsh?.profile?.bundles
  if (selected !== undefined && (!Array.isArray(selected) || selected.some(value => typeof value !== 'string'))) throw new Error('Malformed profile bundle selection; no changes made.')
  const conflicts = components.filter(name => selected?.includes(name))
  return { ready: conflicts.length === 0, reason: conflicts.length ? 'standalone-components-enabled' : null, expected, actual: runtime, conflicts }
}
