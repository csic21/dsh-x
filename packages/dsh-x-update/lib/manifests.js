import { assetUrl } from './releases.js';
import { isVersion } from './semver.js';
const SHA256 = /^[0-9a-f]{64}$/;
const KERNEL_SHA = /^[0-9a-f]{40}$/;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]+={0,2}$/;
export function targetForPlatform(platform, arch) {
    if (platform === 'darwin')
        return arch === 'arm64' ? 'macos-arm64' : arch === 'x64' ? 'macos-x64' : null;
    if (platform === 'win32')
        return arch === 'x64' ? 'windows-x64' : null;
    return null;
}
export function installerSuffix(target) {
    if (target === 'macos-arm64')
        return '-mac-arm64-preview.dmg';
    if (target === 'macos-x64')
        return '-mac-x64-preview.dmg';
    return '-win-x64-preview.exe';
}
export function parseSha256Sums(text) {
    const sums = new Map();
    for (const line of text.split(/\r?\n/)) {
        const match = /^([0-9a-f]{64})\s+\*?(\S.*)$/.exec(line.trim());
        if (!match)
            continue;
        const file = match[2].trim();
        if (!safeFileName(file))
            continue;
        sums.set(file, match[1]);
    }
    return sums;
}
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
/** Load one target's distribution manifest and its installer checksum. */
export async function loadDesktopRelease(options) {
    const { repository, tag, version, target, fetchImpl, signal } = options;
    const manifestText = await fetchText(assetUrl(repository, tag, `distribution-${target}.json`), fetchImpl, signal, 256_000);
    if (manifestText === null)
        return null;
    let raw;
    try {
        raw = object(JSON.parse(manifestText));
    }
    catch {
        return null;
    }
    if (!raw || raw.schema !== 1)
        return null;
    if (raw.version !== version || raw.target !== target)
        return null;
    if (typeof raw.kernelVersion !== 'string' || !isVersion(raw.kernelVersion))
        return null;
    if (typeof raw.kernelSha !== 'string' || !KERNEL_SHA.test(raw.kernelSha))
        return null;
    if (typeof raw.unsigned !== 'boolean')
        return null;
    const sumText = await fetchText(assetUrl(repository, tag, 'SHA256SUMS'), fetchImpl, signal, 128_000);
    if (sumText === null)
        return null;
    const sums = parseSha256Sums(sumText);
    const suffix = installerSuffix(target);
    const expected = `DSH-X-${version}${suffix}`;
    const file = sums.has(expected) ? expected : [...sums.keys()].find(name => name.endsWith(suffix) && name.startsWith(`DSH-X-${version}`));
    if (!file)
        return null;
    return {
        tag,
        version,
        target,
        kernelVersion: raw.kernelVersion,
        kernelSha: raw.kernelSha,
        unsigned: raw.unsigned,
        autoUpdate: raw.autoUpdate === true,
        installer: { file, sha256: sums.get(file), url: assetUrl(repository, tag, file) },
    };
}
/** Load the build manifest published with a plugin release. */
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
