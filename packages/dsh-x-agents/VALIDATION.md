# Agents validation — 2026-10-17

## Automated

Official DSH 0.2.1-alpha.5 SDK and Cordis 4.0.5; existing Stock/Chat/Plan regression suite included. Independent `npm test` builds all four clients and passes **446/446 tests**, zero skipped. Includes 19 adversarial runtime/approval cases, actual managed-stdio synthetic Codex process tests, OpenCode HTTP/SSE fixtures, client rendering and locale tests.

Covered: exact native task continuation; immutable approved prompt; late callbacks from older run; profile/backend/model/directory changes; permission scope completeness and one-time choices; rejected/closed host turn; host policy changes; active Plan coexistence; malformed/oversized streams; event budget/redaction; pending input; cancellation and unknown cleanup fencing; discovery admission/disposal; setup/model gaps; client selector hook, stale response/profile reset and composer insertion protection.

## Actual installed runtime

Official installed Codex **0.159.2** was probed in a newly isolated empty native home. Actual `--version`, app-server initialize, account/read and model/list succeeded. Authentication was false as expected. No login, credential creation, model turn or paid request was made. The fixture's synthetic version/account/model catalog is not this real-runtime observation.

## Official DSH browser

The official installed DSH web shell loaded the linked plugin in an isolated cloud workspace. Actual native UI was exercised with a local deterministic model and executable app-server protocol fixture, clearly labeled synthetic. Observed: plugin running, input-area entry, live right sidebar, runtime/model selection, protected request insertion into the existing composer, explicit Send, separate launch and native one-time approval, native event/result display and terminal state. A second explicitly version-bound turn resumed the same native thread and answered a structured native question through the official DSH question card. A third continuation was stopped from the sidebar and reached the cancelled terminal state after native interruption. The browser found a missing selector argument in the entry hook; it was fixed and a regression added.

## Not established

No authenticated Codex/OpenCode/Claude/Grok model quality, provider billing, OAuth account flow or real paid execution was tested. OpenCode was protocol-fixture tested against the pinned official v1.19.3 schema; no live user server was configured. Restricted-host native execution depends on the actual host confinement backend and fails closed if unavailable. OpenCode trusted HTTP mode does not provide host OS isolation. Child-turn permission/input mapping is unsupported where native ownership cannot be proved. No screen-reader certification, exhaustive operating-system compatibility, primary-host-agent replacement, parallel task DAG, trading or new credentials are claimed.
