# Stock validation

## Completed TypeScript migration — 2026-10-18

- All seven workspace packages use the shared TypeScript builder. Strict type checking includes source and package tests; the temporary Code `allowJs` bridge is removed. Host entries load from `lib/index.js`, with declarations and lazy client factories included in package checks.
- `pnpm run typecheck` and `pnpm run build` pass. Full regression (`TMPDIR=/private/tmp pnpm test`, with local loopback listeners allowed): **762 tests, 760 passed, 0 failed, 2 skipped**. Skips are the unavailable upstream ApprovalPanel source fixture and a platform-specific non-macOS CLI check.
- Plan's ACP input-closure fixture now reads its handshake synchronously before closing fd 0, preserving open stdout and the exact `EPIPE` assertion. Closing a descriptor behind an active Node stdin stream could terminate the fixture before the host write. The test passes within the complete regression.
- Stock's compiled Workbench fixture intercepts the migrated `.tsx` chart module; its twelve cases pass with the intended chart seam. Numeric indicator and dataset validation behavior is retained.
- Package dry runs verify built entries, declarations, client bundles, chart license notices and Agents protocol notes; TypeScript source/tests are excluded from delivery. `git diff --check` is clean.

No provider authentication, real model calls, Electron UI, or paid/network market-data calls are claimed by these synthetic tests.

## Market panorama — 2026-10-18

- `pnpm --filter dsh-x-stock test`: 116 tests, 0 failed. Host tests use offline fake Tencent payloads; UI tests use jsdom with explicit fixtures. No test requires a network or a provider credential.
- `pnpm run typecheck` and the full `pnpm test` regression pass.
- Manual live smoke (not a committed test): the opt-in provider returned 6 indices, 31 level-1 and 124 level-2 Shenwan boards, 5,577 breadth rows; RPC responses measured about 36 KB for overview, 4 KB for breadth and 27 KB for one board detail.
- Chrome headless screenshots were used to inspect the dashboard and sector-detail layout in a light theme. This is a visual smoke check, not a Desktop acceptance test.
- The market source remains unofficial, unlicensed, locally opt-in and disabled by default. No authenticated, real-time, Level-2, historical, fundamental or trading feed is claimed.

## Market source switch — 2026-10-18

- Per-profile preference lives in the official profile's `.dsh-x-stock/market.json`; writes are atomic and 0600, reads fail closed to off, and the file contains only `version` plus a boolean.
- `dsh-x-stock.market-preference` is an exact owner-only RPC; the market data route resolves a provider function on every request so the switch takes effect without a host restart.
- Tests cover the preference store, controller lifecycle, forced host configuration, RPC validation/failure mapping, and jsdom enable/disable from both the setup card and the header switch.
- The disabled source stops polling; toggling the switch refreshes the data hooks on demand.
