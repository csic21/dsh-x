import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-x-stock";
export declare const inject: string[];
export interface StockConfig {
    /**
     * Deprecated alias for `marketSource`. There is one A-share quote source for
     * the market board, the stock page and the bottom bar; this flag used to
     * enable a separate watchlist-only adapter. Off by default;
     * `DSH_X_STOCK_FREE_SOURCE=1` forces it on for headless compositions.
     */
    freeSource?: boolean;
    /**
     * Opt in to the unofficial Tencent adapter for the read-only market board,
     * the stock page and the fixed bottom bar. Off by default;
     * `DSH_X_STOCK_MARKET_SOURCE=1` forces it on for headless compositions.
     * Intended for local, single-user use only.
     */
    marketSource?: boolean;
}
export declare function apply(ctx: Context, config?: StockConfig): void;
