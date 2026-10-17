# Codex adapter

The adapter uses the official CLI's default stdio app-server transport, through the injected DSH subprocess service. It never installs a runtime, reads credential files, initiates login, or starts a model turn during discovery.

## Wire and compatibility

The implementation uses stable v2 methods: `initialize`/`initialized`, `account/read`, `model/list`, `thread/start`, `thread/resume`, `turn/start`, and `turn/interrupt`. A run creates a persistent thread with `ephemeral: false`, immediately checkpoints its returned ID, and only resumes an explicitly supplied ID. A failed start or resume is never retried or converted into a fresh conversation.

Wire values follow the generated official schemas, including `on-request`, `workspace-write`, and `read-only`, rather than camel-case values shown in some prose examples. The fixtures exercise the v2 surface present in the official DSH Codex 0.153.4 integration. Discovery reports the actual executable version and checks the basic protocol; it does not certify every API of every future CLI release. Unsupported requests fail closed. No live, authenticated model turn is part of these tests.

- [Official app-server guide](https://learn.chatgpt.com/docs/app-server)
- [Official thread-start schema](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/v2/ThreadStartParams.json)
- [Official turn-start schema](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/v2/TurnStartParams.json)
- [Official user-input request schema](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/ToolRequestUserInputParams.json)
- [Official user-input response schema](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/ToolRequestUserInputResponse.json)

## Host obligations

`backendIdentity` binds the executable, native home, name-based executable lookup path, and fixed protocol/permission semantics. Native home defaults to the non-secret `CODEX_HOME` setting or the user's `.codex` directory, and can be explicitly supplied as absolute `config.codexHome`. `CODEX_HOME` and the name-based lookup `PATH` are captured into each spawn environment; credentials are never included in the identity. Hosts compare this identity on continuation and immediately before dispatch. Timing and queue-limit settings do not change backend identity.

The host passes the effective `sandboxPolicy: { mode, workspaceRoot }` on each run and confines the managed process tree when required by that policy. The adapter rejects missing policies and working directories outside the root. Native access is capped at workspace-write with network access disabled; host read-only remains read-only. Codex sandboxing does not replace the host's confinement. Restricted host access can prevent native state writes outside the workspace; that failure must be surfaced without expanding the host root or copying credentials.

Approval/input callbacks receive `nativeSessionId`, an operation-specific `id`, a per-request `signal`, and native thread/turn/item/request/connection identities in `details`. Hosts must pass that signal to their prompt service so native resolution or completion cancels stale prompts. Hosts must preserve full operation details when asking permission. The adapter declines approval details that require redaction and sets `scopeComplete: true` only for complete displayed details. Only `accept`, `decline`, and `cancel` are supported; persistent approval, policy amendment, and extra permission grants are never inferred from an allow-once answer.

Ordinary user questions map to DSH question items, and `{ answers: [{ id, selected, custom? }] }` maps back to the native answer dictionary. Missing handlers, malformed/incomplete answers, secret/login prompts, permission-grant requests, and MCP elicitation block visibly. No default answer is fabricated. An explicit rejection is mapped to `defaultRejectOptionId`; a missing/null answer cannot grant anything.

## Events and cleanup

Assistant fragments have `data.delta: true`; full items have `data.delta: false`. Both include `data.messageId`; `data.method` distinguishes item start and completion. Tool, plan, usage, native status, and safe diagnostics retain native IDs and payloads. Raw reasoning content, process stderr, credential-shaped fields, and token-shaped text are not exposed.

Cancellation requests native interruption when the turn ID is known, then terminates the managed process range. Every outcome waits for `waitForExit() === true` and the direct child's settled outcome. A failed, false, or timed-out emptiness check throws `AGENTS_CLEANUP_UNCONFIRMED`. Outbound writes and protocol requests are bounded; human answers are not silently timed out. Successful account discovery means `account/read` reported a known stored account type, without refreshing or remotely validating credentials. Unknown account/provider state remains `authenticated: null`.

Default wire limits are 4 MiB per frame, 4,096 queued events/request identities, and 16 MiB each for pending protocol payloads, active item details, and queued outbound writes. `maxFrameBytes`, `maxQueuedEvents`, and `maxQueuedBytes` configure these limits. Duplicate-request tracking retains fixed-size fingerprints rather than complete request payloads. Closing the connection cancels outstanding write waits, and cleanup also awaits protocol-handler settlement.

`test/fixtures/codex-app-server.mjs` is an executable, synthetic stdio fixture for official DSH composition/UI tests. It never contacts a provider or executes commands. Prompts containing `fixture:approval`, `fixture:input`, `fixture:hang`, or `fixture:fail` exercise the respective paths; other prompts emit representative completed events.
