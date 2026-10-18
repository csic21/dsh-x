# dsh-x-browser

Experimental, opt-in Desktop browser plugin for DSH `0.2.1-rc.2`.

This package is **opt-in and never installed by default**; install it explicitly from the market index. Electron and packaged-app behavior is not verified in this repository: the automated evidence here is Web-side unit and integration testing only, and earlier packaged-app proofs lived in the separate app repository. Treat it as experimental until a packaged Desktop run is recorded again. Source/API compatibility and automated unit tests alone do not establish packaged Desktop compatibility.

## What it does

- Adds its own **AI Browser** tab type to the official right sidebar, keeping the conversation on the left. The official sidebar supplies multiple tabs, close controls, docking and narrow-window behavior.
- Acquires an official `dshDesktop.browser` reservation and creates one actual Electron `webview` per plugin tab, with the exact issued lease and partition. It never takes over the built-in browser's private tabs.
- Keeps manual browsing independent of model control. The web application shows an explicit unsupported message; there is no iframe, external-browser or headless screenshot substitute.
- Provides `dsh_x_browser_tabs` and `dsh_x_browser_action` through the official DSH ToolRuntime. An explicitly configured isolated OpenCode bridge can delegate those same tools under its approved live parent execution. Real OpenCode/provider validation remains pending; Codex, Claude and Grok browser bridges are not enabled.

## Install and use

Build with `pnpm --filter dsh-x-browser run build`, then install this package explicitly through the official Plugins page or the Discover index. Treat it as experimental until a packaged Desktop run is validated.

Open AI Browser from the conversation dock or sidebar guide. Enter an HTTP(S) address. To let the model access the page, choose **Allow AI on this tab**, review the data disclosure and confirm. Page observations enter conversation history and may be sent to the configured model.

The grant is bound to the currently open DSH turn, or exactly the next turn when enabled while idle. An OpenCode delegation additionally claims the grant for its one genuine parent execution; another native run cannot reuse or inspect it. Ending that native run revokes the grant, even after its last browser action has settled. Every non-observation tool action separately requests official approval. **Take over / Stop AI** revokes local command authority immediately; manual interaction is then yours. It stops browser automation rather than cancelling unrelated conversation work. Already-sent website input cannot be undone.

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

Direct DSH tool calls and registered isolated OpenCode children are supported. Other nested wrappers, including unregistered PTC calls, fail closed; an unknown or previously closed parent never falls back to direct DSH authority.

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
