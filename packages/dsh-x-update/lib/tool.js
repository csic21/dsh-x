import { defineTool } from '@deepseek-ai/dsh-tools';
const REASONS = {
    'up-to-date': '当前已是最新版本。',
    'plugin-newer': '发现新的插件版本，与当前内核兼容。',
    'app-newer': '发现新的桌面应用版本。',
    'kernel-changed': '新的桌面应用版本包含不同的内核。',
    'plugin-requires-other-kernel': '新插件需要不同的内核，必须先更新桌面应用。',
    'no-compatible-app-release': '新插件要求的内核还没有对应的桌面应用版本。',
    'no-matching-plugin-artifacts': '发布中没有覆盖已安装插件的安装包。',
    'local-runtime-unknown': '无法确定当前内核版本。',
    'not-desktop': '当前不是 DSH-X Desktop，不能自动安装应用或内核更新。',
    'unsupported-platform': '当前平台没有可用的桌面更新包。',
    'no-release': '没有从发布源读取到可用的更新信息。',
};
function summary(plan, pending) {
    if (!plan)
        return '尚未检查更新。';
    const reason = REASONS[plan.reason] ?? plan.reason;
    if (plan.kind === 'none')
        return `${reason} 应用 ${plan.current.appVersion ?? '未知'}，内核 ${plan.current.kernelVersion ?? '未知'}。`;
    if (plan.kind === 'plugin') {
        return `${reason} 插件 ${plan.current.pluginVersion ?? '未知'} → ${plan.available.pluginVersion ?? '未知'}。${pending ? '更新已下载，重启应用后自动安装。' : '正在下载，安装后需要重启应用。'}`;
    }
    if (plan.kind === 'app') {
        return `${reason} 应用 ${plan.current.appVersion ?? '未知'} → ${plan.available.appVersion ?? '未知'}，内核 ${plan.current.kernelVersion ?? '未知'} → ${plan.available.kernelVersion ?? '未知'}。${pending ? '更新已下载，退出应用后自动安装并重启。' : '正在下载应用更新。'}`;
    }
    return reason;
}
export function updateTool(service) {
    return defineTool({
        name: 'dsh_x_update',
        description: '查看或检查 DSH-X 更新状态。区分插件更新与桌面应用/内核更新：插件更新在下次启动时由官方 CLI 应用；应用更新包含内核，在退出应用后安装。检查可能按配置在后台下载并暂存。',
        parameters: {
            action: { type: 'string', required: true, enum: ['status', 'check'], description: 'status 读取当前状态；check 主动检查 GitHub Releases。' },
        },
        output: {
            schema: {
                type: 'object', additionalProperties: false,
                properties: {
                    kind: { type: 'string', required: true },
                    reason: { type: 'string', required: true },
                    appVersion: { type: 'string', required: true },
                    kernelVersion: { type: 'string', required: true },
                    pluginVersion: { type: 'string', required: true },
                    availableAppVersion: { type: 'string', required: true },
                    availableKernelVersion: { type: 'string', required: true },
                    availablePluginVersion: { type: 'string', required: true },
                    pending: { type: 'string', required: true },
                    summary: { type: 'string', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: value.summary }],
            presentationMeta: (_args, value) => ({ kind: 'dsh-x-update', version: 1, updateKind: value.kind }),
        },
        execute: async (args) => {
            let status = service.snapshot();
            if (args.action === 'check')
                status = await service.check();
            const plan = status.plan;
            return {
                kind: plan?.kind ?? 'unknown',
                reason: plan?.reason ?? 'not-checked',
                appVersion: plan?.current.appVersion ?? '',
                kernelVersion: plan?.current.kernelVersion ?? '',
                pluginVersion: plan?.current.pluginVersion ?? '',
                availableAppVersion: plan?.available.appVersion ?? '',
                availableKernelVersion: plan?.available.kernelVersion ?? '',
                availablePluginVersion: plan?.available.pluginVersion ?? '',
                pending: status.pending ? `${status.pending.kind}:${status.pending.version}` : '',
                summary: summary(plan, status.pending),
            };
        },
    });
}
