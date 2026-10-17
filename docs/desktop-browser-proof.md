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
