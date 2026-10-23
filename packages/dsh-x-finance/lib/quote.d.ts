export interface StockQuote {
    symbol: string;
    provider: string;
    price: number;
    fetchedAt: string;
    quotedAt: string | null;
    notice: string;
    open: number | null;
    high: number | null;
    low: number | null;
    previousClose: number | null;
    change: number | null;
    changePercent: number | null;
}
export interface QuoteOptions {
    apiKey?: string;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
    now?: () => number;
}
export declare const TIMEOUT_MS = 10000;
export declare const MAX_RESPONSE_BYTES = 16384;
export declare function normalizeSymbol(input: unknown): string;
export declare function parseQuote(data: any, symbol: string, fetchedAt: number): StockQuote;
export declare function fetchQuote(input: any, { apiKey, fetchImpl, signal, timeoutMs, now, }?: any): Promise<any>;
