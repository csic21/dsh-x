import type { MarketHistory } from './market.ts';
export interface HistoryDatasetBar {
    sessionDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
    amount: number | null;
    isFinal: boolean;
    updatedAt: null;
    revision: string;
}
export interface HistoryDataset {
    schemaVersion: 1;
    kind: 'market';
    providerId: string;
    id: string;
    symbol: string;
    name: string;
    currency: string;
    exchangeTimezone: string;
    interval: '1d';
    adjustment: 'none' | 'forward' | 'backward';
    adjustmentRevision: string;
    adjustmentMethod: string;
    datasetRevision: string;
    pricePrecision: number;
    volumeUnit: 'shares';
    volumeAdjustment: 'unadjusted' | 'adjusted';
    volumeAdjustmentMethod: string;
    amountAdjustment: 'not-provided' | 'unadjusted';
    amountAdjustmentMethod: string;
    amountCurrency: string;
    source: {
        kind: 'market-feed';
        label: string;
        provenance: string;
        verified: boolean;
    };
    historyAnchor: string;
    hasNonPositivePrices: false;
    logScaleAllowed: true;
    fetchedAt: string;
    volumeBasis: 'shares' | 'lots' | 'unknown' | 'reported';
    bars: HistoryDatasetBar[];
}
/**
 * Identity is stable across refreshes of the same series (so the chart keeps
 * its viewport and updates only the tail) and changes when the symbol,
 * adjustment or covered date range changes (so the chart resets).
 */
export declare function historyDatasetId(history: MarketHistory): string;
export declare function toChartDataset(history: MarketHistory): HistoryDataset;
