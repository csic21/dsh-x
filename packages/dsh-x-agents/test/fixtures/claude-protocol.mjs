// Synthetic Claude Agent SDK 0.3.302 / CLI 2.1.302 protocol fixtures.
// No model, provider, account or real command executes in this fixture.
import { randomUUID } from 'node:crypto';
export function createClaudeFixture({ send, argv = [], onUser, onResponse, account, version = '2.1.302' }) {
  const value = flag => { const at = argv.indexOf(flag); return at >= 0 ? argv[at + 1] : argv.find(arg => arg.startsWith(`${flag}=`))?.slice(flag.length + 1); };
  let session = value('--resume') ?? value('--session-id') ?? randomUUID();
  const frame = event => send({ uuid: randomUUID(), session_id: session, ...event });
  const permission = (toolName = 'Bash', input = { command: 'printf fixture' }, requestId = 'permission-1', toolUseId = 'tool-1') => send({ type: 'control_request', request_id: requestId,
    request: { subtype: 'can_use_tool', tool_name: toolName, input, tool_use_id: toolUseId,
      permission_suggestions: [{ type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'userSettings' }] } });
  const finish = (result = 'Synthetic Claude fixture answer.', extra = {}) => {
    frame({ type: 'assistant', message: { id: 'assistant-1', role: 'assistant', content: [{ type: 'text', text: result }] }, parent_tool_use_id: null });
    frame({ type: 'result', subtype: 'success', is_error: false, result, duration_ms: 1, duration_api_ms: 0, num_turns: 1,
      usage: { input_tokens: 0, output_tokens: 0 }, modelUsage: {}, total_cost_usd: 0, permission_denials: [], ...extra });
  };
  const helper = { frame, permission, finish, get session() { return session; } };
  return { ...helper, async receive(message) {
    if (message.type === 'control_request') {
      const response = message.request.subtype === 'initialize' ? {
        commands: [], agents: [], output_style: 'default', available_output_styles: ['default'], claude_code_version: version,
        models: [{ value: 'fixture-model', displayName: 'Synthetic fixture model', description: 'No model calls' }],
        account: account ?? { apiProvider: 'firstParty', apiKeySource: 'ANTHROPIC_API_KEY' },
      } : message.request.subtype === 'interrupt' ? { still_queued: [], cancelled: [] } : {};
      send({ type: 'control_response', response: { subtype: 'success', request_id: message.request_id, response } });
    } else if (message.type === 'user') {
      session = message.session_id || session;
      frame({ type: 'system', subtype: 'init', cwd: value('--cwd') ?? '/workspace/project', permissionMode: 'default', model: 'fixture-model',
        claude_code_version: version, apiKeySource: 'ANTHROPIC_API_KEY', tools: ['Bash', 'AskUserQuestion'], mcp_servers: [], slash_commands: [], output_style: 'default', skills: [], plugins: [] });
      if (onUser) await onUser(helper, message); else finish();
    } else if (message.type === 'control_response') await onResponse?.(helper, message);
  } };
}
