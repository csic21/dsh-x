export type UpdateKind = 'none' | 'plugin' | 'blocked'

export type UpdateReason =
  | 'up-to-date'
  | 'plugin-newer'
  | 'runtime-mismatch'
  | 'no-matching-plugin-artifacts'
  | 'local-runtime-unknown'
  | 'no-release'

export interface LocalPlugin {
  name: string
  version: string
}

/** Versions read from the running profile without writing anything. */
export interface LocalState {
  home: string | null
  profile: string | null
  runtimeVersion: string | null
  plugins: LocalPlugin[]
}

export interface PluginArtifact {
  name: string
  version: string
  file: string
  sha256: string
  integrity: string
  url: string
}

/** Build manifest published as an asset of a `plugins-v*` release. */
export interface PluginRelease {
  tag: string
  version: string
  runtime: string
  artifacts: PluginArtifact[]
}

export interface UpdatePlan {
  kind: UpdateKind
  reason: UpdateReason
  plugin: PluginRelease | null
  /** Installed plugins covered by this plugin update. */
  targets: PluginArtifact[]
  current: {
    pluginVersion: string | null
    runtimeVersion: string | null
  }
  available: {
    pluginVersion: string | null
    runtime: string | null
  }
}

export type UpdatePhase = 'idle' | 'checking' | 'error'

export interface UpdateStatus {
  schema: 1
  phase: UpdatePhase
  checkedAt: string | null
  error: string | null
  local: LocalState
  plan: UpdatePlan | null
  config: {
    repository: string
    autoCheck: boolean
  }
}

export interface UpdateConfig {
  repository?: string
  /** Override the GitHub Releases Atom feed; intended for tests and mirrors. */
  feedUrl?: string
  autoCheck?: boolean
  checkIntervalHours?: number
  initialDelaySeconds?: number
}
