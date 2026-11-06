import type { FactorState } from './factor-state.ts';
/** Null on every failure: the frozen model is always a valid fallback. */
export declare function readFactorState(directory: string): Promise<FactorState | null>;
export declare function writeFactorState(directory: string, state: FactorState): Promise<void>;
