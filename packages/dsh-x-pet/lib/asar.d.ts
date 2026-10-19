/** One file inside an Electron asar archive. Offsets are relative to the file payload. */
export interface AsarFile {
    path: string;
    offset: number;
    size: number;
}
/** List files whose path matches. The archive is indexed once per mtime. */
export declare function listAsar(file: string, pattern: RegExp): Promise<AsarFile[]>;
/** Read one listed file. `entry` must come from {@link listAsar} for the same archive. */
export declare function readAsar(file: string, entry: AsarFile): Promise<Uint8Array>;
