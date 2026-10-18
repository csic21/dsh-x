import { compareVersions, maxVersion } from './semver.ts'
import type { LocalState, PluginArtifact, PluginRelease, UpdatePlan, UpdateReason } from './types.ts'

function plan(
  kind: UpdatePlan['kind'],
  reason: UpdateReason,
  local: LocalState,
  plugin: PluginRelease | null,
  targets: PluginArtifact[] = [],
): UpdatePlan {
  return {
    kind,
    reason,
    plugin,
    targets,
    current: {
      pluginVersion: maxVersion(local.plugins.map(entry => entry.version)),
      runtimeVersion: local.runtimeVersion,
    },
    available: {
      pluginVersion: plugin?.version ?? null,
      runtime: plugin?.runtime ?? null,
    },
  }
}

/**
 * Decide whether the published plugin release can be installed here.
 *
 * The release runtime must equal the running DSH version exactly. Installed
 * plugins are matched by package name; a release that only raises the suite
 * version without shipping those packages is not installable.
 */
export function decideUpdate(options: {
  local: LocalState
  plugin?: PluginRelease | null
}): UpdatePlan {
  const { local } = options
  const plugin = options.plugin ?? null

  if (!local.runtimeVersion) return plan('blocked', 'local-runtime-unknown', local, plugin)
  if (!plugin) return plan('blocked', 'no-release', local, plugin)

  const installed = new Map(local.plugins.map(entry => [entry.name, entry.version]))
  const targets = plugin.artifacts.filter(artifact => {
    const current = installed.get(artifact.name)
    return current !== undefined && compareVersions(artifact.version, current) > 0
  })
  if (targets.length === 0) {
    const newest = maxVersion(local.plugins.map(entry => entry.version))
    if (newest && compareVersions(plugin.version, newest) > 0) return plan('blocked', 'no-matching-plugin-artifacts', local, plugin)
    return plan('none', 'up-to-date', local, plugin)
  }
  if (plugin.runtime !== local.runtimeVersion) return plan('blocked', 'runtime-mismatch', local, plugin)
  return plan('plugin', 'plugin-newer', local, plugin, targets)
}
