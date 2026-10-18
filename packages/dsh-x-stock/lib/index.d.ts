import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-x-stock";
export declare const inject: string[];
export interface StockConfig {
    /**
     * Opt in to the unofficial qt.gtimg.cn adapter for the A-share watchlist.
     * Off by default; `DSH_X_STOCK_FREE_SOURCE=1` forces it on for headless
     * compositions. Intended for local, single-user use only.
     */
    freeSource?: boolean;
    /**
     * Opt in to the unofficial Tencent adapter for the read-only market board.
     * Off by default; `DSH_X_STOCK_MARKET_SOURCE=1` forces it on for headless
     * compositions. Intended for local, single-user use only.
     */
    marketSource?: boolean;
}
export declare function apply(ctx: Context, config?: StockConfig): void;
