import type { LocalState } from './types.ts';
/**
 * The running DSH version for this build. The plugin declares an exact
 * `engines.dsh`, and the official loader only mounts it on that same runtime,
 * so the manifest is the one value available in both npm and Desktop profiles.
 */
export declare function readOwnRuntimeVersion(): Promise<string | null>;
export interface ReadLocalStateOptions {
    env?: NodeJS.ProcessEnv;
    profileContext?: {
        name?: string;
        dir?: string;
        home?: string;
    };
    runtimeVersion?: string | null;
}
/** Read the running profile and installed plugin versions without writing anything. */
export declare function readLocalState(options?: ReadLocalStateOptions): Promise<LocalState>;
