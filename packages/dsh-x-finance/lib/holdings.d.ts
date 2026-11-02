export declare const ETF_HOLDINGS_ENDPOINT = "https://fundf10.eastmoney.com/FundArchivesDatas.aspx";
export declare const ETF_HOLDINGS_SOURCE = "\u5929\u5929\u57FA\u91D1\u6301\u4ED3 (unofficial)";
/** Rows asked from the disclosure page. A full CSI 300 book is about 300 names. */
export declare const ETF_HOLDINGS_TOPLINE = 400;
/** Hard cap on names kept from one report. */
export declare const ETF_HOLDINGS_MAX_ROWS = 400;
export declare const ETF_HOLDINGS_MAX_BYTES: number;
/** Quarterly reports stay near the statutory top 10; a real book is much larger. */
export declare const ETF_HOLDINGS_COMPLETE_MIN = 30;
export declare const ETF_HOLDINGS_TTL_MS: number;
export interface EtfHolding {
    /** Code as published. A-share codes are six digits; a QDII row may be a ticker. */
    code: string;
    name: string;
    /** Upstream market id when the row linked one (0 Shenzhen, 1 Shanghai, 105 US). */
    market: string | null;
    /** Percent of net asset value. 3.56 means 3.56%, not a fraction. */
    weight: number;
    /** Shares, in 万股. Null when the report left the cell blank. */
    shares: number | null;
    /** Market value, in 万元. Null when the report left the cell blank. */
    marketValue: number | null;
}
export interface EtfHoldingPeriod {
    /** Source label, e.g. `2026年3季度`. */
    label: string;
    /** Report cutoff, `YYYY-MM-DD`. */
    reportDate: string;
    /** True when this period published a book, not only the statutory top 10. */
    complete: boolean;
    /** True when the parser stopped at ETF_HOLDINGS_MAX_ROWS. */
    truncated: boolean;
    holdings: EtfHolding[];
}
export interface EtfHoldings {
    symbol: string;
    /**
     * False for a code that is not an exchange-traded fund or LOF, so the detail
     * page does not invent a holdings section for an ordinary stock.
     */
    applicable: boolean;
    source: string;
    fetchedAt: string;
    /** Newest disclosed period. Often the quarterly top 10. */
    latest: EtfHoldingPeriod | null;
    /** Newest period that published a full book. Null when only a top 10 exists. */
    full: EtfHoldingPeriod | null;
}
/**
 * Exchange-traded funds and LOFs, by the code ranges the watchlist can already
 * hold. Ordinary A-shares, REITs and Beijing listings are not included: a
 * quarterly stock report is not an ETF book.
 */
export declare function isExchangeFund(symbol: string): boolean;
export declare function etfHoldingsUrl(code: string): string;
export declare function emptyEtfHoldings(symbol: string, now: number, applicable?: boolean): EtfHoldings;
/**
 * Parses the `var apidata={ content:"...", arryear:[...], curyear:YYYY }`
 * disclosure script. Periods stay in source order (newest first). A stock, a
 * gold ETF or any code with no stock table comes back with no periods rather
 * than a fabricated book. Exported for offline tests.
 */
export declare function parseEtfHoldingsScript(payload: unknown, symbol: string, now: number): EtfHoldings;
/** Rebuilds the browser payload. Extra fields and a lied `complete` flag do not pass. */
export declare function projectEtfHoldings(raw: unknown, symbol: string, now: number): EtfHoldings;
