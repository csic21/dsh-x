export interface DailyBar {
    sessionDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
    amount: number | null;
    isFinal: boolean;
    updatedAt: string | null;
    revision: string;
}
export interface ChartDataset {
    id: string;
    schemaVersion: number;
    kind: string;
    providerId: string;
    symbol: string;
    name: string;
    currency: string;
    exchangeTimezone: string;
    interval: string;
    adjustment: string;
    adjustmentRevision: string;
    adjustmentMethod: string;
    datasetRevision: string;
    pricePrecision: number;
    volumeUnit: string;
    volumeAdjustment: string;
    volumeAdjustmentMethod: string;
    amountAdjustment: string;
    amountAdjustmentMethod: string;
    amountCurrency: string;
    source: {
        kind: string;
        label: string;
        provenance: string;
        verified: boolean;
    };
    historyAnchor: string;
    hasNonPositivePrices: boolean;
    logScaleAllowed: boolean;
    bars: DailyBar[];
}
/**
 * Browser-local daily OHLCV data contract. This module performs no network,
 * storage, quote-store or model operations. Imported metadata is user-declared.
 * Dates remain exchange session dates, never local/UTC-converted timestamps.
 */
export declare const CHART_SCHEMA_VERSION = 1;
export declare const MAX_IMPORT_BYTES: number;
export declare const MAX_BARS = 5000;
export declare const MAX_ABSOLUTE_PRICE = 1000000000000;
export declare const MAX_QUANTITY: number;
export declare const DEMO_SYMBOL = "DEMO:SYNTH";
export declare const DEMO_PROVIDER_ID = "demo-synthetic";
export declare class ChartDataError extends Error {
    name: string;
    code: any;
    path: any;
    constructor(code: any, path: any, detail: any);
}
/** Valid calendar dates only; no parsing through a browser locale or timezone. */
export declare function isSessionDate(value: unknown): value is string;
/**
 * Validate a parsed import; reject unsorted/duplicate dates rather than silently
 * choosing a revision. Raw prices must be positive. Adjusted prices may be
 * nonpositive only with declared adjustment provenance. Volume is in shares;
 * null means unknown and zero means an explicitly reported zero.
 */
export declare function validateChartDataset(raw: unknown): ChartDataset;
/** Check UTF-8 size before JSON parsing; callers should also check File.size. */
export declare function parseChartImport(jsonText: any): ChartDataset;
/** A small valid, explicitly synthetic template for the browser-local importer. */
export declare function createImportExample(): string;
/**
 * Deterministic synthetic fixture with its own identity. Weekday spacing is a
 * visual fixture, not an exchange calendar; no quote is inferred from these bars.
 */
export declare function createDemoDataset({ count }?: any): any;
