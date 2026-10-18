// Install the official plugin tarballs from a downloaded GitHub Release into one
// official profile, through the official CLI.
//
// This file ships inside every Release and imports nothing from the repository:
// the official CLI stays the authority on runtime compatibility, and this
// wrapper only resolves the files, runs the install and checks that the bundles
// were selected. It creates no home of its own and writes nothing outside the
// chosen profile.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

const DEFAULT_PLUGINS = 'dsh-x-suite,dsh-x-plan,dsh-x-stock,dsh-x-chat,dsh-x-update'

const { values } = parseArgs({ options: {
  dsh: { type: 'string', default: 'dsh' },
  profile: { type: 'string', default: 'web' },
  home: { type: 'string' },
  'release-dir': { type: 'string', default: '.' },
  plugins: { type: 'string', default: DEFAULT_PLUGINS },
  'dry-run': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} })
if (values.help) {
  console.log([
    'node install-plugins.mjs [options]        (run inside the downloaded Release folder)',
    '',
    '  --dsh <path|name>      official CLI (default: dsh on PATH)',
    '  --profile <name>       official profile to install into (default: web)',
    "  --home <dir>           official DSH home (default: $DSH_HOME or ~/.dsh)",
    '  --release-dir <dir>    folder holding the release tarballs (default: current folder)',
    '  --plugins <a,b>        bundle names to install',
    `                         (default: ${DEFAULT_PLUGINS})`,
    '  --dry-run              print the official command without running it',
    '',
    'dsh-x-browser is experimental and excluded by default; pass it explicitly.',
    'The desktop profile is owned by the Electron app; install through Desktop instead.',
  ].join('\n'))
  process.exit(0)
}
if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(values.profile)) throw new Error(`Invalid profile name: ${values.profile}`)
if (values.profile === 'desktop') throw new Error("The desktop profile is managed by the Electron app; use Desktop's own CLI or its Plugins page.")
const releaseDir = path.resolve(values['release-dir'])
if (!existsSync(releaseDir)) throw new Error(`Release directory not found: ${releaseDir}`)
const home = path.resolve(values.home ?? process.env.DSH_HOME ?? path.join(homedir(), '.dsh'))
const names = values.plugins.split(',').map(name => name.trim()).filter(Boolean)
if (names.length === 0) throw new Error('No plugins selected.')

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false, ...options })
  if (result.error) throw result.error
  return { code: result.status, out: result.stdout ?? '', err: result.stderr ?? '' }
}

// Windows resolves a bare `dsh` to dsh.cmd only through a shell, and this
// script spawns without one, so name the shim explicitly.
const cli = process.platform === 'win32' && !/\.(?:cmd|exe|bat)$/i.test(values.dsh) ? `${values.dsh}.cmd` : values.dsh

const version = run(cli, ['--version'])
if (version.code !== 0) throw new Error(`Cannot run ${values.dsh} --version: ${version.err || version.out}`)
const runtime = version.out.trim()

const assets = readdirSync(releaseDir)
const selected = names.map(name => {
  const matches = assets.filter(file => file.startsWith(`${name}-`) && file.endsWith('.tgz'))
  if (matches.length !== 1) throw new Error(`Expected exactly one ${name} tarball in ${releaseDir}, found ${matches.length}.`)
  return path.join(releaseDir, matches[0])
})

const manifestPath = path.join(releaseDir, 'build-manifest.json')
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.runtime && manifest.runtime !== runtime) {
    // The declared peer range may admit this runtime; only the official CLI can
    // decide. Say what the release was qualified on rather than blocking here.
    console.warn(`Note: this release was qualified on DSH ${manifest.runtime}; ${values.dsh} reports ${runtime}.`)
    console.warn('If the official CLI accepts the install, the peer range admits this runtime; the full suite matrix was not run on it.')
  }
}

const args = ['plugin', '--profile', values.profile, 'add', ...selected, '--config.auto-install-peers=false']
if (values['dry-run']) {
  console.log(`DSH_HOME=${home} ${values.dsh} ${args.join(' ')}`)
  process.exit(0)
}
console.log(`Installing ${selected.length} plugin tarball(s) into profile ${values.profile} (DSH ${runtime}).`)
const install = run(cli, args, { env: { ...process.env, DSH_HOME: home }, stdio: 'inherit' })
if (install.code !== 0) throw new Error(`Official installation failed with exit code ${install.code}.`)

const profileManifest = path.join(home, 'profiles', values.profile, 'package.json')
const bundles = JSON.parse(readFileSync(profileManifest, 'utf8')).dsh?.profile?.bundles ?? []
const missing = names.filter(name => !bundles.includes(name))
if (missing.length > 0) throw new Error(`Installed but not selected as bundles: ${missing.join(', ')}. Restart the app and check the Plugins page.`)
console.log(`Installed and selected: ${names.join(', ')}. Restart the app to load the new plugins.`)
