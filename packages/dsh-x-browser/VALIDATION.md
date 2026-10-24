# Browser validation status

## Compatibility target

- Plugin: `dsh-x-browser@0.7.0` (experimental, explicit opt-in)
- Official DSH npm runtime: `0.2.1-rc.3` (`compatibility/policy.json` baseline)
- Inspected upstream source: commit `687f282e8625c6b8d11ff58211a90524be2e4317`
- Official Desktop browser protocol: `dshDesktop.protocolVersion === 1`
- Historical packaged runs below name their own runtime and Electron target.

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

## CDP backend evidence (0.7.0)

- Environment: `agent-browser` 0.39.1 from npm, Chrome stable, macOS arm64, 2026-10-20. The CLI was launched with `--args --no-sandbox --executable-path ...` only because this repository's agent sandbox blocks Chrome's own sandbox; that is a probe workaround, not a plugin default.
- Captured wire contract: one JSON envelope per call (`{success, data, error}`); failures still exit 0, so only `success` is authoritative; every `data` carries an ignored `lifecycle` block; `snapshot` returns `{origin, refs, snapshot}`; `tab list` returns `{tabs}`; `open` returns `{targetId,title,url}`; `tab new` returns `{tabId,targetId,url}`.
- Real runs through `cdpRuntime → agent-browser backend → CLI`:
  - `open → observe(e1) → press PageDown → observe → click`, epochs 2 → 3 → 4 → 5 → 6, on `https://example.com/` (the gated test runs this exact sequence).
  - Two tabs (`t1`, `t2`) via `tab new`, observing the second and closing the first while the second stays alive.
- Automated coverage: scripted CLI tests cover argv construction, envelope parsing, version gating, stale refs, action mapping, domain allowlists, approval rejection, cancellation, missing binary, timeouts, oversized output and dispose idempotency. The same conformance suite runs against the fake, embedded and scripted CDP backends.
- Not covered: packaged Desktop, window/headless lifecycle, proxy/CA settings, downloads, popups, permissions, Windows, real DSH UI sessions, and any provider or paid-model call.
- Reproduce with an installed CLI (default `agent-browser` on PATH):

  ```sh
  DSH_X_BROWSER_REAL=1 node --test packages/dsh-x-browser/test/browser-real.test.ts
  # or a printed summary without the test runner
  node scripts/browser-cdp-smoke.mjs
  ```

  Optional env: `DSH_X_BROWSER_CLI` (executable), `DSH_X_BROWSER_URL` (default `https://example.com/`), `DSH_X_BROWSER_ARGS` (JSON array of global CLI args), `DSH_X_BROWSER_HOME` (child HOME, keeps sessions out of your real home). The test skips unless `DSH_X_BROWSER_REAL=1`.

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

Current status: **experimental**. The embedded backend has Web-side unit and integration evidence in this checkout plus historical packaged Windows smokes; the CDP backend has local real-Chrome adapter evidence only. No packaged Desktop run for either backend is recorded here, and no Codex, Claude, Grok or OpenCode browser bridge ships. Downloads, popups, permissions, proxy/CA behavior, Windows CDP and real DSH UI sessions are not established by this repository's automation.

## Current validation

- Host and client sources and package tests use the shared strict TypeScript configuration. `pnpm run typecheck` and `pnpm run build` pass.
- Browser unit and integration tests cover the broker, ownership, runtime, grant/approval, takeover, synthetic guest paths, and the CDP CLI contract/backend/runtime/tool layers (94 tests at the time of writing: 93 pass, 1 opt-in real-browser test skipped by default).
- Root tests load the built `lib/` entries and check the three-package artifacts, peer ranges and the generated market index.
- No Electron UI, packaged application, provider login, real model call or paid market-data request is claimed.

See the repository's current test run for counts; historical suite-era numbers are intentionally not repeated here.
