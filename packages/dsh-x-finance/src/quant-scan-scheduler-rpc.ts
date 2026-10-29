import { createRpcRoute, failure } from './rpc.ts'
import { validateScope } from './watchlist.ts'
import type { QuantScanScheduler } from './quant-scan-scheduler.ts'

export const QUANT_SCHEDULE_ENDPOINT = 'dsh-x-finance.quant-schedule'
export type QuantScheduleRequest =
  | { action: 'get' | 'disable'; scope: string }
  | { action: 'enable'; scope: string; consent: true }

export function parseQuantScheduleRequest(input: unknown): QuantScheduleRequest {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype) throw new Error('invalid request')
  const value = input as Record<string, unknown>, keys = Object.keys(value).sort().join(',')
  const scope = validateScope(value.scope)
  if ((value.action === 'get' || value.action === 'disable') && keys === 'action,scope') return { action: value.action, scope }
  if (value.action === 'enable' && keys === 'action,consent,scope' && value.consent === true) return { action: 'enable', scope, consent: true }
  throw new Error('invalid request')
}

export function createQuantScheduleHandler(scheduler: QuantScanScheduler) {
  return async (endpoint: unknown, payload: unknown, signal: AbortSignal | undefined, peer: any) => {
    if (peer?.principal?.kind !== 'owner') return failure('finance/forbidden', '只允许当前 profile 的宿主所有者管理全市场自动任务。')
    if (endpoint !== QUANT_SCHEDULE_ENDPOINT) return failure('finance/not-found', '未知全市场自动任务接口。')
    let request: QuantScheduleRequest
    try { request = parseQuantScheduleRequest(payload) }
    catch { return failure('finance/invalid-input', '请提交当前 scope；启用全市场自动任务必须显式同意 consent:true。') }
    if (signal?.aborted) return failure('finance/cancelled', '请求已取消。')
    try { return { ok: true, value: await scheduler.request(request, signal) } }
    catch (error: any) {
      if (signal?.aborted) return failure('finance/cancelled', '请求已取消。')
      const code = ['scope-mismatch', 'storage-unavailable', 'disposed', 'invalid-input'].includes(error?.code) ? error.code : 'storage-unavailable'
      return failure(`finance/quant-schedule-${code}`, '全市场自动任务未完成，请刷新当前 profile 状态；存储失败时不会继续请求上游。')
    }
  }
}

/** Register only behind the official shared Connection owner admission bridge. */
export function createQuantScheduleRoute(scheduler: QuantScanScheduler) {
  return createRpcRoute(QUANT_SCHEDULE_ENDPOINT, createQuantScheduleHandler(scheduler))
}
