const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
export function parseVersion(value) {
    if (typeof value !== 'string')
        return null;
    const match = VERSION.exec(value.trim());
    if (!match)
        return null;
    const prerelease = match[4]
        ? match[4].split('.').map(part => /^(?:0|[1-9]\d*)$/.test(part) ? Number(part) : part)
        : [];
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease,
        raw: value.trim(),
    };
}
function compareIdentifiers(left, right) {
    if (typeof left === 'number' && typeof right === 'number')
        return left === right ? 0 : left < right ? -1 : 1;
    if (typeof left === 'number')
        return -1;
    if (typeof right === 'number')
        return 1;
    return left === right ? 0 : left < right ? -1 : 1;
}
/** Semver precedence, including prerelease ordering. Returns -1, 0 or 1. */
export function compareVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    if (!a || !b)
        throw new Error(`Invalid version comparison: ${left} / ${right}`);
    if (a.major !== b.major)
        return a.major < b.major ? -1 : 1;
    if (a.minor !== b.minor)
        return a.minor < b.minor ? -1 : 1;
    if (a.patch !== b.patch)
        return a.patch < b.patch ? -1 : 1;
    if (!a.prerelease.length && !b.prerelease.length)
        return 0;
    if (!a.prerelease.length)
        return 1;
    if (!b.prerelease.length)
        return -1;
    const length = Math.max(a.prerelease.length, b.prerelease.length);
    for (let index = 0; index < length; index += 1) {
        const one = a.prerelease[index];
        const two = b.prerelease[index];
        if (one === undefined)
            return -1;
        if (two === undefined)
            return 1;
        const order = compareIdentifiers(one, two);
        if (order !== 0)
            return order;
    }
    return 0;
}
export function isNewer(candidate, current) {
    return current === null || compareVersions(candidate, current) > 0;
}
export function maxVersion(values) {
    let best = null;
    for (const value of values) {
        if (!value || !parseVersion(value))
            continue;
        if (best === null || compareVersions(value, best) > 0)
            best = value;
    }
    return best;
}
export function isVersion(value) {
    return parseVersion(value) !== null;
}
