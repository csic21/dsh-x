import { compareVersions } from './semver.js';
const TAG = /^(desktop|plugins)-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
export function classifyTag(tag) {
    const match = TAG.exec(tag);
    return match ? { kind: match[1], version: match[2] } : null;
}
function decodeEntities(value) {
    return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
/** Parse the public releases Atom feed. No API token or rate limit is involved. */
export function parseAtom(xml) {
    const releases = [];
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
    for (const entry of entries) {
        const href = /<link[^>]*rel="alternate"[^>]*href="([^"]+)"[^>]*\/?>/.exec(entry)?.[1]
            ?? /<link[^>]*href="([^"]+)"[^>]*rel="alternate"[^>]*\/?>/.exec(entry)?.[1];
        const tag = href ? /\/releases\/tag\/([^/?#"]+)$/.exec(decodeEntities(href))?.[1] : undefined;
        const classified = tag ? classifyTag(decodeURIComponent(tag)) : null;
        if (!classified)
            continue;
        releases.push({
            tag: tag,
            version: classified.version,
            kind: classified.kind,
            updatedAt: /<updated>([^<]+)<\/updated>/.exec(entry)?.[1] ?? null,
        });
    }
    return releases;
}
/** Fallback parser for the public REST listing when the Atom feed is unavailable. */
export function parseApi(json) {
    if (!Array.isArray(json))
        return [];
    const releases = [];
    for (const item of json) {
        if (!item || typeof item !== 'object')
            continue;
        const record = item;
        if (record.draft === true)
            continue;
        const tag = typeof record.tag_name === 'string' ? record.tag_name : '';
        const classified = classifyTag(tag);
        if (!classified)
            continue;
        releases.push({
            tag,
            version: classified.version,
            kind: classified.kind,
            updatedAt: typeof record.published_at === 'string' ? record.published_at : null,
        });
    }
    return releases;
}
export function assetUrl(repository, tag, file) {
    return `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(file)}`;
}
export function feedUrl(repository) {
    return `https://github.com/${repository}/releases.atom`;
}
export function apiUrl(repository) {
    return `https://api.github.com/repos/${repository}/releases?per_page=50`;
}
async function responseText(response, limit) {
    if (!response.ok)
        throw new Error(`GitHub release feed returned HTTP ${response.status}`);
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > limit)
        throw new Error('GitHub release feed is too large');
    const text = await response.text();
    if (text.length > limit)
        throw new Error('GitHub release feed is too large');
    return text;
}
/** Newest-first release entries, fetched from the public Atom feed. */
export async function fetchReleaseIndex(options) {
    const { repository, fetchImpl, signal } = options;
    const url = options.feedUrl ?? feedUrl(repository);
    const timeout = AbortSignal.timeout(20_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
        const response = await fetchImpl(url, { headers: { accept: 'application/atom+xml, application/xml, text/xml' }, signal: combined, redirect: 'follow' });
        const releases = parseAtom(await responseText(response, 2_000_000));
        if (releases.length > 0)
            return releases;
    }
    catch (error) {
        if (signal?.aborted)
            throw error;
    }
    const response = await fetchImpl(apiUrl(repository), { headers: { accept: 'application/vnd.github+json' }, signal: combined, redirect: 'follow' });
    return parseApi(JSON.parse(await responseText(response, 4_000_000)));
}
export function newestFor(entries, kind, limit = 6) {
    return entries
        .filter(entry => entry.kind === kind)
        .sort((left, right) => compareVersions(right.version, left.version))
        .slice(0, limit);
}
export function latestVersion(entries, kind) {
    return newestFor(entries, kind, 1)[0]?.version ?? null;
}
