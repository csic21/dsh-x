# Code validation — 2026-10-17

## Runtime and automated coverage

Official DSH **0.2.1-alpha.5**, Cordis **4.0.5**, Node **24.19.0**. Public API behavior was checked against official source commit `1517a4dbca0a2789ff1d41ba439600f8547d23fa`; the kernel was not modified.

All five clients build. The complete repository regression suite passes **644/644 tests**, with zero skipped or cancelled. Code's frontend suite contains **14** model/controller/compiled-factory DOM tests; its backend and native-ownership focused suite contains **47** tests. Existing Stock, Chat, Plan, and all four Agents adapters remain in the aggregate suite. `git diff --check` is clean. `npm pack --dry-run` includes the backend entry, client bundle, source, patch, and documentation.

Covered through real official Cordis, ToolRuntime, LlmRuntime, managed subprocess, approval bridges, and durable records:

- Bounded tree/source/diff browsing without Agents or a model call; worktree, staged, and merge-base…HEAD versions; before/after missing sides; deterministic diff coordinates under color, blank-context, and binary-diff attributes.
- Explicit selected paths and exact snapshot capture; final post-approval freshness checks; source edits, index changes, session/cwd changes, repository replacement, and cross-repository re-review rejection.
- Default configured DSH review with one bounded snapshot message, no session history, and zero tools; approval rejection sends no source; exact prepared config and model-visible input are persisted before stream dispatch.
- Structured severity/line/evidence/trigger validation; fabricated or out-of-scope evidence, malformed/truncated responses, tool attempts, oversized output, and sensitive-shaped output fail explicitly. Source-only checks remain unverified/not-run.
- Selected native repair under existing Agents approvals; exact nested execution ownership; active Plan/concurrent-mutation fencing; read-only native review isolation and denied escalation; post-repair stale evidence and required re-review.
- Exact Code-operation cancellation, wrong-operation rejection, pending approval/unload cancellation, late callbacks, immutable history inspection, and bounded byte/count retention.
- Traversal, symlink ancestors, external/shared Git metadata, alternate/symbolic object stores, ignored/global-ignored content, private filenames, credential-shaped text, binary/non-UTF-8 source, oversized files, and unsupported Git states.
- Compiled frontend source/before/diff views, highlighting seam, filename search, explicit scope, finding navigation, stale repair disablement, historical evidence, locale coverage, late response rejection, session reset, and operation cancellation without changing the selected browsing mode.

Independent adversarial probes additionally exercised ordinary HOME and explicitly configured global ignores, shared Git metadata outside the workspace, same-path repository replacement, malformed stream termination, and an ignored-abort late provider callback. These checks identified defects that were corrected before the final suite.

## Official DSH browser

The official installed DSH web shell loaded the linked Code plugin in an isolated cloud workspace. Browser execution uses the supported cloud computer interface. Source and diff were read from a real local Git fixture, not drawn or seeded screenshots. The first default-DSH review selected only `average.js` (257 UTF-8 before+after bytes), showed the official one-time approval, and produced one structured finding through a clearly labeled deterministic local model adapter.

The selected finding was then repaired through the existing Agents path: official launch approval, a second exact native file-edit approval, and an actual fixture edit to `average.js` verified on disk. Code retained the original finding, marked its evidence stale, disabled further repair, and required re-review. Re-review of the new 324-byte source snapshot completed with zero findings while Tests remained **not run**. The historical review reopened the original buggy source and highlighted its exact finding line; historical repair stayed disabled. English locale was selected through the actual official settings and rendered successfully. Synthetic adapters establish host integration, not authenticated model quality.

Code's Stop control was exercised while the official review approval was pending. The approval was withdrawn, the operation ended, and a third durable record remained **cancelled**, with empty findings/checks and no source sent. The UI showed Stopped / Review incomplete, not a successful or empty-clean review.

Actual layouts were checked in the official shell: wide three-pane, medium two-pane, and a narrow viewport obtained with 300% desktop-browser zoom (approximately 396 CSS pixels). A short-height collapse found during this check was fixed; scrolling then exposed readable source. This is a narrow desktop-browser check, not an actual mobile-device test. Source, diff, finding, stale repair, re-review, history, English locale, cancellation, and narrow-layout screenshots were retained as QA artifacts outside the source package.

## Limitations and non-claims

No real paid or authenticated DSH/Codex/OpenCode/Claude/Grok model call, provider billing, OAuth/login flow, credential change, account configuration, external repository upload, or PR/GitHub write was exercised by the plugin tests. Native review is optional and can fail at startup if the vendor requires writable state under strict read-only confinement; the default DSH snapshot reviewer avoids that requirement. Repairs retain the existing native runtime's approved workspace scope, not a new selected-path OS sandbox.

Review evidence is deliberately limited to explicitly selected text snapshots, with a 48 KiB before+after source budget and a 64,000-character encoded prompt limit. It cannot establish repository-wide correctness, real test execution, or that all secrets have been detected. Old findings are never automatically resolved by a repair or an empty re-review.

The pinned official LLM API does not support a `code-review` purpose. Auxiliary input is reconstructable from private Code records and attributed to the session; no unsupported session-log event or false purpose is fabricated. A crash-left storage lock fails closed and requires explicit recovery with all hosts closed. Exhaustive screen-reader, operating-system, desktop-install, and production-provider compatibility are not claimed.

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
