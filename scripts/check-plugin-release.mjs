// Fail a release whose package tree changed without a version bump, or whose
// version changed without a tree change. Run this on a clean commit before
// tagging. Docs-only and script-only commits do not touch packages/, so they
// do not require a plugin bump.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PLUGIN_PACKAGES, assessRelease, parseReleaseTag, pinVersions } from './plugin-versions.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const gitQuiet = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const tags = git('for-each-ref', '--sort=creatordate', '--format=%(refname:short)%09%(objectname)%09%(creatordate:unix)', 'refs/tags/plugins-v*')
  .split('\n').filter(Boolean).map(line => parseReleaseTag(line)).filter(Boolean)

const manifestAt = (name, commit) => {
  try { return JSON.parse(gitQuiet('show', `${commit}:packages/${name}/package.json`)) }
  catch { return null }
}
const treeAt = (name, commit) => {
  try { return gitQuiet('rev-parse', `${commit}:packages/${name}`) }
  catch { return null }
}

const pinned = pinVersions(tags.map(release => ({
  timestamp: release.timestamp,
  packages: PLUGIN_PACKAGES.flatMap(name => {
    const manifest = manifestAt(name, release.commit)
    if (!manifest?.version) return []
    return [{ name, version: manifest.version, commit: release.commit, tree: treeAt(name, release.commit) }]
  }),
})))

const head = git('rev-parse', 'HEAD')
const current = PLUGIN_PACKAGES.map(name => ({
  name,
  version: manifestAt(name, head)?.version ?? null,
  tree: treeAt(name, head),
  dirty: git('status', '--porcelain', '--', `packages/${name}`).length > 0,
}))
const errors = assessRelease(current, pinned)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`Checked ${current.length} plugin version(s) at ${head.slice(0, 7)}.`)
