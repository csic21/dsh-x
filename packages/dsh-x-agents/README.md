# Agents / 原生 Agent 工作台

First-stage native runtime delegation for DSH 0.2.1-alpha.5. DSH coordinates the current host conversation; Codex or OpenCode owns its delegated native turn. Selecting an Agent in the sidebar **prepares a request in the existing composer**; the user sends it. It does not silently change DSH's primary model or send a second hidden conversation.

## Current capabilities

- Codex app-server stdio: persistent native thread identity, explicit continuation, assistant/tool/plan/usage events, one-time native permission decisions, supported structured questions, cancellation and process cleanup.
- OpenCode HTTP/OpenAPI/SSE: existing authenticated loopback server, native sessions, model discovery, event stream, permission/question responses, explicit resume and abort. Requires explicit trusted-external configuration and a host policy that already permits that mode. Restricted hosts report unsupported; this plugin never weakens host settings.
- Agents header entry and right sidebar, current task separate from historical tool cards, Chinese/English, runtime/model discovery, guarded composer insertion and exact-run cancellation.
- Claude/Grok catalog entries are explicitly not integrated in this stage. Native capabilities vary and unsupported requests block visibly.

A native turn ending is not proof of tests passing or task acceptance. Worktree creation, parallel delegation, autonomous routing, native UI embedding, vendor login screens, multimodal attachments and an independent primary-agent session lifecycle are not implemented in this release.

## Installation

Use the official DSH plugin mechanism from the repository root:

```sh
npm ci
npm run build
dsh plugin --profile web add link:$(pwd)/packages/dsh-x-agents
```

The root `scripts/link-plugins.mjs` links all four plugins. No kernel modification is needed. Existing Plan, Stock and Chat remain available. An active Plan must be completed or explicitly abandoned before external execution; Agents does not bypass Plan approval/scope.

## Runtime setup

Install and sign into vendor tools yourself using their official instructions. The plugin does not run `npx`, install arbitrary adapters, create credentials or launch browser login flows.

- Codex: official https://developers.openai.com/codex/app-server/ and https://github.com/openai/codex . Set `DSH_X_AGENTS_CODEX_COMMAND` to the trusted installed executable if it is not `codex`. Optional plugin `codex.codexHome` binds a separate absolute native profile. Discovery initializes app-server, reads account/model availability and exits; it does not start a model turn.
- OpenCode: official https://opencode.ai/docs/server/ . Connect an existing password-protected loopback service through `DSH_X_AGENTS_OPENCODE_URL`, `DSH_X_AGENTS_OPENCODE_USERNAME` and the locally supplied `DSH_X_AGENTS_OPENCODE_PASSWORD`. Do not put passwords in plugin source, URLs, prompts or committed configuration. There is no automatic server startup or credential generation. `trustedExternalRuntime: true` is an explicit administrator selection, not a recommended default. A supported isolated service deployment should be preferred once the host can establish it.

OpenCode's server authentication proves access to that server, not successful model-provider authentication. Models may still reject requests because of provider setup or billing. Provider-specific errors are reported without silently switching to another agent/model.

## Approval and isolation

Every turn starts inside an actual DSH tool invocation and open host turn, with official DSH approval. Native requests retain their own request/session identity and a unique offered one-time choice. Host `allowed-once` never maps to permanent/session-wide approval. Rejection maps to a documented native reject choice; cancelled/unavailable/ambiguous requests are not granted. Sensitive or incompletely displayed permission scopes fail closed. Unsupported secure input requires the vendor's own secure flow.

Codex subprocesses inherit the resolved DSH file-effect policy when the host supports full enforcement, plus Codex's native on-request/workspace-write ceiling. DSH file-effect confinement is **not** a claim of network isolation, secret-read isolation or protection against all external processes. OpenCode explicitly provides no OS sandbox (https://github.com/anomalyco/opencode/blob/v1.19.3/SECURITY.md); its permission dialogs do not substitute for one. HTTP execution is blocked in restricted host modes.

Tasks are bound to the launcher profile, host session, canonical directory, runtime/model, backend identity and run ID. Concurrent mutations in the same host session are fenced while runtime operations own it. Other DSH sessions, pre-existing background jobs and external editors are not an isolated worktree or security boundary. No blanket write authority is granted through the workbench.

## Persistence, cancellation and recovery

Task state is stored under the current launcher's profile directory `.dsh-x-agents`, with a random non-secret scope ID. It is not shared through browser localStorage. Native session IDs remain vendor-owned. Continuation is explicit and version-bound; changing model, backend, native profile or working directory requires a new task.

Cancellation is bound to exact profile/session/task/run, independent of streaming revisions. It requests native interruption and waits for quiescence. Unknown cleanup retains a durable fence and displays interrupted status. Restart does not replay a prompt or automatically unlock a possibly live process. Inspect the relevant native process/server and stop it before administrator recovery; this version intentionally provides no unsafe one-click recovery/unlock button.

Events and history have bounded storage budgets. Old stream events can be trimmed, so this is an operational log rather than a complete immutable audit archive. Known sensitive key/value shapes are withheld; this is conservative protection, not comprehensive secret detection. Review task content and vendor configuration before allowing code/data to leave the workspace. Passwords and question answers are not intentionally persisted by the workbench.

## Validation

Tests use explicit synthetic protocol fixtures and the real official DSH ToolRuntime/approval/subprocess services. No fixture result establishes real vendor model quality, billing or account access. See `VALIDATION.md` for exact observed results and limitations.

Profile isolation here covers workbench records and task identity. It does not automatically create separate vendor accounts or billing: Codex may share its configured `CODEX_HOME`, and OpenCode uses the existing server's provider credentials. Configure distinct vendor profiles explicitly when that separation is required. OpenCode cancellation establishes the native service's reported idle/pending-request state, not independent proof that every OS descendant process has exited.
