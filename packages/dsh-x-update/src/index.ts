import type { Context } from '@deepseek-ai/cordis'
import { createUpdateService } from './service.ts'
import { createUpdateRoutes } from './rpc.ts'
import { updateTool } from './tool.ts'
import type { UpdateConfig } from './types.ts'

export const name = 'dsh-x-update'
export const inject = ['tools']

/**
 * Host half of the updater. Every transport is optional so a headless profile
 * keeps the tool and the automatic check, while the Desktop page only appears
 * when the shell exposes Connection.
 */
export function apply(ctx: Context, config: UpdateConfig = {}): void {
  // Verification and offline smoke tests must not mutate their disposable
  // profile while a real release happens to be newer than the fixture.
  const disabled = process.env.DSH_X_UPDATE_DISABLE === '1'
  const service = createUpdateService({
    env: process.env,
    config: disabled ? { ...config, autoCheck: false, autoDownload: false, autoInstallApp: false } : config,
  })
  ctx.tools.register(updateTool(service))
  ctx.inject(['connection'], (host: any) => {
    for (const route of createUpdateRoutes(service)) host.connection.fetch.register(route)
  })
  const stopChecking = service.start()
  ctx.effect(() => () => {
    stopChecking()
    service.stop()
  }, 'dsh-x-update: lifecycle')
}
