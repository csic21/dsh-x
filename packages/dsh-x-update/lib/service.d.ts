import { spawn } from 'node:child_process';
import { type FetchLike } from './releases.ts';
import type { UpdateConfig, UpdateStatus } from './types.ts';
export interface UpdateServiceOptions {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    arch?: string;
    execPath?: string;
    fetchImpl?: FetchLike;
    config?: UpdateConfig;
    spawnImpl?: typeof spawn;
    now?: () => number;
}
export interface UpdateService {
    snapshot(): UpdateStatus;
    check(): Promise<UpdateStatus>;
    stage(): Promise<UpdateStatus>;
    start(): () => void;
    stop(): void;
}
export declare function createUpdateService(options?: UpdateServiceOptions): UpdateService;
