// Per-profile market source preference. The UI switch writes this small file;
// it is not a credential and it never contains market data. The official
// profile directory remains the only storage root.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
export function createProfileMarketPreference(profileDirectory) {
    if (typeof profileDirectory !== 'string' || !path.isAbsolute(profileDirectory))
        throw new Error('缺少有效的宿主 profile 目录。');
    const directory = path.join(profileDirectory, '.dsh-x-stock');
    const target = path.join(directory, 'market.json');
    return {
        async load() {
            try {
                const text = await readFile(target, 'utf8');
                if (text.length > 1024)
                    return false;
                const value = JSON.parse(text);
                return value?.version === 1 && value?.marketSource === true;
            }
            catch {
                // Missing, unreadable and malformed preferences all fail closed to off.
                // A failed save still surfaces when the UI tries to switch it on.
                return false;
            }
        },
        async save(enabled) {
            await mkdir(directory, { recursive: true, mode: 0o700 });
            const temporary = path.join(directory, `${randomUUID()}.tmp`);
            try {
                await writeFile(temporary, JSON.stringify({ version: 1, marketSource: enabled }), { flag: 'wx', mode: 0o600 });
                await rename(temporary, target);
            }
            finally {
                await unlink(temporary).catch(() => { });
            }
        },
    };
}
export function createMarketController(options) {
    let loaded = false;
    let enabled = false;
    let provider;
    const ensure = async () => {
        if (!loaded) {
            enabled = options.forced || await options.store.load();
            loaded = true;
        }
    };
    return {
        async getProvider() {
            await ensure();
            if (!enabled)
                return undefined;
            if (!provider)
                provider = options.createProvider();
            return provider;
        },
        async state() {
            await ensure();
            return { enabled: enabled || options.forced, forced: options.forced };
        },
        async setEnabled(next) {
            await ensure();
            if (options.forced)
                return { enabled: true, forced: true };
            if (next === enabled)
                return { enabled, forced: false };
            await options.store.save(next);
            enabled = next;
            if (!next)
                provider = undefined;
            return { enabled, forced: false };
        },
    };
}
