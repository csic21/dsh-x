import type { UpdateKind, UpdateProgress, UpdateStatus } from '../types.ts'

export type UpdateTone = 'neutral' | 'info' | 'warning' | 'danger'
export type UpdateState = 'idle' | 'checking' | 'downloading' | 'ready' | 'error' | 'blocked'

export interface UpdateViewModel {
  state: UpdateState
  tone: UpdateTone
  statusKey: string
  reasonKey: string
  kind: UpdateKind | 'unknown'
  appVersion: string | null
  kernelVersion: string | null
  pluginVersion: string | null
  availableAppVersion: string | null
  availableKernelVersion: string | null
  availablePluginVersion: string | null
  pending: UpdateStatus['pending']
  pendingKey: string | null
  pendingParams: Record<string, string>
  progress: UpdateProgress | null
  error: string | null
  canCheck: boolean
  canDownload: boolean
  releaseUrl: string
  repository: string
  desktop: boolean
  pluginCount: number
}

function keyFor(reason: string): string {
  return `reason.${reason}`
}

export function updateViewModel(status: UpdateStatus | null): UpdateViewModel {
  const repository = status?.config.repository ?? 'csic21/dsh-x'
  const releaseUrl = `https://github.com/${repository}/releases`
  if (!status) {
    return {
      state: 'idle', tone: 'neutral', statusKey: 'status.idle', reasonKey: 'reason.not-checked', kind: 'unknown',
      appVersion: null, kernelVersion: null, pluginVersion: null, availableAppVersion: null,
      availableKernelVersion: null, availablePluginVersion: null, pending: null, pendingKey: null,
      pendingParams: {}, progress: null, error: null, canCheck: true, canDownload: false,
      releaseUrl, repository, desktop: false, pluginCount: 0,
    }
  }
  const plan = status.plan
  const base = {
    kind: plan?.kind ?? 'unknown' as const,
    appVersion: status.local.appVersion,
    kernelVersion: status.local.kernelVersion,
    pluginVersion: plan?.current.pluginVersion ?? null,
    availableAppVersion: plan?.available.appVersion ?? null,
    availableKernelVersion: plan?.available.kernelVersion ?? null,
    availablePluginVersion: plan?.available.pluginVersion ?? null,
    pending: status.pending,
    pendingKey: null as string | null,
    pendingParams: {} as Record<string, string>,
    progress: status.progress,
    error: status.error,
    canCheck: true,
    canDownload: false,
    releaseUrl,
    repository,
    desktop: status.local.desktop,
    pluginCount: status.local.plugins.length,
  }
  if (status.phase === 'checking') {
    return { ...base, state: 'checking', tone: 'neutral', statusKey: 'status.checking', reasonKey: keyFor(plan?.reason ?? 'not-checked'), canCheck: false }
  }
  if (status.phase === 'downloading') {
    return { ...base, state: 'downloading', tone: 'info', statusKey: 'status.downloading', reasonKey: keyFor(plan?.reason ?? 'not-checked'), canCheck: false }
  }
  if (status.phase === 'error') {
    return { ...base, state: 'error', tone: 'danger', statusKey: 'status.error', reasonKey: keyFor(plan?.reason ?? 'not-checked'), canCheck: true }
  }
  if (status.pending) {
    const app = status.pending.kind === 'app'
    return {
      ...base,
      state: 'ready',
      tone: 'info',
      statusKey: app ? 'status.app' : 'status.plugin',
      reasonKey: keyFor(app ? 'kernel-changed' : 'plugin-newer'),
      pendingKey: app ? 'pending.app' : 'pending.plugins',
      pendingParams: app
        ? { version: status.pending.version, kernel: plan?.available.kernelVersion ?? '' }
        : { version: status.pending.version },
      canCheck: false,
      canDownload: false,
    }
  }
  if (!plan) {
    return { ...base, state: 'idle', tone: 'neutral', statusKey: 'status.idle', reasonKey: 'reason.not-checked', canCheck: true }
  }
  if (plan.kind === 'none') {
    return { ...base, state: 'idle', tone: 'neutral', statusKey: 'status.up-to-date', reasonKey: keyFor(plan.reason), canCheck: true }
  }
  if (plan.kind === 'plugin') {
    return { ...base, state: 'idle', tone: 'info', statusKey: 'status.plugin', reasonKey: keyFor(plan.reason), canDownload: true, canCheck: true }
  }
  if (plan.kind === 'app') {
    return { ...base, state: 'idle', tone: 'warning', statusKey: 'status.app', reasonKey: keyFor(plan.reason), canDownload: true, canCheck: true }
  }
  return { ...base, state: 'blocked', tone: 'warning', statusKey: 'status.blocked', reasonKey: keyFor(plan.reason), canCheck: true }
}
