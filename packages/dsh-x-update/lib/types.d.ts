export type UpdateKind = 'none' | 'plugin' | 'app' | 'blocked';
export type UpdateReason = 'up-to-date' | 'plugin-newer' | 'app-newer' | 'kernel-changed' | 'plugin-requires-other-kernel' | 'no-compatible-app-release' | 'no-matching-plugin-artifacts' | 'local-runtime-unknown' | 'not-desktop' | 'unsupported-platform' | 'no-release';
export type UpdateTarget = 'macos-arm64' | 'macos-x64' | 'windows-x64';
export interface LocalPlugin {
    name: string;
    version: string;
}
/** Versions and paths read from the running Desktop installation. */
export interface LocalState {
    desktop: boolean;
    home: string | null;
    profile: string | null;
    appVersion: string | null;
    kernelVersion: string | null;
    target: UpdateTarget | null;
    distributionPath: string | null;
    installRoot: string | null;
    appPath: string | null;
    plugins: LocalPlugin[];
}
export interface InstallerAsset {
    file: string;
    sha256: string;
    url: string;
}
/** Distribution manifest published as an asset of a `desktop-v*` release. */
export interface DesktopRelease {
    tag: string;
    version: string;
    target: UpdateTarget;
    kernelVersion: string;
    kernelSha: string;
    unsigned: boolean;
    autoUpdate: boolean;
    installer: InstallerAsset;
}
export interface PluginArtifact {
    name: string;
    version: string;
    file: string;
    sha256: string;
    integrity: string;
    url: string;
}
/** Build manifest published as an asset of a `plugins-v*` release. */
export interface PluginRelease {
    tag: string;
    version: string;
    runtime: string;
    artifacts: PluginArtifact[];
}
export interface UpdatePlan {
    kind: UpdateKind;
    reason: UpdateReason;
    desktop: DesktopRelease | null;
    plugin: PluginRelease | null;
    /** Installed plugins covered by this plugin update. */
    targets: PluginArtifact[];
    current: {
        appVersion: string | null;
        kernelVersion: string | null;
        pluginVersion: string | null;
    };
    available: {
        appVersion: string | null;
        kernelVersion: string | null;
        pluginVersion: string | null;
        runtime: string | null;
    };
}
export interface PendingPluginFile {
    name: string;
    version: string;
    file: string;
    path: string;
    sha256: string;
    integrity: string;
}
export interface PendingPluginUpdate {
    schema: 1;
    kind: 'plugins';
    tag: string;
    version: string;
    runtime: string;
    createdAt: string;
    files: PendingPluginFile[];
}
export interface PendingAppUpdate {
    schema: 1;
    kind: 'app';
    tag: string;
    version: string;
    kernelVersion: string;
    target: UpdateTarget;
    installer: string;
    sha256: string;
    installRoot: string;
    appPath: string;
    createdAt: string;
}
export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'ready' | 'error';
export interface UpdateProgress {
    file: string;
    received: number;
    total: number | null;
}
export interface PendingSummary {
    kind: 'plugins' | 'app';
    tag: string;
    version: string;
    createdAt: string;
}
export interface UpdateStatus {
    schema: 1;
    phase: UpdatePhase;
    checkedAt: string | null;
    error: string | null;
    local: LocalState;
    plan: UpdatePlan | null;
    pending: PendingSummary | null;
    progress: UpdateProgress | null;
    config: {
        repository: string;
        autoCheck: boolean;
        autoDownload: boolean;
        autoInstallApp: boolean;
    };
}
export interface UpdateConfig {
    repository?: string;
    /** Override the GitHub Releases Atom feed; intended for tests and mirrors. */
    feedUrl?: string;
    autoCheck?: boolean;
    autoDownload?: boolean;
    autoInstallApp?: boolean;
    checkIntervalHours?: number;
    initialDelaySeconds?: number;
}
