/** Known official read-only tools. Unknown capabilities fail closed during a task. */
export const READ_ONLY_DURING_DRAFT = new Set([
  'read', 'read_image', 'grep', 'glob', 'web_search', 'web_fetch',
  'ask_user_question', 'present', 'skill', 'session_event_read',
  'session_event_search', 'session_event_trace', 'session_search', 'session_trace',
  'terminal_list', 'terminal_read', 'job_list', 'job_output', 'list_agents', 'list_subagent_models',
  'get_goal', 'schedule_list', 'cordis_inspect_list', 'cordis_inspect_query',
  'list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource',
])
export const PLAN_TOOLS = new Set(['dsh_x_plan', 'dsh_x_revise_plan', 'dsh_x_approve_plan', 'dsh_x_discard_plan', 'dsh_x_review', 'dsh_x_plan_status', 'dsh_x_recover_plan'])
export function gateDecision({ toolName, draft = null, workflow = null, locked = false }) {
  if (PLAN_TOOLS.has(toolName) || READ_ONLY_DURING_DRAFT.has(toolName)) return { kind: 'next' }
  const state = workflow?.state ?? (draft ? 'draft' : null)
  if (!state && !locked) return { kind: 'next' }
  if (locked || !['approved', 'executing'].includes(state)) return { kind: 'deny', reason: `Plan workflow ${state ?? 'busy'} does not permit mutations. Inspect the task and obtain a fresh approval when required.` }
  if (!['write', 'edit', 'bash'].includes(toolName)) return { kind: 'deny', reason: `The active plan cannot constrain ${toolName}. Complete or explicitly discard the task before using this capability.` }
  return { kind: 'next' }
}
