export declare const BAR_INTERVALS: readonly ['1d', '1w', '1M', '1y'];
export type BarInterval = typeof BAR_INTERVALS[number];
export declare function normalizeInterval(raw: unknown): BarInterval;
/** Monday of the calendar week that contains this session, as a date key. */
export declare function weekStart(sessionDate: string): string;
export declare function shanghaiSessionDate(now: Date): string;
/** Merge ascending daily bars. `1d` returns the same array. */
export declare function resampleBars(bars: any[], interval: BarInterval, now?: Date): any[];
/** A view of a daily dataset. Daily itself is returned unchanged. */
export declare function resampleDataset(dataset: any, interval: BarInterval, now?: Date): any;
