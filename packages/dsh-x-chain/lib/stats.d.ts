/**
 * Per-session chain accounting.
 *
 * One record per `chain_run` call, folded into a small durable snapshot under
 * the profile directory. The page reads the same snapshot, so the numbers a
 * user sees are the numbers the tool reported — no re-derivation from logs and
 * no invented savings.
 *
 * @module dsh-x-chain/stats
 */
/** One finished `chain_run` call. */
export interface ChainRecord {
    /** Session that ran the chain. */
    readonly sessionId: string;
    /** Unix epoch milliseconds at settlement. */
    readonly at: number;
    /** Steps that actually executed. */
    readonly executed: number;
    /** Counterfactual model round trips saved, as the tool reported it. */
    readonly saved: number;
    /** Why the chain stopped early, when it did. */
    readonly stopped?: 'guard' | 'error' | 'aborted';
    /** Tools the chain dispatched, in order. */
    readonly tools: readonly string[];
}
/** One session's folded counters. */
export interface SessionSummary {
    sessionId: string;
    chains: number;
    steps: number;
    saved: number;
    stopped: number;
    lastAt: number;
}
/** Everything the page renders. */
export interface StatsSnapshot {
    totals: {
        chains: number;
        steps: number;
        saved: number;
        stopped: number;
    };
    sessions: SessionSummary[];
    updatedAt: number;
}
/** Options for {@link createStatsStore}. */
export interface StatsStoreOptions {
    /** Profile directory; the snapshot lives in `.dsh-x-chain/stats.json`. */
    profileDirectory?: string;
    /** Clock override for tests. */
    now?: () => number;
    /** Sessions kept in the snapshot, newest first. Defaults to 200. */
    maxSessions?: number;
}
/** The durable store behind the tool and the page. */
export interface StatsStore {
    /** Fold one finished chain into the snapshot. */
    record(record: ChainRecord): void;
    /** Current snapshot, newest session first. */
    snapshot(): StatsSnapshot;
    /** Wait for the pending write, including the initial load. */
    flush(): Promise<void>;
}
/**
 * Create the stats store.
 * @param options - profile directory, clock, and retention bound.
 * @returns the store the tool records into and the page reads.
 */
export declare function createStatsStore(options?: StatsStoreOptions): StatsStore;
