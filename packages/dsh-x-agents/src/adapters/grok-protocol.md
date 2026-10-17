# Official Grok Build native ACP adapter

## Verified provenance and exact versions

The executable is **xAI's official Grok Build**, distributed as `@xai-official/grok`, not the unrelated `@stevederico/grok-cli` or a provider HTTP wrapper. No new JavaScript dependency is required. The adapter never installs software automatically.

Verification on 2026-10-17 used:

- Official npm package `@xai-official/grok@1.0.62`; platform artifact `@xai-official/grok-linux-x64@1.0.62`.
- Platform tarball integrity `sha512-MsqDUf0rryWKchpO7TBFY/npVTKiBF/4zarOXzBOqd0YVpnSs9P0tZmZdXQ0o95s9e4FTvpy/CgUbuOsiqkyVA==`.
- Released binary reports `grok 1.0.62 (1474f9cbdd91)`. Its `agent --help` exposes `--no-leader` and `stdio`.
- Official source repository commit `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8`, with `SOURCE_REV` `559751fdcec02d413e4c57c8832ab275e4f44980`. The public snapshot's `xai-grok-shell` crate is **1.0.45**; it is not claimed to be the exact 1.0.62 binary source.
- That snapshot pins Rust `agent-client-protocol` **0.10.4** and `agent-client-protocol-schema` **0.11.4**, negotiating ACP wire **protocolVersion 1**.

The release binary was unpacked in a temporary directory. `--version`, `agent --help`, and one unauthenticated ACP `initialize` were tested with an empty temporary `HOME`/`GROK_HOME` and a cleared environment. No existing user credentials, login, authentication method, or model prompt was used. The initialized response advertised `loadSession: true`, `_meta.grokShell: true`, `_meta.agentVersion: "1.0.62"`, `defaultAuthMethodId: null`, and models `grok-4.6` / `grok-4.5`. A reduced captured response is in `test/fixtures/grok/initialize-1.0.62.json`; machine IDs, paths, and unrelated catalog metadata are intentionally omitted. Model IDs are always read at runtime, never hardcoded into the adapter.

The supported version family is 1.x starting with the inspected 1.0.45 snapshot. This is a compatibility gate, not a cryptographic executable-origin guarantee. Actual runs additionally require the official Grok ACP metadata, matching reported version, protocol v1 and load-session support. Configuring an executable is a trust decision; names or self-reported versions cannot establish a binary's publisher. Unknown wire behavior fails closed. Future releases outside this family require requalification.

Primary sources:

- [Official installation and overview](https://docs.x.ai/build/overview)
- [Official npm package README](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/npm/grok/README.md)
- [Official ACP initialization, prompt, cancellation and authentication implementation](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs)
- [Official native new/load session implementation](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-shell/src/agent/mvp_agent/session_setup.rs)
- [Official permission option mapping](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-workspace/src/permission/prompter.rs)
- [Official question request/response types](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-tools/src/implementations/grok_build/ask_user_question/types.rs)
- [ACP 0.10.4 extension encoding](https://docs.rs/agent-client-protocol/0.10.4/agent_client_protocol/)

## Discovery is deliberately version-only

`discover()` launches only `grok --version`, through the injected managed spawn service. It reports `authenticated: null`, no model entries, and `authentication: { state: 'requires-native-initialization', source: 'version-only' }`.

Native initialization is **not read-only discovery**. The inspected official implementation can refresh existing authentication, sync configuration/plugins, start MCP setup, migrate trust records, and reclaim old native worktrees. Only the host's explicitly approved native-run path may initialize it. The host must disclose this startup behavior when obtaining that approval. Host confinement still applies to discovery and all subsequent processes.

After approved startup, `_meta.defaultAuthMethodId` must name an advertised `cached_token` or `xai.api_key` method. This is only a configured-credentials signal, not proof of current server authentication or subscription eligibility. `x.ai/auth/info` also uses `current_or_expired()` and is not an authentication proof. The adapter never calls `authenticate`, `getBearerToken`, credential retrieval, login or key-writing methods. In particular, official `authenticate(xai.api_key)` can persist a key, and `authenticate(cached_token)` can fall back to login. Missing configured credentials or native `AuthRequired` (-32000) blocks without retry or alternate authentication.

### Explicitly approved model preparation

`discoverModels({cwd,signal,sandboxPolicy})` is a separate, side-effect-bearing preparation action. Its caller must obtain official host approval for native initialization and bind the process to the unchanged workspace, host policy and backend identity before invoking it. Ordinary `discover()` stays version-only. Preparation runs `--version`, starts a fresh owned `agent --no-leader stdio`, sends only `initialize`, validates the official handshake and returns its actual bounded `{id,label}` model catalog. It never sends `session/new`, `session/load`, `session/prompt`, or `authenticate`; reverse client actions are rejected. Every path closes the process and confirms managed-range emptiness. Cleanup uncertainty throws `AGENTS_CLEANUP_UNCONFIRMED`, so the caller must keep its preparation fence rather than publish a successful catalog or launch another action.

The empty-home 1.0.62 capture demonstrates that initialization can advertise models without configured authentication. This is the CLI's advertised catalog, not proof that an account can call each model. Successful preparation always returns `authenticated: null`, with `authentication.source: 'native-initialize'` and state `configured-unverified`, `unconfigured`, or `unsupported`. No auth method or credential is returned. Missing/malformed catalogs fail; an explicitly empty catalog stays empty. Callers must retain catalog provenance/backend identity and handle refresh failures explicitly; later execution still revalidates the selected ID against fresh initialization and session catalogs before `session/set_model` and prompt submission.

## Process ownership and native state

Every version/runtime process uses the injected `spawn`, with fixed `grok agent --no-leader stdio`. The host must use its official managed subprocess provider and require full confinement under restricted host policies. No shell fallback, shared leader attachment, user-selected argv, auto-approve flag, native policy downgrade, or client filesystem/terminal delegation is permitted.

`config.nativeHome` is an absolute path, defaulting to `GROK_HOME` or `~/.grok`. The non-secret backend identity binds executable, native home, captured PATH lookup, protocol and fixed leader/permission settings. Version and runtime spawns use that same captured `GROK_HOME`. No credential files are read by this adapter. Native startup itself retains its documented state behavior. If the host sandbox blocks native-state writes outside the workspace, execution must remain blocked; the host must not copy credentials, expand allowed roots or bypass confinement to make it run.

Native approval is not a sandbox. Previously remembered Grok grants and configured allow rules can precede native questions. The adapter cannot promise that every tool action asks DSH. The host's filesystem-effect confinement is the hard boundary; native approval requests are routed only when Grok emits them. Grok's built-in sandbox documentation also describes unsupported-platform fallbacks, so merely selecting a native sandbox profile would not prove enforcement.

Advertising ACP client filesystem/terminal capabilities as false does not disable Grok's native tools. In the inspected official source, `agent_ops.rs` uses `AcpSessionFs` only when **both** client read and write flags are true; otherwise it uses `LocalFs`. Terminal false selects the native `TerminalRunner` and local terminal backend. A read-only ACP bridge flag alone would not route reads through the host in this snapshot. These are execution-location choices, not access-policy guarantees; native tools remain subject to host process confinement. No client filesystem or terminal service is implemented here.

Each run owns a fresh no-leader process. Session new/load metadata fixes `yoloMode: false`, `autoMode: false`, `noReplay: true`, `x.ai/restore_code: false`, and `x.ai/skip_envrc: true`. These prevent explicit auto-approval, automatic checkout restoration, and envrc loading. They do not erase native stored grants, prevent all native maintenance, or pretend that transcript replay settings make resume read-only. No resident/shared process is reused.

`session/new` returns the durable native ID; an awaited `session` event checkpoints it before parsing optional model metadata or submitting a prompt. `session/load` receives exactly the requested prior ID; failure never starts a replacement session. A second session event advertises at most 100 actual `{id,label}` model entries and observed resume/model capability. `session/set_model` is used only after validating the exact model ID against the native catalog. Initial and loaded catalogs are checked independently. Model output completion does not prove tests or task acceptance.

## Permissions, questions and events

ACP frames are JSON-RPC 2.0 JSONL. Replies are correlated independently of awaited UI events, with UTF-8 incremental decoding and bounded queues. Grok extension names are prefixed with `_` on the wire, as encoded by the official ACP library.

Extension params are direct, not `{method,params}` wrappers: ACP 0.10.4 `src/lib.rs` sends the extension object, and schema 0.11.4 `src/ext.rs` marks `ExtRequest`/`ExtNotification` as `serde(transparent)` with the routing `method` skipped. The inspected Grok leader-forwarding comments/tests also mention wrapped messages; those are not the pinned schema encoder and this no-leader adapter does not accept that legacy shape.

`session/request_permission` requires the current native session and a complete tool input, from the request or its preceding same-session tool update. Full request metadata is included in host details. Sensitive/redacted details block. Only the exact official `allow-once`/`allow_once` and `reject-once`/`reject_once` pairs are exposed; labels and positions are never scope authority. Persistent scopes are not offered, unknown kinds fail closed, and the special `enable-always-approve` option is excluded even though Grok labels it `allow_once` on the wire. Selection maps to `{outcome:{outcome:'selected',optionId}}`; absent/invalid input maps to cancelled. Denial blocks the remaining delegated turn.

`_x.ai/ask_user_question` must carry the same session ID and tool-call ID. Ordinary questions normalize to DSH `{id,question,options,multiSelect}`. DSH `{answers:[{id,selected,custom?}]}` maps back to Grok `{outcome:'accepted',answers:{[questionText]:[labels]},annotations?}`; freeform-only uses `['Other']` with `annotations[questionText].notes`. Duplicate question text, malformed/incomplete answers, option previews, credentials/login questions, missing handlers and unsupported requests block visibly. No invented answer is sent.

The official `ask_user_question/format.rs` includes selected answers and freeform notes in the native tool result. For tool-call IDs identified by same-session question requests, subsequent host tool events and cached tool state retain only a fixed title, native status and identifiers; content, raw inputs/outputs and metadata are omitted. Identification uses scopes registered at frame receipt, including requests whose host handler is delayed or revoked. This avoids deliberately persisting native question-result echoes. It cannot prevent the native agent from retaining its own transcript or later paraphrasing an answer in an ordinary assistant response; no complete DLP guarantee is claimed.

Each permission/input callback receives a connection-unique typed request ID, exact `nativeSessionId`, and request-scoped abort signal. `_x.ai/session_notification` with `{sessionId,update:{sessionUpdate:'interaction_resolved',tool_call_id}}` uses a synchronous receive-frame control path to invalidate the matching reverse request and cancel its host prompt before any slow display/persistence queue without cancelling an unrelated session or the continuing turn. Reverse-request scope is registered before its handler enters that queue, so a queued-but-not-yet-displayed request is also invalidated. Prompt result receipt atomically invalidates outstanding reverse requests and aborts their host signals, preventing late approval. Reused IDs with different payloads fail; identical duplicates do not ask twice.

Standard assistant/tool/plan/status updates are forwarded with sanitized data. Assistant chunks have a run-stable `data.messageId` and `delta:true`. Raw thought chunks and stderr are not published. `_meta.usage` on a native prompt response is forwarded without fabricating token/cost values. Missing/partial native costs stay missing/partial. Native slash commands are blocked because they can invoke administrative actions or toggle permission settings.

## Cancellation and verification

Cancellation sends `session/cancel` with `cancelSubagents:true` when a prompt is active, aborts host interactions, ends stdin and terminates the managed process range. Every exit path awaits `waitForExit() === true`, the direct-child outcome and protocol handler quiescence. False, rejected or timed-out cleanup throws `AGENTS_CLEANUP_UNCONFIRMED`; callers must retain their lock and surface uncertainty. A prompt has no short request timeout while a human answer/model turn is pending, but control requests and writes have bounded deadlines. Every operation remains user-cancellable.

Default limits: 4 MiB per frame, 4,096 queued notifications/request fingerprints/tool entries, and 16 MiB pending payload/tool/answer/write budgets. Configurable limits are validated. Inactive-session actions and unsupported client services never gain filesystem/terminal access through the host.

`node --test packages/dsh-x-agents/test/grok.test.js` runs the protocol tests with injected managed-child fixtures. `test/fixtures/grok-cli.mjs` is an explicitly synthetic executable for official DSH subprocess/ToolRuntime/UI tests: normal prompts complete, `fixture:permission` requests `printf fixture`, `fixture:input` asks a color question, and `fixture:cancel` waits for cancellation. It performs no filesystem effects, credentials or model/network requests. Its configured authentication and model catalog are synthetic test data, not evidence of a real logged-in account.

Authenticated real-model behavior, platform-specific confinement, and actual xAI subscription access are not claimed verified by these fixtures.
