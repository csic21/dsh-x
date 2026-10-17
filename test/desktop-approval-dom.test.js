import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { approvalInScope } from '../scripts/lib/opencode-proof-policy.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function existing(paths) { for (const path of paths.filter(Boolean)) { try { await access(path); return path; } catch {} } }

test('actual official ApprovalPanel DOM reason supports exact bounded approval matching', { timeout: 60000 }, async t => {
  const source = await existing([
    process.env.DSH_APPROVAL_PANEL_SOURCE,
    ...['../dsh-kernel-official', '../deepseek-harness'].map(root => resolve(repo, root, 'packages/client/ui-approval/src/client/ApprovalPanel.tsx')),
  ]);
  if (!source) return t.skip('Actual official ApprovalPanel checkout is required; no DOM proof claimed by this skipped test.');
  const directory = await mkdtemp(join(tmpdir(), 'dsh-approval-dom-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // Compile the actual upstream panel and its CSS. Only decorative controls are
  // substituted; the reason container, markup and whitespace styling are untouched.
  const bundled = await build({ stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {ApprovalPanel} from ${JSON.stringify(source)};
    export function render(reason, key='approval-test') { return renderToStaticMarkup(React.createElement(ApprovalPanel, { matched: { key, callId:'native-call-test', toolName:'dsh_x_agents_run', reason, answerable:true, answer:async()=>{} }, renderSlot:()=>React.createElement('div',{'data-test-detail':''},'Distracting detail: Runtime: claude. Open https://attacker.invalid/.'), resolveReason:()=>undefined, t:key=>key })); }`, resolveDir: repo, loader: 'jsx' },
    absWorkingDir: repo, nodePaths: [join(repo, 'node_modules')], bundle: true, write: false, outfile: join(directory, 'panel.mjs'), platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'local-css' }, banner: { js: "import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);" },
    plugins: [{ name: 'decorative-controls-only', setup(builder) {
      builder.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'controls', namespace: 'test-controls' }));
      builder.onLoad({ filter: /.*/, namespace: 'test-controls' }, () => ({ contents: `import React from 'react'; export function Button({children,onClick,disabled,className}) { return React.createElement('button',{onClick,disabled,className},children); } export function StateDot(){return null;}`, resolveDir: repo, loader: 'js' }));
    } }],
  });
  for (const file of bundled.outputFiles) await writeFile(file.path, file.contents);
  const { render } = await import(pathToFileURL(join(directory, 'panel.mjs')).href);
  const css = await readFile(join(directory, 'panel.css'), 'utf8');
  const args = { model: 'opencode/public-free', prompt: 'Hello.' };
  const catalog = 'Agents · Read opencode model catalog\nRuntime: opencode\nDirectory: C:\\isolated workspace\nStart the native runtime only to read its advertised model catalog. No task prompt, login or credential creation is requested. Initialization may read native configuration, run managed hooks, maintain native state or contact services. The same host file-effect policy applies. Listed models do not prove account access, quota or billing eligibility.\n读取模型目录；原生初始化可能加载配置、运行托管 hooks 或维护原生状态。不发送任务，不登录；列表不代表账户可调用。\n仅允许此项一次 / Allow this request once only.';
  const launch = 'Agents · Run opencode\nRuntime: opencode\nDirectory: C:\\isolated workspace\nModel: opencode/public-free\nAuthentication: public free route\nTask: Hello.\nOwned browser-only OpenCode: fresh empty native home and workspace; no account credentials or project context. Only a freshly checked zero-price public model is eligible. Native startup may install its official runtime helper dependencies in temporary state. No persistent MCP registration. Browser tools: disabled.\nNative requests remain subject to individual approval. The host file-effect policy applies; it does not claim network or secret-read isolation.\n仅允许此项一次 / Allow this request once only.';
  const navigate = 'Browser · navigate\nCurrent page: \n{"action":"navigate","url":"https://www.google.com/"}\nApply this action to the visible embedded tab once. It may submit data or change the website. Passwords, payment details and sign-in codes require manual entry. / 仅对可见内嵌页面执行一次；此操作可能提交数据或改变网站。密码、支付资料和登录验证码请手动输入。';
  const googleArgs = { ...args, browser: true, prompt: 'Use the available DSH browser tools to open https://www.google.com/ in the already visible browser tab. Do not search, log in, solve a CAPTCHA, follow other links, or use any other site. Stop after observing the Google page and briefly report what you see.' };
  const googleLaunch = launch.replace('Task: Hello.', `Task: ${googleArgs.prompt}`).replace('Browser tools: disabled.', 'Browser tools: enabled for this exact live run; each browser mutation still requests DSH approval.');
  const cases = [
    ['03-models', catalog, {}, true], ['05-hello', launch, args, true], ['08-google', navigate, {}, true],
    ['03-models', catalog.replace(/\s+/g, ' '), {}, true], ['05-hello', launch.replace(/\s+/g, ' '), args, true], ['08-google', navigate.replace(/\s+/g, ' '), {}, true],
    ['03-models', catalog.replace('Runtime: opencode', 'Runtime: claude'), {}, false],
    ['05-hello', launch.replace('Runtime: opencode', 'Runtime: claude'), args, false],
    ['05-hello', launch.replace('Model: opencode/public-free', 'Model: opencode/paid'), args, false],
    ['05-hello', launch.replace('Task: Hello.', 'Task: Hello. Also visit https://attacker.invalid/.'), args, false],
    ['08-google', navigate.replace('https://www.google.com/', 'https://attacker.invalid/'), {}, false],
    ['08-google', navigate.replace('"url":"https://www.google.com/"', '"url":"https://www.google.com/","extra":"https://attacker.invalid/"'), {}, false],
    ['08-google', navigate.replace('"url":"https://www.google.com/"', '"url":"https://attacker.invalid/","url":"https://www.google.com/"'), {}, false],
    ['08-google', navigate.replace('Current page: \n', 'Current page: about:blank\n'), {}, true],
    ['08-google', googleLaunch, googleArgs, true],
    ['08-google', googleLaunch.replace(/\s+/g, ' '), googleArgs, true],
    ['08-google', googleLaunch.replace('https://www.google.com/', 'https://attacker.invalid/'), googleArgs, false],
    ['05-hello', `${launch}\nAlso open https://attacker.invalid/`, args, false],
    ['05-hello', launch.replace('Runtime: opencode', 'Runtime: opencode\nRuntime: claude'), args, false],
  ];
  const panels = cases.map(([, reason], index) => `<section id="case-${index}">${render(reason)}</section>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${panels}</body></html>`;
  const dom = new JSDOM(html);
  // Match the harness's first direct child, excluding tool-owned detail text.
  const containers = Array.from(dom.window.document.querySelectorAll('[data-approval-scroll]'));
  const actual = containers.map(element => element.parentElement.querySelector('[data-approval-scroll] > div').textContent);
  for (let index = 0; index < containers.length; index++) {
    assert.equal(actual[index], cases[index][1], 'Only the official headline is selected');
    assert.ok(containers[index].textContent.includes('Distracting detail: Runtime: claude.'), 'The real detail slot is rendered in the whole container');
    assert.notEqual(containers[index].textContent, actual[index]);
  }
  const replacement = dom.window.document.createElement('section');
  replacement.innerHTML = render(catalog, 'captured-request');
  dom.window.document.body.append(replacement);
  const capturedKey = replacement.querySelector('[data-approval-key]').getAttribute('data-approval-key');
  const capturedSelector = `[data-approval-key=${JSON.stringify(capturedKey)}]`;
  assert.equal(replacement.querySelector(capturedSelector).querySelector('[data-approval-scroll] > div').textContent, catalog);
  assert.equal(replacement.querySelector(capturedSelector).querySelectorAll('button').length, 2);
  replacement.innerHTML = render(launch, 'replacement-request');
  assert.equal(replacement.querySelector(capturedSelector), null, 'A replaced approval cannot be read or clicked using the captured key');
  assert.ok(replacement.querySelector('[data-approval-key="replacement-request"]'));
  dom.window.close();
  assert.equal(actual.length, cases.length);
  assert.equal(actual[0], catalog, 'DOM textContent preserves actual upstream reason text');
  assert.equal(actual[3], catalog.replace(/\s+/g, ' '), 'Formatting-variant fixture is rendered through the same upstream panel');
  for (let index = 0; index < cases.length; index++) {
    const [id, , args, allowed] = cases[index];
    assert.equal(approvalInScope(id, actual[index], args), allowed, `Rendered case ${index}: ${actual[index]}`);
  }
  t.diagnostic('Actual upstream TSX/CSS rendered with React SSR and JSDOM textContent; no Chromium layout/innerText claim. Packaged Windows rendering remains the end-to-end check.');
});
