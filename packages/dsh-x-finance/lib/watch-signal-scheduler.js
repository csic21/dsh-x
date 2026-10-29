import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, realpath, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { profileStoreDirectory, STORE_DIRECTORY, PREVIOUS_STORE_DIRECTORY } from './store-path.js';
import { loadProfileScope } from './scope.js';
import { validateScope } from './watchlist.js';
import { scanWatchSignals, WATCH_SIGNAL_MAX_AGE_DAYS } from './client/watch-signals-data.js';
import { createWatchScheduleRpc, scheduleSymbols } from './watch-signal-scheduler-rpc.js';
export const WATCH_SCHEDULE_FILE = 'watch-signal-schedule.json';
export const WATCH_SCHEDULE_INTERVAL_MS = 30_000;
export const WATCH_SCHEDULE_POLICY = {
    timeZone: 'Asia/Shanghai', after: '16:30', weekdaysOnly: true,
    holidayCalendar: false, catchUp: 'current-weekday-only', hostMustBeRunning: true,
    resultsOnDisable: 'cleared', maxSymbols: 200, maxAttemptsPerDate: 1,
};
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const iso = (value) => typeof value === 'string' && value.length <= 32 && Number.isFinite(Date.parse(value));
const empty = (scope = '') => ({ version: 1, scope, enabled: false, symbols: [], lastAttemptDate: null, updatedAt: null, resultDate: null, rows: [], error: null });
const clone = (value) => structuredClone(value);
export function shanghaiScheduleClock(now) {
    const time = new Date(now + 8 * 3_600_000);
    return { date: time.toISOString().slice(0, 10), weekday: time.getUTCDay(), minutes: time.getUTCHours() * 60 + time.getUTCMinutes() };
}
function freshness(sourceDate, isFinal, now) {
    if (!sourceDate || !date(sourceDate))
        return 'unavailable';
    const today = shanghaiScheduleClock(now).date;
    const age = (Date.parse(today) - Date.parse(sourceDate)) / 86_400_000;
    if (age < 0 || age > WATCH_SIGNAL_MAX_AGE_DAYS)
        return 'stale';
    if (isFinal !== true)
        return 'unfinished';
    return sourceDate === today ? 'current' : 'previous-session';
}
function projectRow(row, history, now) {
    const sourceDate = history?.bars.at(-1)?.sessionDate ?? row.signal?.sessionDate ?? null;
    const isFinal = history?.bars.at(-1)?.isFinal ?? row.signal?.isFinal ?? null;
    const fresh = freshness(sourceDate, isFinal, now);
    const usable = row.status === 'ready' && row.signal?.reason === 'ok' && fresh === 'current';
    return {
        symbol: row.symbol, name: row.name, status: row.status,
        // Historical calculations are retained for explanation; `usable` and
        // freshness are authoritative. Never reinterpret them as today's signal.
        signal: row.signal ? clone(row.signal) : null, replay: row.replay ? clone(row.replay) : null,
        source: row.source, fetchedAt: row.fetchedAt,
        adjustment: row.adjustment, pricePrecision: row.pricePrecision, stWarning: row.stWarning,
        sourceDate, isFinal, freshness: fresh, usable,
    };
}
/** Strict disk schema: malformed/truncated/duplicate state never re-enables a task. */
export function parseScheduleRecord(value) {
    const exact = (object, keys) => {
        if (!object || Object.getPrototypeOf(object) !== Object.prototype || Object.keys(object).sort().join(',') !== keys.sort().join(','))
            fail('storage-unavailable');
    };
    exact(value, ['version', 'scope', 'enabled', 'symbols', 'lastAttemptDate', 'updatedAt', 'resultDate', 'rows', 'error']);
    if (value.version !== 1 || typeof value.enabled !== 'boolean')
        fail('storage-unavailable');
    const scope = validateScope(value.scope), symbols = scheduleSymbols(value.symbols);
    for (const key of ['lastAttemptDate', 'resultDate'])
        if (value[key] !== null && !date(value[key]))
            fail('storage-unavailable');
    if (value.updatedAt !== null && !iso(value.updatedAt))
        fail('storage-unavailable');
    if (![null, 'storage-unavailable', 'scope-mismatch', 'scan-failed', 'interrupted', 'source-disabled'].includes(value.error))
        fail('storage-unavailable');
    if (!Array.isArray(value.rows) || value.rows.length > symbols.length || (!value.enabled && (symbols.length || value.rows.length)))
        fail('storage-unavailable');
    const seen = new Set();
    for (const row of value.rows) {
        exact(row, ['symbol', 'name', 'status', 'signal', 'replay', 'source', 'fetchedAt', 'adjustment', 'pricePrecision', 'stWarning', 'sourceDate', 'isFinal', 'freshness', 'usable']);
        if (!symbols.includes(row.symbol) || seen.has(row.symbol))
            fail('storage-unavailable');
        seen.add(row.symbol);
        if (typeof row.name !== 'string' || row.name.length > 64 || (row.source !== null && (typeof row.source !== 'string' || row.source.length > 64)))
            fail('storage-unavailable');
        if (!['pending', 'ready', 'unavailable', 'unknown-kind', 'unsupported', 'unadjusted', 'stale', 'skipped'].includes(row.status))
            fail('storage-unavailable');
        if (row.fetchedAt !== null && !iso(row.fetchedAt))
            fail('storage-unavailable');
        if (row.sourceDate !== null && !date(row.sourceDate))
            fail('storage-unavailable');
        if (![null, true, false].includes(row.isFinal) || typeof row.usable !== 'boolean' || typeof row.stWarning !== 'boolean')
            fail('storage-unavailable');
        if (!['current', 'previous-session', 'stale', 'unfinished', 'unavailable'].includes(row.freshness))
            fail('storage-unavailable');
        if (![null, 'none', 'forward', 'backward'].includes(row.adjustment))
            fail('storage-unavailable');
        if (row.pricePrecision !== null && (!Number.isInteger(row.pricePrecision) || row.pricePrecision < 0 || row.pricePrecision > 8))
            fail('storage-unavailable');
        if (row.signal !== null) {
            const s = row.signal;
            exact(s, ['status', 'reason', 'sessionDate', 'samples', 'isFinal', 'close', 'ma20', 'ma60', 'previousClose', 'previousMa20', 'prior20High']);
            if (!['buy', 'sell', 'watch', 'insufficient'].includes(s.status) || !['ok', 'invalid', 'insufficient'].includes(s.reason))
                fail('storage-unavailable');
            if (s.sessionDate !== null && !date(s.sessionDate))
                fail('storage-unavailable');
            if (!Number.isInteger(s.samples) || s.samples < 0 || s.samples > 250 || typeof s.isFinal !== 'boolean')
                fail('storage-unavailable');
            for (const key of ['close', 'ma20', 'ma60', 'previousClose', 'previousMa20', 'prior20High']) {
                if (s[key] !== null && (typeof s[key] !== 'number' || !Number.isFinite(s[key]) || s[key] <= 0))
                    fail('storage-unavailable');
            }
        }
        if (row.replay !== null) {
            const r = row.replay;
            exact(r, ['status', 'from', 'to', 'bars', 'tradeCount', 'trades', 'open', 'totalReturn', 'buyHoldReturn', 'maxDrawdown']);
            if (!['ready', 'insufficient', 'invalid'].includes(r.status) || typeof r.open !== 'boolean')
                fail('storage-unavailable');
            if ((r.from !== null && !date(r.from)) || (r.to !== null && !date(r.to)))
                fail('storage-unavailable');
            if (!Number.isInteger(r.bars) || r.bars < 0 || r.bars > 250 || !Array.isArray(r.trades) || r.trades.length > 125 || r.tradeCount !== r.trades.length)
                fail('storage-unavailable');
            for (const key of ['totalReturn', 'buyHoldReturn', 'maxDrawdown']) {
                if (r[key] !== null && (typeof r[key] !== 'number' || !Number.isFinite(r[key])))
                    fail('storage-unavailable');
            }
            for (const trade of r.trades) {
                exact(trade, ['entryDate', 'exitDate', 'entryOpen', 'exitOpen', 'netReturn']);
                if (!date(trade.entryDate) || !date(trade.exitDate) || trade.entryDate > trade.exitDate)
                    fail('storage-unavailable');
                for (const key of ['entryOpen', 'exitOpen', 'netReturn'])
                    if (typeof trade[key] !== 'number' || !Number.isFinite(trade[key]))
                        fail('storage-unavailable');
                if (trade.entryOpen <= 0 || trade.exitOpen <= 0)
                    fail('storage-unavailable');
            }
        }
    }
    return clone({ ...value, scope, symbols });
}
// Enough for 200 bounded 250-bar replays, still bounded before allocation/read.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
/** All task files live directly under the official profile's finance directory. */
export function createProfileScheduleStore(profileDirectory) {
    if (typeof profileDirectory !== 'string' || !path.isAbsolute(profileDirectory))
        fail('storage-unavailable');
    const profile = profileDirectory;
    let pinnedRoot;
    const checkDirectory = async (target, optional = false) => {
        try {
            const info = await lstat(target);
            if (!info.isDirectory() || info.isSymbolicLink())
                fail('storage-unavailable');
        }
        catch (error) {
            if (!optional || error.code !== 'ENOENT')
                throw error;
        }
    };
    const base = async (write) => {
        await checkDirectory(profile);
        const root = await realpath(profile);
        if (pinnedRoot && pinnedRoot !== root)
            fail('storage-unavailable');
        pinnedRoot = root;
        const directory = path.join(root, STORE_DIRECTORY);
        await checkDirectory(directory, true);
        if (write) {
            await checkDirectory(path.join(root, PREVIOUS_STORE_DIRECTORY), true);
            if (await profileStoreDirectory(root) !== directory)
                fail('storage-unavailable');
            await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST')
                throw error; });
            await checkDirectory(directory);
        }
        return directory;
    };
    const checkFile = async (target) => {
        try {
            const info = await lstat(target);
            if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
                fail('storage-unavailable');
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    };
    return {
        async load() {
            const directory = await base(false);
            let file;
            try {
                file = await open(path.join(directory, WATCH_SCHEDULE_FILE), constants.O_RDONLY | constants.O_NOFOLLOW);
                const stat = await file.stat();
                if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_FILE_BYTES)
                    fail('storage-unavailable');
                const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
                const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
                if (bytesRead > MAX_FILE_BYTES)
                    fail('storage-unavailable');
                return parseScheduleRecord(JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')));
            }
            catch (error) {
                if (error.code === 'ENOENT')
                    return null;
                throw error;
            }
            finally {
                await file?.close();
            }
        },
        async save(record) {
            const text = JSON.stringify(parseScheduleRecord(record));
            if (Buffer.byteLength(text) > MAX_FILE_BYTES)
                fail('storage-unavailable');
            const directory = await base(true);
            const target = path.join(directory, WATCH_SCHEDULE_FILE);
            await checkFile(target);
            const temporary = path.join(directory, `watch-signal-${randomUUID()}.tmp`);
            try {
                const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
                try {
                    await file.writeFile(text);
                    await file.sync();
                }
                finally {
                    await file.close();
                }
                await checkDirectory(directory);
                await checkFile(target);
                await rename(temporary, target);
            }
            finally {
                await unlink(temporary).catch(() => { });
            }
        },
    };
}
// Enabling requires a scope already obtained through the existing UI route.
// Do not let loadProfileScope create/migrate anything on a scheduler GET/tick,
// or follow a symlink into another profile before checking consent.
async function readScheduleScope(profile) {
    const root = await lstat(profile);
    if (!root.isDirectory() || root.isSymbolicLink())
        fail('storage-unavailable');
    const directory = path.join(await realpath(profile), STORE_DIRECTORY);
    const dir = await lstat(directory);
    if (!dir.isDirectory() || dir.isSymbolicLink())
        fail('storage-unavailable');
    const file = await open(path.join(directory, 'scope.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const info = await file.stat();
        if (!info.isFile() || info.nlink !== 1 || info.size > 1024)
            fail('storage-unavailable');
        const value = JSON.parse(await file.readFile('utf8'));
        if (value.version !== 1)
            fail('storage-unavailable');
        const scope = validateScope(value.scope);
        if (scope !== await loadProfileScope(profile))
            fail('scope-mismatch');
        return scope;
    }
    finally {
        await file.close();
    }
}
export function createWatchSignalScheduler(options) {
    const now = options.now ?? Date.now;
    const store = options.store ?? createProfileScheduleStore(options.profileDirectory);
    const readScope = options.readScope ?? (() => readScheduleScope(options.profileDirectory));
    let record = empty(), loading, stored = false, storageFault = false, disposed = false;
    let generation = 0, pendingMutations = 0, active;
    let queue = Promise.resolve();
    const serial = (fn) => {
        const task = queue.then(fn, fn);
        queue = task.catch(() => { });
        return task;
    };
    const cancel = () => { generation++; active?.abort(); active = undefined; };
    const on = async () => { try {
        return await options.sourceEnabled();
    }
    catch {
        return false;
    } };
    const ensure = () => loading ??= (async () => {
        try {
            const saved = await store.load();
            if (!saved)
                return;
            stored = true;
            if (saved.scope !== validateScope(await readScope())) {
                record.error = 'scope-mismatch';
                return;
            }
            record = saved;
        }
        catch {
            storageFault = true;
            record.error = 'storage-unavailable';
        }
    })();
    const scopeCheck = async (scope) => {
        const actual = validateScope(await readScope());
        if (record.scope && record.scope !== actual) {
            cancel();
            record = { ...empty(actual), error: 'scope-mismatch' };
            stored = false;
        }
        if (scope !== undefined && scope !== actual)
            fail('scope-mismatch');
        return actual;
    };
    const save = async (next) => {
        try {
            await store.save(next);
            stored = true;
            storageFault = false;
        }
        catch {
            storageFault = true;
            record.error = 'storage-unavailable';
            fail('storage-unavailable');
        }
    };
    const snapshot = async () => {
        const sourceEnabled = await on();
        const rows = record.rows.map(row => {
            const fresh = freshness(row.sourceDate, row.isFinal, now());
            return { ...clone(row), freshness: fresh, usable: sourceEnabled && row.status === 'ready' && row.signal?.reason === 'ok' && fresh === 'current' };
        });
        const clock = shanghaiScheduleClock(now());
        const current = rows.filter(row => row.freshness === 'current').length;
        const usable = rows.filter(row => row.usable).length;
        return {
            enabled: record.enabled, running: Boolean(active), syncedCount: record.symbols.length,
            lastAttemptDate: record.lastAttemptDate, updatedAt: record.updatedAt, resultDate: record.resultDate,
            rows, error: record.error, sourceEnabled,
            partial: Boolean(record.resultDate) && (rows.length !== record.symbols.length || usable !== rows.length),
            freshness: !rows.length ? 'empty' : current === rows.length ? 'current' : current ? 'mixed' : 'historical',
            blockedReason: disposed ? 'disposed' : storageFault ? 'storage-unavailable' : !record.enabled ? 'disabled' : active ? 'running'
                : !sourceEnabled ? 'source-disabled' : !record.symbols.length ? 'empty'
                    : clock.weekday === 0 || clock.weekday === 6 ? 'weekend' : clock.minutes < 990 ? 'before-window'
                        : record.lastAttemptDate && record.lastAttemptDate >= clock.date ? 'already-attempted' : null,
            policy: WATCH_SCHEDULE_POLICY,
        };
    };
    const start = async () => {
        await ensure();
        if (disposed || pendingMutations || !record.enabled || storageFault || active)
            return;
        await scopeCheck();
        if (!record.enabled)
            return;
        const state = await snapshot();
        if (state.blockedReason || pendingMutations || disposed)
            return;
        const token = generation, controller = new AbortController(), clock = shanghaiScheduleClock(now());
        active = controller;
        // Persist the attempt BEFORE any upstream request. A crash consumes today's
        // attempt and leaves an explicit interrupted record, never an invented retry.
        const next = { ...record, lastAttemptDate: clock.date, resultDate: clock.date, rows: [], updatedAt: new Date(now()).toISOString(), error: 'interrupted' };
        try {
            await save(next);
        }
        catch {
            if (active === controller)
                active = undefined;
            return;
        }
        if (disposed || token !== generation)
            return;
        record = next;
        const symbols = record.symbols.slice(), scope = record.scope;
        const valid = () => !disposed && !pendingMutations && token === generation && record.enabled && record.scope === scope && !controller.signal.aborted;
        const allowed = async () => {
            if (!valid())
                return false;
            if (!await on()) {
                controller.abort();
                return false;
            }
            if (await scopeCheck() !== scope)
                return false;
            return valid();
        };
        const histories = new Map();
        const rpc = createWatchScheduleRpc({ market: options.market, search: options.search, now, allowed, onHistory: history => histories.set(history.symbol, history) });
        let progress = [];
        void (async () => {
            let rows = [], error = null;
            try {
                rows = await scanWatchSignals(rpc, symbols.map(symbol => ({ symbol, alias: '' })), {
                    signal: controller.signal, now, wait: options.wait, onProgress: value => { progress = value; },
                });
            }
            catch {
                rows = progress;
                error = controller.signal.aborted ? 'interrupted' : 'scan-failed';
            }
            if (!rows.length)
                rows = symbols.map(symbol => ({ symbol, alias: '', name: '', status: 'skipped', signal: null, replay: null, source: null, fetchedAt: null, adjustment: null, pricePrecision: null, stWarning: false }));
            await serial(async () => {
                // A source change can preserve completed rows, but a consent/list/scope
                // change MUST NOT let the old generation publish or overwrite anything.
                if (disposed || token !== generation || record.scope !== scope)
                    return;
                if (await scopeCheck() !== scope || token !== generation)
                    return;
                if (!await on())
                    error = 'source-disabled';
                const completed = {
                    ...record, rows: rows.map(row => projectRow(row.status === 'pending' ? { ...row, status: 'skipped' } : row, histories.get(row.symbol), now())),
                    updatedAt: new Date(now()).toISOString(), error,
                };
                try {
                    await save(completed);
                    if (token === generation && !disposed)
                        record = completed;
                }
                catch { /* Keep the durable interrupted attempt and expose the disk failure. */ }
                finally {
                    if (active === controller)
                        active = undefined;
                }
            });
        })().catch(() => { if (active === controller) {
            active = undefined;
            record.error = 'scan-failed';
        } });
    };
    return {
        async request(request, signal) {
            // Owner checking and strict wire parsing are in the public RPC handler.
            await ensure();
            if (disposed)
                fail('disposed');
            signal?.throwIfAborted();
            const scope = await scopeCheck(validateScope(request.scope));
            signal?.throwIfAborted();
            const mutating = request.action === 'disable' || request.action === 'sync' || request.action === 'enable';
            if (mutating) {
                if (request.action === 'sync' && !record.enabled)
                    fail('not-enabled');
                pendingMutations++;
                cancel(); // Immediate cancellation, even if an earlier disk write is pending.
            }
            try {
                return await serial(async () => {
                    if (disposed)
                        fail('disposed');
                    if (await scopeCheck(scope) !== scope)
                        fail('scope-mismatch');
                    if (request.action === 'enable' || request.action === 'sync') {
                        if (request.action === 'enable' && request.consent !== true)
                            fail('not-enabled');
                        if (request.action === 'sync' && !record.enabled)
                            fail('not-enabled');
                        const next = { ...record, scope, enabled: true, symbols: scheduleSymbols(request.symbols), rows: [], resultDate: null, error: null, updatedAt: new Date(now()).toISOString() };
                        await save(next);
                        record = next;
                    }
                    else if (request.action === 'disable') {
                        // Clear in memory even on disk failure. The error explicitly warns that
                        // persistence failed; the old consent may survive a process restart.
                        record = { ...empty(scope), lastAttemptDate: record.lastAttemptDate, updatedAt: new Date(now()).toISOString() };
                        if (stored || storageFault)
                            await save(record);
                    }
                    else if (request.action === 'run') {
                        if (!record.enabled)
                            fail('not-enabled');
                        await start();
                    }
                    return snapshot();
                });
            }
            finally {
                if (mutating)
                    pendingMutations--;
            }
        },
        tick: () => serial(async () => { await start(); return snapshot(); }),
        sourceChanged() { active?.abort(); },
        dispose() { disposed = true; cancel(); },
    };
}
/** Official TimerService.interval(callback, delay), owned by the injected ctx. */
export function installWatchScheduleTimer(host, scheduler) {
    host.effect(() => {
        const tick = () => { void scheduler.tick().catch(() => { }); };
        const stop = host.timer.interval(tick, WATCH_SCHEDULE_INTERVAL_MS);
        tick(); // Catch up only today's eligible window, after a process restart.
        return () => { scheduler.dispose(); stop(); };
    });
}
