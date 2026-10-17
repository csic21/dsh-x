/** Exact authorization scope, independent of normal-whitespace DOM layout. */
const normalized = value => typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
const once = '仅允许此项一次 / Allow this request once only.';
const catalogNotice = 'Start the native runtime only to read its advertised model catalog. No task prompt, login or credential creation is requested. Initialization may read native configuration, run managed hooks, maintain native state or contact services. The same host file-effect policy applies. Listed models do not prove account access, quota or billing eligibility. 读取模型目录；原生初始化可能加载配置、运行托管 hooks 或维护原生状态。不发送任务，不登录；列表不代表账户可调用。';
const ownedNotice = 'fresh empty native home and workspace; no account credentials or project context. Only a freshly checked zero-price public model is eligible. Native startup may install its official runtime helper dependencies in temporary state. No persistent MCP registration.';
const nativeNotice = 'Native requests remain subject to individual approval. The host file-effect policy applies; it does not claim network or secret-read isolation.';
const browserNotice = 'Apply this action to the visible embedded tab once. It may submit data or change the website. Passwords, payment details and sign-in codes require manual entry. / 仅对可见内嵌页面执行一次；此操作可能提交数据或改变网站。密码、支付资料和登录验证码请手动输入。';
const directory = value => /^(?:[A-Za-z]:\\|\/)[^\x00-\x1f]+$/.test(value);
const count = (text, token) => text.split(token).length - 1;
export function approvalInScope(id, reason, args = {}) {
  const value = normalized(reason);
  if (!value || value.length > 16000) return false;
  if (id === '03-models') {
    const match = /^Agents · Read opencode model catalog Runtime: (\S+) Directory: (.*?) Start the native runtime only /.exec(value);
    if (!match || match[1] !== 'opencode' || !directory(match[2]) || count(value, 'Runtime: ') !== 1 || count(value, 'Directory: ') !== 1) return false;
    return value === `Agents · Read opencode model catalog Runtime: opencode Directory: ${match[2]} ${catalogNotice} ${once}`;
  }
  if (!['05-hello', '08-google'].includes(id)) return false;
  if (value.startsWith('Agents · Run ')) {
    const match = /^Agents · Run (\S+) Runtime: (\S+) Directory: (.*?) Model: (\S+) Authentication: (.*?) Task: (.*?) Owned browser-only OpenCode: (.*)$/.exec(value);
    if (!match || match[1] !== 'opencode' || match[2] !== 'opencode' || !directory(match[3]) || match[4] !== args.model || !match[5] || match[6] !== normalized(args.prompt)) return false;
    for (const key of ['Runtime: ', 'Directory: ', 'Model: ', 'Authentication: ', 'Task: ', 'Owned browser-only OpenCode: ', 'Browser tools: ']) if (count(value, key) !== 1) return false;
    const mode = args.browser === true ? 'enabled for this exact live run; each browser mutation still requests DSH approval.' : 'disabled.';
    return match[7] === `${ownedNotice} Browser tools: ${mode} ${nativeNotice} ${once}`;
  }
  if (id !== '08-google') return false;
  const match = /^Browser · navigate Current page: (?:(.*?) )?(\{.*\}) Apply this action to the visible embedded tab once\./.exec(value);
  if (!match || !['', 'about:blank'].includes(match[1] ?? '') || value !== normalized(`Browser · navigate Current page: ${match[1] ?? ''} ${match[2]} ${browserNotice}`)) return false;
  try {
    const command = JSON.parse(match[2]);
    return match[2] === JSON.stringify({ action: 'navigate', url: 'https://www.google.com/' }) && Object.keys(command).sort().join(',') === 'action,url' && command.action === 'navigate' && command.url === 'https://www.google.com/';
  } catch { return false; }
}
