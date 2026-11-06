// The daily input log behind the self-correcting screen.
//
// The factor state cannot be updated from the current session alone: a label
// needs the next open and the close after it. So every finished scan appends
// the exact rows it scored — symbol, close, board limit, feature vector — and a
// later pass labels them once the bars exist. That is what lets the Host catch
// up on a restart instead of silently skipping the days it was closed.
//
// The journal holds only what cannot be recomputed later: the point-in-time
// feature vector. Prices are refetched when the label is taken, so a stale
// entry can still be labelled correctly. The file is bounded, validated on
// read, and replaced atomically.
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
export const FACTOR_JOURNAL_FILE = 'factor-journal.json';
export const FACTOR_JOURNAL_VERSION = 1;
export const FACTOR_JOURNAL_MAX_BYTES = 4 * 1024 * 1024;
export const FACTOR_JOURNAL_MAX_SESSIONS = 30;
export const FACTOR_JOURNAL_MAX_ROWS = 200;
const fail = () => { throw Object.assign(new Error('factor journal unavailable'), { code: 'finance/factor-journal-invalid' }); };
const CLOCK = /^\d{4}-\d{2}-\d{2}$/;
function exact(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype
        || Object.keys(value).sort().join(',') !== [...keys].sort().join(','))
        fail();
}
export const emptyFactorJournal = () => ({ version: FACTOR_JOURNAL_VERSION, sessions: [] });
export function parseFactorJournal(value) {
    exact(value, ['version', 'sessions']);
    const raw = value;
    if (raw.version !== FACTOR_JOURNAL_VERSION)
        fail();
    if (!Array.isArray(raw.sessions) || raw.sessions.length > FACTOR_JOURNAL_MAX_SESSIONS)
        fail();
    let previous = '0000-01-01';
    const sessions = raw.sessions.map(session => {
        exact(session, ['sessionDate', 'rows']);
        if (typeof session.sessionDate !== 'string' || !CLOCK.test(session.sessionDate)
            || !Number.isFinite(Date.parse(session.sessionDate)) || session.sessionDate <= previous)
            fail();
        previous = session.sessionDate;
        if (!Array.isArray(session.rows) || session.rows.length > FACTOR_JOURNAL_MAX_ROWS)
            fail();
        return {
            sessionDate: session.sessionDate,
            rows: session.rows.map(row => {
                exact(row, ['symbol', 'close', 'rate', 'vector']);
                if (typeof row.symbol !== 'string' || !/^(SH|SZ|BJ)\.\d{6}$/.test(row.symbol))
                    fail();
                if (!Number.isFinite(row.close) || row.close <= 0 || row.close > 1e9)
                    fail();
                if (!Number.isFinite(row.rate) || row.rate < 1 || row.rate > 30)
                    fail();
                if (!row.vector || typeof row.vector !== 'object' || Array.isArray(row.vector))
                    fail();
                const vector = {};
                for (const [name, entry] of Object.entries(row.vector)) {
                    if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(name) || typeof entry !== 'number' || !Number.isFinite(entry))
                        fail();
                    vector[name] = entry;
                }
                return { symbol: row.symbol, close: row.close, rate: row.rate, vector };
            }),
        };
    });
    return { version: FACTOR_JOURNAL_VERSION, sessions };
}
/** Null on every failure: an unreadable journal means "nothing to learn yet". */
export async function readFactorJournal(directory) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory))
        return null;
    try {
        const target = path.join(directory, FACTOR_JOURNAL_FILE);
        const info = await lstat(target);
        if (!info.isFile() || info.isSymbolicLink() || info.size > FACTOR_JOURNAL_MAX_BYTES)
            return null;
        return parseFactorJournal(JSON.parse(await readFile(target, 'utf8')));
    }
    catch {
        return null;
    }
}
export async function writeFactorJournal(directory, journal) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory))
        throw new Error('invalid journal directory');
    const parsed = parseFactorJournal(journal);
    const text = `${JSON.stringify(parsed)}\n`;
    if (Buffer.byteLength(text) > FACTOR_JOURNAL_MAX_BYTES)
        throw new Error('factor journal too large');
    await mkdir(directory, { recursive: true });
    const target = path.join(directory, FACTOR_JOURNAL_FILE);
    const temporary = path.join(directory, `.${FACTOR_JOURNAL_FILE}.${process.pid}.${Date.now()}.tmp`);
    const handle = await open(temporary, 'wx', 0o600);
    try {
        try {
            await handle.writeFile(text, 'utf8');
            await handle.sync();
        }
        finally {
            await handle.close();
        }
        await rename(temporary, target);
    }
    catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
}
/**
 * Replaces the entry for this session and trims the oldest ones. Re-running the
 * same day is a no-op in content terms: the newest vector wins, never a
 * duplicate.
 */
export async function appendJournalSession(directory, session) {
    if (!session.rows.length)
        return;
    const journal = (await readFactorJournal(directory)) ?? emptyFactorJournal();
    const rows = session.rows.slice(0, FACTOR_JOURNAL_MAX_ROWS);
    const sessions = journal.sessions.filter(entry => entry.sessionDate !== session.sessionDate);
    sessions.push({ sessionDate: session.sessionDate, rows });
    sessions.sort((left, right) => left.sessionDate.localeCompare(right.sessionDate));
    await writeFactorJournal(directory, {
        version: FACTOR_JOURNAL_VERSION,
        sessions: sessions.slice(-FACTOR_JOURNAL_MAX_SESSIONS),
    });
}
