export interface EvidenceFile {
    path: string;
    kind: string;
    reason?: string;
    fingerprint?: string;
    mode?: string;
    hash?: string;
    text?: string;
}
export declare const MAX_EVIDENCE_FILES = 128;
export declare const MAX_EVIDENCE_FILE_BYTES: number;
export declare const MAX_SNAPSHOT_BYTES: number;
/** Conservative credential screening, not a general-purpose secret scrubber. */
export declare function containsCredentialLikeText(text: any): boolean;
export declare const containsCredential: typeof containsCredentialLikeText;
export declare function hashText(value: any): string;
export declare function evidencePathReason(file: any): "not an allowlisted source-text file" | "private or excluded path" | "unsafe path" | null;
export declare function issue(code: string, message: string, file?: string): {
    code: string;
    message: string;
    path?: string | undefined;
};
export declare function opaqueFile(file: string, reason: string, stat: any): EvidenceFile;
export declare function excludedFile(file: string, reason: string, kind?: string): EvidenceFile;
/** Never follow a source-file symlink (including parent directories). */
export declare function readEvidenceFile(root: string, file: string): Promise<EvidenceFile>;
export declare function fileIssue(file: any): {
    code: string;
    message: string;
    path?: string | undefined;
} | null;
export declare function sameFile(left: any, right: any): boolean;
