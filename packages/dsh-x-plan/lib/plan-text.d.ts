/**
 * Pull acceptance commands from the last `dsh-x-acceptance` fence.
 * Empty or missing fences mean there is nothing to run.
 * @param {string} text
 * @returns {{ commands: string[] } | { error: string }}
 */
export declare function parseAcceptance(text: string): {
    code: string;
    error: string;
    commands?: undefined;
} | {
    code?: undefined;
    error?: undefined;
    commands: string[];
};
/**
 * Pull `pass` or `fail` from the last verdict fence.
 * A missing or unknown verdict is inconclusive, and the gap text says so.
 * @param {string} text
 * @returns {{ verdict: 'pass' | 'fail', gaps: string }}
 */
export declare function parseVerdict(text: string): {
    verdict: string;
    gaps: string;
    body: string;
    missingVerdict: boolean;
};
