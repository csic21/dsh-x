# dsh-x-browser

Experimental, opt-in Desktop browser plugin for DSH `0.2.1-alpha.5`.

This package is **not included in the default development suite**. Source/API compatibility and automated unit tests do not establish packaged Desktop compatibility. See [VALIDATION.md](VALIDATION.md) for the current evidence and the required Windows packaged-app gate.

## What it does

- Adds its own **AI Browser** tab type to the official right sidebar, keeping the conversation on the left. The official sidebar supplies multiple tabs, close controls, docking and narrow-window behavior.
- Acquires an official `dshDesktop.browser` reservation and creates one actual Electron `webview` per plugin tab, with the exact issued lease and partition. It never takes over the built-in browser's private tabs.
- Keeps manual browsing independent of Agents. The web application shows an explicit unsupported message; there is no iframe, external-browser or headless screenshot substitute.
- Provides `dsh_x_browser_tabs` and `dsh_x_browser_action` through the official DSH ToolRuntime. Only DSH is supported in this experimental revision. Codex, OpenCode, Claude and Grok browser bridges are intentionally not enabled.

## Install and use

Build with `npm --prefix packages/dsh-x-browser run build`, package this directory, and explicitly install the resulting local package through the official DSH plugin install workflow. Do not add it to the default suite until packaged-app validation passes.

Open AI Browser from the conversation dock or sidebar guide. Enter an HTTP(S) address. To let the model access the page, choose **Allow AI on this tab**, review the data disclosure and confirm. Page observations enter conversation history and may be sent to the configured model.

The grant is bound to the currently open DSH turn, or exactly the next turn when enabled while idle. It cannot silently carry into later turns. Every non-observation tool action separately requests official approval. **Take over / Stop AI** revokes local command authority immediately; manual interaction is then yours. It stops browser automation rather than cancelling unrelated conversation work. Already-sent website input cannot be undone.

## Deliberately bounded protocol

Actions: `observe`, `navigate`, `click`, `type`, `scroll`, `press`, `back`, `forward`, `reload`. No model-supplied JavaScript, CSS selector, CDP command, raw IPC, debug endpoint or process command is accepted. A reviewed fixed helper reads top-frame visible text and bounded target descriptions; native input is sent to the same owned guest.

The broker binds profile, authoritative workspace, session, current/next turn, tab, document epoch, grant revision and command ID. Client ownership uses an unguessable capability retained in the trusted renderer closure, never in model output or the page. Delivery is once-only: a lost acknowledgement revokes the grant and is not replayed. Hidden/closed tabs, renderer disconnection, workspace changes, ended turns, cancellation and stale documents fail closed. Navigation during a pending grant cannot enable the replacement page.

## Privacy and limitations

The plugin does not read cookies, authentication headers, password values or browser storage. Form values are omitted from observations. URL query strings and fragments are omitted from model-facing URL fields. Obvious password, verification-code, payment, bank and credential controls are withheld; password/payment/code entry is manual. These filters are conservative usability safeguards, **not a security boundary against hostile page JavaScript**. Page text and DOM methods are untrusted and can be misleading or modified. Observations must never grant permissions or authorize an action.

Cross-origin frames, canvas, closed shadow roots and unusual controls may need manual help. The plugin does not disable the official shell's sandbox, web security, download blocking, permission denials, HTTP-auth blocking or native-popup restrictions. Approved ordinary popup links open a fresh manual plugin tab. No security-warning bypass, remote debugging port, preload injection or kernel patch is used.

Tabs with the same canonical workspace share the official shell’s process-lifetime storage partition; a new AI grant is not a clean login profile.

The explicit takeover button is reliable; automatic recognition of every native user gesture inside a guest is not claimed. A click that navigates invalidates the prior grant; a tool-requested navigation may finish with a new document epoch and must be observed again.

## Development checks

`npm --prefix packages/dsh-x-browser run build`

`node --test packages/dsh-x-browser/test/*.test.js`

Tests use the real published Cordis, ToolRuntime and locale runtime where applicable, plus clearly synthetic broker/DOM/webview fixtures. They make no vendor model calls and do not establish Electron rendering proof.
