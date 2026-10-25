import { createUiRoute } from './routes.js';
import { createUiStore, readPatch, resolveAppearance } from './store.js';
export const name = 'dsh-x-ui';
export const inject = ['profileContext'];
export const READ_ENDPOINT = 'dsh-x-ui/read';
export const WRITE_ENDPOINT = 'dsh-x-ui/write';
const configDefaults = (config) => {
    const patch = {};
    if (typeof config.enabled === 'boolean')
        patch.enabled = config.enabled;
    if (config.level !== undefined)
        patch.level = config.level;
    if (typeof config.backdrop === 'boolean')
        patch.backdrop = config.backdrop;
    if (typeof config.refraction === 'boolean')
        patch.refraction = config.refraction;
    return patch;
};
export function apply(ctx, config = {}) {
    const services = ctx;
    const store = createUiStore(services.profileContext.dir);
    const seed = configDefaults(config);
    // Reading resolves what the Client should paint; writing merges the patch over
    // the same resolution, so a partial write never drops the seeded fields.
    const current = async () => resolveAppearance(await store.read(), seed);
    ctx.inject(['connection'], injected => {
        const host = injected;
        host.connection.fetch.register(createUiRoute(READ_ENDPOINT, async () => await current(), []));
        host.connection.fetch.register(createUiRoute(WRITE_ENDPOINT, async (payload) => {
            const patch = readPatch(payload);
            return await store.write(patch, await current());
        }, ['enabled', 'level', 'backdrop', 'refraction']));
    });
}
export { createUiStore, normalizeAppearance, readPatch, resolveAppearance } from './store.js';
