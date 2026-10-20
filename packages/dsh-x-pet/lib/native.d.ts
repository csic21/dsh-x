export interface ShellPlan {
    /** Whether the source is newer than the binary, or the binary is missing. */
    compile: boolean;
    binary: string;
    args: string[];
}
/** Where the compiled shell lives: the profile's own plugin directory. */
export declare function shellBinary(profileDir: string): string;
/** Whether the binary has to be rebuilt from the shipped source. */
export declare function needsCompile(source: string, binary: string): boolean;
/**
 * The exact argv the shell runs with. The bootstrap URL carries the launch
 * token, which mints the browser cookie; the page is loaded after it lands.
 */
export declare function shellArguments(frameURL: string, bootstrapURL: string): string[];
/** The frame document under the Host's own origin. */
export declare function frameURL(baseURL: string): string;
export interface ShellOptions {
    profileDir: string;
    source: string;
    frameURL: string;
    bootstrapURL: string;
}
export interface ShellHandle {
    /** Start the shell, compiling it on first use. Returns false when it cannot run. */
    open(options: ShellOptions): Promise<boolean>;
    close(): void;
    running(): boolean;
}
/** Build once, then keep the process for as long as the user wants the pet out. */
export declare function createShell(): ShellHandle;
