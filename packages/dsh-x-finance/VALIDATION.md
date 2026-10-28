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
