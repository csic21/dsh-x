import { type FetchLike } from './releases.ts';
import type { UpdateConfig, UpdateStatus } from './types.ts';
export interface UpdateServiceOptions {
    env?: NodeJS.ProcessEnv;
    profileContext?: {
        name?: string;
        dir?: string;
        home?: string;
    };
    runtimeVersion?: string | null;
    fetchImpl?: FetchLike;
    config?: UpdateConfig;
    now?: () => number;
}
export interface UpdateService {
    snapshot(): UpdateStatus;
    check(): Promise<UpdateStatus>;
    start(): () => void;
    stop(): void;
}
/**
 * Check-only updater. Installation stays with the official Plugins page or
 * `dsh plugin`, so this service never downloads a package, edits a profile, or
 * writes an update directory.
 */
export declare function createUpdateService(options?: UpdateServiceOptions): UpdateService;
