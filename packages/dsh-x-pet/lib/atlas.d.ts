/** A decoded atlas header: what the file claims about its own geometry. */
export interface AtlasInfo {
    mime: 'image/png' | 'image/webp';
    width: number;
    height: number;
    rows: 9 | 11;
}
/**
 * Read an atlas header and apply the Codex geometry rules. A file that decodes
 * to something else is not a pet sheet and is refused by name, never silently
 * stretched.
 */
export declare function inspectAtlas(bytes: Uint8Array): AtlasInfo;
