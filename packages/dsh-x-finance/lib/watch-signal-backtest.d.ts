export declare const WATCH_REPLAY_COMMISSION_BPS = 5;
export declare const WATCH_REPLAY_SLIPPAGE_BPS = 5;
export declare const WATCH_REPLAY_SELL_TAX_BPS = 5;
export declare const WATCH_REPLAY_MIN_BARS = 121;
export interface WatchReplayTrade {
    entryDate: string;
    exitDate: string;
    entryOpen: number;
    exitOpen: number;
    netReturn: number;
}
export interface WatchReplay {
    status: 'ready' | 'insufficient' | 'invalid';
    from: string | null;
    to: string | null;
    bars: number;
    tradeCount: number;
    trades: WatchReplayTrade[];
    open: boolean;
    totalReturn: number | null;
    buyHoldReturn: number | null;
    maxDrawdown: number | null;
}
/** Input must be one chronologically ordered, consistently adjusted daily series. */
export declare function replayWatchSignals(input: unknown): WatchReplay;
