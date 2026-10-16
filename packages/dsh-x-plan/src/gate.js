/**
 * Tools that may run while a session has an unapproved draft.
 * Names come from the official tool catalog (bash, fs, search, web, terminal
 * read, session query, and the read-only inspectors). Anything else is
 * refused until the user approves or discards the draft.
 */
export const READ_ONLY_DURING_DRAFT = new Set([
  'read',
  'read_image',
  'grep',
  'glob',
  'web_search',
  'web_fetch',
  'ask_user_question',
  'present',
  'skill',
  'session_event_read',
  'session_event_search',
  'session_event_trace',
  'session_search',
  'session_trace',
  'terminal_list',
  'terminal_read',
  'list_agents',
  'list_subagent_models',
  'interrupt_agent',
  'get_goal',
  'schedule_list',
  'cordis_inspect_list',
  'cordis_inspect_query',
  'list_mcp_resources',
  'list_mcp_resource_templates',
  'read_mcp_resource',
  'exit_plan_mode',
  'dsh_x_plan',
  'dsh_x_approve_plan',
  'dsh_x_discard_plan',
])

/**
 * @param {{ toolName: string, draft: { round: number, path: string } | null, discard: { round: number, path: string } | null }} input
 * @returns {{ kind: 'next' } | { kind: 'ask', reason: string } | { kind: 'deny', reason: string }}
 */
export function gateDecision({ toolName, draft, discard }) {
  if (toolName === 'dsh_x_approve_plan') {
    if (draft === null) return { kind: 'next' }
    return {
      kind: 'ask',
      reason: `批准第 ${draft.round} 轮计划，并允许 DeepSeek 按这个文件执行：${draft.path}`,
    }
  }
  if (toolName === 'dsh_x_discard_plan') {
    if (discard === null) return { kind: 'next' }
    return {
      kind: 'ask',
      reason: `放弃第 ${discard.round} 轮计划：${discard.path}`,
    }
  }
  if (draft === null) return { kind: 'next' }
  if (READ_ONLY_DURING_DRAFT.has(toolName)) return { kind: 'next' }
  return {
    kind: 'deny',
    reason: `第 ${draft.round} 轮计划还没批准，不能调用 ${toolName}。请用户确认后调用 dsh_x_approve_plan，或调用 dsh_x_discard_plan 放弃。计划文件：${draft.path}`,
  }
}
