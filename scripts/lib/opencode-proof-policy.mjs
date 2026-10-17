/** Exact authorization scope for the user-requested public hello/Google proof. */
export function approvalInScope(id, reason, args) {
  if (typeof reason !== 'string') return false;
  if (id === '03-models') return reason.startsWith('Agents · Read opencode model catalog\n') && reason.includes('Runtime: opencode\n');
  if (!['05-hello','08-google'].includes(id)) return false;
  if (reason.startsWith('Agents · Run opencode\n')) return reason.includes('Runtime: opencode\n') && reason.includes(`Model: ${args.model}\n`) && reason.includes(`Task: ${args.prompt}\n`) && reason.includes('Owned browser-only OpenCode:') && reason.includes(args.browser === true ? 'Browser tools: enabled for this exact live run; each browser mutation still requests DSH approval.' : 'Browser tools: disabled.');
  if (id !== '08-google' || !reason.startsWith('Browser · navigate\n')) return false;
  try {
    const line = reason.split('\n').find(item => item.startsWith('{'));
    const command = JSON.parse(line);
    return Object.keys(command).sort().join(',') === 'action,url' && command.action === 'navigate' && command.url === 'https://www.google.com/';
  } catch { return false; }
}
