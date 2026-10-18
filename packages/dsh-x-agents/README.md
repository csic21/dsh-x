# Agents / 原生 Agent 工作台

Native runtime delegation for DSH 0.2.1-rc.2. DSH coordinates the current host conversation; the selected native runtime owns its delegated native turn. Selecting an Agent in the sidebar **prepares a request in the existing composer**; the user sends it. It does not silently change DSH's primary model or send a second hidden conversation.

## Current capabilities

- Codex app-server stdio: persistent native thread identity, explicit continuation, assistant/tool/plan/usage events, one-time native permission decisions, supported structured questions, cancellation and process cleanup.
- OpenCode HTTP/OpenAPI/SSE: existing authenticated loopback server, native sessions, model discovery, event stream, permission/question responses, explicit resume and abort. Requires explicit trusted-external configuration and a host policy that already permits that mode. Restricted hosts report unsupported; this plugin never weakens host settings.
- Experimental owned OpenCode browser mode: fresh per-operation native service and home, public zero-price catalog only, managed host confinement, explicit per-run Browser opt-in, and existing DSH Browser approvals. No continuation, account credentials or global MCP registration. See [the pinned protocol and isolation notes](src/adapters/opencode-owned-protocol.md).
- Agents input-dock entry and right sidebar, current task separate from historical tool cards, Chinese/English, runtime/model discovery, guarded composer insertion and exact-run cancellation.
- Claude: pinned official Agent SDK 0.3.302 / native CLI 2.1.302 with managed process injection, native session continuation, streamed tools/results and one-time requests. This adapter supports explicitly configured API / official cloud-provider authentication, not a custom Claude subscription login flow.
- Grok: official CLI 1.0.62 ACP over owned stdio (`agent --no-leader`), native sessions/models, tools, one-time permissions, user questions and cancellation. No background leader attachment or automatic login.
- Claude/Grok discovery only checks the executable version. Native initialization happens after official launch approval, because it can have startup effects. Authentication validity and billing remain unverified; missing native setup blocks before a user model turn. Models are selectable only after native advertisement, with a final adapter check before dispatch.

Native capabilities vary; unsupported requests block visibly. These adapters preserve the native agent loops but do not promise every vendor plugin, UI command, or permission mode is available.

A native turn ending is not proof of tests passing or task acceptance. Worktree creation, parallel delegation, autonomous routing, native UI embedding, vendor login screens, multimodal attachments and an independent primary-agent session lifecycle are not implemented in this release.

## Installation

Use the official DSH plugin mechanism from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run build
dsh plugin --profile web add link:$(pwd)/packages/dsh-x-agents
```

The root `scripts/link-plugins.mjs` links the configured plugin suite. No kernel modification is needed. Existing Plan, Stock and Chat remain available. An active Plan must be completed or explicitly abandoned before external execution; Agents does not bypass Plan approval/scope.

## Runtime setup

For account-backed modes, install and sign into vendor tools yourself using their official instructions. The plugin does not run `npx`, install arbitrary adapters, create credentials or launch browser login flows.

- Codex: official https://developers.openai.com/codex/app-server/ and https://github.com/openai/codex . Set `DSH_X_AGENTS_CODEX_COMMAND` to the trusted installed executable if it is not `codex`. Optional plugin `codex.codexHome` binds a separate absolute native profile. Discovery initializes app-server, reads account/model availability and exits; it does not start a model turn.
- OpenCode existing-server mode: official https://opencode.ai/docs/server/ . Connect an existing password-protected loopback service through `DSH_X_AGENTS_OPENCODE_URL`, `DSH_X_AGENTS_OPENCODE_USERNAME` and the locally supplied `DSH_X_AGENTS_OPENCODE_PASSWORD`. Do not put passwords in plugin source, URLs, prompts or committed configuration. There is no automatic server startup or credential generation. `trustedExternalRuntime: true` is an explicit administrator selection, not a recommended default. The separate opt-in owned browser mode below does not use this server or its credentials.

Owned browser-only setup: configure `opencode: { mode: 'owned-browser', executable: '/absolute/path/to/opencode' }` using the inspected official v1.19.3 binary. Use an isolated writable workspace outside a Git checkout. Prepare the model catalog with official approval, select an advertised `free:true` entry, then start a new task; add `browser:true` only when the user explicitly wants the granted embedded Browser. The native runtime can install its own official helper dependencies into temporary state. See [exact restrictions and lifecycle](src/adapters/opencode-owned-protocol.md).

OpenCode's server authentication proves access to that server, not successful model-provider authentication. Models may still reject requests because of provider setup or billing. Provider-specific errors are reported without silently switching to another agent/model.

Official protocol notes: [Claude](src/adapters/claude-protocol.md), [Grok](src/adapters/grok-protocol.md). References: https://platform.claude.com/docs/en/agent-sdk/overview and https://docs.x.ai/build/overview . The adapter notes pin the exact package/protocol evidence and distinguish tested fixtures from live authentication.

### Claude and Grok configuration

- Claude uses the exact official SDK dependency, including its matching platform binary. `DSH_X_AGENTS_CLAUDE_COMMAND` optionally selects an already trusted, matching native executable. `claude.configDir` selects an absolute native configuration directory. Provider environment configuration belongs in private local `claude.env`, not committed source, prompts, browser state or workbench event logs. The adapter does not copy arbitrary ambient provider secrets into the SDK. It does not create credentials, invoke login, or collect subscription tokens.
- Grok uses an already installed official CLI. `DSH_X_AGENTS_GROK_COMMAND` selects that executable and `grok.nativeHome` selects its native profile. Install and authenticate through xAI's official instructions yourself. The adapter never calls ACP `authenticate`, since some methods can save API keys or start interactive login.

Only version queries run during connection inspection. Approved initialization can read native configuration and run vendor startup behavior. Grok may refresh existing authentication, synchronize configured plugins or perform native state/worktree maintenance. Claude ordinary user/project settings, custom MCP, plugins and skills are excluded by this first adapter; enterprise-managed hooks can still apply. These are capability boundaries, not a claim that the complete vendor UI has been reproduced.

The first approved turn can use the native default model. Advertised models from initialization become available to the workbench for subsequent new tasks; continuing an existing task keeps its original model selection. A missing/expired account or inaccessible model is shown as blocked or failed, without silently switching providers.

## Approval and isolation

Every turn starts inside an actual DSH tool invocation and open host turn, with official DSH approval. Native requests retain their own request/session identity and a unique offered one-time choice. Host `allowed-once` never maps to permanent/session-wide approval. Rejection maps to a documented native reject choice; cancelled/unavailable/ambiguous requests are not granted. Sensitive or incompletely displayed permission scopes fail closed. Unsupported secure input requires the vendor's own secure flow.

Native subprocesses inherit the resolved DSH file-effect policy when the host supports full enforcement, plus each adapter's stated native permission controls (Codex has an on-request/workspace-write ceiling). DSH file-effect confinement is **not** a claim of network isolation, secret-read isolation or protection against all external processes. OpenCode explicitly provides no OS sandbox (https://github.com/anomalyco/opencode/blob/v1.19.3/SECURITY.md); its permission dialogs do not substitute for one. Existing external-server HTTP execution is blocked in restricted host modes. Owned browser mode spawns its own managed process and requires full host confinement when the host is restricted.

Native runtimes may need to write their own state directories during startup. Those writes must already be permitted by the host policy; the plugin does not add filesystem exceptions or loosen the policy. A constrained host may therefore report setup or startup failure even when the executable is installed.

Tasks are bound to the launcher profile, host session, canonical directory, runtime/model, backend identity and run ID. Concurrent mutations in the same host session are fenced while runtime operations own it. Other DSH sessions, pre-existing background jobs and external editors are not an isolated worktree or security boundary. No blanket write authority is granted through the workbench.

## Persistence, cancellation and recovery

Task state is stored under the current launcher's profile directory `.dsh-x-agents`, with a random non-secret scope ID. It is not shared through browser localStorage. Native session IDs remain vendor-owned. Continuation is explicit and version-bound; changing model, backend, native profile or working directory requires a new task.

Cancellation is bound to exact profile/session/task/run, independent of streaming revisions. It requests native interruption and waits for quiescence. Unknown cleanup retains a durable fence and displays interrupted status. Restart does not replay a prompt or automatically unlock a possibly live process. Inspect the relevant native process/server and stop it before administrator recovery; this version intentionally provides no unsafe one-click recovery/unlock button.

Events and history have bounded storage budgets. Old stream events can be trimmed, so this is an operational log rather than a complete immutable audit archive. Known sensitive key/value shapes are withheld; this is conservative protection, not comprehensive secret detection. Review task content and vendor configuration before allowing code/data to leave the workspace. Passwords and question answers are not intentionally persisted by the workbench.

## Validation

Tests use explicit synthetic protocol fixtures and the real official DSH ToolRuntime/approval/subprocess services. No fixture result establishes real vendor model quality, billing or account access. See `VALIDATION.md` for exact observed results and limitations.

Profile isolation here covers workbench records and task identity. It does not automatically create separate vendor accounts or billing: Codex may share its configured `CODEX_HOME`, Claude its `configDir`, Grok its `nativeHome`, and existing-server OpenCode uses that server's provider credentials. Owned browser-only OpenCode instead uses a new empty native home and public free route for each operation. Configure distinct vendor profiles explicitly when that separation is required. OpenCode cancellation establishes the native service's reported idle/pending-request state, not independent proof that every OS descendant process has exited.

### Prepare and refresh model catalogs

Use `dsh_x_agents_models` with `{runtime, scope}` from the current snapshot. The workbench prepares this request in the existing composer; the user sends it and grants the official one-time initialization approval. It does not submit a task prompt or overwrite the current task. Claude/Grok no longer require a first default-model task merely to populate the selector. Native initialization can run managed hooks or maintain vendor state, so it is never silently substituted for a status refresh.

Codex reads and follows `model/list` pagination; OpenCode reads models under connected providers from `/provider` (still subject to the explicitly trusted external-runtime boundary). Claude reads the official SDK initialization response through `supportedModels()`. Grok reads ACP initialization model state without creating/loading a session. No model IDs are hardcoded, no login is performed, and no paid inference probe is sent. Native initialization/hooks can have their own side effects; this is not a promise that arbitrary configured extensions cannot contact services.

Model catalogs carry fetch/expiry timestamps, source, truncation and failure state. After five minutes they are visibly stale. The UI status-refresh button only reads the snapshot and never extends freshness. The separate setup-check tool re-queries Codex app-server and trusted OpenCode providers, but only checks Claude/Grok versions and does not refresh their native directories. Explicit catalog preparation refreshes the selected directory. The in-memory cache is bound to runtime backend identity, native version, working directory and current DSH profile/session, and clears on plugin restart. Credential contents are never hashed as account IDs. An account changed outside this process cannot be detected instantaneously; a listed model is not evidence of account entitlement, remaining quota, price or successful inference. Run startup rechecks the runtime and selected model. Continuations retain the original runtime/model; choose a new task to switch models.

At most 2,000 normalized entries are projected to the workbench; excess is visibly marked truncated. A failed Codex page discards the incomplete new list rather than presenting partial results as a successful catalog. A failed explicit refresh retains a previous directory with a failure marker. Unknown native cleanup retains a durable operation fence, visible after restart, without replacing the user's existing task. Verify the native process has stopped before manual recovery; the plugin never automatically replays the operation.

### Remaining extension boundaries

Grok's ACP filesystem and terminal client services are not advertised by this host. The inspected official implementation falls back to native `LocalFs` and `TerminalRunner`; this does not remove Grok's own file or command tools. A host bridge would mainly add host-level mediation/editor integration and requires a separate lifecycle/identity design.

Claude skills are executable workflow extensions: they may grant tools, expand commands, run hooks or fork agents. A skills-name allowlist alone is insufficient. Project/plugin extensions therefore remain disabled in this batch. Future opt-in support needs explicit trusted content/path manifests and separate tool/hook/MCP ownership rules; no unknown project hooks or MCP servers are loaded by this change.

## TypeScript development

Host sources live in `src/` with entry `src/index.ts`; browser sources are in `src/client/`, and package tests are `test/*.test.ts`. The shared builder emits host JavaScript and declarations into `lib/` and bundles `lib/client.js`. `main` and the root export use `./lib/index.js`; built artifacts ship with the package and remain tracked in this repository.

```sh
pnpm --filter dsh-x-agents run typecheck
pnpm --filter dsh-x-agents run build
pnpm --filter dsh-x-agents test
```

The root `pnpm test` builds every package before running source unit tests and built-entry integration tests.
