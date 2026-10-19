export type FileIconKind =
  | 'markdown' | 'typescript' | 'javascript' | 'json' | 'yaml' | 'svg' | 'image'
  | 'style' | 'html' | 'shell' | 'python' | 'go' | 'rust' | 'vue' | 'xml'
  | 'git' | 'package' | 'docker' | 'license' | 'lock' | 'text' | 'audio' | 'video' | 'file'

const BY_NAME: Record<string, FileIconKind> = {
  'package.json': 'package', 'package-lock.json': 'package', 'pnpm-lock.yaml': 'package', 'yarn.lock': 'package',
  dockerfile: 'docker', 'license': 'license', 'license.md': 'license', 'license.txt': 'license',
  '.gitignore': 'git', '.gitattributes': 'git', '.gitmodules': 'git', '.gitkeep': 'git',
}

const BY_EXT: Record<string, FileIconKind> = {
  md: 'markdown', mdx: 'markdown',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'json',
  yml: 'yaml', yaml: 'yaml', toml: 'yaml',
  svg: 'svg',
  png: 'image', jpg: 'image', jpeg: 'image', jpe: 'image', gif: 'image', webp: 'image', bmp: 'image', ico: 'image', avif: 'image',
  css: 'style', scss: 'style', less: 'style',
  html: 'html', htm: 'html',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  py: 'python', go: 'go', rs: 'rust', vue: 'vue', xml: 'xml',
  lock: 'lock', txt: 'text',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio',
  mp4: 'video', webm: 'video', ogv: 'video',
}

/** The icon family for a repository path. Names win over extensions, so package.json is not a plain JSON file. */
export function fileIconKind(path: string | null | undefined): FileIconKind {
  const base = path?.split(/[\\/]/).pop()?.toLowerCase() ?? ''
  if (!base) return 'file'
  if (BY_NAME[base]) return BY_NAME[base]
  if (base.startsWith('tsconfig') && base.endsWith('.json')) return 'typescript'
  if (base.startsWith('dockerfile')) return 'docker'
  const dot = base.lastIndexOf('.')
  const ext = dot > 0 ? base.slice(dot + 1) : ''
  return BY_EXT[ext] ?? 'file'
}
