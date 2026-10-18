export function approvalText({ toolName, draft, discard, snapshot }, requestedRound) {
    const target = snapshot ?? (toolName === 'dsh_x_approve_plan' ? draft : discard);
    const round = requestedRound ?? target?.round;
    if (toolName !== 'dsh_x_approve_plan')
        return {
            zh: `放弃第 ${round} 轮计划。此操作不会撤销已经产生的文件改动。`,
            en: `Discard plan round ${round}. This does not undo existing file changes.`,
        };
    const scope = target?.manifest?.files?.join('\n') ?? target?.path ?? '';
    const checks = target?.manifest?.checks?.map((check) => check.command).join('\n') ?? '';
    const body = (target?.body ?? '').replace(/```dsh-x-plan\s*\n[\s\S]*?```/g, '').trim();
    const steps = target?.manifest?.steps?.map((step) => `${step.id}: ${step.title}`).join('; ') ?? '';
    const baseline = target?.binding?.baseline?.head ?? '';
    return {
        zh: `批准第 ${round} 轮 / 版本 ${target?.revision ?? '?'}，执行者为当前会话。\n目标：${target?.manifest?.goal ?? ''}\n审批 SHA-256：${target?.hash ?? ''}\n工作目录：${target?.binding?.cwd ?? ''}\n基线 HEAD：${baseline}\n步骤：${steps}\n文件范围：\n${scope}\n验收命令（可能写入测试产物，仍须宿主权限批准）：\n${checks}\n\n不可变审批内容：\n${body}`,
        en: `Approve round ${round} / revision ${target?.revision ?? '?'}. The current session executes the plan.\nGoal: ${target?.manifest?.goal ?? ''}\nApproval SHA-256: ${target?.hash ?? ''}\nWorking directory: ${target?.binding?.cwd ?? ''}\nBaseline HEAD: ${baseline}\nSteps: ${steps}\nFile scope:\n${scope}\nAcceptance commands (may write test artifacts; host permissions still apply):\n${checks}\n\nImmutable approval content:\n${body}`,
    };
}
