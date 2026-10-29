import type { WatchSignalRow } from './client/watch-signals-data.ts';
import type { ScheduleRpcOptions, WatchScheduleRequest } from './watch-signal-scheduler-rpc.ts';
export declare const WATCH_SCHEDULE_FILE = "watch-signal-schedule.json";
export declare const WATCH_SCHEDULE_INTERVAL_MS = 30000;
export declare const WATCH_SCHEDULE_POLICY: {
    readonly timeZone: 'Asia/Shanghai';
    readonly after: '16:30';
    readonly weekdaysOnly: true;
    readonly holidayCalendar: false;
    readonly catchUp: 'current-weekday-only';
    readonly hostMustBeRunning: true;
    readonly resultsOnDisable: 'cleared';
    readonly maxSymbols: 200;
    readonly maxAttemptsPerDate: 1;
};
export type ScheduleFreshness = 'current' | 'previous-session' | 'stale' | 'unfinished' | 'unavailable';
export interface ScheduledWatchRow extends Omit<WatchSignalRow, 'alias'> {
    sourceDate: string | null;
    isFinal: boolean | null;
    freshness: ScheduleFreshness;
    /** Only today's final, sufficient, validated data may be displayed as a current observation. */
    usable: boolean;
}
export type ScheduleError = 'storage-unavailable' | 'scope-mismatch' | 'scan-failed' | 'interrupted' | 'source-disabled' | null;
export interface ScheduleRecord {
    version: 1;
    scope: string;
    enabled: boolean;
    symbols: string[];
    lastAttemptDate: string | null;
    updatedAt: string | null;
    resultDate: string | null;
    rows: ScheduledWatchRow[];
    error: ScheduleError;
}
export interface WatchScheduleState {
    enabled: boolean;
    running: boolean;
    syncedCount: number;
    lastAttemptDate: string | null;
    updatedAt: string | null;
    resultDate: string | null;
    rows: ScheduledWatchRow[];
    error: ScheduleError;
    sourceEnabled: boolean;
    partial: boolean;
    freshness: 'empty' | 'current' | 'mixed' | 'historical';
    blockedReason: 'disabled' | 'running' | 'source-disabled' | 'empty' | 'weekend' | 'before-window' | 'already-attempted' | 'storage-unavailable' | 'disposed' | null;
    policy: typeof WATCH_SCHEDULE_POLICY;
}
export interface ScheduleStore {
    load(): Promise<ScheduleRecord | null>;
    save(record: ScheduleRecord): Promise<void>;
}
export declare function shanghaiScheduleClock(now: number): {
    date: string;
    weekday: number;
    minutes: number;
};
/** Strict disk schema: malformed/truncated/duplicate state never re-enables a task. */
export declare function parseScheduleRecord(value: any): ScheduleRecord;
/** All task files live directly under the official profile's finance directory. */
export declare function createProfileScheduleStore(profileDirectory: unknown): ScheduleStore;
export interface WatchScheduleOptions {
    profileDirectory: string;
    market?: ScheduleRpcOptions['market'];
    search: ScheduleRpcOptions['search'];
    sourceEnabled: () => Promise<boolean>;
    now?: () => number;
    wait?: (signal: AbortSignal) => Promise<void>;
    store?: ScheduleStore;
    readScope?: () => Promise<string>;
}
export interface WatchSignalScheduler {
    request(request: WatchScheduleRequest, signal?: AbortSignal): Promise<WatchScheduleState>;
    tick(): Promise<WatchScheduleState>;
    sourceChanged(): void;
    dispose(): void;
}
export declare function createWatchSignalScheduler(options: WatchScheduleOptions): WatchSignalScheduler;
/** Official TimerService.interval(callback, delay), owned by the injected ctx. */
export declare function installWatchScheduleTimer(host: {
    timer: {
        interval(callback: () => void, delay: number): () => void;
    };
    effect(callback: () => (() => void)): unknown;
}, scheduler: WatchSignalScheduler): void;
