# dsh-x 安装与插件验证报告

日期：2026-10-16（UTC）

## 版本与环境

- 用户源码：`csic21/dsh-x` main，提交 `c967c3ce7a949313fcdaa6c8db49c8fcb3f055e4`。经 GitHub 连接器读取；原始 30 个文件的 Git blob hash 全部与远端相符，原始 tree 为 `333751a445923e8bbb91dca8f244a71075d90e79`。
- 官方项目：[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。查阅源码固定在 `1517a4dbca0a2789ff1d41ba439600f8547d23fa`，根版本 `0.2.1-alpha.5`。
- 实际安装：官方 npm `@deepseek-ai/dsh@0.2.1-alpha.5`，CLI `--version` 实际返回相同版本。npm 的 latest 标签当时仍是 `0.2.0-rc.2`，因此显式固定版本，没有使用 latest。
- 云端 Linux 隔离工作目录；Node v24.19.0。没有操作用户电脑，没有修改官方内核，没有上传、发布或合并仓库。
- 开发依赖锁定于 package-lock.json；全新目录 `npm ci --ignore-scripts` 安装 82 个依赖后测试通过，不依赖预先存在的完整 dsh 安装。

## 已通过

1. 修改前现有 plan 单测：20/20。
2. 修改后全套：80/80，无失败、跳过或取消。
   - plan：33；股票工具与界面：32；聊天：11；真实官方服务集成：4。
3. 官方 `dsh plugin --profile web add link:...` 成功安装三个 bundle。
4. 官方 `--dump-config` 含三个插件配置层；Web profile 实际启动，临时认证 cookie 后首页 HTTP 200，HTML 37,341 字节，启动日志未发现 Error。
5. 真正的 Cordis/ToolRuntime 加载 plan，注册工具与提示词；未批准时阻断写工具，没有 approval 服务时不绕过审批。
6. 真正的官方 subprocess-local 启动本地 ACP fixture 进程，完成 initialize/session/new/session/prompt；实际命令执行和输出采集通过。
7. 股票 entry 在真正 ToolRuntime 下通过参数/输出处理；HTTP 为本地 mock。
8. 聊天 entry 在真正 ToolRuntime + LlmRuntime 下通过原生路由/流处理；模型 adapter 为本地 fixture。
9. 股票正式客户端构建后，在 jsdom 验证固定、排序、移除、折叠、导航及持久化；slot 先占用/后来占用/释放与卸载测试通过。
10. 云端官方 DSH Web 的实际 Chromium 页面已验证股票侧栏、独立详情页、固定股票、工作页面底条、点击直达该股、折叠、浏览器刷新恢复清单，以及 200% 缩放单列布局。无真实账户、无行情价格。
11. 真正官方 Host 股票桥接 HTTP 200，标准 RPC 信封、未配置行情的 null 字段均断言通过；无认证请求 401、跨 Origin 请求 403、错误市场代码拒绝。
12. 新增官方 profile scope：两个实际 DSH home 返回不同标识，同 home 重启保持稳定；同 home 不同 profile、并发创建与损坏状态单测通过。浏览器取得 scope 前不读取或保存清单，旧全局 key 不迁移；重连期间旧标签页事件不能恢复旧清单。scope 接口也验证匿名拒绝与跨 Origin 拒绝。
13. 新插件的取消、超时、异常响应、输出上限、凭据错误脱敏等测试通过；源码语法与 diff whitespace 检查通过。

## 发现并修复

- 读取计划状态异常原先返回“无草稿”，可能解除写入门禁；现在安全失败并停止本次工具执行。
- ACP 合法 JSON 值 null/数组等原先可能在 stdout 回调中触发未处理异常；现在验证 JSON-RPC 消息结构并受控失败。
- ACP 单行缓冲与累计正文原先无界；现限制单行 256,000 字符、正文 200,000 字符，超限停止。

- ACP 子进程关闭 stdin 产生 EPIPE 原先可成为未处理流错误；现捕获并使请求受控失败。用真正官方 SubprocessLocal + 关闭 fd0 的子进程验证，不只 EventEmitter mock。

## 新插件

### dsh-x-stock

`dsh_x_stock_quote`，单股票只读报价。固定 Finnhub HTTPS endpoint、拒绝重定向、校验 symbol、响应大小与数值；返回报价时间、来源和延迟声明。需要 FINNHUB_API_KEY，未加入密钥或创建账户。市场覆盖由 Finnhub 套餐决定，未承诺 A 股/港股覆盖。没有交易、持仓或资金接口。

### dsh-x-chat

`dsh_x_chat`，复用 ctx.llm 已配置提供方，显式 provider/model。本次 prompt/context 独立发送，不自动读取历史或文件，不提供模型工具；可见截断提醒，拒绝错误/缺失结束/工具调用输出。调用可能有模型费用。

股票新增独立 main 页面、sidebar 导航与 shell.bottom 自选条。最多手动固定八个交易所限定的 A 股代码，支持别名、排序、删除、折叠与当前浏览器持久化。底部单插槽有其他注册者时退让，不抢 composer。默认未配置行情，历史走势、基本面、数据驱动分析尚未实现，显示真实缺失状态。界面与 Finnhub 工具独立，不宣称 Finnhub 支持 A 股。聊天目前仍为工具，无独立聊天窗口。

## 尚未验证，不能宣称通过

- 真正 Finnhub 行情：无已授权凭据，没有发送请求或产生服务费用。
- 真正模型问答、Codex/Claude/Grok ACP 登录、真实规划→用户审批→执行→交叉验收完整链路：未配置服务账户，只有本地协议与官方运行时集成测试。
- 现有 plan 的 authenticateIfNeeded 依赖 authMethods 名称中 cached/existing/login 判断；“login” 不保证是无交互缓存认证。此项须针对实际适配器和已登录账户另行验证，未擅自更改登录行为。
- macOS/Windows Desktop 安装包、打包、签名与远端 CI：未运行。Linux 云端官方 Web/Chromium 实测不代表 Electron Desktop 安装包已验证。
- 已登录模型会话的草稿保留、真实 Inspector 插件启停竞争、所有窄屏/键盘读屏场景：尚未完整实测；纯 UI/slot 生命周期已做离线测试。
- 清单按官方 profileContext.dir 对应的普通随机 scope + 浏览器 origin 隔离；不等于独立登录账户隔离。同一个 DSH profile 的使用者共用其清单；复制整个 profile 也会复制标识。
- 精确测试版本以外的 dsh 预发布版本兼容性。

## 复现

参见 `scripts/README.md`。完整测试：`npm ci --ignore-scripts && npm test`。实际加载：用 link-plugins.mjs 链接，再运行 smoke-web.mjs。测试脚本仅使用临时文件与本地 fixture，不调用外部模型/行情服务。

官方安装与插件文档：[README](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/README.md)、[组合包安装](https://github.com/deepseek-ai/deepseek-harness/blob/1517a4dbca0a2789ff1d41ba439600f8547d23fa/docs/user/develop/basic/publish.zh.md)。

## 2026-10-17 补充：Plan 原生 Web 交互实测

在官方 DSH 0.2.1-alpha.5 的云端 Chromium 中，以独立 DSH_HOME、独立 git 测试仓库及明确标注的本地 LLM/ACP fixture，实际完成：

1. 原生会话显示 `dsh_x_plan` 生成的计划；批准前尝试 `write` 被插件阻断，测试文件保持原样。
2. `dsh_x_approve_plan` 显示官方 Waiting for approval 卡。点击 Reject 后没有批准副本，文件未修改。
3. 再次请求并点击 Allow once 后才出现 `.approved.md`；随后真实 `read`/`write` 仅修改隔离仓库中的一个测试文件。
4. `dsh_x_review` 真实采集 git diff 并运行计划中的验收命令，本地 ACP fixture 基于证据返回 pass，审查记录持久化成功。

原版 plan 是工具插件，没有独立计划页面；本次验证的是原生会话与官方审批卡。规划与验收文本来自本地确定性模拟模型，不代表真实 Codex/Claude/Grok 账号与模型质量已验证。测试没有使用外部模型、私密凭据或付费服务。演示 home、会话、测试仓库与 fixture 均在产品仓库外，不纳入源码提交。

同日已将原80测试通过版本推送至 `work/stock-chat-plugins`，提交 `1d438fa793a1e1e711b89515bcb7cca6d7f0929e`，源码树与本地交付相同。未合并或发布；现有 Desktop workflow 仅支持手动触发，该提交没有自动 Actions/check runs，不应称 CI 已通过。

## 2026-10-17 补充：三个插件国际化

- 股票、聊天、计划全部接入官方 Client locale 与自有 toolview，提供中文/英文、区域 fallback、数字与时间格式；三个包的 locale 元信息随包发布。
- 最新完整测试 **94/94**，无失败、跳过或取消；`git diff --check` 和三包 `npm pack --dry-run` 清单通过。
- 官方 DSH/Chromium 实测：股票页、侧栏、底条从 English 切中文即时更新，固定 SH.600519 不变；聊天工具卡从中文切 English，标签改变、原模型回答不变；行情工具缺密钥显示英文错误，未发送真实报价请求。
- Plan 第二轮真实计划仍阻断未批准 write；待审批期间从 English 切中文，工具标题与原生审批理由即时更新，未因此生成批准副本；测试结束拒绝该轮审批。
- 模型输出、证券名/别名、文件路径和已有原始历史不翻译。Host 面向模型的诊断仍保持原文；例如官方 write 工具因计划门禁被拒的原始诊断不由本插件接管。自有工具错误卡和审批显示文本双语。
- 本轮聊天、计划浏览器验证仍使用明确标注的本地模拟模型；未验证真实服务账号或外部模型质量。行情数据、走势与基本面接入仍待提供方。
