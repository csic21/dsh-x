# dsh-x-stock

为 DeepSeek Harness 提供只读股票报价工具 `dsh_x_stock_quote`。不包含交易、下单、账户或持仓接口，也不提供投资建议。

## 配置与使用

与 `dsh-x-plan` 一样，通过包内 `dsh.bundle.patch` 和 `cordis.patch.yml` 注册 Cordis 插件；需要宿主提供 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`。本实现按官方内核 `v0.2.1-alpha.5` 的 `defineTool` 接口编写，运行时 Node.js 22 或更新版本。

在启动宿主的环境中设置 `FINNHUB_API_KEY`。请通过自己的密钥管理方式设置，不要向模型发送密钥、放进工具参数、提交到仓库或写入打包产物。插件不会创建账户、保存密钥或购买订阅。没有密钥时直接返回配置提示，不发请求。

例如要求模型：“查询 AAPL 报价并告诉我报价时间。”工具参数：`{"symbol":"AAPL"}`。一次只接受一个明确的 Finnhub 代码，自动去除首尾空白并转为大写；允许字母、数字、点和连字符，最多 32 个字符。代码语法有效不代表供应商支持该证券。遇到歧义应先向用户确认。

## 数据来源与边界

- 使用 Finnhub 官方 `GET https://finnhub.io/api/v1/quote`，代码放在 `symbol` 查询参数，密钥放在 `X-Finnhub-Token` 请求头。
- 官方文档：https://finnhub.io/docs/api/quote
- 官方 SDK 的鉴权与字段说明：https://github.com/Finnhub-Stock-API/finnhub-go 和 https://github.com/Finnhub-Stock-API/finnhub-go/blob/master/docs/Quote.md
- 返回价格、开盘/最高/最低/前收盘、涨跌额和涨跌百分比，以及供应商、抓取时间和可用的报价时间。缺失的可选数据为 `null`，不会自动补成零。
- `quotedAt` 来自响应中的 Unix 秒时间 `t`；缺失则为 `null`。`fetchedAt` 只是抓取时间，不能当作行情时间。百分比保留供应商的百分数，不额外乘以 100。
- 接口不提供币种，因此插件不推断或输出币种。报价可能延迟、停留在前一个交易时段，市场覆盖和许可取决于供应商及账户订阅；不能保证实时、A 股/港股覆盖或所有代码可用。
- 不使用未验证的免密接口或网页抓取作为兜底。没有做带真实密钥的在线验证；离线测试全部使用模拟响应，示例数字不是实时行情。

## 安全与可靠性

固定 HTTPS 主机，拒绝重定向；默认整个请求含响应体最多 10 秒，响应体最多 16 KiB；尊重宿主取消信号，不自动重试限流请求。校验 JSON、价格、可选数值和时间。上游错误正文及原始网络错误不会回传，避免泄露密钥。成功结果会明确包含数据限制提醒。

插件不改变宿主的工具审批策略。外部返回内容仅作为行情数据校验，不执行其中任何指令。

## 测试

在此目录运行 `npm test`，不需要密钥或网络。覆盖格式、请求目标与鉴权方式、来源时间、缺失字段、非法响应、HTTP 错误、响应体上限、密钥脱敏、请求取消与超时、工具声明与参数传递。

## A 股自选界面（新增）

界面与原有 Finnhub 工具相互独立。侧栏新增「股票」入口，通过官方 `main` keyed slot 打开独立股票详情页；底部条点击股票先选择该股，再用 `ctx.layout.selectPanel('dsh-x-stock')` 导航，不改当前 Session，也不向对话插入消息。「返回对话」调用 `selectPanel(null)`。

- 手动选择上海、深圳或北京交易所并填写六位代码，内部标识如 `SH.600519`、`SZ.000001`、`BJ.430047`。不把同代码的不同交易所合并，不猜上市市场。
- 最多固定八只，可填自定义别名、删除、上移/下移；添加只校验代码格式，不声称验证证券存在性。保持用户手动顺序，不自动按涨跌排序。
- 底条单行横向滚动，不跑马灯；显示名称或代码、价格、带正负号的涨跌幅；收起后保留自选数量及恢复按钮。股票详情页始终是独立入口。
- `localStorage` 只保存版本、代码/别名、顺序、收起状态；不保存行情、密钥、账户、持仓或生成的分析。同浏览器、同站点、同宿主 profile 可恢复，标签页通过 storage 事件同步；不跨设备或浏览器同步。宿主在官方 `profileContext.dir` 下持久化普通随机 scope 标识，通过受保护的精确 route 交给客户端。客户端确认 scope 后才读取对应 localStorage key；不同 home/profile 隔离，同 profile 重启稳定。旧未分区 key 不迁移。切换/重连期间清空旧视图并停止存储事件读取，获取 scope 失败时暂停管理，可重试。scope 不是凭据，不包含目录路径或凭据哈希。存储拒绝时保留当前内存操作并展示提示。
- 详情页提供报价/来源/报价时间/获取时间，走势与成交、基本面和分析区块。没有数据时明确留空，不绘制假 K 线、不编财务指标、不生成没有依据的判断。

### 行情现状与可替换接口

**当前 A 股界面默认「未配置行情」，不是实时行情成品。** 没有配置、抓取或转发未经确认授权的免密行情源。Finnhub 工具仍可用，但不会把美股订阅当作 A 股数据源，也不会自动索取或把 `FINNHUB_API_KEY` 发到浏览器。用户可以先维护清单，行情接入需另行确认数据供应商、许可范围、费用和凭据。

Host 的 `createWatchlistHandler({ provider })` 为未来获授权适配器保留边界；默认不传 provider。适配器实现 `name` 与 `quote(symbol, { signal })`，输出 `symbol/name/price/changePercent/quotedAt/marketStatus`。Host 验证并投影允许字段，不将原始响应、错误或密钥送客户端。历史行情、成交量、基本面及基于来源的分析尚未实现；这些能力未来须单独提供，当前不以 quote 接口虚构它们。

客户端 `resources` provider 通过官方 `connection.rpc.call('/api', 'dsh-x-stock.quotes', { symbols }, signal)` 调用；Host 使用同一 Connection 的 `connection.fetch.register` 精确 POST `/api/dsh-x-stock.quotes`（不占用 Gateway 的 `/api` 拦截器），验证并回显标准 RPC envelope；官方 shared Connection 在调用精确 route 前强制验证所有者，仅接受 owner principal、确切参数、最多八个不重复的交易所限定代码。原有工具在没有 Connection 的 headless composition 下继续工作。没有自行开放监听端口，也不通过模型调用获取 UI 数据。

有可用适配器时，资源按 60 秒周期更新；隐藏窗口或离线暂停，组件卸载/收起释放订阅并取消在途请求。未配置源不周期轮询。失败保留资源框架最近成功值并标注旧数据；三分钟前的报价标为旧报价。只有供应商明确提供 closed 才标休市，不用本地工作日规则猜节假日/停牌。此实现不承诺实时或交易所级延迟。

### 底部插槽与冲突

依据官方源码 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`，`shell.bottom` 是 **root/single**，不是增量列表；`experimental-inspector` 可能长期占用，即使其 DOM 隐藏也算占用。插件在 `slots.inject` 声明生命周期内通过公开 `entries/subscribe` 检查，仅空位时挂载，使用最低优先级作为竞争安全保障；其他注册出现就退让，移除后恢复。冲突状态在独立股票页说明，清单不会丢失。不覆盖 composer、不将浮层伪装为全宽底部槽，也不修改内核。

独立页使用 `main` 的自有 key `dsh-x-stock`；侧栏使用 `sidebar.panellist` 自有同名 id。`shell.bottom` 为 single，故不伪造 id。

### 构建与验证

在仓库根 `npm ci` 后执行 `npm --prefix packages/dsh-x-stock run build`。`lib/client.js` 是正式 `window.__ModuleLoader__.load({ id, factory(require) })` 客户端产物；React 由宿主共享模块表提供，`package.json` 声明 `./client` 导出及 `dsh.client.inject` 依赖。它不是动态 Cordis 代码片段。已生成的 `lib/client.js` 随包交付，宿主无需在运行时编译 JSX。

`npm --prefix packages/dsh-x-stock test` 验证原有行情工具、A 股身份/清单/存储拒绝、RPC 所有者与输入边界、slot 冲突/恢复/卸载、资源暂停取消，profile 标识原子发布/跨 home 与 profile 隔离/重启稳定/初始化竞态，以及实际构建产物在 jsdom 中的独立页导航、管理和折叠交互。测试行情均为明确的离线 fixture，不是在线证券数据。jsdom 不验证像素布局，也不证明真实桌面浏览器完整流程；生产数据源及真实浏览器视觉验收仍需单独完成。
