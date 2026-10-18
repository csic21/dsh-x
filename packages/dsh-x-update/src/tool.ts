import { defineTool } from '@deepseek-ai/dsh-tools'
import type { UpdateService } from './service.ts'
import type { UpdatePlan } from './types.ts'

const REASONS: Record<string, string> = {
  'up-to-date': '当前已是最新插件版本。',
  'plugin-newer': '发现新的插件版本，与当前 DSH 运行时兼容。',
  'runtime-mismatch': '新插件要求的 DSH 运行时与当前版本不同，不能直接安装。',
  'no-matching-plugin-artifacts': '发布中没有覆盖已安装插件的安装包。',
  'local-runtime-unknown': '无法确定当前 DSH 运行时版本。',
  'no-release': '没有从发布源读取到可用的插件发布信息。',
}

function summary(plan: UpdatePlan | null): string {
  if (!plan) return '尚未检查插件更新。'
  const reason = REASONS[plan.reason] ?? plan.reason
  return `${reason} 插件 ${plan.current.pluginVersion ?? '未知'} → ${plan.available.pluginVersion ?? '暂无'}；DSH ${plan.current.runtimeVersion ?? '未知'}。安装请使用官方 Plugins 页面。`
}

export function updateTool(service: UpdateService) {
  return defineTool({
    name: 'dsh_x_update',
    description: '查看或检查 DSH-X 插件更新。只读取公开 GitHub Releases 和当前 profile 的已安装版本，不下载安装包、不修改 profile；安装由官方 Plugins 页面完成。',
    parameters: {
      action: { type: 'string', required: true, enum: ['status', 'check'], description: 'status 读取当前状态；check 主动检查 GitHub Releases。' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true },
          reason: { type: 'string', required: true },
          pluginVersion: { type: 'string', required: true },
          availablePluginVersion: { type: 'string', required: true },
          runtimeVersion: { type: 'string', required: true },
          availableRuntime: { type: 'string', required: true },
          summary: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
      presentationMeta: (_args, value) => ({ kind: 'dsh-x-update', version: 1, updateKind: value.kind }),
    },
    execute: async (args) => {
      let status = service.snapshot()
      if (args.action === 'check') status = await service.check()
      const plan = status.plan
      return {
        kind: plan?.kind ?? 'unknown',
        reason: plan?.reason ?? 'not-checked',
        pluginVersion: plan?.current.pluginVersion ?? '',
        availablePluginVersion: plan?.available.pluginVersion ?? '',
        runtimeVersion: plan?.current.runtimeVersion ?? '',
        availableRuntime: plan?.available.runtime ?? '',
        summary: summary(plan),
      }
    },
  })
}
