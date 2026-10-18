import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isVersion } from './semver.js';
import { targetForPlatform } from './manifests.js';
const TARGETS = new Set(['macos-arm64', 'macos-x64', 'windows-x64']);
function asTarget(value) {
    return typeof value === 'string' && TARGETS.has(value) ? value : null;
}
function findUp(start, file, depth = 10) {
    let current = path.resolve(start);
    for (let index = 0; index < depth; index += 1) {
        if (existsSync(path.join(current, file)))
            return path.join(current, file);
        const parent = path.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return null;
}
async function readJson(file) {
    try {
        const value = JSON.parse(await readFile(file, 'utf8'));
        return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
    }
    catch {
        return null;
    }
}
/** Read the outer DSH-X distribution manifest when this process runs from it. */
export async function readDistribution(execPath, env) {
    const candidates = [];
    if (env.DSH_X_DISTRIBUTION_PATH)
        candidates.push(path.resolve(env.DSH_X_DISTRIBUTION_PATH));
    const executable = findUp(path.dirname(execPath), 'distribution.json');
    if (executable)
        candidates.push(executable);
    const resourcesPath = process.resourcesPath;
    if (typeof resourcesPath === 'string') {
        const resources = findUp(resourcesPath, 'distribution.json');
        if (resources)
            candidates.push(resources);
    }
    for (const candidate of [...new Set(candidates)]) {
        const raw = await readJson(candidate);
        if (!raw || raw.schema !== 1)
            continue;
        if (typeof raw.version !== 'string' || !isVersion(raw.version))
            continue;
        if (typeof raw.kernelVersion !== 'string' || !isVersion(raw.kernelVersion))
            continue;
        const target = asTarget(raw.target);
        if (!target)
            continue;
        const appPath = target === 'windows-x64' ? path.join(path.dirname(candidate), 'DSH-X.exe') : path.resolve(path.dirname(candidate), '../..');
        const installRoot = target === 'windows-x64' ? path.dirname(candidate) : path.dirname(appPath);
        const plugins = [];
        if (Array.isArray(raw.plugins)) {
            for (const item of raw.plugins) {
                if (!item || typeof item !== 'object')
                    continue;
                const entry = item;
                if (typeof entry.name === 'string' && entry.name.startsWith('dsh-x-') && typeof entry.version === 'string' && isVersion(entry.version)) {
                    plugins.push({ name: entry.name, version: entry.version });
                }
            }
        }
        return {
            path: candidate,
            appVersion: raw.version,
            kernelVersion: raw.kernelVersion,
            target,
            installRoot,
            appPath,
            plugins,
        };
    }
    return null;
}
async function profilePlugins(profileDir) {
    const manifest = await readJson(path.join(profileDir, 'package.json'));
    if (!manifest)
        return null;
    const dependencies = manifest.dependencies;
    const names = dependencies !== null && typeof dependencies === 'object' && !Array.isArray(dependencies)
        ? Object.keys(dependencies).filter(name => name.startsWith('dsh-x-'))
        : [];
    const plugins = [];
    for (const name of names) {
        if (!/^dsh-x-[a-z0-9-]+$/.test(name))
            continue;
        const entry = await readJson(path.join(profileDir, 'node_modules', name, 'package.json'));
        if (entry && typeof entry.version === 'string' && isVersion(entry.version))
            plugins.push({ name, version: entry.version });
    }
    return plugins;
}
async function profileKernel(profileDir) {
    const direct = await readJson(path.join(profileDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'));
    if (direct && typeof direct.version === 'string' && isVersion(direct.version))
        return direct.version;
    return null;
}
/** Read the running app, kernel and installed plugin versions without writing anything. */
export async function readLocalState(options = {}) {
    const env = options.env ?? process.env;
    const platform = options.platform ?? process.platform;
    const arch = options.arch ?? process.arch;
    const execPath = options.execPath ?? process.execPath;
    const home = typeof env.DSH_HOME === 'string' && path.isAbsolute(env.DSH_HOME) ? path.resolve(env.DSH_HOME) : null;
    const profile = typeof env.DSH_PROFILE === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(env.DSH_PROFILE) ? env.DSH_PROFILE : null;
    const profileDir = typeof env.DSH_PROFILE_DIR === 'string' && path.isAbsolute(env.DSH_PROFILE_DIR)
        ? path.resolve(env.DSH_PROFILE_DIR)
        : home && profile ? path.join(home, 'profiles', profile) : null;
    const distribution = await readDistribution(execPath, env);
    const installed = profileDir ? await profilePlugins(profileDir) : null;
    const kernelVersion = distribution?.kernelVersion ?? (profileDir ? await profileKernel(profileDir) : null);
    return {
        desktop: distribution !== null,
        home,
        profile,
        appVersion: distribution?.appVersion ?? null,
        kernelVersion,
        target: distribution?.target ?? targetForPlatform(platform, arch),
        distributionPath: distribution?.path ?? null,
        installRoot: distribution?.installRoot ?? null,
        appPath: distribution?.appPath ?? null,
        plugins: installed ?? distribution?.plugins ?? [],
    };
}
export function updatesDir(home) {
    return path.join(home, 'updates');
}
export function pendingPluginPath(home) {
    return path.join(updatesDir(home), 'pending-plugins.json');
}
export function pendingAppPath(home) {
    return path.join(updatesDir(home), 'pending-app.json');
}
export function statusPath(home) {
    return path.join(updatesDir(home), 'status.json');
}
