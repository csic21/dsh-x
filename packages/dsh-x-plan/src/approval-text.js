// The official approval bridge resolves these maps against the live client
// locale. Model-facing gate reasons and approval semantics remain unchanged.
export function approvalText({ toolName, draft, discard }, requestedRound) {
  const target = toolName === 'dsh_x_approve_plan' ? draft : discard
  const zhRound = new Intl.NumberFormat('zh-CN').format(target.round)
  const enRound = new Intl.NumberFormat('en').format(target.round)
  const text = toolName === 'dsh_x_approve_plan' ? {
    zh: `批准第 ${zhRound} 轮计划，并允许 DeepSeek 按这个文件执行：${target.path}`,
    en: `Approve plan round ${enRound} and allow DeepSeek to execute the steps in this file: ${target.path}`,
  } : {
    zh: `放弃第 ${zhRound} 轮计划：${target.path}`,
    en: `Discard plan round ${enRound}: ${target.path}`,
  }
  if (typeof requestedRound === 'number') {
    text.zh += `（本次调用指定第 ${new Intl.NumberFormat('zh-CN').format(requestedRound)} 轮）`
    text.en += ` (this call specifies round ${new Intl.NumberFormat('en').format(requestedRound)})`
  }
  return text
}
