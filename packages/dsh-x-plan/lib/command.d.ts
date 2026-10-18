/**
 * Run one argv through the host subprocess seam and capture capped text.
 * @param {(spec: object) => object} spawn
 * @param {{ argv: string[], cwd: string, signal?: AbortSignal, timeoutMs: number, maxChars: number }} options
 */
export declare function runCaptured(spawn: (spec: any) => {
    stdout?: any;
    stderr?: any;
    done: Promise<{
        exitCode?: number | null;
        signal?: string | null;
        error?: unknown;
    }>;
}, { argv, cwd, signal, timeoutMs, maxChars }: {
    argv: string[];
    cwd: string;
    signal?: AbortSignal;
    timeoutMs: number;
    maxChars: number;
}): Promise<{
    exitCode: any;
    signal: any;
    output: string;
    truncated: boolean;
}>;
