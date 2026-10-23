export interface CrossPoint {
    sessionDate: string;
    close: number | null;
    fast: number | null;
    slow: number | null;
}
export interface ClosedReplay {
    entryDate: string;
    exitDate: string;
    entryClose: number;
    exitClose: number;
    returnRatio: number;
}
export interface CrossReplay {
    closed: ClosedReplay[];
    open: {
        entryDate: string;
        entryClose: number;
    } | null;
    latest: 'golden' | 'death' | 'above' | 'below' | 'flat' | 'warmup';
}
export declare function crossReplay(points: CrossPoint[]): CrossReplay;
export declare function replaySummary(replay: CrossReplay): {
    samples: number;
    wins: number;
    average: number | null;
    open: boolean;
    latest: "above" | "below" | "death" | "flat" | "golden" | "warmup";
};
