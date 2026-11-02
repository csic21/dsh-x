export declare const FUNDAMENTALS_VALUATION_ENDPOINT = "https://push2.eastmoney.com/api/qt/stock/get";
export declare const FUNDAMENTALS_REPORTS_ENDPOINT = "https://datacenter.eastmoney.com/securities/api/data/v1/get";
export declare const FUNDAMENTALS_SOURCE = "\u4E1C\u65B9\u8D22\u5BCC\u8D22\u62A5\u4E0E\u4F30\u503C (unofficial)";
/** A filing changes quarterly; the multiples move with the price, so the
 * snapshot is cached briefly rather than for a whole reporting cycle. */
export declare const FUNDAMENTALS_TTL_MS: number;
export declare const FUNDAMENTALS_MAX_BYTES: number;
/** About two years of quarterly filings, newest first. */
export declare const FUNDAMENTALS_MAX_PERIODS = 8;
export interface FundamentalPeriod {
    /** Report cutoff, `YYYY-MM-DD`. */
    reportDate: string;
    /** Source label such as `2026三季报`. */
    reportName: string;
    /** Date the filing was published, `YYYY-MM-DD`; null when not disclosed. */
    noticeDate: string | null;
    /** Year-to-date revenue in CNY. */
    revenue: number | null;
    /** Year-to-date revenue growth in percent; 1.82 means +1.82%. */
    revenueYoY: number | null;
    /** Year-to-date net profit attributable to shareholders, in CNY. */
    netProfit: number | null;
    /** Net profit growth in percent; -0.25 means -0.25%. */
    netProfitYoY: number | null;
    /** Basic earnings per share in CNY. */
    eps: number | null;
    /** Book value per share in CNY. */
    bps: number | null;
    /** Return on equity in percent. */
    roe: number | null;
    /** Gross margin in percent; null for a bank or another filer without one. */
    grossMargin: number | null;
    /** Net margin in percent. */
    netMargin: number | null;
    /** Debt-to-asset ratio in percent. */
    debtRatio: number | null;
}
export interface FundamentalsValuation {
    /** Total market capitalisation in CNY. */
    totalMarketCap: number | null;
    /** Free-float market capitalisation in CNY. */
    floatMarketCap: number | null;
    /** Price / previous fiscal year earnings. */
    peStatic: number | null;
    /** Price / trailing twelve months earnings. */
    peTtm: number | null;
    /** The source's dynamic multiple: the latest period annualised. */
    peDynamic: number | null;
    /** Price / book value. */
    pb: number | null;
}
export interface Fundamentals {
    symbol: string;
    name: string;
    /** False for an ETF/LOF, whose periodic disclosure is a holdings book, not a P&L. */
    applicable: boolean;
    source: string;
    fetchedAt: string;
    currency: 'CNY';
    valuation: FundamentalsValuation;
    /** Newest first, at most FUNDAMENTALS_MAX_PERIODS. */
    periods: FundamentalPeriod[];
    /** `periods[0]`, repeated so the client does not have to infer it. */
    latest: FundamentalPeriod | null;
    /** True when one of the two upstream calls failed and the other was shown. */
    partial: boolean;
}
export declare function eastmoneySecIdFor(symbol: string): string;
export declare function fundamentalsValuationUrl(symbol: string): string;
/** Requested explicitly so an upstream schema change cannot silently add a column. */
export declare const FUNDAMENTALS_REPORT_COLUMNS: string;
export declare function fundamentalsReportsUrl(symbol: string): string;
export declare function emptyValuation(): FundamentalsValuation;
export declare function emptyFundamentals(symbol: string, now: number, applicable?: boolean): Fundamentals;
/**
 * The valuation snapshot. A source that does not answer for this code, or
 * answers for another one, is a failure rather than an all-null "success".
 */
export declare function parseValuation(payload: any, symbol: string): {
    name: string;
    valuation: FundamentalsValuation;
};
/**
 * The report periods. Rows for another security are dropped, duplicate dates
 * are collapsed, and the result is newest first. An upstream answer with no
 * reports at all is an empty series, not an error: a new listing can be
 * quoted before its first filing reaches this endpoint.
 */
export declare function parseReportPeriods(payload: any, symbol: string, now: number): {
    name: string;
    periods: FundamentalPeriod[];
};
export declare function composeFundamentals(input: {
    symbol: string;
    name: string;
    valuation: FundamentalsValuation;
    periods: FundamentalPeriod[];
    now: number;
    partial: boolean;
}): Fundamentals;
/**
 * Re-validates a snapshot at the same trust boundary as the other projectors,
 * so a replacement adapter cannot ship a NaN, a wrong symbol or a period list
 * that contradicts its own `latest`. Extra fields are dropped.
 */
export declare function projectFundamentals(raw: unknown, symbol: string, now: number): Fundamentals;
