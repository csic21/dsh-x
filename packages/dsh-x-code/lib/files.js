// Shared safety rules follow the repository Plan evidence reader; this package has no Plan runtime dependency.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
// Evidence is deliberately a small, text-only source snapshot, not a recursive
// filesystem reader. Every excluded changed path makes the review incomplete.
export const MAX_EVIDENCE_FILES = 20;
export const MAX_EVIDENCE_FILE_BYTES = 64 * 1024;
export const MAX_SNAPSHOT_BYTES = 256 * 1024;
const EXTENSIONS = new Set([
    '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.md', '.mdx', '.txt',
    '.yml', '.yaml', '.toml', '.xml', '.html', '.css', '.scss', '.less', '.sql',
    '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.h', '.cpp',
    '.hpp', '.cs', '.sh', '.bash', '.ps1', '.bat', '.cmd', '.ini', '.conf',
    '.graphql', '.gql', '.vue', '.svelte', '.lock', '.csv', '.tsv', '.proto',
]);
const FILENAMES = new Set(['Dockerfile', 'Makefile', 'LICENSE', 'NOTICE', '.gitignore', '.gitattributes', '.editorconfig']);
const PRIVATE_NAME = /^(?:.*[._-])?(?:credentials?|secrets?|passwords?|tokens?)(?:\.(?:json|ya?ml|toml|txt|ini|conf|xml))?$|^id_(?:rsa|ed25519)(?:\.pub)?$/i;
const PRIVATE_FILES = new Set(['.npmrc', '.netrc', '.pypirc', '.git-credentials', 'credentials.json', 'credentials.yaml']);
const PRIVATE_DIRECTORIES = new Set(['.git', '.ssh', '.aws', '.azure', '.gnupg', '.dsh', '.dsh-x', '.dsh-x-code', '.dsh-x-agents', 'node_modules', 'vendor']);
/** Conservative credential screening, not a general-purpose secret scrubber. */
export function containsCredentialLikeText(text) {
    if (typeof text !== 'string')
        return false;
    return /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(text)
        || /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(text)
        || /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xai-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{12,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,})\b/.test(text)
        || /(?:["']?)(?:_?auth(?:entication)?[_-]?token|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password|passwd|private[_-]?key)["']?\s*[:=]\s*["']?[A-Za-z0-9_+/.=-]{12,}/i.test(text)
        || /(?:authorization["']?\s*[:=]\s*["']?|\b)Bearer\s+[A-Za-z0-9_.-]{20,}/i.test(text);
}
export const containsCredential = containsCredentialLikeText;
export function hashText(value) {
    return createHash('sha256').update(value).digest('hex');
}
export function evidencePathReason(file) {
    if (typeof file !== 'string' || file === '' || file.length > 4096 || /[\\\x00-\x1f\x7f\ufffd]/.test(file) || path.posix.isAbsolute(file))
        return 'unsafe path';
    const parts = file.split('/');
    if (parts.some(part => part === '' || part === '.' || part === '..'))
        return 'unsafe path';
    if (parts.some(part => PRIVATE_DIRECTORIES.has(part.toLowerCase()) || PRIVATE_FILES.has(part.toLowerCase()) || PRIVATE_NAME.test(part) || /^\.env(?:[.-]|$)/i.test(part)))
        return 'private or excluded path';
    const name = parts.at(-1) ?? '';
    if (!EXTENSIONS.has(path.posix.extname(name).toLowerCase()) && !FILENAMES.has(name))
        return 'not an allowlisted source-text file';
    return null;
}
export function issue(code, message, file) {
    return { code, message, ...(file === undefined ? {} : { path: file }) };
}
export function opaqueFile(file, reason, stat) {
    return { path: file, kind: 'opaque', reason, fingerprint: ['dev', 'ino', 'size', 'mode', 'mtimeMs', 'ctimeMs'].map(key => String(stat[key])).join(':') };
}
export function excludedFile(file, reason, kind = 'excluded') {
    return { path: file, kind, reason };
}
/** Drop a trailing partial UTF-8 sequence. Returns null when the bytes are not valid text. */
function decodePreview(contents) {
    let end = contents.length;
    for (let trim = 0; trim < 4 && end > 0; trim += 1) {
        try {
            return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(contents.subarray(0, end));
        }
        catch {
            end -= 1;
        }
    }
    return null;
}
/**
 * Never follow a source-file symlink (including parent directories).
 * Review reads stop at the evidence cap. A preview read may return a prefix.
 */
export async function readEvidenceFile(root, file, options) {
    const reason = evidencePathReason(file);
    if (reason === 'unsafe path')
        return excludedFile(file, reason);
    let handle;
    try {
        let cursor = root;
        const parts = file.split('/');
        for (let index = 0; index < parts.length; index += 1) {
            cursor = path.join(cursor, parts[index]);
            const entry = await lstat(cursor);
            if (entry.isSymbolicLink())
                return excludedFile(file, 'symbolic link');
            if (index < parts.length - 1 && !entry.isDirectory())
                return excludedFile(file, 'non-directory ancestor');
            if (index === parts.length - 1 && !entry.isFile())
                return excludedFile(file, 'not a regular file');
        }
        const metadata = await lstat(cursor);
        if (reason !== null)
            return opaqueFile(file, reason, metadata);
        const resolved = await realpath(cursor);
        if (resolved !== path.join(root, ...parts))
            return excludedFile(file, 'path resolved outside the captured location');
        handle = await open(cursor, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const before = await handle.stat();
        if (!before.isFile())
            return excludedFile(file, 'not a regular file');
        if (before.dev !== metadata.dev || before.ino !== metadata.ino)
            return excludedFile(file, 'file identity changed before reading', 'unavailable');
        const limit = options?.maxBytes ?? MAX_EVIDENCE_FILE_BYTES;
        const truncate = options?.truncate === true && before.size > limit;
        if (before.size > limit && !options?.truncate)
            return opaqueFile(file, 'file exceeds evidence size limit', before);
        const bytes = Buffer.alloc(truncate ? limit : Math.min(limit + 1, before.size + 1));
        let offset = 0;
        while (offset < bytes.length) {
            const result = await handle.read(bytes, offset, bytes.length - offset, offset);
            if (result.bytesRead === 0)
                break;
            offset += result.bytesRead;
        }
        const after = await handle.stat();
        if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || (!truncate && before.size !== offset) || (truncate && offset < limit)) {
            return excludedFile(file, 'file changed while collecting evidence', 'unavailable');
        }
        const contents = bytes.subarray(0, offset);
        const text = truncate ? decodePreview(contents) : (() => { try {
            return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(contents);
        }
        catch {
            return null;
        } })();
        if (text == null)
            return opaqueFile(file, 'not UTF-8 source text', before);
        if (/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/.test(text))
            return opaqueFile(file, 'binary or unsupported source text', before);
        if (containsCredential(text))
            return opaqueFile(file, 'possible credential content excluded', before);
        return { path: file, kind: 'text', mode: (before.mode & 0o111) === 0 ? '100644' : '100755', hash: hashText(text), text, ...(truncate ? { truncated: true } : {}) };
    }
    catch (error) {
        const code = error.code;
        if (code === 'ENOENT')
            return { path: file, kind: 'missing' };
        return excludedFile(file, `file unavailable (${code ?? 'read failed'})`, 'unavailable');
    }
    finally {
        await handle?.close();
    }
}
export function fileIssue(file) {
    if (file.kind === 'text' || file.kind === 'missing')
        return null;
    return issue('FILE_INCOMPLETE', `${JSON.stringify(file.path)}: ${file.reason ?? file.kind}`, file.path);
}
export function sameFile(left, right) {
    return left.kind === right.kind && (left.kind === 'missing' || (left.kind === 'opaque' && left.fingerprint === right.fingerprint) || (left.kind === 'text' && left.hash === right.hash && left.mode === right.mode));
}
