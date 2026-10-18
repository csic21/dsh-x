import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { decideUpdate } from './decision.js';
import { appUpdateSupported, spawnAppUpdate } from './app-update.js';
import { compareVersions } from './semver.js';
import { pendingAppPath, pendingPluginPath, readLocalState, statusPath, updatesDir } from './local.js';
import { loadDesktopRelease, loadPluginRelease } from './manifests.js';
import { fetchReleaseIndex, newestFor } from './releases.js';
import { readPendingApp, readPendingPlugin, stageAppUpdate, stagePluginUpdate } from './stage.js';
const DEFAULT_REPOSITORY = 'csic21/dsh-x';
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
function emptyLocal() {
    return {
        desktop: false, home: null, profile: null, appVersion: null, kernelVersion: null, target: null,
        distributionPath: null, installRoot: null, appPath: null, plugins: [],
    };
}
function normalizeConfig(input = {}) {
    const repository = typeof input.repository === 'string' && REPOSITORY.test(input.repository) ? input.repository : DEFAULT_REPOSITORY;
    const feedUrl = typeof input.feedUrl === 'string' ? input.feedUrl : undefined;
    if (feedUrl) {
        const parsed = new URL(feedUrl);
        const local = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
        if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))
            throw new Error('Update feed must use HTTPS');
    }
    return {
        repository,
        feedUrl,
        autoCheck: input.autoCheck !== false,
        autoDownload: input.autoDownload !== false,
        autoInstallApp: input.autoInstallApp !== false,
        checkIntervalHours: Math.min(168, Math.max(1, Number(input.checkIntervalHours) || 6)),
        initialDelaySeconds: Math.min(3600, Math.max(0, Number(input.initialDelaySeconds ?? 20))),
    };
}
export function createUpdateService(options = {}) {
    const env = options.env ?? process.env;
    const platform = options.platform ?? process.platform;
    const arch = options.arch ?? process.arch;
    const execPath = options.execPath ?? process.execPath;
    const fetchImpl = options.fetchImpl ?? fetch;
    const config = normalizeConfig(options.config);
    const now = options.now ?? (() => Date.now());
    const spawnImpl = options.spawnImpl ?? spawn;
    let local = emptyLocal();
    let plan = null;
    let phase = 'idle';
    let checkedAt = null;
    let error = null;
    let progress = null;
    let pending = null;
    let stopped = false;
    let checking = null;
    let staging = null;
    let loaded = false;
    let loading = null;
    let lastPersist = 0;
    function home() { return local.home; }
    function snapshot() {
        return {
            schema: 1,
            phase,
            checkedAt,
            error,
            local,
            plan,
            pending,
            progress,
            config: {
                repository: config.repository,
                autoCheck: config.autoCheck,
                autoDownload: config.autoDownload,
                autoInstallApp: config.autoInstallApp,
            },
        };
    }
    async function persist(force = false) {
        const directory = home();
        if (!directory)
            return;
        const timestamp = now();
        if (!force && timestamp - lastPersist < 1000)
            return;
        lastPersist = timestamp;
        try {
            await mkdir(updatesDir(directory), { recursive: true, mode: 0o700 });
            await writeFile(statusPath(directory), `${JSON.stringify(snapshot(), null, 2)}\n`, { mode: 0o600 });
        }
        catch { /* Status persistence never blocks an update decision. */ }
    }
    function load() {
        if (loaded)
            return Promise.resolve();
        if (loading)
            return loading;
        loading = loadOnce().finally(() => { loading = null; });
        return loading;
    }
    async function loadOnce() {
        local = await readLocalState({ env, platform, arch, execPath });
        loaded = true;
        const directory = local.home;
        if (!directory)
            return;
        try {
            const raw = JSON.parse(await readFile(statusPath(directory), 'utf8'));
            if (raw && typeof raw === 'object') {
                const saved = raw;
                if (saved.schema === 1) {
                    checkedAt = typeof saved.checkedAt === 'string' ? saved.checkedAt : null;
                    if (saved.plan && typeof saved.plan === 'object')
                        plan = saved.plan;
                    if (saved.phase === 'ready' || saved.phase === 'idle' || saved.phase === 'error')
                        phase = saved.phase;
                }
            }
        }
        catch { /* First run has no persisted status. */ }
        let pluginPending = await readPendingPlugin(directory);
        let appPending = await readPendingApp(directory);
        if (appPending && local.appVersion && compareVersions(local.appVersion, appPending.version) >= 0) {
            await rm(pendingAppPath(directory), { force: true }).catch(() => { });
            appPending = null;
        }
        if (pluginPending) {
            const installed = new Map(local.plugins.map(entry => [entry.name, entry.version]));
            const applied = pluginPending.files.every(file => {
                const version = installed.get(file.name);
                return version !== undefined && compareVersions(version, file.version) >= 0;
            });
            if (applied) {
                await rm(pendingPluginPath(directory), { force: true }).catch(() => { });
                pluginPending = null;
            }
        }
        pending = summarize(appPending, pluginPending);
        if (pending && phase !== 'error')
            phase = 'ready';
        if (appPending && config.autoInstallApp && local.desktop && appUpdateSupported(platform)) {
            void spawnAppUpdate({ pending: appPending, home: directory, hostPid: process.pid, platform, spawnImpl })
                .catch(() => { });
        }
    }
    function summarize(appPending, pluginPending) {
        if (appPending)
            return { kind: 'app', tag: appPending.tag, version: appPending.version, createdAt: appPending.createdAt };
        if (pluginPending)
            return { kind: 'plugins', tag: pluginPending.tag, version: pluginPending.version, createdAt: pluginPending.createdAt };
        return null;
    }
    async function runCheck() {
        try {
            await load();
        }
        catch (failure) {
            phase = 'error';
            error = failure instanceof Error ? failure.message : String(failure);
            return snapshot();
        }
        if (stopped)
            return snapshot();
        phase = 'checking';
        error = null;
        progress = null;
        await persist(true);
        try {
            const target = local.target;
            if (!target) {
                plan = decideUpdate({ local });
                phase = 'error';
                error = '当前平台没有可用的 DSH-X Desktop 更新包。';
                checkedAt = new Date(now()).toISOString();
                await persist(true);
                return snapshot();
            }
            const entries = await fetchReleaseIndex({ repository: config.repository, feedUrl: config.feedUrl, fetchImpl });
            let desktop = null;
            for (const entry of newestFor(entries, 'desktop', 6)) {
                desktop = await loadDesktopRelease({
                    repository: config.repository, tag: entry.tag, version: entry.version, target, fetchImpl,
                });
                if (desktop)
                    break;
            }
            const pluginEntry = newestFor(entries, 'plugins', 1)[0];
            const plugin = pluginEntry
                ? await loadPluginRelease({ repository: config.repository, tag: pluginEntry.tag, version: pluginEntry.version, fetchImpl })
                : null;
            plan = decideUpdate({ local, desktop, plugin });
            checkedAt = new Date(now()).toISOString();
            phase = pending ? 'ready' : 'idle';
            await persist(true);
            if (config.autoDownload && (plan.kind === 'plugin' || plan.kind === 'app') && pending === null) {
                setTimeout(() => { void stage(); }, 0).unref?.();
            }
        }
        catch (failure) {
            phase = 'error';
            error = failure instanceof Error ? failure.message : String(failure);
            checkedAt = new Date(now()).toISOString();
            await persist(true);
        }
        return snapshot();
    }
    function check() {
        if (checking)
            return checking;
        checking = runCheck().finally(() => { checking = null; });
        return checking;
    }
    async function runStage() {
        try {
            await load();
        }
        catch (failure) {
            phase = 'error';
            error = failure instanceof Error ? failure.message : String(failure);
            return snapshot();
        }
        if (stopped)
            return snapshot();
        if (checking)
            await checking;
        if (!plan)
            await check();
        if (!plan)
            return snapshot();
        const directory = local.home;
        if (!directory) {
            phase = 'error';
            error = '独立 Web profile 没有 Desktop 更新目录，无法暂存更新。';
            await persist(true);
            return snapshot();
        }
        phase = 'downloading';
        error = null;
        progress = null;
        await persist(true);
        try {
            if (plan.kind === 'plugin' && plan.plugin) {
                const result = await stagePluginUpdate({
                    release: plan.plugin,
                    installed: new Set(local.plugins.map(entry => entry.name)),
                    targets: plan.targets,
                    home: directory,
                    fetchImpl,
                    onProgress: (file, received, total) => {
                        progress = { file, received, total };
                        void persist();
                    },
                });
                pending = summarize(null, result);
            }
            else if (plan.kind === 'app' && plan.desktop) {
                if (!local.installRoot || !local.appPath)
                    throw new Error('无法定位当前 DSH-X 安装目录');
                const result = await stageAppUpdate({
                    release: plan.desktop,
                    home: directory,
                    installRoot: local.installRoot,
                    appPath: local.appPath,
                    fetchImpl,
                    onProgress: (file, received, total) => {
                        progress = { file, received, total };
                        void persist();
                    },
                });
                pending = summarize(result, null);
                if (config.autoInstallApp && appUpdateSupported(platform)) {
                    await spawnAppUpdate({ pending: result, home: directory, hostPid: process.pid, platform, spawnImpl });
                }
            }
            else {
                throw new Error('没有可下载的更新');
            }
            progress = null;
            phase = 'ready';
            await persist(true);
        }
        catch (failure) {
            phase = 'error';
            error = failure instanceof Error ? failure.message : String(failure);
            progress = null;
            await persist(true);
        }
        return snapshot();
    }
    function stage() {
        if (staging)
            return staging;
        staging = runStage().finally(() => { staging = null; });
        return staging;
    }
    function start() {
        if (!config.autoCheck)
            return () => { };
        const initial = setTimeout(() => { void check(); }, config.initialDelaySeconds * 1000);
        initial.unref?.();
        const interval = setInterval(() => { void check(); }, config.checkIntervalHours * 3600_000);
        interval.unref?.();
        return () => { clearTimeout(initial); clearInterval(interval); };
    }
    function stop() {
        stopped = true;
    }
    void load().catch(() => { });
    return { snapshot, check, stage, start, stop };
}
