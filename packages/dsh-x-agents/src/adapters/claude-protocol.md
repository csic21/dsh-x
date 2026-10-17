# Claude native adapter protocol and validation

## Pinned official implementation

- Package: `@anthropic-ai/claude-agent-sdk@0.3.302`, exact dependency, obtained from the official npm registry on 2026-10-17.
- Matching bundled Claude binary: `2.1.302`; package `manifest.json` identifies build commit `2ef144e6f98c1c99d082b735e4b38f50e3391e55` and build time `2026-10-16T16:13:51Z`.
- This adapter calls the official SDK `query()` and preserves its native tool loop, session storage, model context and control protocol. It does not implement a replacement model/tool loop or use the Messages API.
- `sdk.d.ts` and `sdk.mjs` in the exact installed package are the executable contract. The public [TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript), [session guide](https://code.claude.com/docs/en/agent-sdk/sessions), [input guide](https://code.claude.com/docs/en/agent-sdk/user-input) and [permissions guide](https://code.claude.com/docs/en/agent-sdk/permissions) explain the corresponding APIs.
- The wrapper requires the matching native version. A custom installed executable must also report `2.1.302`; version drift blocks instead of assuming schema compatibility. No auto-install, auto-update, login, paid test turn or fallback runtime is performed.

## Inspection versus an approved native launch

`discover()` uses the injected managed process service for **only** `claude --version`. It returns `authenticated: null`, no models, `authDiscovery: false`, and `authentication: { state: 'requires-native-initialization', source: 'version-only' }`. Binary availability does not prove an account, model, network path or billing entitlement.

Only after the host's explicit launch approval does `run()` initialize a real SDK query. A gated async input iterable prevents sending any user prompt during that initialization. The adapter reads `initializationResult()`, `accountInfo()` and `supportedModels()` from the SDK's initialization response; these are local native configuration evidence, not successful provider authentication tests. Missing supported configuration, OAuth-only setup, incompatible CLI or an unadvertised explicit model blocks before the prompt gate opens.

Initialization can read native state, create native state files and execute vendor startup behavior. Ordinary user/project/local settings are excluded using `settingSources: []`. Custom MCP, plugins and skills are excluded using `strictMcpConfig: true`, an empty MCP map, plugin list and skill list. Inline settings disable ordinary hooks, bundled skills, skill shell execution, automatic memory and Claude.ai skill/plugin sync. Enterprise-managed settings and managed hooks can still apply; the wrapper does not bypass or rewrite them. SDK declarations explicitly say managed hooks can run despite a non-managed `disableAllHooks`. For this reason, SDK initialization is never part of unattended inspection.

The first approved turn may use the native default. Models obtained from native initialization are emitted in `session.data.models` for later selection. The adapter validates any selected model again before sending the prompt. It never substitutes a model. A provider rejection during the actual turn is an unsuccessful native result, not proof that the earlier configuration check validated the account.

## Authentication scope and privacy

This adapter currently accepts API-key configuration reported by the native runtime or a supported official cloud-provider backend. Explicit provider environment values come only from private host `claude.env` configuration; arbitrary ambient provider credentials are not copied. It also permits the official runtime to use its own configured native API-key state. The adapter itself does not open credential files, query a keychain, collect subscription tokens, invoke login, create credentials or refresh them through SDK authentication methods.

The [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) directs third-party SDK products to API-key methods and distinguishes that product from the CLI. The [current legal/compliance documentation](https://code.claude.com/docs/en/legal-and-compliance) separately describes end-user use of the unmodified official binary and native subscription login. This implementation's API/provider-only scope is **not** a blanket claim that all third-party hosting of an official CLI subscription workflow is forbidden. No third-party Claude.ai login, credential collection or subscription-proxy workflow is offered here.

Only non-secret routing/configuration fields and configured credential **field names** enter `backendIdentity`. Credential values and credential-derived hashes never do. Credential rotation does not identify an account; native account/profile separation remains the operator's responsibility. SDK subprocess environment inheritance is explicitly narrowed; all other ambient keys receive `undefined` tombstones so the host's environment merge cannot restore `NODE_OPTIONS`, `BASH_ENV`, debug flags or unrelated secrets. `HOME`, path/platform temporary-directory settings, the selected native configuration directory and explicitly configured provider fields are retained. Provider URLs cannot carry embedded credentials or query parameters.

Stderr and raw account details are never emitted. Known secret-key/value shapes and exact explicitly configured credential values are redacted. Raw thinking blocks are not published. `AskUserQuestion` answer-bearing native tool results and tool summaries emit only answered metadata. This filtering is not a general guarantee that arbitrary generated prose cannot contain sensitive user data.

## Managed subprocess boundary

Official `Options.spawnClaudeCodeProcess` is synchronous and returns the documented `SpawnedProcess` shape: stdin/stdout, killed/exitCode, kill and exit/error listener methods. `ClaudeProcessOwner` supplies that shape while bridging to asynchronous host `spawn(spec)`. It never imports or invokes `child_process`.

All actual CLI launches pass through the injected host service, which owns `ctx.subprocess` and the host's confinement policy. Native callbacks and Claude permission modes do **not** constitute an OS sandbox. The adapter does not claim network or secret-read isolation. Cleanup assurance depends on the host's managed-range backend; fallback process-group backends may not track or terminate descendants that escape their process group.

The exact SDK package contains other direct subprocess paths, including standalone session-file helpers that use Git, platform managed-settings resolution and `sessionStore` resume helpers that may access a keychain. The adapter does not call `resolveSettings`, standalone session-file APIs, `sessionStore`, SDK MCP-server factories, authentication methods or prewarming. Its used path is ordinary `query()` with the custom process hook. These exclusions should be re-audited before any SDK upgrade.

Each queued launch owns an AbortController. Closing before the spawn microtask prevents launch; closing while confinement is pending aborts the signal checked by the host. If the host has already produced a child, the adapter terminates and awaits the whole range. Cancellation requests official `interrupt({ cancelQueued: true })`, aborts the SDK, rejects stale host answers and terminates the managed range. A direct child exit is insufficient: `waitForExit()` must confirm `true`, `done` must settle and callbacks must quiesce. Any uncertainty throws `AGENTS_CLEANUP_UNCONFIRMED`, retaining the controller's durable fence.

## Session and request identity

The SDK supports an explicitly supplied UUID through `options.sessionId`. Because the native `system/init` message follows the user prompt, the adapter first awaits a durable `session` event for this exact reserved UUID with `provenance: 'host-reserved'` and `nativeConfirmed: false`. Only then does it release the single prompt. Resume uses the exact saved UUID through `resume`, never `continue` or a latest-session lookup. The matching native init confirms that UUID in a second event. Failure to persist the reservation sends no prompt. A reservation can exist without a usable vendor transcript if launch failed; continuation then fails visibly rather than silently starting another session.

Native message identities must match the reservation. Terminal results require the session ID. Permission requests wait for native init, receive a unique run/request/tool identity, and retain the SDK's native cancellation signal. Replays, mismatched tool IDs, unsupported scope and incomplete sensitive details are denied. A result frame revokes pending permissions at transport ingress, independently of slow display/store callbacks. A final outbound reply fence converts any already-queued stale allow into deny after native completion or cancellation.

`canUseTool` is the SDK's native ask callback; it does not observe every automatically allowed native action. The host presents only `allow_once` and `reject_once`. Only the exact one-time answer returns `{ behavior: 'allow', updatedInput, toolUseID }`. `updatedPermissions` and the SDK's session/persistent permission suggestions are never returned. Native permission-mode transitions (`EnterPlanMode`, `ExitPlanMode`) are disallowed by this first adapter. Native todo/plan display events remain supported.

`AskUserQuestion` accepts up to four unique questions with two to four ordinary options. Questions are normalized to host IDs; the host response is validated and mapped back to the official question-text-keyed `answers` object. Multi-selection and ordinary custom text are supported. Credential questions, previews, duplicate/invalid answers, unsupported dialogs and MCP elicitation fail closed. No sign-in data is requested through generic question controls.

## Stream limits and event mapping

The process boundary validates UTF-8 JSONL frames before the SDK queues them. Default budgets: 4 MiB per frame, 16 MiB cumulative output and 8,192 frames per turn. Invalid, oversized or unsupported reverse-control frames stop the managed run instead of being ignored. These are deliberate execution limits, not silent truncation of an authoritative result.

Assistant text uses native `message_start.message.id` / final `assistant.message.id`, plus the content-block index as `partId`. Root and subagent partial-stream identities are tracked separately. Final text replaces its corresponding delta accumulation in the host UI. Tool calls/results, todo plans and terminal usage are mapped from native fields. Usage/model cost is an SDK estimate; a terminal result does not assert task acceptance or successful tests.

## Reproducible tests and observed limits

`test/claude.test.js` imports the **real official SDK**, with an injected in-memory synthetic native protocol peer. `test/fixtures/claude-cli.mjs` is an executable synthetic peer for real host integration/UI tests. Its `--version` string intentionally simulates the official format; its prompts `fixture:permission`, `fixture:input` and `fixture:cancel` never call a model or execute a real tool command. All normal answers explicitly say Synthetic. Do not treat fixture account/model metadata as a verified vendor account.

Tests cover the SDK initialization/prompt/permission/input/result path, exact resume, pre-prompt checkpoint persistence, stable multipart text, raw-thinking suppression, redaction, secret input rejection, stale/replayed approvals, terminal/cancel races, bounds, missing results and cleanup quarantine. Independent `test/agents-native-audit.test.js` adds bridge cancellation and terminal-result regressions. `test/agents-additional-integration.test.js` uses official DSH ToolRuntime/approval/subprocess services with the real SDK and the synthetic executable.

On 2026-10-17, a separate real-binary smoke used official DSH `ctx.subprocess` with an empty temporary HOME/USERPROFILE/config directory. The only process command was the installed SDK's `claude --version`; it returned `2.1.302`, and cleanup was confirmed. No native account initialization, real credential access or model call was attempted. This checks the installed binary and managed lifecycle, not sandbox enforcement or real account readiness.

Run focused verification from the repository root:

```sh
node --test packages/dsh-x-agents/test/claude.test.js
node --test test/agents-native-audit.test.js test/agents-additional-integration.test.js
```
