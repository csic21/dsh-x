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
- Renderer generation races: stale pre-grant sync, hide/re-show during grant, navigation during grant, takeover while an operation is pending and late result suppression.
- Fixed DOM-helper unit tests: no input values or obvious password/OTP/card targets; bounded JSON arguments cannot become page code; URL query/hash omission.
- Compiled UI registration with the real published locale runtime, English/Chinese copy, honest web-only limitation, desktop-only disabled control and responsive styles.
- Real published official ToolRuntime integration through the plugin's route/broker path, official approval acceptance/rejection and cancellation. The renderer/agent state is synthetic, not a real Electron runtime or paid model.

## Required packaged-app gate (not a local pass)

The cloud development environment is Linux x64. Official Desktop build targets are macOS arm64/x64 and Windows x64. Therefore a browser-like Linux page or mock webview is not accepted as native proof.

The dedicated Windows Desktop smoke in the packaging workflow must launch the actual prepared official packaged application, use its own primary preload and owned CLI, install this plugin explicitly, and exercise a deterministic loopback fixture through a synthetic offline LLM and the real ToolRuntime/approval UI. It must establish:

1. Conversation left / real visible owned Chromium guest right, address bar and tabs.
2. Same guest navigation, observation, native text input and click with observable fixture effects.
3. Explicit takeover revokes control, and stale/late commands cannot change the page.
4. Guest permissions/popups/download restrictions remain in force.
5. Screenshot and runtime identity evidence from the packaged application, not a web preview.

Until a run establishes those facts, status is **experimental implementation, packaged Desktop proof pending**. Windows results do not by themselves validate macOS. Native-agent browser bridges and a default-suite promotion remain deferred.
