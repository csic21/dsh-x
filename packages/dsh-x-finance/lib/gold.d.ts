export declare const GOLD_ENDPOINT = "dsh-x-finance.gold";
export declare const GOLD_SOURCE_NAME = "\u65B0\u6D6A\u8D22\u7ECF (unofficial)";
export declare const GOLD_QUOTE_ENDPOINT = "https://hq.sinajs.cn/list=";
export declare const GOLD_HISTORY_PATH = "https://stock2.finance.sina.com.cn/futures/api/jsonp.php/";
export declare const GOLD_TIMEOUT_MS = 10000;
/** The daily feed returns the full history; only the tail is kept. */
export declare const GOLD_MAX_BYTES: number;
export declare const GOLD_HISTORY_BARS = 260;
export declare const GOLD_SNAPSHOT_TTL_MS = 15000;
export declare const GOLD_HISTORY_TTL_MS: number;
/** One troy ounce in grams; used only to restate a USD/oz price in CNY/g. */
export declare const TROY_OUNCE_GRAMS = 31.1034768;
export type GoldInstrumentKey = 'XAU' | 'GC' | 'SI' | 'AU9999' | 'AUTD' | 'USDCNH';
export type GoldUnit = 'usd-ounce' | 'cny-gram' | 'cny-usd';
export type GoldRangeLabel = '5d' | '20d' | '60d' | 'ytd';
export interface GoldInstrument {
    key: GoldInstrumentKey;
    /** Provider label, sanitized; the UI falls back to its own name. */
    name: string;
    unit: GoldUnit;
    price: number;
    change: number | null;
    changePercent: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    previousClose: number | null;
    /** (high - low) / previousClose, in percent. */
    amplitudePercent: number | null;
    quotedAt: string | null;
}
export interface GoldRange {
    label: GoldRangeLabel;
    changePercent: number | null;
}
export interface GoldSeries {
    key: 'XAU' | 'GC';
    /** Latest daily close the ranges were computed from. */
    lastClose: number | null;
    lastDate: string | null;
    ranges: GoldRange[];
    high52w: number | null;
    low52w: number | null;
    /** (lastClose - high52w) / high52w, in percent. */
    drawdownPercent: number | null;
}
export interface GoldDerived {
    /** XAU restated in CNY per gram, using the quoted offshore rate. */
    londonCnyPerGram: number | null;
    /** AU9999 minus that restatement, in CNY per gram. */
    shanghaiPremium: number | null;
    shanghaiPremiumPercent: number | null;
    /** XAU / SI; a ratio, not a signal. */
    goldSilverRatio: number | null;
}
export interface GoldSnapshot {
    source: string;
    fetchedAt: string;
    instruments: GoldInstrument[];
    derived: GoldDerived;
    series: GoldSeries[];
    /** True when at least one daily series failed; the panel says so. */
    seriesIncomplete: boolean;
}
export type GoldResult = {
    status: 'unconfigured';
} | {
    status: 'ready';
    snapshot: GoldSnapshot;
};
export interface GoldDailyBar {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
}
/** The single batched request the panel issues. */
export declare const GOLD_QUOTE_KEYS: string[];
/** `yyyy-MM-dd` + `HH:mm:ss` in Beijing time; missing or future stamps fail. */
export declare function goldStamp(date: unknown, time: unknown, now: number): string | null;
/**
 * Parses one `hq_str_*="..."` payload. Futures and SGE symbols share the
 * `price,?,?,?,high,low,time,previousClose,open,...` layout; the offshore FX
 * line carries its own clock and change fields and only its price is used.
 */
export declare function parseGoldQuote(key: string, fields: string[], now: number): GoldInstrument;
/** Splits `var hq_str_hf_XAU="a,b,c";` lines into validated instruments. */
export declare function parseGoldQuotes(text: string, now: number): GoldInstrument[];
/** Parses the JSONP body of the daily series (`var _GC=([...]);`). */
export declare function parseGoldHistory(body: string): GoldDailyBar[];
export declare function computeGoldSeries(key: 'XAU' | 'GC', bars: GoldDailyBar[]): GoldSeries;
/** CNY-per-gram restatement, the Shanghai premium and the gold/silver ratio. */
export declare function deriveGold(instruments: GoldInstrument[]): GoldDerived;
/**
 * Trust boundary: re-validates the provider's snapshot before it leaves the
 * Host. A value that fails here is reported as unavailable, never repaired.
 */
export declare function validateGoldSnapshot(raw: GoldSnapshot, now: number): GoldSnapshot;
