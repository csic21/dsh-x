# Stock validation

## Drill-down and daily K-line — 2026-10-19

- `pnpm --filter dsh-x-stock test` covers the new history parser, volume-unit inference, owner-only RPC projection, and jsdom drill-down. Offline fixtures only; no credential.
- `{ kind: 'history', symbol, adjustment, limit }` is on the existing owner-only `dsh-x-stock.market` route and the same free-source switch. A provider without `history()` returns `stock/history-unavailable` and does not fail quotes.
- Volume is shares only when turnover confirms the unit (or lots × 100). Indices keep the source aggregate and the chart labels it as index units, not shares. A qfq request that comes back as `day` is labelled unadjusted.
- Market panorama: constituent and mover rows open the stock detail and add an unfixed watchlist item when needed. Index cards expand an inline daily chart and do not touch the watchlist.
- A one-off Chrome headless smoke of a fixture harness showed the watchlist daily chart, the market panorama, the constituent “查看详情” column, the drilled stock page, and the inline index chart. It is not a Desktop acceptance test, and the harness numbers are synthetic.
- Not verified against the live Desktop window: pixel layout after install, upstream rate limits, and whether Tencent keeps this kline shape.

## Watchlist / fixed bar split and one shared source — 2026-10-19

- `pnpm --filter dsh-x-stock test`: 152 tests, 0 failed; `pnpm run typecheck`, package build and the repository integration suite (17 tests) pass. All quote tests use offline fixtures; no network call or credential is involved.
- Watchlist and bottom bar are separate collections: watchlist items carry `fixed`, the bar renders only fixed ones, and mounting `shell.bottom` additionally requires the bar not to be hidden. Removing every fixed mark or pressing `Alt+Shift+S` releases the slot instead of holding an empty bar.
- Storage payload is `version: 2` (`items[].fixed`, `barHidden`) under a new scoped key; a `version: 1` record (watchlist == bar) under the previous scoped key is imported once as an unfixed watchlist. Covered by controller tests, including the fixed-limit rejection and cross-window sync.
- One A-share source: `MarketProvider` gained `quotes(symbols)`, `dsh-x-stock.market` gained `{ kind: 'quotes', symbols }`, and the retired `dsh-x-stock.quotes` route plus the separate `freeSource` adapter were deleted. `freeSource` / `DSH_X_STOCK_FREE_SOURCE` remain as deprecated aliases that force the same switch on.
- The fixed bar issues one batched request per tick (max 8 symbols). Polling is 5 s while the newest quote is moving and falls back to 60 s from the quote timestamp (closed market, suspension, stalled feed); an unconfigured source is never polled. Covered by resource and `pollDelay` tests.
- A symbol the source does not answer for is projected as `unavailable` with null numbers — never zero, previous close or any substitute.
- Not verified: pixel layout in the Desktop window, the real upstream feed under load, rate limiting, and whether the quoting endpoint keeps serving this batch form. The `Alt+Shift+S` handler is unit-tested only; its behaviour inside the real Electron window is a manual check.

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

## Watchlist name search — 2026-10-18

- `pnpm --filter dsh-x-stock test`: 144 tests, 0 failed. Directory parsing, query bounds, provider HTTP limits/cancellation, owner-only RPC projection, opt-in gating and jsdom combobox interaction all use explicit offline fixtures.
- New host seam: `dsh-x-stock.search` (status + search) with a 64 KiB / 8 s bounded fetch to the fixed `smartbox.gtimg.cn` host. It projects only `symbol/name/kind` and never returns raw payloads or upstream errors.
- Gating reuses the existing local free source: the per-profile market switch, `marketSource` or `freeSource`. With none of them on, the route reports `disabled` and no request is made; the client offers an in-place "turn on free source" action through the existing owner-only preference route.
- Scope is exchange-tradable A-shares, ETFs, LOFs and REITs (max 10 rows). Indices, HK/US listings, off-exchange funds and warrants are filtered out. Names are directory data, not exchange-verified identities, and no live or licensed directory call is claimed by these tests.
