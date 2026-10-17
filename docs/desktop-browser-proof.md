# Native Desktop browser proof

The browser implementation is experimental until `Actual Windows Desktop browser smoke` passes for its exact commit. A source test or ordinary web-shell screenshot is not a substitute.

## Isolated execution

The dedicated job lives in the existing `desktop-package.yml` packaging entry. It runs only for relevant changes on `work/stock-chat-plugins`, or manual workflow dispatch. The older distribution matrix remains manual-only. The job checks out the fixed official kernel SHA, builds the official unsigned unpacked Windows application, and installs the plugin and deterministic local model fixture through the Desktop-owned CLI. It never patches the kernel or produces a DSH-X installer.

The application uses a new temporary DSH home. A public, deliberately invalid API-key sentinel permits the native onboarding check; the selected model is a local deterministic adapter and performs no provider inference. The unsigned build uses the official anonymous update-policy configuration with a reserved `.invalid` destination. No update-policy availability, SSO, signature or release claim is made. No signing/upload secrets, authenticated websites, private browsing data or account changes are used.

## Assertions

The driver uses Playwright's documented experimental Electron API. It checks `app.isPackaged`, the official primary document and an actual `webview` WebContents. A loopback fixture page is opened visibly. Synthetic model output invokes the real DSH tools, with explicit browser opt-in and official one-time approvals; the plugin observes a form, types a value and clicks its button. The visible guest's DOM must reflect the same value. Takeover must revoke authority while retaining that exact guest and page.

`report.json` records kernel/plugin commit, executable SHA-256, application/Electron versions, guest identity and completed assertions. Screenshots show only the local fixture. Artifacts exclude the home, sessions, credential files and executable. A failed job is an unproven feature, never a passing test.

## Current environment boundary

The pinned official Desktop build-target resolver supports mac-arm64, mac-x64 and win-x64. On the Linux cloud desktop it reports `unsupported target linux-x64`. No sandbox, protected-path or platform check is bypassed to run it. Windows CI evidence remains required. The test does not establish cross-origin frames, authenticated sites, file transfer, screen-reader accessibility, provider-driven agent quality or all supported operating systems.

## Recorded successful run

On 2026-10-17, [run 39032141251](https://github.com/csic21/dsh-x/actions/runs/39032141251) passed for plugin commit `faf0d130867180fe7ca5643ef1f7442c1e6485a8` with official kernel `1517a4dbca0a2789ff1d41ba439600f8547d23fa`. The downloaded report and both screenshots were inspected. Runtime assertions identified the packaged Windows application version `0.2.1-alpha.5`, Electron `44.7.0`, an isolated user-data directory, and a native guest of type `webview` (ID 2).

The five-tool fixture observed, typed and clicked the same visible guest. Takeover rejected a stale action and retained the guest for manual input. The executable SHA-256 was `4068dfc4346b5fe0908034ef590a452fc7cd00e9d56b3a53fcacd5e9199d2754`; the browser client SHA-256 was `1108bcea3f4b15862ab705654e897a737b99e18da677d67dec4f52fcdc6b8164`.

This evidence applies only to that commit. Later cancellation changes require their own run. Actual AI navigation, multiple tabs, closing tabs, navigation-epoch changes, popup/download/permission restrictions, and the full platform matrix remain outside this initial smoke proof. The model and webpage were local synthetic fixtures, not a paid provider or authenticated website.

The successor harness additionally checks manual navigation during a live granted turn, epoch advance and stale-input denial, followed by closing a re-granted official dock tab and checking native guest destruction and stale-action denial. These assertions remain pending until that successor commit passes on Windows. No build cache or platform workaround was introduced.
