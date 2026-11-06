export declare const FACTOR_JOURNAL_FILE = "factor-journal.json";
export declare const FACTOR_JOURNAL_VERSION = 1;
export declare const FACTOR_JOURNAL_MAX_BYTES: number;
export declare const FACTOR_JOURNAL_MAX_SESSIONS = 30;
export declare const FACTOR_JOURNAL_MAX_ROWS = 200;
export interface JournalRow {
    symbol: string;
    /** Close of the signal session, the base for the next open gap. */
    close: number;
    /** The board's price limit for that symbol, percent. */
    rate: number;
    /** Point-in-time feature vector, exactly what the model scored. */
    vector: Record<string, number>;
}
export interface JournalSession {
    sessionDate: string;
    rows: JournalRow[];
}
export interface FactorJournal {
    version: typeof FACTOR_JOURNAL_VERSION;
    sessions: JournalSession[];
}
export declare const emptyFactorJournal: () => FactorJournal;
export declare function parseFactorJournal(value: unknown): FactorJournal;
/** Null on every failure: an unreadable journal means "nothing to learn yet". */
export declare function readFactorJournal(directory: string): Promise<FactorJournal | null>;
export declare function writeFactorJournal(directory: string, journal: FactorJournal): Promise<void>;
/**
 * Replaces the entry for this session and trims the oldest ones. Re-running the
 * same day is a no-op in content terms: the newest vector wins, never a
 * duplicate.
 */
export declare function appendJournalSession(directory: string, session: JournalSession): Promise<void>;
