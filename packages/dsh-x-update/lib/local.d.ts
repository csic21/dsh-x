import type { LocalPlugin, LocalState, UpdateTarget } from './types.ts';
export interface DistributionInfo {
    path: string;
    appVersion: string;
    kernelVersion: string;
    target: UpdateTarget;
    installRoot: string;
    appPath: string;
    plugins: LocalPlugin[];
}
/** Read the outer DSH-X distribution manifest when this process runs from it. */
export declare function readDistribution(execPath: string, env: NodeJS.ProcessEnv): Promise<DistributionInfo | null>;
export interface ReadLocalStateOptions {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    arch?: string;
    execPath?: string;
}
/** Read the running app, kernel and installed plugin versions without writing anything. */
export declare function readLocalState(options?: ReadLocalStateOptions): Promise<LocalState>;
export declare function updatesDir(home: string): string;
export declare function pendingPluginPath(home: string): string;
export declare function pendingAppPath(home: string): string;
export declare function statusPath(home: string): string;
