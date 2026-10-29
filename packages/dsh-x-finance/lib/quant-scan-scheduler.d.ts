import type { MarketProvider } from './market.ts';
import type { QuantScanResult } from './quant-scan.ts';
import type { QuantScheduleRequest } from './quant-scan-scheduler-rpc.ts';
export declare const QUANT_SCHEDULE_FILE = "quant-scan-schedule.json";
export declare const QUANT_SCHEDULE_MAX_BYTES: number;
export declare const QUANT_SCHEDULE_POLICY: Readonly<{
    readonly timeZone: 'Asia/Shanghai';
    readonly after: '16:45';
    readonly weekdaysOnly: true;
    readonly holidayCalendar: false;
    readonly hostMustBeRunning: true;
    readonly catchUp: 'current-weekday-only';
    readonly maxAttemptsPerDate: 1;
    readonly reportsRetained: 20;
    readonly resultsOnDisable: 'retained';
    readonly watchlistPriority: 'already-running-at-start';
    readonly recovery: 'interrupted-no-automatic-resume';
    readonly realtime: false;
    readonly notice: '开启后，每个工作日上海时间 16:45 后可能持续发起数千次免费行情请求；不识别法定节假日，需宿主保持运行。每天最多自动尝试一次，中断后当天不自动重试，可在 UI 手动启动 scanner。仅保留最近 20 个报告日期、每次前 30 候选与覆盖统计；不改变自选或账户、不下单，报告不代表实时行情或交易所全覆盖。';
    readonly limits: Readonly<{
        stocks: 12000;
        pages: 60;
        pageSize: 200;
        historyBars: 250;
        minBars: 120;
        minAmountSamples: 16;
        batchStocks: 150;
        concurrency: 2;
        requestGapMs: 500;
        batchMs: 90000;
        cooldownMs: 60000;
        sessionMs: number;
        resultTtlMs: number;
        rows: 30;
        consecutiveFailures: 5;
    }>;
}>;
export type QuantScheduleError = null | 'interrupted' | 'source-disabled' | 'scope-mismatch' | 'storage-unavailable' | 'scan-failed' | 'upstream-failures' | 'expired';
export interface QuantScheduleReport {
    /** Attempt's Shanghai calendar date. Source trading dates remain in result. */
    date: string;
    updatedAt: string;
    status: 'complete' | 'partial' | 'interrupted';
    partial: boolean;
    error: QuantScheduleError;
    /** A bounded snapshot, never a resumable session or raw daily-bar database. */
    result: QuantScanResult | null;
}
export interface QuantScheduleRecord {
    version: 1;
    scope: string;
    consent: true;
    enabled: boolean;
    lastAttemptDate: string | null;
    updatedAt: string | null;
    error: QuantScheduleError;
    reports: QuantScheduleReport[];
}
export interface QuantScheduleState {
    enabled: boolean;
    running: boolean;
    sourceEnabled: boolean;
    lastAttemptDate: string | null;
    updatedAt: string | null;
    error: QuantScheduleError;
    latest: QuantScheduleReport | null;
    reports: QuantScheduleReport[];
    blockedReason: null | 'disabled' | 'disposed' | 'running' | 'source-disabled' | 'before-window' | 'weekend' | 'already-attempted' | 'watch-running' | 'watch-unavailable' | 'storage-unavailable' | 'scope-mismatch';
    policy: typeof QUANT_SCHEDULE_POLICY;
}
export interface QuantScheduleStore {
    load(): Promise<QuantScheduleRecord | null>;
    save(record: QuantScheduleRecord): Promise<void>;
}
export declare function quantScheduleClock(now: number): {
    date: string;
    weekday: number;
    minutes: number;
};
/** Disk input is stricter than the provider projection: unknown/private fields are rejected. */
export declare function parseQuantScheduleRecord(value: any): QuantScheduleRecord;
export declare function createProfileQuantScheduleStore(profile: string): QuantScheduleStore;
export interface QuantScheduleOptions {
    profileDirectory: string;
    provider: () => Promise<MarketProvider | undefined>;
    sourceEnabled: () => Promise<boolean>;
    /** Must be read-only. Failure blocks admission, not the watch task. */
    watchRunning?: (scope: string) => Promise<boolean>;
    now?: () => number;
    wait?: (ms: number, signal: AbortSignal) => Promise<void>;
    store?: QuantScheduleStore;
    readScope?: () => Promise<string>;
}
export interface QuantScanScheduler {
    request(request: QuantScheduleRequest, signal?: AbortSignal): Promise<QuantScheduleState>;
    tick(): Promise<QuantScheduleState>;
    sourceChanged(): void;
    dispose(): void;
}
export declare function createQuantScanScheduler(options: QuantScheduleOptions): QuantScanScheduler;
