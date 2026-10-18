export declare const MAX_EVIDENCE_FILES = 20;
export declare const MAX_EVIDENCE_FILE_BYTES: number;
export declare const MAX_SNAPSHOT_BYTES: number;
/** Volatile identity fields of one path, as reported by `lstat` in either number or bigint mode. */
export interface FileStamp {
    dev: number | bigint;
    ino: number | bigint;
    size: number | bigint;
    mode: number | bigint;
    mtimeMs: number | bigint;
    ctimeMs: number | bigint;
}
/**
 * One decoded path decision. The reader returns heterogeneous records its
 * callers discriminate by `kind`; only `text` carries source content, and a
 * `missing` record may still be given empty text by a comparing caller.
 */
export interface EvidenceFile {
    path: string;
    kind: 'text' | 'missing' | 'opaque' | 'excluded' | 'unavailable';
    reason?: string;
    fingerprint?: string;
    mode?: '100644' | '100755';
    hash?: string;
    text?: string;
}
/** One structured reason why a selected path is incomplete. */
export interface EvidenceIssue {
    code: string;
    message: string;
    path?: string;
}
/** Conservative credential screening, not a general-purpose secret scrubber. */
export declare function containsCredentialLikeText(text: unknown): boolean;
export declare const containsCredential: typeof containsCredentialLikeText;
export declare function hashText(value: string): string;
export declare function evidencePathReason(file: unknown): string | null;
export declare function issue(code: string, message: string, file?: string): EvidenceIssue;
export declare function opaqueFile(file: string, reason: string, stat: FileStamp): EvidenceFile;
export declare function excludedFile(file: string, reason: string, kind?: 'excluded' | 'unavailable'): EvidenceFile;
/** Never follow a source-file symlink (including parent directories). */
export declare function readEvidenceFile(root: string, file: string): Promise<EvidenceFile>;
export declare function fileIssue(file: EvidenceFile): EvidenceIssue | null;
export declare function sameFile(left: EvidenceFile, right: EvidenceFile): boolean;
