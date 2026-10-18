# Plan upgrade validation — 2026-10-17

## Automated checks

- `npm test`: all plugin client builds completed; **319 tests passed**, zero failed or skipped.
- Independent read-only rerun of `node --test packages/*/test/*.test.js test/*.test.js`: **319 passed**.
- `git diff --check`: clean.
- Regression coverage includes immutable approval races, rejected approval plus baseline drift, metadata tampering, repository replacement and unrelated HEAD, checks between HEAD changes, in-flight mutation exclusion, uncertain process cleanup, ignored paths, dangling symlinks, staged shadow content, deterministic failure precedence, and legacy migration without inherited authorization.
- Client tests cover Chinese/English switching, metadata fallback, historical snapshots, real file/inspection actions, and preventing contradictory or incomplete evidence from appearing passed.

## Official DSH browser validation

Tested with official DSH `0.2.1-alpha.5`, isolated cloud workspace/profile, native Chromium, and local deterministic ACP/model fixtures. No real Codex, Claude, or Grok model request or account credential was used. The fixture label remains visible in the UI.

Observed end to end:

1. Plan card shows goal, roles, revision, file/step/check counts, and historical-snapshot label.
2. A write attempted before approval is blocked.
3. Native approval shows the captured version, SHA-256, repository baseline, file scope and commands; rejection leaves the plan unapproved.
4. Approval survives server restart. A scoped write then changes the actual isolated test file.
5. Review asks for explicit command approval, explaining that commands may write artifacts; its nested standard bash check exits zero through the official tool runtime.
6. A malformed fixture reviewer answer produces `inconclusive` / `needs_user`, even though the command passed.
7. Reapproval creates revision 2 without undoing existing work. With a valid fixture verdict, another review produces `completed` with one passed check and the task-relative file change recorded.
8. The Chinese dark-theme task card displays the final passed state and check evidence. English/locale fallback and responsive markup are covered by component tests; this final browser run did not repeat a full English/narrow-screen visual matrix.

## Remaining integration boundaries

- Real vendor authentication, adapter release compatibility, paid model behavior and production model quality are **not verified**. See ADAPTERS.md for capability and version requirements; unsupported read-only modes fail closed.
- Evidence is bounded, Git-visible source/worktree evidence, not a complete filesystem or operating-system sandbox. Excluded, oversized or ambiguous evidence blocks completion. Index divergence is checked separately.
- Other sessions, external editors and background jobs predating observation are not isolated. Recovery of a retained uncertain-process lock requires operator investigation; it does not silently resume.
- There is no automatic rollback or autonomous publishing. Execution uses the current DSH session. See README.md and UPGRADE.md for state and approval semantics.
- Existing repository CI is manual-dispatch; local test results are not an assertion that GitHub Actions ran.

## Completed TypeScript migration — 2026-10-18

- All seven workspace packages use the shared TypeScript builder. Strict type checking includes source and package tests; the temporary Code `allowJs` bridge is removed. Host entries load from `lib/index.js`, with declarations and lazy client factories included in package checks.
- `pnpm run typecheck` and `pnpm run build` pass. Full regression (`TMPDIR=/private/tmp pnpm test`, with local loopback listeners allowed): **762 tests, 760 passed, 0 failed, 2 skipped**. Skips are the unavailable upstream ApprovalPanel source fixture and a platform-specific non-macOS CLI check.
- Plan's ACP input-closure fixture now reads its handshake synchronously before closing fd 0, preserving open stdout and the exact `EPIPE` assertion. Closing a descriptor behind an active Node stdin stream could terminate the fixture before the host write. The test passes within the complete regression.
- Stock's compiled Workbench fixture intercepts the migrated `.tsx` chart module; its twelve cases pass with the intended chart seam. Numeric indicator and dataset validation behavior is retained.
- Package dry runs verify built entries, declarations, client bundles, chart license notices and Agents protocol notes; TypeScript source/tests are excluded from delivery. `git diff --check` is clean.

No provider authentication, real model calls, Electron UI, or paid/network market-data calls are claimed by these synthetic tests.
