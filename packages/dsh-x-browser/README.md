# dsh-x-browser

Experimental, opt-in Desktop browser plugin for DSH `0.2.1-rc.2`.

This package is **opt-in and never installed by default**; install it explicitly from the market index. Electron and packaged-app behavior is not verified in this repository: the automated evidence here is Web-side unit and integration testing only, and earlier packaged-app proofs lived in the separate app repository. Treat it as experimental until a packaged Desktop run is recorded again. Source/API compatibility and automated unit tests alone do not establish packaged Desktop compatibility.

## What it does

- Adds its own **AI Browser** tab type to the official right sidebar, keeping the conversation on the left. The official sidebar supplies multiple tabs, close controls, docking and narrow-window behavior.
- Acquires an official `dshDesktop.browser` reservation and creates one actual Electron `webview` per plugin tab, with the exact issued lease and partition. It never takes over the built-in browser's private tabs.
- Keeps manual browsing independent of model control. The web application shows an explicit unsupported message; there is no iframe, external-browser or headless screenshot substitute.
- Provides `dsh_x_browser_tabs` and `dsh_x_browser_action` through the official DSH ToolRuntime. No native Codex, Claude, Grok or OpenCode browser bridge ships in this repository; an external bridge would have to call the same host tools under the same approvals.

## Install and use

Build with `pnpm --filter dsh-x-browser run build`, then install this package explicitly through the official Plugins page or the Discover index. Treat it as experimental until a packaged Desktop run is validated.

Open AI Browser from the conversation dock or sidebar guide. Enter an HTTP(S) address. To let the model access the page, choose **Allow AI on this tab**, review the data disclosure and confirm. Page observations enter conversation history and may be sent to the configured model.

The grant is bound to the currently open DSH turn, or exactly the next turn when enabled while idle. A nested owner, when present, claims the grant for its one genuine parent execution; another run cannot reuse or inspect it. Ending that run revokes the grant, even after its last browser action has settled. Every non-observation tool action separately requests official approval. **Take over / Stop AI** revokes local command authority immediately; manual interaction is then yours. It stops browser automation rather than cancelling unrelated conversation work. Already-sent website input cannot be undone.

## Unattended mode (opt-in)

By default one grant covers one turn and every action waits for a human. That makes a verification loop impossible to leave running, so a profile can opt in to unattended operation:

```yaml
- id: dsh-x-browser
  config:
    approval: auto          # this plugin answers its own browser approvals
    persistentGrant: true   # one explicit tab grant survives later turns
```

Both are off by default, and each is independent. `approval: 'auto'` skips only the per-action prompt for this plugin's own tools — it is this plugin, not the official approver, that answers, so it never widens any other tool. `persistentGrant: true` keeps the grant on the tab instead of the turn: it survives later turns and in-tab navigation, and a command whose owning turn ended is abandoned rather than revoking the tab.

The boundaries that remain under both flags:

- The user still enables the tab once in the sidebar. The model cannot grant itself anything, and Take over still revokes instantly.
- The tab must stay visible. Hiding, closing, switching workspace, renderer disconnection and a heartbeat timeout all revoke.
- Credential filters are unchanged: passwords, payment details, verification codes and bank fields never reach the model, and CAPTCHA, security warnings, permissions and unsupported frames still require the human.
- A page that navigates during a pending grant still cannot authorize the replacement document; the observation is re-required.

Unattended mode means the model can submit forms while nobody watches. Enable it only in a profile where that risk is acceptable.

## Deliberately bounded protocol

Actions: `observe`, `navigate`, `click`, `type`, `scroll`, `press`, `back`, `forward`, `reload`. No model-supplied JavaScript, CSS selector, CDP command, raw IPC, debug endpoint or process command is accepted. A reviewed fixed helper reads top-frame visible text and bounded target descriptions; native input is sent to the same owned guest.

The broker binds profile, authoritative workspace, session, current/next turn, tab, document epoch, grant revision and command ID. Client ownership uses an unguessable capability retained in the trusted renderer closure, never in model output or the page. Delivery is once-only: a lost acknowledgement revokes the grant and is not replayed. Hidden/closed tabs, renderer disconnection, workspace changes, ended turns, cancellation and stale documents fail closed. Navigation during a pending grant cannot enable the replacement page.

Before each native input, the renderer rechecks the exact delivered command, document epoch and grant revision with the host, then rechecks its local takeover generation immediately before dispatch. This prevents a command cancelled while awaiting its DOM helper from later sending input. The host confirmation is a dispatch admission point, not a distributed transaction: cancellation arriving after that admission can race an already-admitted input. Such input may complete and is never automatically replayed. The explicit local Take over button revokes the renderer first.

Revocation between a mouse/key down and up can leave a partial input pair. The plugin does not automatically finish the pair, because a release event can itself activate the page. Already-sent events cannot be undone; the user should inspect the page after taking over.

## Privacy and limitations

The plugin does not read cookies, authentication headers, password values or browser storage. Form values are omitted from observations. URL query strings and fragments are omitted from model-facing URL fields. Obvious password, verification-code, payment, bank and credential controls are withheld; password/payment/code entry is manual. These filters are conservative usability safeguards, **not a security boundary against hostile page JavaScript**. Page text and DOM methods are untrusted and can be misleading or modified. Observations must never grant permissions or authorize an action.

Cross-origin frames, canvas, closed shadow roots and unusual controls may need manual help. The plugin does not disable the official shell's sandbox, web security, download blocking, permission denials, HTTP-auth blocking or native-popup restrictions. Approved ordinary popup links open a fresh manual plugin tab. No security-warning bypass, remote debugging port, preload injection or kernel patch is used.

Tabs with the same canonical workspace share the official shell’s process-lifetime storage partition; a new AI grant is not a clean login profile.

The explicit takeover button is reliable; automatic recognition of every native user gesture inside a guest is not claimed. A click that navigates invalidates the prior grant; a tool-requested navigation may finish with a new document epoch and must be observed again.

Only a synthetic nested-owner path is exercised in tests. No Codex, Claude, Grok or OpenCode bridge ships in this repository; the browser tools remain callable by the main conversation, and renderer capabilities never reach a native model or guest page.

Direct DSH tool calls are supported. Other nested wrappers, including unregistered PTC calls, fail closed; an unknown or previously closed parent never falls back to direct DSH authority.

## CDP backend (opt-in, experimental)

`backend: 'cdp'` swaps the execution layer from the embedded webview to an external Chrome driven by [agent-browser](https://github.com/vercel-labs/agent-browser) (0.39.x). The model still sees the same tools — `dsh_x_browser_tabs`, `dsh_x_browser_open`, `dsh_x_browser_action` — and never supplies JavaScript, CSS selectors or CDP commands.

```yaml
- id: dsh-x-browser
  config:
    backend: cdp
    cdp:
      command: agent-browser   # CLI on PATH; install it yourself
      headed: true             # visible by default; headless must be explicit
      allowedDomains: [example.com]
```

Boundaries:

- `grantRevision` is always `0`; `epoch` is the target revision, and every action rotates it, so observe again before the next ref.
- Each non-observe action still goes through official approval. Enabling `backend: 'cdp'` is the consent to use an external Chrome; the renderer grant model does not apply.
- The domain allowlist is enforced by the plugin and passed to the CLI as `--allowed-domains`.
- `type` replaces the field value (it maps to `fill`); `select` needs a `value`. `read` and `screenshot` exist in the CLI but are not exposed as tools yet.
- Current form values are stripped from snapshots before they reach the model.
- Missing CLI or an unsupported series fails with `BROWSER_BINARY_MISSING` / `BROWSER_VERSION`; the plugin does not install anything.
- Real Chrome (agent-browser 0.39.1, Chrome stable) has run `open → observe → click` and two parallel tabs through this backend on macOS. Packaged Desktop behavior is still unverified.

## Development checks

`pnpm --filter dsh-x-browser run build`

`node --test packages/dsh-x-browser/test/*.test.js`

Tests use the real published Cordis, ToolRuntime and locale runtime where applicable, plus clearly synthetic broker/DOM/webview fixtures. They make no vendor model calls and do not establish Electron rendering proof.

## TypeScript 开发

宿主入口是 `src/index.ts`，前端入口是 `src/client/index.ts`，测试位于 `test/*.test.ts`。

```sh
pnpm --filter dsh-x-browser run typecheck
pnpm --filter dsh-x-browser run build
pnpm --filter dsh-x-browser test
```

构建统一使用根目录的 `scripts/build-package.mjs`：`tsc` 生成宿主 JS 和声明，esbuild 生成 `lib/client.js`；包入口指向 `lib/index.js`。
`lib/` 随源码交付，Git 安装不需要先构建；需要重新构建时再运行上面的命令。
