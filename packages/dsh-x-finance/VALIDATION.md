## CSI 500 / CSI 800 added to the index board — 2026-10-24

- Gap: the board listed 沪深300 and then jumped straight to 中证1000, so the 300/500/800/1000 ladder had two holes. Both missing indices are answered by the same Tencent endpoint already in use; no new source, host or token was added.
- Catalogue: `sh000905` (中证500) and `sh000906` (中证800) are now entries in the fixed `INDEXES` list, parsed by the same `parseIndexQuote` path. Live single request confirmed both return the expected columns (name, price, previous close, open, `fields[30]` stamp, change, change percent, high, low, `fields[37]` turnover).
- Drill-down: both match `canDrillIndex` (`SH.\d{6}`, only `SH.932000` excluded), so their cards open the inline daily chart and the quant panel. `newfqkline` returns a `day` array for `sh000906`, so the history route works for it.
- Tests: the offline fixture now carries all four ladder indices plus 中证全指, and the overview test asserts the ladder order, the 中证800 price/percent/turnover/timestamp projection, and that the card count grew by two. The view test asserts 中证500 and 中证800 cards are clickable while 中证2000 and the HK cards are not.
- Not verified: real Desktop pixels for the two new cards, and whether adding two more codes changes the single batched request's latency in a meaningful way.

## Expanded index board — 2026-10-23

- `pnpm --filter dsh-x-finance test`: **220 tests, 0 failed**; typecheck and build pass. New cases cover the Hang Seng batch line and slash timestamp, the HK namespace and null turnover, the A-share clock staying on the mainland close, the best-effort CSI 2000 supplement, and its omission when the source does not answer.
- Live smoke of the built provider: **12 indices** returned in 230 ms — the original six, 中证1000, 中证全指, 恒生指数, 恒生国企, 恒生科技, 恒生红筹. HK quotes carried Hong Kong timestamps and null turnover; the header `quotedAt` stayed on the latest mainland quote.
- 中证2000 (932000) is not served by Tencent (`v_pv_none_match`, empty kline) or Sina (empty line). The provider tries East Money `1.932000` and `2.932000` as a best-effort supplement and omits the card on failure. In this sandbox the East Money hosts return 403, so the live smoke did not include it; the live path is therefore **not verified** here.
- HK cards are quote-only: the chart history route is A-share-only, so `HK.*` and `SH.932000` are excluded from drill-down. The sentiment index momentum excludes HK. No currency is inferred for HK turnover.

## Quantitative analysis and clickable index cards — 2026-10-23

- `pnpm --filter dsh-x-finance test`: **216 tests, 0 failed**; `tsc -p tsconfig.json` and the package build pass. New pure tests cover normalisation, returns/volatility/drawdown/Sharpe, ATR/RSI/Bollinger, monthly grouping, correlation alignment, all four rule replays, next-open execution (no lookahead), both-side costs, and fail-closed empty inputs. A jsdom panel test covers the full render, benchmark correlation and the too-few-bars state.
- Interaction: the whole index card (including the large value) is now a keyboard-accessible button; clicking it opens the inline daily chart and the new quant panel. The old name-only link was the reason a click on the value did nothing. The test clicks the value element directly.
- Visual smoke: a standalone Chrome page rendered the panel with a 120-bar synthetic fixture at 1185×1342; the five-column statistics grid, monthly table, replay metrics and SVG equity curve were inspected. This is **not** a Desktop acceptance test; the embedded tab cannot authenticate to the local Web GUI, so the real page was not screenshotted.
- Limits: daily window is capped at 1,000 bars (about four years); the benchmark is CSI 300 (SSE Composite when the chart itself is CSI 300) and is requested unadjusted. The replay is long-only, fully invested, next-open, with commission/slippage on both sides; no dividends, taxes, financing, leverage or suspended-market fills. It is a historical description, not a forecast or advice. Data remains the unofficial local free source.

## Global index board — 2026-10-23

- `pnpm --filter dsh-x-finance test`: **203 tests, 0 failed**; `tsc -p tsconfig.json` and the package build pass. New tests cover catalogue uniqueness, the East Money batch parser, rejected unknown/impossible/future rows, the host projection boundary, regional averages, the single batched provider request with caching, and the owner-only RPC branch. All fixtures are offline.
- Source: one paced request to `push2.eastmoney.com/api/qt/ulist.np/get` with a fixed 30-code catalogue, 60 s host cache. Each of the 30 secids was confirmed to return a quote in a live single request during development; rows the source omits are dropped, never substituted.
- The catalogue is an explicit identity list with reviewed Chinese/English names, regions and IANA exchange time zones. Quotes are formatted in each exchange's local time, not folded into Beijing time.
- The sandbox egress returned HTTP 403 when several probes were issued in quick succession, so live checks were spaced out; the endpoint itself answered every paced request. Sustained upstream rate limits and the real Desktop pixel layout are **not** verified. No licensed, real-time, level-2, news or trading feed is claimed.

# Finance validation

## Market drill-down is a preview, not a watchlist write — 2026-10-24

- Bug: opening a stock from the market panorama (mover rows, constituent rows, the selected-tile action) called `add()`, so a stock that was not on the watchlist was **persisted** into it before being shown. Browsing the market silently edited the saved list.
- Fix: the controller gained a session-only `preview` field. A drill-down for a stock that is not on the list now calls `preview(symbol, name)`; the detail stage renders the previewed stock (quote + daily chart) with a banner and an explicit "加入自选" action. Only that action calls `add()`. Selecting a saved row, adding the stock, changing scope, or closing the preview clears it; the preview is never persisted and never appears in the rail or the fixed bar.
- Tests: `pnpm --filter dsh-x-finance test` — **221 tests, 0 failed**; `tsc -p tsconfig.json` and the package build pass. New coverage: controller preview writes nothing and is cleared by select/add/scope change (watchlist tests), and the jsdom market drill-down asserts `add()` is not called, the preview banner is shown, saving is the only write, and dismissing saves nothing (market-view tests). The built-client integration test still passes.
- Not verified: the Desktop pixel layout of the new preview banner; behaviour is asserted in jsdom only.

## Quoted price width — 2026-10-23

- Bug: the fixed bar and the stock detail formatted every price with two decimals, so an ETF quoted at `4.027` (or `4.0240`) was rounded and misreported. Fix: the provider now carries `pricePrecision` from the raw quote field, the host re-validates it (integer 0–6, otherwise null), and the browser formats at that width. A source that states no width still falls back to two decimals.
- `pnpm --filter dsh-x-finance test`: **195 tests, 0 failed**. New cases cover the width parser (including trailing zeros and out-of-range input), the projection boundary, the formatter, and a jsdom bottom-bar render asserting `4.027` and `4.0240` are not rounded.
- Gold instruments carry the same field: `53.925` stays three decimals instead of being rounded to `53.93`.

## Rename to dsh-x-finance and the gold panel — 2026-10-23

- `pnpm --filter dsh-x-finance test`: **190 tests, 0 failed**; `tsc -p tsconfig.json` and the package build pass. Gold and rename tests are offline fixtures; one manual live smoke of the provider returned six instruments, the CNY/g restatement, the Shanghai premium and both daily series.
- Rename: package id, patch id, RPC endpoints, slot keys, locale namespace and the profile directory all move to `dsh-x-finance`. Migration is covered by tests: `.dsh-x-stock` is renamed to `.dsh-x-finance` (an existing new directory wins), the market switch is read after adoption, the pre-rename localStorage key is imported as a read-only fallback, and the current key wins and is the only one written. `DSH_X_STOCK_*` stays a deprecated alias.
- Gold: two field layouts (commodity and offshore FX) are parsed separately; the session date is located by shape because padding differs per symbol. Timestamps are rejected when impossible, in the future, or older than ten days. `validateGoldSnapshot` re-checks prices, ranges and series before the response leaves the Host; a bad value fails rather than being repaired.
- Range moves use daily closes (260 bars kept, 250 for the 52-week window) and stay empty when history is short or missing; the panel labels that state instead of estimating.
- Not verified: pixel layout in the Desktop window, upstream rate limits, and whether Sina keeps these two shapes. No news or event attribution is implemented by design.

## Drill-down and daily K-line — 2026-10-19

- `pnpm --filter dsh-x-finance test` covers the new history parser, volume-unit inference, owner-only RPC projection, and jsdom drill-down. Offline fixtures only; no credential.
- `{ kind: 'history', symbol, adjustment, limit }` is on the existing owner-only `dsh-x-finance.market` route and the same free-source switch. A provider without `history()` returns `finance/history-unavailable` and does not fail quotes.
- Volume is shares only when turnover confirms the unit (or lots × 100). Indices keep the source aggregate and the chart labels it as index units, not shares. A qfq request that comes back as `day` is labelled unadjusted.
- Market panorama: constituent and mover rows open the stock detail and add an unfixed watchlist item when needed. Index cards expand an inline daily chart and do not touch the watchlist.
- A one-off Chrome headless smoke of a fixture harness showed the watchlist daily chart, the market panorama, the constituent “查看详情” column, the drilled stock page, and the inline index chart. It is not a Desktop acceptance test, and the harness numbers are synthetic.
- Not verified against the live Desktop window: pixel layout after install, upstream rate limits, and whether Tencent keeps this kline shape.

## Watchlist / fixed bar split and one shared source — 2026-10-19

- `pnpm --filter dsh-x-finance test`: 152 tests, 0 failed; `pnpm run typecheck`, package build and the repository integration suite (17 tests) pass. All quote tests use offline fixtures; no network call or credential is involved.
- Watchlist and bottom bar are separate collections: watchlist items carry `fixed`, the bar renders only fixed ones, and mounting `shell.bottom` additionally requires the bar not to be hidden. Removing every fixed mark or pressing Option+Shift+S on macOS (`⌥⇧S`) / Alt+Shift+S elsewhere releases the slot instead of holding an empty bar.
- Storage payload is `version: 2` (`items[].fixed`, `barHidden`) under a new scoped key; a `version: 1` record (watchlist == bar) under the previous scoped key is imported once as an unfixed watchlist. Covered by controller tests, including the fixed-limit rejection and cross-window sync.
- One A-share source: `MarketProvider` gained `quotes(symbols)`, `dsh-x-finance.market` gained `{ kind: 'quotes', symbols }`, and the retired `dsh-x-finance.quotes` route plus the separate `freeSource` adapter were deleted. `freeSource` / `DSH_X_FINANCE_FREE_SOURCE` remain as deprecated aliases that force the same switch on.
- The fixed bar issues one batched request per tick (max 8 symbols). Polling is 5 s while the newest quote is moving and falls back to 60 s from the quote timestamp (closed market, suspension, stalled feed); an unconfigured source is never polled. Covered by resource and `pollDelay` tests.
- A symbol the source does not answer for is projected as `unavailable` with null numbers — never zero, previous close or any substitute.
- Not verified: pixel layout in the Desktop window, the real upstream feed under load, rate limiting, and whether the quoting endpoint keeps serving this batch form. The shortcut handler is unit-tested only, including the macOS case where Option rewrites `key`; its behaviour inside the real Electron window is a manual check.

## Completed TypeScript migration — 2026-10-18

- All seven workspace packages use the shared TypeScript builder. Strict type checking includes source and package tests; the temporary Code `allowJs` bridge is removed. Host entries load from `lib/index.js`, with declarations and lazy client factories included in package checks.
- `pnpm run typecheck` and `pnpm run build` pass. Full regression (`TMPDIR=/private/tmp pnpm test`, with local loopback listeners allowed): **762 tests, 760 passed, 0 failed, 2 skipped**. Skips are the unavailable upstream ApprovalPanel source fixture and a platform-specific non-macOS CLI check.
- Plan's ACP input-closure fixture now reads its handshake synchronously before closing fd 0, preserving open stdout and the exact `EPIPE` assertion. Closing a descriptor behind an active Node stdin stream could terminate the fixture before the host write. The test passes within the complete regression.
- Stock's compiled Workbench fixture intercepts the migrated `.tsx` chart module; its twelve cases pass with the intended chart seam. Numeric indicator and dataset validation behavior is retained.
- Package dry runs verify built entries, declarations, client bundles, chart license notices and Agents protocol notes; TypeScript source/tests are excluded from delivery. `git diff --check` is clean.

No provider authentication, real model calls, Electron UI, or paid/network market-data calls are claimed by these synthetic tests.

## Market panorama — 2026-10-18

- `pnpm --filter dsh-x-finance test`: 116 tests, 0 failed. Host tests use offline fake Tencent payloads; UI tests use jsdom with explicit fixtures. No test requires a network or a provider credential.
- `pnpm run typecheck` and the full `pnpm test` regression pass.
- Manual live smoke (not a committed test): the opt-in provider returned 6 indices, 31 level-1 and 124 level-2 Shenwan boards, 5,577 breadth rows; RPC responses measured about 36 KB for overview, 4 KB for breadth and 27 KB for one board detail.
- Chrome headless screenshots were used to inspect the dashboard and sector-detail layout in a light theme. This is a visual smoke check, not a Desktop acceptance test.
- The market source remains unofficial, unlicensed, locally opt-in and disabled by default. No authenticated, real-time, Level-2, historical, fundamental or trading feed is claimed.

## Market source switch — 2026-10-18

- Per-profile preference lives in the official profile's `.dsh-x-finance/market.json`; writes are atomic and 0600, reads fail closed to off, and the file contains only `version` plus a boolean.
- `dsh-x-finance.market-preference` is an exact owner-only RPC; the market data route resolves a provider function on every request so the switch takes effect without a host restart.
- Tests cover the preference store, controller lifecycle, forced host configuration, RPC validation/failure mapping, and jsdom enable/disable from both the setup card and the header switch.
- The disabled source stops polling; toggling the switch refreshes the data hooks on demand.

## Watchlist name search — 2026-10-18

- `pnpm --filter dsh-x-finance test`: 144 tests, 0 failed. Directory parsing, query bounds, provider HTTP limits/cancellation, owner-only RPC projection, opt-in gating and jsdom combobox interaction all use explicit offline fixtures.
- New host seam: `dsh-x-finance.search` (status + search) with a 64 KiB / 8 s bounded fetch to the fixed `smartbox.gtimg.cn` host. It projects only `symbol/name/kind` and never returns raw payloads or upstream errors.
- Gating reuses the existing local free source: the per-profile market switch, `marketSource` or `freeSource`. With none of them on, the route reports `disabled` and no request is made; the client offers an in-place "turn on free source" action through the existing owner-only preference route.
- Scope is exchange-tradable A-shares, ETFs, LOFs and REITs (max 10 rows). Indices, HK/US listings, off-exchange funds and warrants are filtered out. Names are directory data, not exchange-verified identities, and no live or licensed directory call is claimed by these tests.
