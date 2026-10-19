/** Preview formats shared by the host reader and the viewer. No Node APIs. */
export declare const MAX_PREVIEW_MEDIA_BYTES: number;
export type MediaKind = 'image' | 'audio' | 'video';
export interface MediaFormat {
    kind: MediaKind;
    mime: string;
}
export declare function fileExtension(file: string | null | undefined): string;
export declare function mediaOf(file: string | null | undefined): MediaFormat | null;
export declare function isSvgPath(file: string | null | undefined): boolean;
