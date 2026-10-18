import { compareVersions, maxVersion } from './semver.js';
function plan(kind, reason, local, desktop, plugin, targets = []) {
    return {
        kind,
        reason,
        desktop,
        plugin,
        targets,
        current: {
            appVersion: local.appVersion,
            kernelVersion: local.kernelVersion,
            pluginVersion: maxVersion(local.plugins.map(entry => entry.version)),
        },
        available: {
            appVersion: desktop?.version ?? null,
            kernelVersion: desktop?.kernelVersion ?? null,
            pluginVersion: plugin?.version ?? null,
            runtime: plugin?.runtime ?? null,
        },
    };
}
/**
 * Decide what an installation can actually consume.
 *
 * - A new desktop release is an app update because it carries the kernel.
 * - A plugin release is only installable when its exact runtime matches the
 *   running kernel; otherwise the user needs an app update first.
 */
export function decideUpdate(options) {
    const { local } = options;
    const desktop = options.desktop ?? null;
    const plugin = options.plugin ?? null;
    if (!local.target)
        return plan('blocked', 'unsupported-platform', local, desktop, plugin);
    if (!local.kernelVersion)
        return plan('blocked', 'local-runtime-unknown', local, desktop, plugin);
    const installed = new Map(local.plugins.map(entry => [entry.name, entry.version]));
    let targets = [];
    if (plugin) {
        targets = plugin.artifacts.filter(artifact => {
            const current = installed.get(artifact.name);
            return current !== undefined && compareVersions(artifact.version, current) > 0;
        });
    }
    const pluginNewer = targets.length > 0;
    if (plugin && local.plugins.length > 0 && targets.length === 0) {
        const newest = maxVersion(local.plugins.map(entry => entry.version));
        if (newest && compareVersions(plugin.version, newest) > 0)
            return plan('blocked', 'no-matching-plugin-artifacts', local, desktop, plugin);
    }
    if (plugin && pluginNewer) {
        if (plugin.runtime !== local.kernelVersion) {
            const appNotOlder = local.appVersion === null || (desktop !== null && compareVersions(desktop.version, local.appVersion) >= 0);
            if (local.desktop && desktop && appNotOlder && compareVersions(desktop.kernelVersion, plugin.runtime) >= 0) {
                return plan('app', 'plugin-requires-other-kernel', local, desktop, plugin);
            }
            return plan('blocked', local.desktop ? 'no-compatible-app-release' : 'not-desktop', local, desktop, plugin);
        }
    }
    if (desktop && local.desktop) {
        const newerApp = local.appVersion === null || compareVersions(desktop.version, local.appVersion) > 0;
        const changedKernel = local.appVersion !== null
            && compareVersions(desktop.version, local.appVersion) === 0
            && compareVersions(desktop.kernelVersion, local.kernelVersion) > 0;
        if (newerApp || changedKernel)
            return plan('app', changedKernel ? 'kernel-changed' : 'app-newer', local, desktop, plugin);
    }
    if (plugin && pluginNewer)
        return plan('plugin', 'plugin-newer', local, desktop, plugin, targets);
    if (!desktop && !plugin)
        return plan('blocked', 'no-release', local, desktop, plugin);
    return plan('none', 'up-to-date', local, desktop, plugin);
}
