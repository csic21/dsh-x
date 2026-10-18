import type { LocalState, PluginRelease, UpdatePlan } from './types.ts';
/**
 * Decide whether the published plugin release can be installed here.
 *
 * The release runtime must equal the running DSH version exactly. Installed
 * plugins are matched by package name; a release that only raises the suite
 * version without shipping those packages is not installable.
 */
export declare function decideUpdate(options: {
    local: LocalState;
    plugin?: PluginRelease | null;
}): UpdatePlan;
