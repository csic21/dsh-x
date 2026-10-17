# Agents validation — 2026-10-17

## Automated

Official DSH 0.2.1-alpha.5 SDK and Cordis 4.0.5; existing Stock/Chat/Plan regression suite included. Independent `npm test` builds all four clients and passes **581/581 tests**, zero skipped. Includes the original 19 adversarial runtime/approval cases plus 16 Claude/Grok independent adversarial cases, actual managed-stdio synthetic Codex/Grok processes, the real Claude Agent SDK 0.3.302 with an injected synthetic CLI, OpenCode HTTP/SSE fixtures, ten additional official-host Claude/Grok integrations, client rendering and locale tests.

Covered: exact native task continuation; immutable approved prompt; late callbacks from older run; profile/backend/model/directory changes; permission scope completeness and one-time choices; rejected/closed host turn; host policy changes; active Plan coexistence; malformed/oversized streams; event budget/redaction; pending input; cancellation and unknown cleanup fencing; discovery admission/disposal; setup/model gaps; client selector hook, stale response/profile reset and composer insertion protection.

## Actual installed runtime

Official installed Codex **0.159.2** was probed in a newly isolated empty native home. Actual `--version`, app-server initialize, account/read and model/list succeeded. Authentication was false as expected. No login, credential creation, model turn or paid request was made. The fixture's synthetic version/account/model catalog is not this real-runtime observation.

Official Claude CLI **2.1.302** and Grok CLI **1.0.62** were also checked with `--version` in isolated empty native homes. Their normal discovery does not initialize an agent or authenticate. Native protocol execution below uses synthetic executable fixtures; it does not establish authenticated vendor execution.

## Official DSH browser

The official installed DSH web shell loaded the linked plugin in an isolated cloud workspace. Actual native UI was exercised with a local deterministic model and executable app-server protocol fixture, clearly labeled synthetic. Observed: plugin running, input-area entry, live right sidebar, runtime/model selection, protected request insertion into the existing composer, explicit Send, separate launch and native one-time approval, native event/result display and terminal state. A second explicitly version-bound turn resumed the same native thread and answered a structured native question through the official DSH question card. A third continuation was stopped from the sidebar and reached the cancelled terminal state after native interruption. The browser found a missing selector argument in the entry hook; it was fixed and a regression added.

The second batch exercised Claude selection → protected composer request → explicit Send → official launch approval → native tool approval → synthetic result in the live sidebar. Grok selection → launch approval → the official DSH question card → selection and submission → synthetic completion also passed after restarting the server with the final adapter. The question answer is not echoed in stored event data. Four-runtime selection and bounded expandable event details are present. A stale preparation notice discovered during this UI test was fixed, regression-tested and rechecked.

## Not established

Claude ordinary project settings, plugins, skills and MCP integrations are intentionally disabled in this first adapter; managed enterprise hooks can still apply. Grok native client filesystem/terminal requests and unprovable child-request ownership are unsupported. Without a prepared catalog, first Claude/Grok turns use the native default model; explicit approved directory preparation now enables a native-advertised selection before the first task. DSH profile isolation concerns workbench records, not independently isolated vendor credentials.

No authenticated Codex/OpenCode/Claude/Grok model quality, provider billing, OAuth account flow or real paid execution was tested. OpenCode was protocol-fixture tested against the pinned official v1.19.3 schema; no live user server was configured. Restricted-host native execution depends on the actual host confinement backend and fails closed if unavailable. OpenCode trusted HTTP mode does not provide host OS isolation. Child-turn permission/input mapping is unsupported where native ownership cannot be proved. No screen-reader certification, exhaustive operating-system compatibility, primary-host-agent replacement, parallel task DAG, trading or new credentials are claimed.

## Model catalog preparation increment

A separate approved operation initializes Claude/Grok only to obtain native model metadata, without submitting a user prompt or starting a task. Actual official ToolRuntime/SubprocessLocal integration with synthetic native peers verifies both engines can populate a directory before the first task and then run the explicitly chosen model. Adapter tests assert zero task/session creation RPCs for Grok and zero user-prompt/persistence/resume flags for the real Claude SDK. Metadata retains unconfigured/unverified authentication; directory membership is not tested model access.

The final model-directory increment passes **581/581** complete tests, including **26** independent model-operation adversarial cases. The official DSH cloud browser was separately exercised for both Claude and Grok: the new directory button prepared a request without sending it, explicit Send showed the official native-initialization approval, approval returned a dynamic fixture directory, and the selector accepted the advertised model. The prior Grok task and its result remained unchanged. These screenshots demonstrate actual host UI with synthetic model metadata, not authenticated provider availability.
