import type { UpdateKind, UpdateStatus } from '../types.ts'

export type UpdateTone = 'neutral' | 'info' | 'warning' | 'danger'
export type UpdateState = 'idle' | 'checking' | 'error' | 'blocked'

export interface UpdateViewModel {
  state: UpdateState
  tone: UpdateTone
  statusKey: string
  reasonKey: string
  kind: UpdateKind | 'unknown'
  pluginVersion: string | null
  availablePluginVersion: string | null
  runtimeVersion: string | null
  availableRuntime: string | null
  error: string | null
  canCheck: boolean
  releaseUrl: string
  repository: string
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
      pluginVersion: null, availablePluginVersion: null, runtimeVersion: null, availableRuntime: null,
      error: null, canCheck: true, releaseUrl, repository, pluginCount: 0,
    }
  }
  const plan = status.plan
  const base = {
    kind: plan?.kind ?? 'unknown' as const,
    pluginVersion: plan?.current.pluginVersion ?? null,
    availablePluginVersion: plan?.available.pluginVersion ?? null,
    runtimeVersion: plan?.current.runtimeVersion ?? null,
    availableRuntime: plan?.available.runtime ?? null,
    error: status.error,
    canCheck: true,
    releaseUrl,
    repository,
    pluginCount: status.local.plugins.length,
  }
  if (status.phase === 'checking') {
    return { ...base, state: 'checking', tone: 'neutral', statusKey: 'status.checking', reasonKey: keyFor(plan?.reason ?? 'not-checked'), canCheck: false }
  }
  if (status.phase === 'error') {
    return { ...base, state: 'error', tone: 'danger', statusKey: 'status.error', reasonKey: keyFor(plan?.reason ?? 'not-checked'), canCheck: true }
  }
  if (!plan) {
    return { ...base, state: 'idle', tone: 'neutral', statusKey: 'status.idle', reasonKey: 'reason.not-checked', canCheck: true }
  }
  if (plan.kind === 'none') {
    return { ...base, state: 'idle', tone: 'neutral', statusKey: 'status.up-to-date', reasonKey: keyFor(plan.reason), canCheck: true }
  }
  if (plan.kind === 'plugin') {
    return { ...base, state: 'idle', tone: 'info', statusKey: 'status.plugin', reasonKey: keyFor(plan.reason), canCheck: true }
  }
  return { ...base, state: 'blocked', tone: 'warning', statusKey: 'status.blocked', reasonKey: keyFor(plan.reason), canCheck: true }
}
