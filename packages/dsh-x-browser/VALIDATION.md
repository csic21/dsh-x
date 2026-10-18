# Browser validation status

## Compatibility target

- Plugin: `dsh-x-browser@0.1.0` (experimental, explicit opt-in)
- Official DSH npm runtime: `0.2.1-alpha.5`
- Inspected upstream source: `deepseek-ai/deepseek-harness`, commit `1517a4dbca0a2789ff1d41ba439600f8547d23fa`
- Official Desktop browser protocol: `dshDesktop.protocolVersion === 1`
- Official source lockfile Electron target: `44.7.0`

No upstream source is modified, copied into this package or patched at runtime. The plugin relies on public primary-preload browser lease methods and the standard owned-webview APIs.

## Passed locally

- Client bundle build.
- Broker scope/capability isolation, single-delivery queue, exact acknowledgement, stale epoch/grant/turn rejection, current-or-exactly-next-turn binding, takeover, hide/close, workspace change, cancellation and lost-ack fail-closed tests.
- Pre-input host confirmation after DOM-helper work, exact pending-command authority and cancellation-before-input rejection; no claim of atomic cancellation across processes after input admission.
- Renderer generation races: stale pre-grant sync, hide/re-show during grant, navigation during grant, takeover while an operation is pending and late result suppression.
- Fixed DOM-helper unit tests: no input values or obvious password/OTP/card targets; bounded JSON arguments cannot become page code; URL query/hash omission.
- Compiled UI registration with the real published locale runtime, English/Chinese copy, honest web-only limitation, desktop-only disabled control and responsive styles.
- Real published official ToolRuntime integration through the plugin's route/broker path, official approval acceptance/rejection and cancellation. The renderer/agent state is synthetic, not a real Electron runtime or paid model.
- Native owner registration with real nested ToolRuntime children: one genuine parent per grant, no cross-parent metadata access, stable native-run cancellation after a child settles, and no claim after an owner closes during metadata lookup. These are synthetic ownership tests, not real OpenCode/provider proof.

## Passed packaged Windows smoke (published baseline)

[Windows workflow run 39032141251](https://github.com/csic21/dsh-x/actions/runs/39032141251) passed on 2026-10-17 for plugin commit `faf0d130867180fe7ca5643ef1f7442c1e6485a8`. The report identifies an actual packaged Windows app, DSH `0.2.1-alpha.5`, Electron `44.7.0`, and the pinned official source above. It records owned guest webContents ID `2`, type `webview`.

The smoke used a deterministic loopback page and a synthetic offline LLM through the real ToolRuntime and official approval UI. Its screenshot shows the conversation left and the visible owned guest right. The passing assertions establish:

- Manual address navigation to the fixture in the actual plugin guest.
- Model-path observation, native text input and click on that same visible guest, with fixture effects.
- Explicit takeover, rejection of a stale action, preservation of the same guest and subsequent manual input.

Evidence artifact: `desktop-browser-proof-39032141251-1`, including `report.json`, `visible-browser-proof.png` and `user-takeover.png`. Reported client SHA-256: `1108bcea3f4b15862ab705654e897a737b99e18da677d67dec4f52fcdc6b8164`.

The packaging workflow and packaged-app smoke driver were removed when the desktop app moved out of this repository. These runs remain historical evidence and are not reproducible from this plugin-only checkout; desktop qualification is owned by the separate application repository.

This result applies to that exact published baseline. The baseline smoke does not establish AI navigation lifecycle, multiple tabs, close races, downloads, popup or permission behavior, macOS compatibility, or native-agent browser bridges. Later bounded evidence is recorded below.

## Later failed qualification attempt

[Windows run 39034154065](https://github.com/csic21/dsh-x/actions/runs/39034154065), plugin commit `b127f6510ca38db5cfbbc76c52210444d9017f65`, launched the same packaged runtime and a real guest but failed before the first observation: the initial tabs tool found no visible granted tab. No text input, click or additional lifecycle assertion passed in that run. Its failure report did not capture the underlying broker error, so the cause is not established.

The proof driver now waits for the official host turn to finish before granting access, rather than only waiting for setup text to appear. Browser grant semantics remain unchanged. Additional local regressions show that a grant made during a finishing setup turn cannot authorize the following turn. Later runs record bounded, redacted turn/run/revision transitions and the actual Browser error code; turn-ended errors are no longer labeled as connection loss. Another attempt reached the closing-tab assertion but expected a structured error code in rendered ToolRuntime text. An actual ToolRuntime regression now checks that serialization contract.

## Latest passed packaged Windows lifecycle smoke

[Run 39038004598](https://github.com/csic21/dsh-x/actions/runs/39038004598) passed the deterministic Browser smoke on 2026-10-17 for commit `ee4b963db3449b07b8b7d95c6aa0e23b6562b13f`, with the same official DSH `0.2.1-alpha.5` / Electron `44.7.0` runtime. Its downloaded report confirms all five assertions:

1. Actual packaged application, primary document and owned native `webview`.
2. Real ToolRuntime observation, typing and clicking on the same visible guest, including the pre-input host-confirmation path.
3. Takeover, stale-action denial and subsequent manual input on that guest.
4. Manual navigation preserves the guest, advances the document epoch, revokes the live-turn grant and rejects stale input.
5. Closing the granted official dock tab removes the broker identity and destroys the native guest; stale actions are denied.

Client SHA-256: `b87e8d562a2e961b2c0aed0c03db3c8f0e181e0dc77e18b526c29a3951b94136`. Packaged executable SHA-256: `4068dfc4346b5fe0908034ef590a452fc7cd00e9d56b3a53fcacd5e9199d2754`. This deterministic local-fixture smoke is separate from the real OpenCode/provider proof, which remains pending.

## Remaining packaged-app qualification

The cloud development environment is Linux x64. Official Desktop build targets are macOS arm64/x64 and Windows x64. Therefore a browser-like Linux page or mock webview is not accepted as native proof.

The dedicated Windows Desktop smoke previously lived in this repository's packaging workflow. It launched the actual prepared official packaged application, used its own primary preload and owned CLI, installed this plugin explicitly, and exercised a deterministic loopback fixture through a synthetic offline LLM and the real ToolRuntime/approval UI. That workflow is now part of the separate desktop application repository. The broader qualification gate remains:

1. Conversation left / real visible owned Chromium guest right, address bar and tabs.
2. Same guest navigation, observation, native text input and click with observable fixture effects.
3. Explicit takeover revokes control, and stale/late commands cannot change the page.
4. Guest permissions/popups/download restrictions remain in force.
5. Screenshot and runtime identity evidence from the packaged application, not a web preview.

Current status: **experimental, current bounded Windows native lifecycle smoke passed; real OpenCode/provider interaction and broader restriction/platform matrix pending**. AI-requested navigation, multiple tabs, download/popup/permission behavior and macOS are not established by this smoke. Codex/Claude/Grok browser bridges and a default-suite promotion remain deferred.

## TypeScript migration — 2026-10-18

- Host and client sources and package tests now use TypeScript under the shared strict configuration. Published entry: `lib/index.js`; the shared builder emits host JavaScript/declarations and the client bundle.
- `pnpm run typecheck` and `pnpm run build` pass. Browser + Code focused tests pass **65/65**. Root integration tests pass **189**, with **2 skipped** and no failures.
- Full regression with `TMPDIR=/private/tmp` and local loopback listeners allowed: **756 total, 753 passed, 2 skipped, 1 failed**. The failure is the unchanged Plan ACP input-closure fixture (`packages/dsh-x-plan/test/acp.test.js:23`): expected `EPIPE`, received `DSH_X_PLAN_ACP_CLOSED`. No Plan runtime or tests were changed by this migration.
- `npm pack --dry-run` includes the built host entry, declarations, client bundle, patch and documentation, without source/test files. `git diff --check` passes. No live Desktop/provider validation was repeated for this source migration.

## Completed TypeScript migration — 2026-10-18

- All seven workspace packages use the shared TypeScript builder. Strict type checking includes source and package tests; the temporary Code `allowJs` bridge is removed. Host entries load from `lib/index.js`, with declarations and lazy client factories included in package checks.
- `pnpm run typecheck` and `pnpm run build` pass. Full regression (`TMPDIR=/private/tmp pnpm test`, with local loopback listeners allowed): **762 tests, 760 passed, 0 failed, 2 skipped**. Skips are the unavailable upstream ApprovalPanel source fixture and a platform-specific non-macOS CLI check.
- Plan's ACP input-closure fixture now reads its handshake synchronously before closing fd 0, preserving open stdout and the exact `EPIPE` assertion. Closing a descriptor behind an active Node stdin stream could terminate the fixture before the host write. The test passes within the complete regression.
- Stock's compiled Workbench fixture intercepts the migrated `.tsx` chart module; its twelve cases pass with the intended chart seam. Numeric indicator and dataset validation behavior is retained.
- Package dry runs verify built entries, declarations, client bundles, chart license notices and Agents protocol notes; TypeScript source/tests are excluded from delivery. `git diff --check` is clean.

No provider authentication, real model calls, Electron UI, or paid/network market-data calls are claimed by these synthetic tests.
