// Shared rules for per-plugin versions. A plugins-v* tag publishes a commit.
// Each package contributes its own package.json version. A version is pinned
// once, at the earliest tag that contains it, so an unchanged package does not
// get a new market entry.

export const PLUGIN_PACKAGES = ['dsh-x-code', 'dsh-x-finance', 'dsh-x-browser', 'dsh-x-delegate', 'dsh-x-pet']

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export const isSemver = version => SEMVER.test(version ?? '')

export const compareSemver = (a, b) => {
  const parse = value => {
    const [core, pre = ''] = String(value).split('+')[0].split('-')
    const [major = 0, minor = 0, patch = 0] = core.split('.').map(Number)
    return { major, minor, patch, pre }
  }
  const left = parse(a)
  const right = parse(b)
  const core = left.major - right.major || left.minor - right.minor || left.patch - right.patch
  if (core) return core
  if (left.pre === right.pre) return 0
  if (!left.pre) return 1
  if (!right.pre) return -1
  return left.pre < right.pre ? -1 : 1
}

export const parseReleaseTag = (line, minimum = '0.2.0') => {
  const [tag, commit, timestamp] = line.split('\t')
  if (!tag?.startsWith('plugins-v')) return null
  const version = tag.slice('plugins-v'.length)
  if (!isSemver(version) || compareSemver(version, minimum) < 0) return null
  return { tag, version, commit, timestamp: Number(timestamp) }
}

// releases are { timestamp, packages: [{ name, version, commit, tree }] }.
// The first time a package version is seen wins; pass oldest releases first.
export const pinVersions = releases => {
  const pinned = new Map(PLUGIN_PACKAGES.map(name => [name, new Map()]))
  for (const release of releases) {
    for (const item of release.packages ?? []) {
      const known = pinned.get(item.name)
      if (!known || !isSemver(item.version) || known.has(item.version)) continue
      known.set(item.version, item)
    }
  }
  return pinned
}

export const assessRelease = (current, pinned) => {
  const errors = []
  for (const item of current) {
    if (item.dirty) {
      errors.push(`${item.name} 有未提交改动。提交之后再发布。`)
      continue
    }
    if (!isSemver(item.version)) {
      errors.push(`${item.name} 的 version 不是 SemVer：${item.version ?? '缺失'}`)
      continue
    }
    const history = [...(pinned.get(item.name)?.values() ?? [])]
    const same = history.find(entry => entry.version === item.version)
    if (same) {
      if (same.tree && item.tree && same.tree !== item.tree) {
        errors.push(`${item.name} 相对已发布的 ${item.version}（${String(same.commit).slice(0, 7)}）有改动，但版本号没变`)
      }
      continue
    }
    const previous = history.reduce((best, entry) => !best || compareSemver(entry.version, best.version) > 0 ? entry : best, null)
    if (!previous) continue
    if (compareSemver(item.version, previous.version) <= 0) {
      errors.push(`${item.name} 的 ${item.version} 没有高于已发布的 ${previous.version}`)
      continue
    }
    if (previous.tree && item.tree && previous.tree === item.tree) {
      errors.push(`${item.name} 升到 ${item.version}，但相对 ${previous.version} 没有文件变化`)
    }
  }
  return errors
}
