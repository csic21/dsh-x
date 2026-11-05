## 海外并入自选与底栏 — 2026-11-05

- 需求：港股/美股只能临时查看，不能加入自选。确认后选择「全量并入」：一个自选清单混排三市场，底栏同时盯三地。
- 为什么原来不行（改之前逐层确认过）：自选不是一张列表，而是整条 A 股管道的入口键。`validateSymbol` 只认 `SH/SZ/BJ` + 六位；批量报价只解析 `v_sh/v_sz/v_bj` 行；分时、基本面、持仓、尾盘扫描、自选信号、全市场量化都默认 symbol 是 A 股。硬塞进去的后果不是「不显示」，而是**整份存档被判无效**——`parseSaved` 会抛错。
- 实现（`validateSymbol` 保持 A 股专用，另开一条更宽的身份口子）：
  - `watchlist.ts` 新增 `marketOf()` / `isWatchSymbol()` / `validateWatchSymbol()`：`cn` 六位、`hk` 五位、`us` ticker（含 `BRK.A`），恒生指数 `HK.HSI` 仍然不可入自选。只有**存储条目、批量报价请求、资源地址**三处放宽；历史、分时、基本面、持仓、尾盘扫描继续调用窄的 `validateSymbol`，所以海外 symbol 不会漂进拿错字段的路由。
  - 批量报价：`parseTencentBatch` 增加 `hk\d{5}` 与 `us<CODE>`；`parseStockQuote` 按 key 前缀分三套布局解析。三个市场共用 `[3]` 现价、`[32]` 涨跌幅，但时间戳格式与交易所时区不同——港股按 `Asia/Hong_Kong`、美股按 `America/New_York` 用 `zonedQuoteTime` 换算，A 股仍走原来的上海解析。回显校验也分开：港股比 `fields[2] === '00700'`，美股比 `fields[2]` 前缀 `AAPL.`。
  - 详情分发：`StockPage` 用 `marketOf(item.symbol)` 决定渲染 A 股 `Detail`、`HkDetail` 还是 `UsDetail`；海外页新增「加入自选」与「固定/取消固定」按钮，样式与 A 股详情一致。从查询框选中一只**已在自选里**的海外股票时直接选中该行，不再生成第二份临时查看。
  - 美股交易所代码：`WatchlistItem` 增加可选 `code`（如 `AAPL.OQ`）。没有它，刷新后无法再取日 K（美股日线接口要 venue 后缀）。`normalizeItem` 只做形状校验（`[A-Z0-9.]`），真正的白名单校验仍在美股路由的 `normalizeUsCode`，存储不是信任边界。
  - 信号：客户端 `WatchSignals` 只传 A 股行；宿主 `scheduleSymbols` 对 `HK.`/`US.` 行**丢弃**而不是整批报错（混合自选现在是正常状态），非自选身份仍然报错。
  - 定价展示：底栏与自选行给海外行加 `HK$` / `US$` 前缀，A 股不加标记。价格小数位继续取源里打印的宽度（港股常见 3 位）。
- 真实冒烟（本机 2026-11-05 12:00 上海时间，直接调用构建产物 `lib/market-provider.js` 的一次批量请求）：
  - `quotes(['SH.600519','SZ.000001','HK.00700','HK.02800','US.AAPL','US.BRK.A'])` → **6/6 行全部可用**，同一响应内混排三套布局。
  - `SH.600519` 1445.66（2 位，`2026-11-05T11:57:11+08:00`）；`HK.00700` 426.400（3 位，`2026-11-05T03:42:06Z`）；`US.AAPL` 349.51（2 位，`2026-11-04T21:00:01Z`）；`US.BRK.A` 869300.76（带点的 ticker 正常）。
- 边界：海外行进入自选与底栏，但只有报价与日 K；没有基本面、分时、行业/题材扫描或交易；自选信号与全市场量化不覆盖海外（同步时跳过，不报错）。底栏仍是最多 8 只、自选最多 200 条。港股的 RMB 双柜台、恒生指数依旧不入结果。
- 兼容性：存档格式仍是 `version: 2`，海外条目只是在同一份列表里多了 `HK./US.` 身份和可选的 `code`。**不向前兼容**：把混合存档交给旧版客户端，旧版会把整份判为无效（显示存储错误，不会静默删数据）——降级前请先清空海外行。
- 测试：`node --test test/*.test.ts` — **543 passed / 0 failed**；`tsc`、构建通过；仓库集成测试 27/27。新增/扩展：混合存档（三市场、`code` 保留与非法 `code` 拒绝、`HK.HSI` 拒绝）、同一批量请求解析三套布局（含时间戳/精度/回显错配）、报价路由接受三市场并拒绝指数代码、`scheduleSymbols` 丢弃海外行、以及 jsdom 全页流程（切港股 → 选中 → 加入自选 → 固定 → 底栏出现 `HK$` → 取消固定 → 移除；美股选中 → 加入自选后存档含 `AAPL.OQ`）。
- 未验证：真实 Electron 里的底栏排版与混合列表观感；港股/美股休市与半日市的真实状态（源无收盘标志，仍显示「未知/最近报价」）；旧版客户端降级场景（只做了代码层推断，没有实际跑旧包）。
## 港股查询（搜索框切到「港股」，报价 + 日 K） — 2026-11-05

- 需求：查询框只有 A 股与美股，港股搜不到。希望港股也能像美股那样查询并临时查看报价与日 K。
- 上游事实（本机实测）：目录 `smartbox.gtimg.cn/s3/?q=腾讯&t=all` 返回 `hk~00700~腾讯控股~txkg~GP`，同时返回 `hk~80700~腾讯控股r~txkgr~GP`（人民币双柜台）、`us~tcehy.ps~…`、`hk~13005~…~QZ`（窝轮）。港股 ETF 与股票同为 `GP` 类目（`02800 盈富基金`）。报价 `qt.gtimg.cn/q=hk00700` 为 GBK 文本，币种在字段 75（`HKD`）、成交额在 37；日 K `proxy.finance.qq.com/ifzqgtimg/appstock/app/hkfqkline/get?param=hk00700,day,,,5,qfq` 返回 `data.hk00700.qfqday`，行序与 A 股相同，成交额列是**万元**，同一响应自带 `qt` 报价块。
- 实现（新增一条与美股并列的只读路由 `dsh-x-finance.hk`）：
  - 身份 `HK.00700`：五位代码带前导零；与恒生指数 `HK.HSI`（字母）共用 `HK.` 前缀但永不冲突。目录条目只接受 `hk` + `GP` + 五位数字，窝轮（`QZ`）与 **RMB 双柜台（代码 = 港币柜台 + 80000）** 被丢弃，否则每次查港股都会出现两条同名 `r` 记录。
  - 报价解析：校验回显代码、币种 `HKD`、最高价不低于最低价、现价在当日区间、涨跌额/幅与「现价 − 昨收」互证；单字段 `v_hkXXXXX="1"` 判为「没有这只股票」（unavailable），字段数在 2–37 之间才判为格式错误。
  - 日 K：只取前复权（`qfq`）；源不返回 `qfqday` 时按不复权显示并写明。单位不猜：成交量与报价块 1:1 才记「股」，成交额与报价块约 10000 倍关系才把「万元」换算成港元，否则两列都留空并标 unknown。
  - 客户端：查询胶囊的市场选择变为「A股 / 港股 / 美股」，A 股仍发两键信封（兼容旧宿主），港股/美股才附加 `market`；结果行右侧标签按市场显示「港股」。选中打开临时查看页（`HkDetail`），只做报价 + 日 K，不写入自选、不进入底栏；与美股共用同一个「免费源」开关，关闭时路由返回 `disabled` 且不发请求。
  - 图表：`StockWorkbench` 增加 `hk` 分支，只走日线（无分时）、无 A 股基准、不显示三档复权选择。
- 真实冒烟（本机 2026-11-05 11:15 上海时间，直接调用构建产物 `lib/hk-provider.js` 与 `lib/instrument-search-provider.js`）：
  - `HK.00700` 报价：`腾讯控股` 427.600、涨跌 +26.000（+6.47%）、开盘 413.800、最高 429.000、最低 410.200、成交量 28,396,548、成交额 11,979,630,451.546 HKD、`quotedAt` 2026-11-05T03:15:13Z。
  - `HK.00700` 日 K：`adjustment=forward`、`currency=HKD`、`volumeBasis=shares`，末根 `2026-11-05 open 413.8 / high 429 / low 410.2 / close 426.6 / volume 30,699,730 / amount 12,960,585,800`（成交额由「万元」列换算，`isFinal=false` 因为当日仍在交易）。
  - 目录（`market: 'hk'`）：`腾讯` → `HK.00700 腾讯控股`、`HK.01698 腾讯音乐sw`（`80700` 被过滤）；`阿里` → `HK.09988 阿里巴巴w`、`HK.00241 阿里健康`；`盈富` → `HK.02800 盈富基金`；`00700` → `HK.00700`。同一关键词在 A 股板返回 0 条，三块互不串台。
- 边界：港股不进入自选/底栏，没有基本面、分时、行业扫描或交易；RMB 双柜台不出现（需要人民币柜台时请直接在交易所确认代码）。数据来自腾讯公开接口（非官方、无 SLA、不可再分发），只适合本机个人查看，不构成投资建议。
- 测试：`node --test test/*.test.ts` — **539 passed / 0 failed**；`tsc -p tsconfig.json` 与 `scripts/build-package.mjs` 通过。新增 `test/hk-market.test.ts`（身份/URL、双柜台过滤、报价交叉校验、日 K 单位判定、请求信封、适配器错误与取消、RPC 边界、目录解析）与 `test/hk-view.test.ts`（查询框切港股、结果标签、空结果文案、详情渲染报价与港交所时间、源关闭时的空态）；`test/instrument-search.test.ts` 追加港股目录投影、`HK.` 匹配校验与市场转发。
- 未验证：真实 Electron 内的像素与窄窗口布局；港股节假日/半日市（源不提供休市标志，页面一律标为未知状态）；腾讯港股接口的长期限流行为；RMB 双柜台过滤是否覆盖全部交易所编号（只按 80000–89999 的已知规则处理）。

## 名称搜索：多关键词与指数/简称差异导致的「搜不到」 — 2026-11-05

- 现象：在标题栏查询框里输入「红利低波动etf 易方达」（A 股），下拉里没有任何结果，也没有可用提示；用户据此判断「搜索坏了」。同一只基金用「红利低波」或代码 `563020` 都能找到。
- 根因一（上游没有分词）：`smartbox.gtimg.cn/s3/` 每次请求只按**一个连续子串**匹配（名称与拼音各匹配一次），没有「与」语义。实测原样请求：`红利低波动etf 易方达` → `v_hint="N"`；`红利低波动ETF 易方达` → `N`；`红利低波 易方达` → `N`。也就是说，只要关键词里有一个空格，整次查询就必然为空，与证券是否存在无关。
- 根因二（指数名 ≠ 基金简称）：用户记的是指数名「红利低波动」，场内基金简称是「红利低波」。`红利低波动` 只匹配到 `563590 A500红利低波动ETF国寿`，外加 9 条场外联接基金（`jj`，被插件按范围过滤），过滤后只剩 1 条；`红利低波` 才返回 `563020 红利低波ETF易方达` 等 10 条。
- 根因三（上游截断）：上游每个请求最多返回 10 行原文，场外基金、指数等被过滤后经常只剩 0–1 行，界面就表现为「几乎没有结果」，与「没有结果」难以区分。
- 交叉核对：把同一个关键词发给另一家公开建议接口（东方财富 `searchapi.eastmoney.com/api/suggest/get`）同样返回 0 条，说明这不是某一家源坏了，而是「整串子串匹配」这个模式本身不匹配用户习惯。
- 修复（Host 侧，客户端协议不变）：
  - `planSearch()` 把查询拆成**有序的探测阶梯**：① 原样关键词（保证原有行为不变）→ ② 去掉空格的拼接 → ③ 最长的实义词。分段同时按分隔符和**中英文边界**切分，所以 `红利低波动etf` 会拆成 `红利低波动` + `etf`，而 `300ETF` 保持整体；`etf`/`lof`/`基金`/`指数`/`联接` 这类**类别词只参与排序、不单独探测**（`ETF` 单独探测只会返回随机十只 ETF），**纯数字同理**（`300` 单独探测会先返回 `600300 维维股份`，而完整代码本身就是第一个探测）。阶梯严格上限 4 次请求，整条阶梯共用一个 8 秒超时。
  - `relax`：中文指数名常被基金简称缩写。当探测结果**不足 4 条**时，再试一次「最长中文词去掉最后一个字」（`红利低波动` → `红利低波`）；结果够多时不会多打这一枪。
  - 提前停止：凑满 10 条（一页）即停；出现与关键词**完全同名**的品种即停（用户已经打全了名称）。
  - 失败降级：只有第一个探测（用户原样关键词）失败才算搜索失败；后续探测失败只结束阶梯，保留已拿到的结果，不会因为一次多余探测把整次搜索变成错误。
  - `rankCandidates()` 本地排序：按代码去重后，按「名称覆盖了多少关键词」加权——完整包含 1.0、中文近似覆盖按最长公共连续串折算（`红利低波动` 对 `红利低波` = 0.8）、仅由拼音探测命中给 0.5；代码**完全等于**关键词 +10（四位以上数字前缀 +2，避免 `300` 把 `600300` 顶上来），名称以首个关键词开头 +1；同分保留目录原顺序，因此 `byd` 这类拼音查询不会被打乱。
  - 客户端文案：`lookup.hint` 说明可以写多个关键词；空结果提示补上「去掉品牌词或只输入名称里的一段再试」。
- 真实冒烟（本机 2026-11-05 11:0x 上海时间，直接调用构建产物 `lib/instrument-search-provider.js`，非测试用例）：
  - `红利低波动etf 易方达` → 10 条、366ms、4 次请求，首条 `SH.563020 红利低波ETF易方达`，其后 `563590`、`512890`、`515450`、`159307`。
  - `红利低波动` → 10 条、75ms、2 次请求（严格 1 条 + 退一格补 9 条），首条 `563590`、`563020` 第三。
  - `贵州 茅台` → 1 条 `SH.600519`、80ms、2 次请求（第二枪输出与关键词同名，阶梯提前停止）。
  - `byd` → 2 条（`SZ.002594` 比亚迪、`SH.603861` 白云电器）、47ms、1 次请求；`563020` → 1 条、49ms、1 次请求；单关键词且能命中的查询仍然只发一次请求。`沪深300` → 8 条、69ms，全部是沪深300 ETF/LOF，首条 `SH.510300`（修复前同一查询会被 `300` 这个探测带进 `600300 维维股份`）。
- 边界：拆分出的片段都是关键词的子串，不引入新的检索内容；单个请求仍走固定 HTTPS 主机、拒绝重定向、8 秒超时、64 KiB 上限；最坏情况是 4 次请求而不是 1 次，这是用一点上游礼貌换召回。场外基金（`jj`）仍然不进入结果，`563020 红利低波ETF易方达` 是场内 ETF，`020602 易方达中证红利低波动ETF联接发起式A` 依旧被过滤。
- 测试：`node --test test/*.test.ts` — **520 passed / 0 failed**；`tsc -p tsconfig.json` 通过；`scripts/build-package.mjs` 构建通过。新增 4 条用例：`planSearch` 的阶梯形状（原样优先、空格与中英边界、类别词不单独探测、退一格、上限）；`rankCandidates` 的排序（整句命中优先、代码直中、拼音保序、空输入）；provider 走完整阶梯并合并排序（含 `jj` 过滤）；提前停止、单次请求与「后续探测失败保留前序结果」。
- 未验证：真实 Electron 里的实际输入体验与 4 次请求的体感延迟；上游对同一会话内短时间多次探测的限流行为；更长尾的多关键词组合（如「新能源 电池 龙头」）的召回质量。

## 查询框静默失败：新旧宿主混用与错误不可见 — 2026-11-04

- 现象：升级到带美股开关的客户端后，在查询框输入代码（如 `519319`）没有任何下拉、没有「没有匹配」、也没有报错；回车同样无反应。改动前同一输入至少有结果或空结果提示。
- 根因：桌面应用从 11-03 起一直在运行，宿主进程加载的是旧插件代码；`lib/client.js` 每次请求都从磁盘读，所以刷新页面后浏览器已经是新客户端。新客户端把 `market` 字段放进**每一次**搜索请求，旧宿主的 `parseSearchRequest` 只接受 `action + query` 两个键，直接判为 `invalid-query`。而查询胶囊的错误浮层只在 `open` 为真时渲染，请求失败时从没把 `open` 置真，于是失败表现成「输入没反应」。
- 修复一（兼容）：A 股请求恢复成两键信封，只有切到「美股」时才附加 `market: 'us'`。这样新客户端 + 旧宿主下 A 股搜索照旧可用，新版宿主同时接受两种形状。
- 修复二（可见性）：请求开始、失败、空结果都会打开浮层；失败时显示具体错误，而不是保持沉默。若「美股」请求被旧宿主以 `invalid-query`/`not-found` 拒绝，提示「美股查询需要新版宿主：请重启应用后再试」，不把版本错配说成关键词错误。
- 另核实：`519319` 在腾讯目录里返回 `v_hint="N"`，`qt.gtimg.cn/q=sh519319` 也是 `v_pv_none_match`，即该代码不在数据源覆盖内。修复后输入它会显示「没有匹配的 A 股、ETF、LOF 或 REIT」，这是正确结果，不是新的失败。
- 测试：`node --test test/*.test.ts` — **522 passed / 0 failed**。新增两条：失败时浮层出现错误文本（`role="alert"`）；旧宿主拒绝 `market` 时显示重启提示。既有断言改为校验 A 股请求不带 `market` 键。
- 未验证：宿主进程热重载（本轮未重启应用，也未在插件管理器里关闭/重开 finance 插件）；真实 Electron 里刷新后的实际表现需在重启后再看一次。

## 美股查询（标题栏查询框切到「美股」）— 2026-11-04

- 需求：标题栏「查询股票」原来只认 A 股，输入 Apple / AAPL 没有任何结果；希望把美股也纳入查询，并能在页面里看到报价与日 K。
- 实现：查询胶囊里增加 A股 / 美股 开关。美股走同一个目录主机（`smartbox.gtimg.cn`，`t=all`），只保留 `us` 市场、`GP` 类目，且只接受逐个核对过的交易所后缀（`oq/n/am/ps/pk`）。目录代码 `aapl.oq` 被拆成身份 `US.AAPL` 与每日接口需要的 `AAPL.OQ`；未知后缀（如 `bad.zz`）或无后缀条目直接跳过，不猜。
- 报价与日 K：新增只读路由 `dsh-x-finance.us`，`kind: quote` 取 `qt.gtimg.cn/q=us<TICKER>`（GBK），`kind: history` 取 `proxy.finance.qq.com/.../usfqkline/get?param=us<CODE>,day,,,<n>,qfq`。报价解析只取名字、现价、昨收、开/高/低、涨跌额/幅、成交量、成交额、币种与时间，并交叉校验涨跌额 = 现价 − 昨收、涨跌幅 = 涨跌额 ÷ 昨收、现价在当日区间内；币种必须是 `USD`。日 K 行序为 `date/open/close/high/low`（不是 OHLC），OHLC 非法或日期乱序的整行丢弃。
- 时间与单位：`qt.gtimg.cn` 的美股时间是交易所当地时间（16:00:02 收盘），按 `America/New_York` 换算成时刻并过 DST；实测 2026-11-03 16:00:02 → `2026-11-03T21:00:02Z`（EST，UTC−5）。成交量单位不靠假设：日 K 响应自带同一交易日的 `qt` 快照，末根成交量与它一致才声明「股」（×100 则按「手」折算），不一致或没有快照时置空并标注 unknown。
- 复权：`usfqkline` 只支持 `qfq`。请求 `hfq` 或空复权参数会返回 `code:1`；某些证券（实测 `BRK.A`）请求 `qfq` 却只返回 `day`，此时按**不复权**展示并写明，不改写为前复权。因此美股页面只提供前复权口径，不显示 A 股那套三档复权选择。
- 真实冒烟（本机 2026-11-04 16:35 上海时间，直接调用 `lib/us-provider.js`）：
  - `US.AAPL` 报价：现价 331.90、涨跌幅 −1.90%、成交量 63,160,026、币种 USD、`quotedAt` 2026-11-03T21:00:02.000Z。
  - `US.AAPL` 日 K：30 根，`adjustment=forward`，`volumeBasis=shares`，末根 `2026-11-03 open 325.58 / high 334.50 / low 325.33 / close 331.90 / volume 63,160,026`，与同一时点报价逐项一致。
  - `US.BRK.A` 日 K：末根 `2026-11-03 close 836,445.13 / volume 251`，`adjustment=none`（源忽略了 qfq），`amount` 209,682,723 美元随 `day` 行返回。
  - 目录：`apple` → `US.AAPL`(AAPL.OQ)、`US.APLE`(APLE.N)；`brk` → `US.BRK.A`(BRK.A.N)、`US.BRK.B`(BRK.B.N) 等 8 条，说明带点的代码与多后缀都能正确拆分。
- 边界：美股是**查看**能力。不写入自选、不进入底栏，也没有基本面、分时、行业/题材扫描或交易；量化面板仍按已加载日 K 本地计算，但没有 A 股基准，相关性留空。数据源是腾讯公开接口（非官方、无 SLA、不可再分发），与 A 股共用同一个「免费源」开关，关闭时路由返回 `disabled` 且不发任何请求；不需要 `FINNHUB_API_KEY`，也不把 Finnhub 当 UI 行情源。
- 测试：`node --test test/*.test.ts` — **520 passed / 0 failed**；typecheck 与 build 通过。新增 `test/us-market.test.ts`（身份/目录拆分、报价与日 K 解析、涨跌交叉校验、时间换算、成交量单位判定、请求信封、RPC 边界、适配器错误脱敏、路由信封）与 `test/us-view.test.ts`（查询框切市场、美股结果只保留 US 行、结果卡带「美股」标签、详情渲染报价与纽约时间、无 code 时不请求日 K）；`test/client.test.ts` 追加真实构建产物里的完整流程（切美股 → 搜索 → 选中 → 报价 + 日 K 请求带 `AAPL.OQ` → 自选与底栏都不变）。
- 未验证：真实 Electron 里的像素与窄窗口布局；腾讯美股接口的长期限流/断连行为；美股节假日与半日市（不识别，休市时显示最近一笔报价）；盘前盘后行情（不取）。

## 自选信号与全市场日线量化 — 2026-10-29

- 实现：自选股票按前复权日线计算可解释的买入观察／若持有退出信号，数据不足、证券类型不明、ST、旧数据和未确认收盘均显式标注；样本内回放明确假设、成本与未模拟的交易限制。每日自选和每日全市场后台任务都需用户分别显式同意，前者同步代码到当前 profile，后者只保存候选报告与覆盖统计；两者均不读取账户或下单。
- 全市场：按免费源目录逐股分批请求日线，记录目录、已请求、样本不足、失败、状态排除和未请求数量；分位仅在已覆盖、同一日期且成交额样本足够的股票中计算。后台按批次限速，免费源中断时停止并保存部分报告，不声称已完成全市场。
- 真实免费源冒烟（本机 2026-10-29 17:45:41 上海时间）：腾讯公开行情（非官方）声明目录 5,577 只，目录识别 5,577 只；首批请求 150 只，日线样本合格 117、样本不足 33、失败 0、可排序 115，仍有 5,427 只未请求，结果标记部分且当日日线未确认。只验证首批，**没有**完成全市场扫描，也未验证长期限流或后续收益。
- 修复：真实首批曾因开始时间与到期时间分别读取时钟，相差 1ms 而被宿主投影拒绝；现统一使用同一时间戳计算边界，并增加时钟持续前进的离线回归测试。
- 自选样本链路：公开代码 `SH.600519` 的证券目录和前复权日线可读取，250 根样本与单股回放可计算；2026-10-29 16:56 上海时间获取的最后日线仍标记未确认。单个样本不代表其他证券或源的长期可用性。
- 测试：仓库发布工作流同口径的全仓离线测试 **751 通过、0 失败、1 项可选真实浏览器测试跳过**；6 个插件类型检查通过；金融插件构建与冻结锁文件校验通过。测试输出含其他宠物插件既有 React `act` 警告，不影响本次测试结果。
- 验证限制：未据此声称交易所授权、实时行情、完整历史、实际成交或投资收益；Electron 页面及完整交易日自动运行需要在目标环境进一步验证。

## 低调模式下可保留底部固定栏 — 2026-10-29

- 需求：低调模式（老板键）开启后底栏整个消失，希望在需要时也能保留底栏，而不是只能在退出低调模式后恢复。
- 实现：设置载荷新增 `barInDiscreet`（`dsh-x-finance:settings:v1` 现为 `{version:1,discreet,barInDiscreet}`，旧载荷按 `false` 处理，仍可跨标签同步）。底栏可见性改为 `(!低调模式 || barInDiscreet) && !barHidden && 有固定股票`：默认仍让出 `shell.bottom`，打开新开关后底栏继续挂载。设置抽屉的「底部固定栏」段新增「低调模式下保留底栏」，低调模式开启且未保留时给出即时说明；自选栏底部在低调模式隐藏底栏时直接显示「低调模式下显示固定栏」，一次点击同时打开保留开关并清掉之前的「隐藏」状态；底栏快捷键在同样状态下也按「保留并显示」处理，底栏已经显示时仍是普通的显示/隐藏切换。
- 低调样式：保留的底栏根节点加 `dxs-discreet`，与页面共用同一套中性 token（涨跌色、强调色、状态色），去掉玻璃背景模糊；底栏「打开」按钮在低调模式下显示「工作台」，读屏名称改为「快速查看条」。热力图、K 线与分时不受影响。
- 边界：开关只是显示偏好，不改变任何请求、自选、固定标记或行情数据；关闭保留开关后底栏只在低调模式期间隐藏，退出后仍按原来的 `barHidden` 状态恢复。`barHidden` 与 `barInDiscreet` 分属自选记录与浏览器设置两份存储，互不覆盖。
- 测试：`pnpm --filter dsh-x-finance test` — **325 tests, 0 failed**；typecheck 与 build 通过。新增/更新覆盖：设置载荷规范化（含旧载荷）、两个开关分别持久化与跨标签同步、写入失败仍内存生效、抽屉新开关与低调提示、构建产物在 jsdom 中低调模式释放底栏 → 页面一键保留 → 底栏带 `dxs-discreet` 重新挂载，以及单测中的样式表断言。
- 未验证：真实 Electron 窗口里的实际像素与玻璃主题叠加；当前 desktop profile 安装的是已发布的 0.15.1，这份本地构建需要发布/重新安装后才会出现在应用里（本轮未安装或改写 profile）。

## 查询框改为标题栏搜索胶囊 — 2026-10-28

- 问题（截图）：0.15.0 的「查询股票」是内容区顶部的一条独立横带，360px 输入框右边是整片空白，标题栏与内容之间多出一段不承载信息的高度，用户反馈「UI 太难看」。
- 改动：查询挪进标题栏，位于品牌与页签之间，尺寸收成 28px 圆角胶囊（放大镜图标 + 透明输入框，只有 `:focus-within` 才出现强调色描边与光晕）；结果、空结果、加载与错误都收进胶囊下方 340px 的浮层，不再撑开页面高度。免费源关闭时胶囊本身变成「开启免费源后搜索」按钮（一次点击就地开启，失败只折叠成短提示）；目录不可用时是只读胶囊「名称搜索不可用」，不再留一个点了没反应的输入框。
- 窗口拖拽：标题栏是 `data-window-drag` 区域，胶囊与输入框显式加了 `-webkit-app-region:no-drag`（外壳只统一处理 button），避免在桌面端变成点不动的控件。
- 响应式：≤1024px 隐藏装饰性副标题并把胶囊收到 200px，≤760px 收到 140px，≤700px 隐藏胶囊（此时仍可在「自选 → 添加自选」里按名称搜索）。标题栏顺序固定为 品牌 → 查询 → 页签 → 操作，其余页面结构不动。
- 测试：`pnpm test` — **597 tests, 0 failed**。新增断言：查询框位于 `.dxs-titlebar` 内、不在内容区；关闭态只渲染开启按钮且不渲染输入框，点击后输入框出现并能搜到结果；目录不可用时只有只读胶囊。
- 未验证：真实 Electron 里的拖拽命中、暗色主题与极窄窗口下的实际像素（本轮 jsdom 没有布局引擎，只验证结构与状态机）。

## 查询即看：不必先加自选 — 2026-10-28

- 需求：目前只有「添加自选」表单里才有名称搜索，想搜一只股票看看 K 线就必须先把它加进自选。
- 实现：把目录查询抽成 `useInstrumentSearch`，一份逻辑两种呈现——表单里的 `InstrumentSearch` 行为不变（只回填交易所与代码），页面顶部的 `InstrumentLookup` 选中后走已有的 `openStock()`：已在自选就选中该行，不在自选就打开临时查看页（详情 + 日 K + 分时）。临时查看不写自选、不改当前选中行，保存仍然只能在详情页显式点「加入自选」。查询框在所有页签和临时查看页都可见，可以连着看第二只。
- 边界：免费源关闭时查询框原地显示「开启免费源」，不发任何请求（`status` 路由本身不触网，只回答开关与目录可用性）；目录不可用时输入框禁用；下拉列表绝对定位、失焦收起，选项用 `mousedown` 保焦点，因此点击不会先失焦再落空。
- 文案与文档：新增 `lookup.*` 中英文字典键；空自选状态补一行引导说明；README 与插件指南写清三个入口（页首查询 / 表单搜索 / 市场点行）的分工。
- 测试：`pnpm test` — **597 tests, 0 failed**（1 skipped 为需要 `DSH_X_BROWSER_REAL=1` 的可选浏览器用例）。新增覆盖：查询命中与键盘选择、关闭态原地开启、不可用禁用输入、页面顶部查询走预览且 `add` 从未被调用、预览页仍可继续搜索、以及真实发布物 `lib/client.js` 在 jsdom 里走完预览流程后 localStorage 中的自选不变。
- 未验证：桌面安装后的实际像素；下拉在极窄窗口下的换行表现未在真实 Electron 窗口核对。

## 分时获取失败：同源重试、换源与冷却 — 2026-10-28

- 问题（截图）：打开分时经常「分时获取失败」，手点重试好几次才出来。
- 实测（本机，2026-10-28 11:00 前后，非推断）：东财 `push2.eastmoney.com/api/qt/stock/trends2/get` 单发 8 次只有 5 次成功，6 并发时 30 次**全部** `Empty reply from server`——约 0.1 s 接受连接后直接断开，不是超时；同一时刻腾讯 `web.ifzq.gtimg.cn/appstock/app/minute/query` 5/5 成功、约 215 ms。原来的 `loadIntraday` 只有一次请求，没有重试也没有第二个源，所以第一次碰到断链就整块报错。
- 实现：`loadIntraday` 改成 东财（同源失败立即重试 1 次，单次预算 5 s）→ 腾讯 1 分钟分时（同样重试 1 次）→ 抛错。腾讯只给累计成交量/成交额，所以每分钟成交量取相邻累计值之差，均价 = 累计成交额 ÷（累计手数 × 100），`volumeBasis` 仍是 `lots`，来源标为「腾讯分时」，不冒充东财。单个源失败后 60 s 内跳过（冷却），但两个源都失败时会清掉东财的冷却，下一轮从主源重新开始，不会让人卡在只剩回退源的等待里。
- 判定：两个源都传输失败 → `finance/market-unavailable`（界面「分时获取失败」+ 重试）；只要有一个源明确回答「这只股票没有分时」→ `finance/intraday-unavailable`（界面「暂无分时」）。不把「取不到」说成「没有」。
- 前端：一次失败最多再试 3 次（0.7 s / 1.4 s 退避，单轮 20 s 预算）；已经有线时刷新失败不再清空图，改为保留上次抓到的分时并在下方标注抓取时间与重试按钮，同时把「不会用旧线替代」的文案改成「没有已抓取的分时时不会……」。
- 一致性核对（本机 11:05 两份同一时刻的原始响应，不是只比最后一点）：东财与腾讯重叠 95 个分钟，价格与累计成交量完全相同，均价差 < 0.001；逐分钟成交量取差后逐点一致（正在形成的最后一分钟除外，因为它随时还在长）。
- 真实冒烟：正常时走东财（三个代码 229–542 ms）；把东财强制断链后 684 ms 内回退到腾讯并出图；紧接着的第二个代码只发 1 次请求、55 ms（冷却生效）。
- 测试：`pnpm test` — **597 tests, 0 failed**。新增覆盖：腾讯累计值差分与均价推导（含收市后行、午餐时段、未来日期拒绝）、RPC 投影接受回退线、主源重试后成功、主源断链后换源并标注来源、冷却跳过主源、两源都挂报失败而空数据报不可用、前端失败重试与「保留旧线 + 标注时间」。
- 未验证：桌面安装后的真实像素；东财限流窗口的长度（本轮只观察到持续数分钟）与腾讯在持续请求下的长期限流行为未长期观察。

## 沪深300基金规模占流通市值比例面板 — 2026-10-27

- 需求：在「市场 → 沪深300」下钻里加一张「头部沪深300基金市值占沪深300流通市值比例」的图；用户选择「快照 + 季度趋势」和「全部沪深300指数基金（含场外）」。
- 数据链路（本机实测，不是推断）：基金目录与规模来自中证指数 `https://www.csindex.com.cn/csindex-home/index-list/queryByIndexCode/000300`（175 条跟踪产品，含 ETF/LOF/场外指数/指数增强/联接/海外 ETN）；流通市值来自腾讯 `qt.gtimg.cn/q=sh000300` 第 44 字段（488,918.40 亿元，与东财 `f117` 的 48,894,034,176,087 元一致）；季度规模来自各基金 `https://fund.eastmoney.com/pingzhongdata/<code>.js` 的 `Data_fluctuationScale`（单位亿元，510300 的 2026-09-30 为 1068.79 亿，与中证目录的 1069.56 亿一致）；季度末点位来自中证指数 `perf/index-perf`。
- 口径：只计境内 6 位代码的 ETF、LOF、场外指数基金；剔除 ETF 联接（重复计算）、指数增强（主动仓位）与海外 ETF（币种不同）。A/C 份额各自计入，加总为同一组合总规模。趋势按当前目录的固定基金集合加总；某季度覆盖不足当前规模 80% 时丢弃该季度，`historyCoverage` 报告最新季度覆盖率。历史流通市值按点位折算并在 UI 标注估算。
- 真实冒烟（本机，2026-10-27 08:20）：42 只基金、规模合计 2,815.07 亿元、流通市值 488,918.40 亿元、比例 **0.576%**；趋势 5 个季度（2025-09-30 至 2026-09-30），最新季度覆盖 97.5%；合并请求约 **1.2 s**（并发 6），Host 缓存 6 小时。东财 `push2` 在本机会间歇性空回包，因此分母改用腾讯指数行情；中证与天天基金接口本轮稳定。
- 实现：`MarketProvider.csi300Funds()` + RPC kind `csi300-funds`；RPC 边界 `projectCsi300FundShare` 重算合计与比例、校验日期/代码/类型/覆盖率，并要求 `estimatedFloatCap: true`。客户端 `Csi300FundShare` 只在 `indexChart.code === 'SH.000300'` 时挂载在日 K 之前，含比例、头部基金构成条、SVG 季度折线、可展开的季度表与前 10 只基金表。
- 测试：`node --test test/*.test.ts` — **288 tests, 0 failed**；typecheck 与包构建通过。新增覆盖：目录过滤与排序、脚本解析与坏行丢弃、点位/流通市值校验、覆盖率裁剪、四上游合并与缓存复用、单基金脚本失败仍计快照、请求参数校验、RPC 投影重算与拒绝不一致载荷、市场路由的 kind 分发与缺少能力时的降级、以及 jsdom 断言面板只在沪深300下钻出现并渲染比例/趋势/表格。
- 未验证：桌面安装后的实际像素（本轮只跑 jsdom 与真实上游 HTTP）；当前 desktop profile 安装的是 0.12.0，这份本地构建需要重新链接/发布后才会出现在应用里；基金规模是季报口径，季报切换当天的覆盖率与限流行为未长期观察。

## 港股指数可点开日 K 与量化 — 2026-10-26

- 问题（截图）：第 8–12 张指数卡（恒生指数、国企指数、恒生科技、红筹指数、中证2000）点不动，而同一行前几张可以。根因是 `canDrillIndex` 只接受 `SH|SZ|BJ.\d{6}` 并显式排除 `SH.932000`，所以这几张卡连 `onClick`/`role`/`tabIndex` 都没挂。
- 实测（不是推断）：`newfqkline?param=hkHSI,day` 返回完整日线（最新 2026-10-26 收 23156.96），`hkHSI` 加 `qfq` 时上游仍只给 `day`；`sh932000` 返回 **`day: []`**，东财 `push2his` 的 `1.932000` / `2.932000` 都是 `data: null`（rc 102）。所以港股四张能修，中证2000 修不了。
- 符号域：新增 `HK_INDEX_SYMBOLS`（恰好四个代码）与 `validateHistorySymbol`，只放宽 history 一路。报价批量、分时、尾盘扫描、A 股自选继续走 `validateSymbol`，`HK.HSX`/`HK.00700`/`HK.hsi` 仍被拒，港股不会混进 A 股自选。
- 币种与时区：`MarketHistory` 的 `currency` / `amountUnit` / `exchangeTimezone` 从固定 `CNY`+`Asia/Shanghai` 改为按符号取 `HKD`+`Asia/Hong_Kong`。这不是照抄适配器：RPC 的 `projectHistoryResponse` 也按符号重算，替换源即使把 A 股那一对抄进载荷也会被改回港币与香港时区。`isFinal` 的「今天」改用 `zoneToday(now, timeZone)`，A 股结果不变。
- 成交量：港股指数行把成交额放在成交量位（`row[5]` 与 `row[8]×1e4` 是同一个数），因此港股日 K 的 `volume` 留空、`volumeBasis: 'unknown'`，成交额仍进 `amount`。没有把港币成交额标成股数。
- 客户端：`canDrillIndex` 放开 `HK.*`（中证2000 继续排除）；港股图表隐藏「分时」页签（分时端点仍是 A 股专用，留着只会点出错误卡），历史里存着 `intraday` 时回落到日 K。提示文案与图表脚注同步说明港股为港币/香港时间、量能留空。
- 测试：`pnpm --filter dsh-x-finance test` — **278 tests, 0 failed**；`tsc -p tsconfig.json` 与包构建通过。新增覆盖：四个港股代码被 history 接受而 `HK.HSX`/`HK.00700`/`HK.hsi` 被拒、`HK.HSI` 请求走 `hkHSI` 且 `qfq` 回落记为未复权、港股投影的 HKD/香港时区/空成交量、RPC 边界按符号改写币种、以及视图层断言四张港股卡可点而中证2000 不可点。
- 未验证：桌面安装后的实际像素与真实点击（本轮只跑 jsdom 与真实上游 HTTP）；港股日 K 的长期限流与节假日行为未验证；中证2000 仍然只有报价，除非再接一个提供 932000 日线的源。

## 设置面板与老板键低调模式 — 2026-10-26

- 需求：把分散在外观、底栏、行情源上的设置收拢到一个面板；增加老板键，一键让 UI 不再像炒股界面。
- 实现：股票页右上角新增「设置」抽屉，分为外观、底部固定栏、行情数据、快捷键四段；底栏显示、免费源开关、低调模式与两组快捷键都在这里集中管理。行情源开关提升到页面层，抽屉、市场页、全球页与搜索框共用同一份状态，切换后市场/全球会重新拉取，搜索会重新检查可用性。
- 低调模式：`⌥⇧B`（Windows / Linux 为 `Alt+Shift+B`）随时切换，不影响输入框。启用后页面根节点加 `dxs-discreet`：在金融子树内重映射 `state-error` / `state-success` / `brand` / `state-warn` 与 `--dxs-up/down/accent`（用 `color-mix` 跟随明暗主题），同时把标题改成「工作台」、页签改成「列表 / 概览 / 关注 / 指数 / 商品」、抽屉标题改成「设置」，并自动隐藏底部固定栏；热力图换成低饱和的玫瑰/鼠尾草色阶，K 线与分时 canvas 降低饱和度（`saturate(.32)`），实时红点与资本标签改为中性。再按一次恢复，底栏按原来的显示开关重新挂载。
- 状态：设置只写入当前浏览器的 `dsh-x-finance:settings:v1`（`{version:1,discreet}`），不写会话、自选、行情或 profile；storage 事件跨标签同步；写入被拒绝时开关仍在内存生效，面板明确提示只在当前页面有效。
- 测试：`pnpm --filter dsh-x-finance test` — **275 tests, 0 failed**；typecheck 与 build 通过。新增覆盖：设置载荷规范化、持久化/跨标签同步/写入与读取失败、老板键匹配（含输入框、repeat、平台键帽）、面板渲染与开关回调、以及构建产物在 jsdom 中打开抽屉、开启/关闭低调模式、标题与页签改写、底栏释放与恢复。
- 未验证：桌面安装后的实际像素。内嵌 AI tab 访问 `127.0.0.1:60057` 返回 401（需要应用自己的鉴权），未读取或输入任何凭据；当前 desktop profile 安装的是已发布的 0.11.2，这份本地构建需要重新安装/链接后才会出现在应用里。抽屉用 `.dxs-page`（现为 `position:relative`）作为绝对定位祖先，未在真实 Electron 窗口里核对极窄宽度与玻璃主题叠加。

## 尾盘扫描增加上午盘 / 下午盘时段切换 — 2026-10-26

- 需求（截图）：面板固定写死 14:30–15:00，希望同一个扫描也能按上午盘和下午盘来扫。
- 口径：两个时段各取该时段最后 30 分钟。上午盘 = 11:00–11:30，下午盘 = 14:30–15:00（原行为，默认值）。请求带 `window: 'morning' | 'afternoon'`，不带时按下午盘处理，旧客户端不变。
- 基线（这是本次唯一需要新定义的地方）：下午盘继续用 10:00–14:30 的 6 个 30 分钟块中位数。上午盘在 11:00 之前只有 10:00–11:00 可用，改用 6 个 10 分钟块，每个块折算成 30 分钟口径（×3），所以两个时段的「尾盘量比」和评分可以直接对照，不会因为块变短而系统性放大。开盘半小时仍排除（集合竞价会污染第一块）。
- 实现：`TAIL_SCAN_WINDOW_SPECS` 描述两个窗口（起止、基线块、块长）；`computeTailMetrics` 接受 window，尾段涨跌取「窗口末价 ÷ 窗口起价」，尾盘成交占比改用「截至窗口结束的当日成交量」，因此 11:30 时不要求下午的分时。上午盘在 11:30 之后即判定 complete。Host 侧 `projectTailScan` 要求 window 合法，并校验每行尾段起止与窗口一致，不一致直接判无效（`tail-scan window mismatch`），不在 UI 里改名。缓存键按窗口分开（`tail-scan:morning` / `tail-scan:afternoon`）。
- 交互：面板标题下新增「上午盘 / 下午盘」分段控件（`aria-pressed`）。切换只改选择，不自动请求；当前显示的结果必须与所选窗口一致，否则显示未开始/加载态，绝不把下午的表当上午的结果展示。扫描途中切换时段时，旧窗口的结果回来后会被丢弃并回落到未开始提示，面板不会变空白（有专门用例覆盖这个竞态）。
- 文案：副标题、口径说明、不完整提示改为带 `{start}`/`{end}`/`{baseline}` 参数，上午盘/下午盘各有一套基线描述；中英文字典键与占位符一一对应。
- 真实行情冒烟（本机，2026-10-26 午间，腾讯/新浪公开接口）：上午盘 `11:00-11:30` → `complete=true`，全市场 5,577/5,577，候选池 1,241，分时 32，**尾段确认 2**（三环集团 -10.65%，尾段 -1.29%，量比 1.33，blocks 6，points 120；联特科技 -14.88%，尾段 -0.87%，量比 1.36），失败 0，约 2.5 s。同一时刻请求下午盘得到 `complete=false`、0 只确认、分时未开始——没有把上午的分时当成下午尾盘。两次请求分别命中各自缓存。
- 测试：`pnpm --filter dsh-x-finance test` — **270 tests, 0 failed**；typecheck 与 build 通过。新增覆盖：上午盘量比与基线折算、11:30 即 complete 且占比只用上午成交量、窗口不匹配/非法窗口被拒、RPC 窗口传递与默认值、provider 按窗口分缓存、以及 jsdom 断言切换时段不串用旧结果、扫描途中切换时段不显示旧表也不留空白、请求带 `window: 'morning'`。
- 未验证：桌面安装后的实际像素（本轮只跑了 jsdom）；上午盘基线用 10 分钟块，遇到极端稀疏的分钟线（10 分钟内缺 2 分钟以上）该块会被整体丢弃，个股尾部量比可能因此变 null；法定节假日与长期限流行为照旧未验证。

## 全球指数整页不可用：东财被网络阻断，改为多源回退 — 2026-10-25

- 问题（截图）：全球页整块显示「全球指数暂不可用」，开关是开的，重试无效。
- 根因（实测，不是猜测）：`push2.eastmoney.com` 在这台机器上 TLS 握手成功、证书校验通过、请求发出后**对端直接断开**（`curl: (52) Empty reply from server`，Node 为 `other side closed`）。换 `push2delay` / `82.push2` / `push2his` 等镜像、换 UA/Referer/HTTP2/IPv4、走系统代理与 SOCKS 都一样；同一 URL 经外部代理正常返回 30 行完整数据，说明上游本身没挂，是本机到该主机的链路不通。腾讯 `qt.gtimg.cn` 与新浪 `hq.sinajs.cn` 都能直连。而全球页当时只接了东财一家，所以整页失败。
- 修复：全球面板改为按 东方财富 → 腾讯 → 新浪 的顺序回退并合并。三家并发探测，先到先得，后面的源只补前面没给的代码；任一成功就出数。刚失败的源 120 秒内跳过，恢复后自动再用。页面顶部新增「当前来源：…」，降级时不会看起来像主源。
- 覆盖核对（逐条对过，不按名字硬套）：腾讯能给出 10 个（道指/标普/纳指/上证/深成/创业板/恒生/国企/恒生科技/富时100）；新浪能给出 18 个。合并后 24/30 个指数可用，三个地区都有数据。**未覆盖的 6 个**：台湾加权、新西兰50、泰国SET、菲律宾PSEi、瑞士SMI、俄罗斯RTS。新浪确实有名称相似的行，但值不对——`b_SMI` 与瑞士 SMI 相差约 18%，`b_TWSE` 与台湾加权相差约 44%——因此这 6 个在回退快照里直接不出现，不用相似行填充。
- 时间戳：三家格式不同（`2026-10-23 16:42:55`、`2026/10/23 18:31:07`、`20261023161500`），且都按交易所当地时间打印。按目录的 IANA 时区换算，跑两遍以跨过 DST 边界；未来时刻、非法日期、未知时区、以及超过 30 天的戳一律作废（新浪回退源里确有 2025 年的旧行）。交叉核对：FTSE 与东财完全一致（10:40:30Z），美股与新浪一致，港股 18:31:07 HKT → 10:31:07Z。
- 测试：`pnpm --filter dsh-x-finance test` — **264 tests, 0 failed**；typecheck 与 build 通过。新增覆盖：三家解析器的字段偏移与坏行丢弃、未知代码、倒挂区间、旧戳/未来戳/非法日期/未知时区、三源合并的先到先得、东财被阻断时降级到 24 个、冷却窗口内不再重试且到期后重试、以及 jsdom 断言页面渲染「当前来源」。
- 真实网络冒烟（本机，2026-10-25）：`provider.globalOverview()` → `腾讯全球指数 (unofficial) + 新浪全球指数 (unofficial)`，24 个指数，覆盖 americas/asiaPacific/europe，最新报价 2026-10-23T21:15:59Z，耗时约 124 ms（东财那一路先失败并被冷却）。反向验证：把真实东财响应喂进同一 provider，来源仍是 `东方财富全球指数 (unofficial)`，说明主源健康时不会被稀释。
- 一个实现细节：上游按 GBK 解码，若测试夹具用 UTF-8 写中文名，一个多字节字符会吃掉后面的 `~`，字段整体错位。夹具因此改用 ASCII 名称（解析器本来就只信目录里的名称）。
- 未验证：桌面安装后的实际像素；120 秒冷却是否会在长期使用中掩盖真实的短暂抖动（当前取舍是少等超时）；三家上游的长期限流行为。

## 临时查看改成独立详情页 — 2026-10-25

- Problem reported from a screenshot: drilling into a stock that is not on the watchlist landed on the 自选 page with the watchlist rail next to it, so the page looked like a watchlist entry and the rail was useless.
- Change: a preview now renders as its own full-width page above the tab content. `.dxs-rail` is not mounted, no tab is marked active, a sticky bar offers 返回上一页, and clicking any tab leaves the preview first. The temporary-view sentence stays at the top so the reader still knows nothing was saved and how to save it. Saving from the preview is still the only write, and it lands on the watchlist with the stock selected.
- Tests: `pnpm --filter dsh-x-finance test` — **256 tests, 0 failed**; typecheck and build pass. The drill test now asserts the rail is absent while previewing, that no tab claims the page, that the back action returns to 市场 without writing, and that switching tabs clears the preview.
- Not verified: desktop pixels after reinstall; the check is DOM-level (jsdom), not a screenshot.

## 热点题材筛选 — 2026-10-25

- Feature: the stock page gains a 「热点」tab. One manual run scores the whole market against 35 built-in strategies and ranks the hits. It never runs on mount, shares the existing opt-in free-source switch, and sends no request while that switch is off.
- Two layers, reported honestly: 19 snapshot rules (move, volume ratio, turnover rate, turnover, main inflow, amplitude, speed, 5/10/20-day moves, limit-up, within 2% of the limit) run over every A share from the Tencent rank feed; 16 history rules (Bollinger break, MACD golden/bull, MA stack, above MA20, volume breakout, 20/60-day highs, RSI, 3-day volume rise, shrinking pullback, volume bull candle, MA5 over MA10, consecutive/first limit-up) only run on the 120 highest snapshot scores. `universe.historyChecked` states that coverage instead of implying all rules ran on all symbols.
- Hit definition: at least one matched strategy with weight ≥ 2. Weak weight-1 rules only add score and tags. Without this, the first draft marked 5,129 of 5,572 symbols as hits (a 3% move or any positive main inflow alone qualified) — a headline that meant nothing. Three non-directional rules (small/large float, 60-day oversold) were replaced by high turnover, heavy turnover and near-limit conditions.
- Scoring: matched weight ÷ the run's maximum weight × 100, so the top stock is always 100. It orders one run only and is labelled as such. The list shows at most 60 rows while `hitCount` reports the true total, and the UI prints both.
- Data path: Tencent rank pages (28 × 200 rows, cached 60 s) + bounded Tencent daily bars (80 per candidate, concurrency 4, cached). No new host, no credential, no 东财 clist dependency. Every row is re-validated host-side; `projectHotScan` bounds numbers, rejects non-exchange symbols, drops unknown strategy ids and keeps `hitCount ≥ hits.length`.
- Live smoke (2026-10-25, provider called directly): universe 5,577/5,577 covered, 5,572 scanned, 120/120 history checked, 0 failed, **2,517 ms**, **1,198 hits**. Top rows: 利亚德 +20.00% (score 100, 29 tags), 兆威机电 +10.00% (93.48), 大业股份 +9.99% (91.30), 海洋王 +9.99% (91.30), 众诚科技 +30.00% (86.96).
- Tests: `pnpm --filter dsh-x-finance test` — **256 tests, 0 failed**; typecheck and build pass. New coverage: 35 unique strategies with zh/en labels, board/ST/new-listing limit rates, snapshot thresholds, history rules on synthetic bars, consecutive limit counting, strong-rule qualification, score normalisation and deterministic sorting, ranking-row unit conversions, page/request validation, Host projection (bad symbol, inconsistent coverage, unknown ids), a jsdom test proving the tab renders scores, tags and the truncated total on demand, and a handler test proving the scan is served to the owner only and fails closed when a source has no hot-scan capability.
- Not verified: Desktop pixel layout after install, sustained upstream rate limiting over hours, concept-board themes (the free source publishes none, so industry scope uses SW level-2), and anything resembling trading. The screen is a local description of one run, not a forecast.

## Mean-reversion channel: BOLL / %B / Z-Score — 2026-10-25

- Feature: the daily chart overlays a Bollinger channel (20, 2) on the price pane and adds %B (0–1) and Z-Score (σ) panes, each toggleable from the toolbar. The mid line is the same SMA(20) the MA20 line draws — one function, not a second implementation — and the analytics card's 布林 %B(20,2) now calls that function instead of keeping its own copy.
- Definitions: mid = 20-close simple mean; bands = mid ± 2 × sample deviation (n−1); %B = (close − lower) / (upper − lower); Z = (close − mid) / deviation. A flat window (deviation 0) leaves both blank rather than claiming 0.5 / 0; fewer than 20 bars leaves the whole channel blank and says why; null closes reset the window like SMA and KDJ.
- Reference lines: the Z pane marks 0 and ±2σ, the %B pane marks 0.5. These are the only arbitrary thresholds added, they are labelled on the axis and re-coloured with the theme instead of being baked in.
- Defaults: BOLL and Z-Score open on, %B stays off — it is the same deviation on a 0–1 scale, so a third readout would be a duplicate pane. A config saved before these keys existed keeps its own defaults instead of being read as "hidden by the user".
- Tests: `pnpm --filter dsh-x-finance test` — **242 tests, 0 failed**; typecheck and build pass. New coverage: hand-calculated 3-period channel/%B/Z, warm-up and gap resets, flat-window nulls, strict parameter validation, the %B–Z conversion, and adapter assertions for six panes, the one-colour channel and the four horizontal reference lines.
- Not verified: desktop pixel layout. The channel is computed on whatever interval is loaded (a weekly view means 20 weekly closes), and unlike MA50/MA250 it has no interval warning; BOLL parameters are fixed at 20/2 and are not exposed as inputs.

## 尾盘放量下跌扫描 — 2026-10-25

- Feature: the market panorama now has a manual "late-session volume-dump" scan. It reads the cached full A-share list, screens liquid decliners, confirms the 14:30–15:00 tail with 1-minute data, then loads up to 250 daily bars for the survivors. It never runs on mount and shares the existing opt-in free-source switch.
- Definitions: tail = 14:30–15:00; tail volume ratio = tail volume ÷ median of the complete 30-minute blocks from 10:00 to 14:30; tail decline = 15:00 price ÷ 14:30 price − 1. "Consecutive volume decline" is reported two ways and the larger is used: consecutive down sessions with volume above the previous session, and consecutive down sessions with volume ≥1.2× the prior five-day mean. The score is tail volume 30 + tail decline 25 + day decline 15 + daily volume 15 + streak 15. The Host re-validates every metric and recomputes the score.
- Data path: Tencent rank pages + batched quotes + daily bars. Minute data tries Tencent first; after repeated scans that endpoint returned HTTP 501 challenge pages, so the provider now falls back to Sina's 1-minute K-line JSONP. A failed request is counted, never retried blindly and never filled with an adjacent value. If both minute feeds fail for a symbol, that symbol is not a candidate and the result is marked partial.
- Live smoke: session **2026-10-23** (run on 2026-10-25; the current day is a weekend, so the UI says "latest session, not today"). Universe 5,577/5,577 covered; 499 screened after decline/turnover/volume-ratio filters; 32 minute lines checked; **8 tail-confirmed**; 8 daily histories; 0 failed requests; 1.8–2.2 s. Confirmed: 三峡新材 -6.12% (tail -4.47%, tail ratio 2.75), 星光股份 -7.78%, 海量数据 -8.69%, 大洋生物 -9.44%, 万里石 -9.99%, 华测导航 -10.61%, 华绿生物 -9.84%, 康鹏科技 -8.51%. The consecutive flag (2 sessions) applied to 万里石, 华测导航 and 华绿生物; all three were also below MA20/MA60 with RSI(14) 28–33.
- Tests: `pnpm --filter dsh-x-finance test` — **242 tests, 0 failed**; typecheck and build pass. New coverage: pure tail/baseline arithmetic, incomplete and missing-volume states, both consecutive definitions, score bounds, Host projection (recomputed score, rejected malformed rows), provider pipeline and caching, failed-minute accounting, Sina JSONP parsing and fallback, exact RPC identity/owner boundary, and a jsdom test proving the scan is manual, renders candidates and filters consecutive rows.
- Not verified: Desktop pixel layout, sustained upstream rate limits over hours, statutory holidays, level-2/fund-flow/news data, or real trading. The scan is a local description of one session, not a forecast or advice.

## Source switch was invisible in dark themes — 2026-10-24

- Bug reported from a screenshot: with the free source on, the header switch rendered as a blank white pill with no readable on/off state.
- Cause, confirmed by sampling the screenshot rather than guessing: the on state painted the track with `--dsw-alias-brand-primary`, which this dark theme resolves to near-white `rgb(249,250,251)`, while the knob was a literal `#fff`. Track and knob therefore collapsed into one colour. The knob sat on the right, so the switch was in fact on — it just could not be seen.
- Fix: the switch no longer depends on the host accent. The on track takes `--dxs-fg` and the knob takes `--dxs-bg`, so the two are always opposing colours in either theme; the off state uses `--dxs-line` with a `--dxs-muted` knob. Label and focus ring moved to the plugin's own tokens. No JSX changed.
- Verification: the reported state was reproduced offline (old rules, simulated dark theme) and rendered next to the new rules with headless Chrome at 2x. Dark theme: before = blank white pill, after = light track with a dark knob on the right when on, and a grey knob on the left when off. Light theme re-rendered too, since that is where brand-primary is a real blue; both states stay legible there.
- Tests: `pnpm --filter dsh-x-finance test` — **223 tests, 0 failed**; typecheck and build pass. A new guard asserts the checked track uses `--dxs-fg` and never the brand accent, and that the knob uses `--dxs-bg` rather than a bare `#fff`, which is the exact regression.
- Not verified: real Desktop pixels after install; the check used a simulated theme with the tokens sampled from the user's screenshot, not the live shell.

## MA50 / MA250 (季线 / 年线) on the daily chart — 2026-10-24

- Gap: the chart offered only MA5/10/20, so the long-term 季线/年线 that readers commonly look at had no line at all. The indicator engine already accepted any period up to 500; only the chart's fixed period list was the limit.
- Change: `CHART_MA_PERIODS` (5/10/20/50/250) now drives the toolbar checkboxes, the readout, the data-table columns and the adapter's series. `DEFAULT_MA_PERIODS` stays 5/10/20 for callers that never opt in. MA50/MA250 default to **off**, because they need 50 and 250 bars of warm-up and a fresh chart should not open with two blank lines.
- Stored settings: `normalizeChartConfig` now distinguishes "absent" from "explicitly false" per period, so a config saved before these periods existed keeps the user's MA5/10/20 choices and leaves 50/250 at their own defaults. Unknown keys are still dropped.
- Empty-line honesty: when a switched-on period exceeds the loaded bar count, the chart says so instead of leaving an unexplained gap; on weekly/monthly/yearly views it also states that the period unit changes and daily is the intended view.
- Tests: `pnpm --filter dsh-x-finance test` — **222 tests, 0 failed**; typecheck and build pass. New coverage asserts the default visibility map, legacy-config migration for both the absent and explicit-false cases, unknown-key dropping, MA250 producing `bars - 249` varying points (never one repeated value), a 100-bar history leaving MA250 entirely null, and the adapter creating five price-pane MA series that start hidden and become visible when configured.
- Live check of the built host modules: 中证800 (`SH.000906`) with 1,000 daily bars returned MA5 4571.67 / MA10 4628.89 / MA20 4794.57 / MA50 5006.26 / MA250 5202.25 against a 4567.26 close.
- Not verified: real Desktop pixels for the two extra toolbar checkboxes and the five-column data table, and how the legend reads at narrow widths. The 1,000-bar cap means MA250 has about 751 usable points on a full history; a newly listed stock may never show it.

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

## 玻璃材质接入（2026-10-25）

`test/glass-surface.test.ts` 断言：.dxs-bar blur, .dxs-page near-opaque pane。所有规则都带 `none` / 原底色回退，未安装 `dsh-x-ui` 时行为不变。

**未验证**：真实浏览器里的模糊与观感。

## 涨停接力概率（2026-10-27）

- `pnpm --filter dsh-x-finance test`：**303 tests, 0 failed**（新增 `test/predict.test.ts` 21 条、`test/predict-view.test.ts` 4 条）。覆盖：板别涨跌停价与 ST/新股判定、封板需要「涨幅 + 收在最高」、回溯连板只向过去读、特征确定性/窗口/缺口处理、分位映射边界、模型文件与共享特征表一致、系数符号与概率单调性、行级 reason/risk 只来自股票级特征、投影拒绝篡改与丢弃未知标签、按概率排序的确定性、请求形状闭包、RPC 端到端（owner-only、投影、上游异常归因到 `finance/predict-scan-unavailable`）、中英词条对齐。
- 新宿主接口：`dsh-x-finance.market` 的 `predict-scan` kind。一次运行 = 一次全市场排行快照 + 最多 90 只候选的 80 根前复权日 K（并发 4），宿主缓存 2 分钟；客户端挂载不发请求，只有显式点击才调用。
- 研究脚本 `scripts/finance-research.mjs`：`fetch` 缓存 1,471 只股票 × 640 根日 K 到 `.research/`（已 gitignore）；`fit` 按月滚动重拟合、只用当月之前的数据，情绪分位 knot 也只取样本外区间之前的值；`scan` 导入真实 `createTencentMarketProvider()` 跑端到端。
- 模型与样本外（2025-10-23..2026-10-23，243 个交易日、5,682 条样本）：AUC **0.680**、Brier **0.1371**（基准晋级率 18.9%）、残差 IC **-0.038**。按残差排序前 3 只、次日开盘买入/T+2 收盘卖出、扣 0.2% 往返成本，平均 **-1.84%/笔**、累计 -99.2%、最大回撤 -99.3%。结论写进面板：这是概率观察表，不是买入信号。
- 基准表（n=14,258）：晋级率 6.3% / 17.8% / 32.7% / 44.1% / 49.7%，对应未封板、首板、2 板、3 板、4 板+；次日开盘溢价 +2.23% → +4.06%；接力期望 -3.41% / -0.36% / -0.69% / -0.99% / +0.19%。
- 真实数据端到端（2026-10-27 13:13 Asia/Shanghai，直接调用 provider）：覆盖 5,577 只、候选 50 只、评分 50 只、0 失败、**1,286 ms**；情绪「冷清」（hotShare 1.1%、upShare 19.3%、分位 12）；榜首多伦科技 4 板，p=73.4%、同组 49.7%。
- 单日极端值处理：原始 hotShare 在 2024-09-30 达到 64.5%，会独占线性项；因此市场级特征改为训练期分位映射，标准化输入在 ±5σ 截断，样本外数据不参与 knot。
- **未验证**：面板在正在运行的 Desktop 应用里的实际观感（需要重启宿主才能加载新插件版本）；CSS 只在 jsdom 与静态截图里检查过，未在真实窗口尺寸下逐档核对。
- **已知边界**：样本为当前在市股票，存在生存者偏差；北交所、ST 与新股不在训练/服务范围内；盘中运行时最后一根日 K 未收盘，结果会随收盘变化；次日一字锁板无法在开盘买入，已从回测剔除但无法从实盘剔除。

## 涨停接力面板的样式修复（2026-10-27，0.14.1）

- **现象**：0.14.0 在宽窗口下整个「预测」面板没有样式——概率、卡片、表格全部退化成纯文本流，复选框还被 `.dxs input` 撑成整行蓝色方块。
- **根因**：rebase 到远端 0.13.0 时解决 `market/styles.ts` 冲突，只保留了一个收尾花括号：CSI300 那段的 `@media(max-width:720px){` 一直没闭合，于是后面 79 行 `.dxs-predict-*` 规则全被套进这条媒体查询，只在窗口窄于 720px 时生效。`tsc`、esbuild 和原有的渲染测试都不会报错——CSS 字符串只是数据。
- **修复**：补回缺失的 `}`（`MARKET_CSS` 现在 385 开 / 385 闭），并新增回归测试 `the injected stylesheet stays balanced and keeps each panel at top level`：断开花括号计数，且每个面板的首条规则（`.dxs-hot-row{`、`.dxs-csi300{`、`.dxs-predict-regime{`、`.dxs-predict-row{`、`.dxs-predict-toggle{`）在字符串里的嵌套深度必须是 0。这条测试在修复前会失败。
- **同时改版**：宽屏（≥1000px）下榜单改成 10 列对比表（排名 / 晋级概率 / 股票 / 连板 / 现价·涨幅 / 同组 / 偏差 / 同组接力 / 胜率 / 依据·风险），行高由 118px 降到 51px；窄屏保持卡片式，四个指标压成一行。新增 `predict.col.*` 中英词条。
- **验证**：`pnpm --filter dsh-x-finance test` 与根 `pnpm test` 全绿（**586 passed / 0 failed**，1 skipped）；用真实 provider 数据在 1646×830 与 760×830 两个宽度下静态渲染核对，无横向溢出（`scrollWidth === clientWidth`）。
- **仍未验证**：真实 Electron 窗口里的字体渲染与滚动性能；只做了两点宽度的静态截图与 jsdom 断言。

## Company fundamentals — 2026-11-02

- New host seam `dsh-x-finance.market` kind `fundamentals`: owner-only, one A-share symbol, 5-minute cache, 256 KiB cap, two fixed HTTPS hosts, redirects rejected, 10 s timeout. Only projected fields leave the Host; raw payloads and upstream errors never do.
- The two upstreams are independent. A throttled report host keeps the valuation snapshot and marks it `partial`; only both failing is a panel error. An ETF/LOF answers locally without a request.
- Parser tests cover hundredths scaling for PE/PB, negative multiples, missing cells, cumulative report periods, duplicate and foreign rows, the 8-period cap, and a one-host-down partial. Projection tests reject a wrong symbol, NaN, a negative market cap, unsorted periods and an ETF answer carrying a P&L.
- jsdom panel tests cover the Chinese and English copy, the six valuation cells, loss labelling, unconfigured/error/retry/partial states, and the ETF no-request path. All fixtures are offline; no live upstream, real filing or Desktop acceptance is claimed.

## 热点筛选被一只新股打空 — 2026-11-03

- **现象**：工作台「热点」页点「运行筛选」后只剩「热点筛选暂不可用」，行业条、范围说明都在，但没有任何结果；同一时刻市场概览和底部报价正常。
- **根因**：宿主投影 `projectHotScan` 把单行涨幅限制在 ±100%，而快照解析器 `parseHotRow` 允许 ±1000%。当天排行里有一只上市首日的新股（N皇冠新材，+650.94%）——首日不受板块涨跌停约束——投影遇到它直接抛 `finance/hot-scan-invalid`，`market-rpc` 再把整次扫描归为 `finance/hot-scan-unavailable`，于是 800 条命中全部被丢弃。规则层本身没有崩，坏在信任边界比数据源窄。
- **修复**：投影的涨幅边界改成与解析器一致的 ±1000，并在代码里写明新股首日的原因；其余校验不变，异常载荷仍然整包拒绝。
- **验证**：直接调用真实 provider + `projectHotScan`（2026-11-03 11:02 Asia/Shanghai）：修复前必然抛错，修复后 60 行 / 796 条命中 / 覆盖 5,576 / 历史层 120 只 / 2.3 s。新增回归测试喂入 +650.94% 的首日行，断言它被保留而不是拖垮整次投影；`pnpm --filter dsh-x-finance test` **502 passed / 0 failed**，含重新构建的 `lib`。
- **未验证 / 使用前提**：Desktop 宿主进程仍加载着旧 `lib/hot.js`，需重启应用后才会用上这次修复；客户端没有改动，不需要单独刷新页面。

## 自选栏显示最近价与涨跌幅，移除左下添加表单 — 2026-11-05

- **截图问题**：左上「我的自选」每行只有名称与代码，看不到价格；左下仍是一整块「添加自选」表单（交易所 / 六位代码 / 别名 / 固定），和页首的「查询股票」统一入口重复。
- **左上**：每行改成两列网格——左侧名称、代码，右侧最近价与带正负号的涨跌幅（沿用 `--dxs-up` / `--dxs-down` 与报价精度，涨幅为 0 或缺失时价格回到正文色、涨跌幅用次要色）。行标题保留 `symbol · 状态 · 点击查看详情`；固定状态由行内实心星标与栏头 `已固定 n/8` 表达，不再额外占一个「固定」徽标，把宽度留给名称。栏头新增一行状态：`实时行情 · 来源 · 更新时间`；报价超过 3 分钟或休市时改说「最近行情」，源未开启 / 加载中 / 失败各有一句。空清单不显示这行状态。
- **行情读取**：新增资源地址 `dsh-resource://dsh-x-finance/list/<symbols>`。Host 的单次批量报价上限仍是 8 只（`MARKET_MAX_QUOTES`），所以客户端资源按 8 只分片顺序请求、合并后按原清单顺序返回；一份快照仍只占用一个资源订阅，列表变化或排序时重订阅，切走页签 / 打开临时查看时直接卸载并停止轮询。开市时 10 秒一轮，报价时间超过 3 分钟自动退到 60 秒；源关闭时只请求一次 `unconfigured`，不继续轮询。
- **左下**：删除 `AddStock`、`InstrumentSearch` 与批处理/别名表单，保留固定栏开关、快捷键提示和「说明」。保存只剩详情页的「加入自选」一个显式动作，别名默认取目录名称，固定仍用行内星标。窄窗口下页首查询不再被隐藏（会压到 160–170px、页签横向滚动，市场切换收窄但不消失），否则宽屏切到「美股」后再缩窄会留下一个看不见的活动筛选。
- **验证**：`pnpm --filter dsh-x-finance test` — **514 tests, 0 failed**；`pnpm run build` 通过。新增覆盖：17 只清单被拆成 8/8/1 三批并在乱序响应后仍按清单顺序合并、空清单地址不触发任何 RPC、列表轮询使用 10 秒间隔、重复/未知地址继续拒绝；jsdom 集成测试从页首搜索进入临时查看、点「加入自选」保存后移除，并断言行内出现价格与涨幅、左下已无表单。
- **未验证**：真实 Electron 窗口里的实际行宽、名称截断与窄窗口页签滚动；本地 jsdom 没有布局引擎，只验证结构、状态机和样式表文本。插件已重新构建到 `lib/`，Desktop 若未热载入客户端 bundle 需刷新页面或重启应用。

## 个股页 UX 重构：图表优先、吸顶报价头、可折叠自选分析 — 2026-11-05

- **截图问题**：打开任意一只股票，右侧最先看到的是「每日自选分析」的说明、同步按钮和大段设置文字，接着是报告期持仓表，图表被推到很下面；自选分析每次切换股票都要重新滚过。个股头和报价也不随滚动保留，宽屏上价格与名称距离很远。
- **信息架构**：个股页改成「图表优先」——顶部是一条默认折叠的「自选量化信号」摘要（标题、当前状态一句话、`分析我的自选`、展开箭头），下面紧接吸顶的报价头（名称、代码、别名/临时查看标记、紧挨名称的价格与涨跌、状态、固定开关；价格不再被推到窗口最右），再下面是两个页签：股票「行情 / 财务」，ETF 与 LOF「行情 / 持仓」。行情页先显示日 K / 分时与量化回放；持仓表与财报不再挡在图表前面。原来的「分析」占位卡已移除，避免用一个永远「数据不足」的区块占位置。
- **吸顶与切换**：报价头和页签一起吸顶（预览页保留自己的返回条，不吸顶）；切换页签时把个股头滚回顶部；切换股票时把工作区滚回顶部。股票切股票、ETF 切 ETF 会保留仍然有效的页签（例如连续比较多只股票的「财务」），股票与 ETF 互切时回退到「行情」。
- **固定与预览**：已保存的个股在报价头提供「固定 / 取消固定」，与左栏星标同步；临时查看仍只显示「加入自选」，不重复一个无法使用的固定按钮。
- **首次打开**：空自选不再显示一张没有股票的图表工作台；改为居中的「从一只股票开始」卡片（说明顶部查询 + 市场 / 热点入口），本地图表导入收进「本地图表与导入」折叠区，保留原有 DEMO / 本地 JSON 能力。
- **分析条**：`WatchSignals` 默认折叠，只保留标题、状态摘要（源未开启 / 等待分析 / 进度）、运行按钮和展开箭头；运行分析会自动展开结果，展开后才挂载每日后台分析的设置面板。折叠状态不写存储，不改变任何请求或同意状态。空自选时整个分析条不渲染，首屏留给开始卡片。
- **验证**：`pnpm --filter dsh-x-finance test` — **515 tests, 0 failed**；build 与 typecheck 通过。新增/更新覆盖：分析条默认折叠、可展开/收起且展开不触发请求、运行自动展开；个股页首次空状态开始卡；个股报价头的固定按钮与「行情 / 财务」页签、切到财务后财报面板挂载；原有持仓/财报组件测试保持直接渲染。
- **未验证**：真实 Electron 窗口中的吸顶叠层、滚动回弹、宽屏下的价格/名称距离与窄窗口页签换行；本轮没有浏览器控制，无法截取正在运行的 Desktop 页面。jsdom 只验证结构、状态机与样式表文本。
