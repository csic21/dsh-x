import type { MarketAdjustment, MarketHistory } from './market.ts';
/** Fixed Host limits; no RPC option can raise them. All state is process memory. */
export declare const QUANT_SCAN_LIMITS: Readonly<{
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
export declare const QUANT_SCAN_NOTICE: readonly ['手动扫描的进度仅保留在当前 provider 内存；每日后台任务需单独同意并只保存报告。', '免费非官方接口无 SLA，可能延迟、限流或缺失；完整仅指本次源清单处理完成，不保证覆盖交易所全部股票。', '名称及停牌状态仅来自 rank 快照；不能完整识别风险警示、临时停牌或历史状态变化。', '仅在已覆盖、同一末日且关键因子齐全的样本中计算分位；分批和缺失会改变排序，清单按代码推进而非候选预筛。', '复权使用实际返回口径；混合复权、公司行动及未确认收盘可能影响比较，未做总回报修正。', '流动性取最近20条有效日线中可用金额的中位数，至少16条可用才参与排序；不把缺失金额填成0。', '确定性演示评分不是收益概率，不保证盈利；数据和收益均不宣称实时。'];
/**
 * start: one batch, or the existing unexpired result (no forced refresh).
 * status: cached progress/null; joins an active batch without starting work.
 * continue: one further batch for this id, only after nextAllowedAt. Calls
 * during cooldown/completion return the same result. Unknown ids fail closed.
 * Once expired, only an explicit start creates a fresh universe snapshot.
 */
export type QuantScanRequest = {
    action: 'start' | 'status';
} | {
    action: 'continue';
    scanId: string;
};
export declare function parseQuantScanRequest(input: unknown): QuantScanRequest;
export type QuantStopReason = 'batch-limit' | 'deadline' | 'finished' | 'upstream-failures' | 'cancelled' | 'expired';
export interface QuantStock {
    symbol: string;
    name: string | null;
    suspended: boolean | null;
}
export interface QuantPage {
    expected: number;
    stocks: QuantStock[];
    invalid: number;
    rawCount: number;
}
export interface QuantFactors {
    close: number;
    ma20: number;
    ma60: number;
    return20: number;
    return60: number;
    amountMedian20: number | null;
    amountSamples20: number;
    volatility20: number;
}
export interface QuantSample {
    symbol: string;
    name: string;
    sessionDate: string;
    fetchedAt: string;
    adjustment: MarketAdjustment;
    provisional: boolean;
    validBars: number;
    factors: QuantFactors;
}
export interface QuantRow extends QuantSample {
    score: number;
    scores: {
        trend: number;
        momentum: number;
        liquidity: number;
        risk: number;
    };
    percentiles: {
        return20: number;
        return60: number;
        amountMedian20: number;
        lowVolatility20: number;
    };
    explanation: string[];
}
export interface QuantCounts {
    /** First page's total, null when it could not be obtained. */
    expected: number | null;
    discovered: number;
    invalidListRows: number;
    duplicateListRows: number;
    failedPages: number;
    attempted: number;
    /** Successfully parsed nonempty daily series, including insufficient samples. */
    covered: number;
    dailySucceeded: number;
    dailyInsufficient: number;
    dailyFailed: number;
    notAttempted: number;
    /** Disjoint exclusions among successful (>=120 bars) daily series, in this order. */
    excludedSuspended: number;
    excludedST: number;
    excludedStatusUnknown: number;
    missingFactors: number;
    excludedDateMismatch: number;
    ranked: number;
    provisional: number;
    coverage: number;
    sampleCoverage: number;
    listCoverage: number;
}
export interface QuantScanResult {
    version: 1;
    scanId: string;
    source: string;
    startedAt: string;
    updatedAt: string;
    expiresAt: string;
    nextAllowedAt: string;
    /** Source dates, not a claim that prices are current. */
    sessionDate: string | null;
    oldestSessionDate: string | null;
    status: 'complete' | 'incomplete';
    partial: boolean;
    provisional: boolean;
    canContinue: boolean;
    stopReason: QuantStopReason;
    listPartial: boolean;
    requestedAdjustment: 'forward';
    requests: number;
    batches: number;
    /** Every ratio is 0..1; final rows omit all historical bar arrays. */
    counts: QuantCounts;
    rows: QuantRow[];
    notices: string[];
    limits: typeof QUANT_SCAN_LIMITS;
}
export declare const quantScanError: () => Error & {
    code: string;
};
export declare function isQuantSymbol(value: unknown): value is string;
export declare function quantDate(value: unknown): value is string;
/** Average tied rank / (n-1); a singleton and an all-tied cohort receive 0.5. */
export declare function quantPercentiles(values: readonly number[]): number[];
/** A malformed series is not ranked; missing turnover remains null. */
export declare function quantSample(history: MarketHistory, stock: QuantStock, now: number): QuantSample | null;
export declare function quantExplanation(row: Pick<QuantRow, 'factors' | 'scores'>): string[];
export declare function rankQuantSamples(samples: QuantSample[]): QuantRow[];
interface QuantScannerDependencies {
    source: string;
    now?: () => number;
    id: () => string;
    page(offset: number, signal: AbortSignal): Promise<QuantPage>;
    history(symbol: string, signal: AbortSignal): Promise<MarketHistory>;
    /** Offline clock/scheduler seam; production always uses the fixed limits. */
    wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}
/** No scheduling on construction/status. A start/continue call performs one bounded batch. */
export declare function createQuantScanner(deps: QuantScannerDependencies): (input: QuantScanRequest, signal?: AbortSignal) => Promise<QuantScanResult | null>;
/** Host trust boundary. Never forward raw provider fields, bars or explanations. */
export declare function projectQuantScan(raw: unknown, now: number): QuantScanResult | null;
export {};
