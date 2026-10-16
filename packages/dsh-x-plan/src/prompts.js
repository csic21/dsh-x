export const LOOP_SECTION = `dsh-x 规划循环：需要改仓库时，先调用 dsh_x_plan，让 Codex、Claude 或 Grok 写出计划。把计划原文交给用户。用户同意后调用 dsh_x_approve_plan，并等待用户在审批卡上允许。只执行已批准的 plan-<轮次>.approved.md。做完后调用 dsh_x_review。验收者要换成另一个模型家族。验收失败时只按缺口修改，同一份已批准计划最多失败两次。两次仍失败就停下来问用户。规划者和验收者只读，不能改仓库。`

/**
 * @param {{ goal: string, context?: string }} input
 */
export function plannerPrompt({ goal, context }) {
  const excerpt = context?.trim() ? context.trim() : '（调用方没有提供文件摘录。缺少决定计划所必需的信息时，写在「待确认」里，不要编造。）'
  return `你是只读规划者。不要改文件，不要运行会改仓库的命令。工具权限请求会被拒绝。

执行者是当前的 DeepSeek 会话。用户批准计划之后，它才会按计划改仓库。另一家族的模型会验收结果，你不要给自己打分。

信息不够就提问，不要假设不存在的文件或行为。问题写在「待确认」下面。

用 Markdown 写出这些节：目标、非目标、会改到的文件、步骤、待确认。
最后放一个代码块，语言标记必须是 dsh-x-acceptance。每行一条验收命令，井号开头是注释。没有命令就留空代码块。这些命令会在验收时执行。

\`\`\`dsh-x-acceptance
# 例如 pnpm test
\`\`\`

## 目标

${goal.trim()}

## 调用方提供的摘录

${excerpt}
`
}

/**
 * @param {{ planner: string, reviewer: string, evidence: string }} input
 */
export function reviewerPrompt({ planner, reviewer, evidence }) {
  return `你是只读验收者。规划者是 ${planner}，你是 ${reviewer}。你没有写这份计划，也不要改仓库。工具权限请求会被拒绝。

下面是全部证据：用户批准的计划、git status、git diff HEAD、未跟踪文件名、计划里点名的验收命令输出。不要假设证据以外的内容。命令失败是缺口。diff 改了计划没列出的文件是缺口。步骤没有落在 diff 里是缺口。未跟踪文件只有名字，没有内容；如果实现只存在于未跟踪文件里，把这一点写成缺口。

通过时，正文用一句话说明，代码块里只写 pass。
失败时，正文只写编号缺口，不要重写整份计划，代码块里只写 fail。

\`\`\`dsh-x-verdict
fail
\`\`\`

${evidence}
`
}
