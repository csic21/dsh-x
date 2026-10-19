/** Preview formats shared by the host reader and the viewer. No Node APIs. */
export const MAX_PREVIEW_MEDIA_BYTES = 8 * 1024 * 1024;
/** Extensions VS Code's built-in media preview opens, except SVG which stays source text. */
const MEDIA = {
    png: { kind: 'image', mime: 'image/png' },
    jpg: { kind: 'image', mime: 'image/jpeg' },
    jpeg: { kind: 'image', mime: 'image/jpeg' },
    jpe: { kind: 'image', mime: 'image/jpeg' },
    gif: { kind: 'image', mime: 'image/gif' },
    webp: { kind: 'image', mime: 'image/webp' },
    bmp: { kind: 'image', mime: 'image/bmp' },
    ico: { kind: 'image', mime: 'image/x-icon' },
    avif: { kind: 'image', mime: 'image/avif' },
    mp3: { kind: 'audio', mime: 'audio/mpeg' },
    wav: { kind: 'audio', mime: 'audio/wav' },
    ogg: { kind: 'audio', mime: 'audio/ogg' },
    oga: { kind: 'audio', mime: 'audio/ogg' },
    mp4: { kind: 'video', mime: 'video/mp4' },
    webm: { kind: 'video', mime: 'video/webm' },
    ogv: { kind: 'video', mime: 'video/ogg' },
};
export function fileExtension(file) {
    const name = file?.split(/[\\/]/).pop() ?? '';
    const dot = name.lastIndexOf('.');
    if (dot <= 0)
        return '';
    return name.slice(dot + 1).toLowerCase();
}
export function mediaOf(file) {
    return MEDIA[fileExtension(file)] ?? null;
}
export function isSvgPath(file) {
    return fileExtension(file) === 'svg';
}
