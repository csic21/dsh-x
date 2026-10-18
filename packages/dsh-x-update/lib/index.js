import { createUpdateService } from './service.js';
import { createUpdateRoutes } from './rpc.js';
import { updateTool } from './tool.js';
export const name = 'dsh-x-update';
export const inject = ['tools', 'profileContext'];
/**
 * Host half of the updater. It only reads the public release index and the
 * installed versions; installation remains owned by the official plugin
 * manager, so no download, profile edit, or extra home directory is needed.
 */
export function apply(ctx, config = {}) {
    // Offline smoke tests must not depend on a newer real release.
    const disabled = process.env.DSH_X_UPDATE_DISABLE === '1';
    const service = createUpdateService({
        env: process.env,
        profileContext: ctx.profileContext,
        config: disabled ? { ...config, autoCheck: false } : config,
    });
    ctx.tools.register(updateTool(service));
    ctx.inject(['connection'], (host) => {
        for (const route of createUpdateRoutes(service))
            host.connection.fetch.register(route);
    });
    const stopChecking = service.start();
    ctx.effect(() => () => {
        stopChecking();
        service.stop();
    }, 'dsh-x-update: lifecycle');
}
