import { assetUrl } from './releases.js';
import { isVersion } from './semver.js';
const SHA256 = /^[0-9a-f]{64}$/;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]+={0,2}$/;
export function safeFileName(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 240
        && value === value.split(/[\\/]/).pop() && !value.includes('..') && !/[\u0000-\u001f]/.test(value);
}
async function fetchText(url, fetchImpl, signal, limit) {
    const timeout = AbortSignal.timeout(30_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await fetchImpl(url, { signal: combined, redirect: 'follow', headers: { accept: 'application/json, text/plain' } });
    if (response.status === 404)
        return null;
    if (!response.ok)
        throw new Error(`Release asset ${url} returned HTTP ${response.status}`);
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > limit)
        throw new Error(`Release asset ${url} is too large`);
    const text = await response.text();
    if (text.length > limit)
        throw new Error(`Release asset ${url} is too large`);
    return text;
}
function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
/** Load the build manifest published with a plugin release. Nothing is downloaded or executed. */
export async function loadPluginRelease(options) {
    const { repository, tag, version, fetchImpl, signal } = options;
    const text = await fetchText(assetUrl(repository, tag, 'build-manifest.json'), fetchImpl, signal, 1_000_000);
    if (text === null)
        return null;
    let raw;
    try {
        raw = object(JSON.parse(text));
    }
    catch {
        return null;
    }
    if (!raw || raw.tag !== tag)
        return null;
    if (typeof raw.runtime !== 'string' || !isVersion(raw.runtime))
        return null;
    if (!Array.isArray(raw.artifacts))
        return null;
    const artifacts = [];
    for (const item of raw.artifacts) {
        const entry = object(item);
        if (!entry)
            continue;
        const { name, file, sha256, integrity } = entry;
        if (typeof name !== 'string' || !/^dsh-x-[a-z0-9-]+$/.test(name))
            continue;
        if (!safeFileName(file) || !/^dsh-x-[a-z0-9-]+-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.tgz$/.test(file))
            continue;
        if (typeof sha256 !== 'string' || !SHA256.test(sha256))
            continue;
        if (integrity !== undefined && (typeof integrity !== 'string' || !INTEGRITY.test(integrity)))
            continue;
        if (typeof entry.version !== 'string' || !isVersion(entry.version))
            continue;
        artifacts.push({
            name,
            version: entry.version,
            file,
            sha256,
            integrity: typeof integrity === 'string' ? integrity : '',
            url: assetUrl(repository, tag, file),
        });
    }
    if (artifacts.length === 0)
        return null;
    return { tag, version, runtime: raw.runtime, artifacts };
}
