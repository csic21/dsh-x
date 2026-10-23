import type { GoldSnapshot } from './gold.ts';
export interface GoldProvider {
    readonly name: string;
    snapshot(signal?: AbortSignal): Promise<GoldSnapshot>;
}
export interface GoldProviderOptions {
    fetchImpl?: typeof fetch;
    now?: () => number;
    timeoutMs?: number;
    snapshotTtlMs?: number;
    historyTtlMs?: number;
}
export declare function createSinaGoldProvider(options?: GoldProviderOptions): GoldProvider;
