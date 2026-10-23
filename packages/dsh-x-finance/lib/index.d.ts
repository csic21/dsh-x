import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-x-finance";
export declare const inject: string[];
export interface FinanceConfig {
    /**
     * Deprecated alias for `marketSource`. There is one free quote source for the
     * market board, the watchlist detail, the bottom bar and the gold panel; this
     * flag used to enable a separate watchlist-only adapter. Off by default;
     * `DSH_X_FINANCE_FREE_SOURCE=1` forces it on for headless compositions.
     */
    freeSource?: boolean;
    /**
     * Opt in to the unofficial public adapters (Tencent for A shares, Sina for
     * gold) used by the read-only market board, the stock page, the fixed bottom
     * bar and the gold panel. Off by default;
     * `DSH_X_FINANCE_MARKET_SOURCE=1` forces it on for headless compositions.
     * The pre-rename `DSH_X_STOCK_*` variables keep working as deprecated aliases.
     * Intended for local, single-user use only.
     */
    marketSource?: boolean;
}
export declare function apply(ctx: Context, config?: FinanceConfig): void;
