import type { DesktopRelease, LocalState, PluginRelease, UpdatePlan } from './types.ts';
/**
 * Decide what an installation can actually consume.
 *
 * - A new desktop release is an app update because it carries the kernel.
 * - A plugin release is only installable when its exact runtime matches the
 *   running kernel; otherwise the user needs an app update first.
 */
export declare function decideUpdate(options: {
    local: LocalState;
    desktop?: DesktopRelease | null;
    plugin?: PluginRelease | null;
}): UpdatePlan;
