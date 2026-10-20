import type { BrowserErrorCode } from '../../contract/errors.ts';
/** Supported CLI series; 0.x minor bumps may break the wire contract. */
export declare const SUPPORTED_MAJOR = 0;
export declare const SUPPORTED_MINOR = 39;
export interface AgentBrowserVersion {
    major: number;
    minor: number;
    patch: number;
}
export declare function parseVersion(output: string): AgentBrowserVersion | null;
export declare function assertVersion(output: string): AgentBrowserVersion;
export interface AgentBrowserEnvelope<T> {
    success: boolean;
    data: T | null;
    error: string | null;
    code?: string;
}
/** One JSON line is the contract; tolerate trailing log lines by reading the last parseable object. */
export declare function parseEnvelope<T = unknown>(stdout: string): AgentBrowserEnvelope<T>;
/** Command failures carry no stable code, so map the message onto our own taxonomy. */
export declare function classifyError(message: string): BrowserErrorCode;
export interface OpenResult {
    targetId: string;
    url: string;
    title: string;
}
export declare function openResult(data: unknown): OpenResult;
export interface TabNewResult {
    tabId: string;
    targetId: string;
    url: string;
}
export declare function tabNewResult(data: unknown): TabNewResult;
export interface SnapshotRef {
    name?: string;
    role?: string;
}
export interface SnapshotResult {
    origin: string;
    refs: Record<string, SnapshotRef>;
    snapshot: string;
}
export declare function snapshotResult(data: unknown): SnapshotResult;
export interface TabSummaryData {
    tabId: string;
    targetId: string;
    url: string;
    title: string;
    active: boolean;
}
export declare function tabsResult(data: unknown): TabSummaryData[];
