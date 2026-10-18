import { spawn } from 'node:child_process';
import type { PendingAppUpdate } from './types.ts';
type SpawnLike = typeof spawn;
export declare function buildMacHelper(options: {
    pending: PendingAppUpdate;
    hostPid: number;
    logPath: string;
}): string;
export declare function buildWindowsHelper(options: {
    pending: PendingAppUpdate;
    hostPid: number;
    logPath: string;
}): string;
export declare function appUpdateSupported(platform: NodeJS.Platform): boolean;
export declare function spawnAppUpdate(options: {
    pending: PendingAppUpdate;
    home: string;
    hostPid: number;
    platform?: NodeJS.Platform;
    spawnImpl?: SpawnLike;
}): Promise<{
    helper: string;
    log: string;
}>;
export {};
