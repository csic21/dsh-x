# 浏览器走 CDP 怎么落地

这是决策记录，不是路线图承诺。依据是当前仓库的 `dsh-x-browser` `0.7.0` 与官方 `0.2.1-rc.3`（`compatibility/policy.json`）。不写发布日期。

结论：**保留现有模型工具面，把执行层抽成 backend；CDP 后端用 Vercel Labs 的 `agent-browser` 做引擎。** 模型仍然拿不到 JavaScript、选择器或 CDP 命令。

## 为什么是 agent-browser

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| `agent-browser`（CLI + 可选 MCP） | **用** | 语义快照带引用、tab 句柄稳定、`connect` 直连 CDP、sessions/state、Apache-2.0 |
| `chrome-devtools-mcp` | 备选 | 调试与性能最强；MCP 面偏大，作为换引擎的退路 |
| Playwright / Puppeteer 自研 | 不用 | 等待、定位、多标签、弹窗都要自己维护，和引擎重复 |
| browser-use / Stagehand | 不用 | 自带 agent 循环，和 DSH 的模型循环冲突 |
| 云浏览器（Browserbase 等） | 以后再说 | 页面内容出本机，需要云端凭据 |

我们只用它的 CLI 与 `--json`：把工具参数翻译成命令行、把快照转成统一观察、在 daemon 崩了以后关闭授权。**CDP 协议本身不重写。**

## 分层

```text
tools.ts          dsh_x_browser_tabs / dsh_x_browser_action（与 backend 无关）
    │
authority.ts      profile · session · workspace · turn · ownership · approval
    │             （grant 语义仍由后端解释：embedded 每标签每轮，CDP 配置级 + 逐动作审批）
    │
backends/types.ts BrowserBackend 接口 + Observation / TargetSummary / 错误码
    ├── embedded/      现有 webview：register/sync/poll/confirm/ack
    └── agent-browser/ 外部 Chrome：spawn · argv/JSON 映射 · 快照解析 · 进程回收
```

配置里的值仍然叫 `cdp`，目录叫 `agent-browser/`，避免把“传输协议”和“引擎”混成一个词。

```ts
interface BrowserBackend {
  kind: 'embedded' | 'cdp'
  capabilities: ReadonlySet<Action>
  ensure(scope): Promise<void>
  list(scope): Promise<TargetSummary[]>
  open(scope, url): Promise<TargetSummary>
  observe(scope, targetId): Promise<Observation>
  execute(scope, targetId, cmd): Promise<ExecutionResult>
  close(scope, targetId): Promise<void>
  dispose(scope): Promise<void>
}
```

## 五个契约决定

1. **引用只从观察来。** 引用格式由后端定（embedded 是 `e12:s3:n4`，CDP 是 `e1`），协议只做边界与模式校验；真正的准入是该 target 最新一次观察里存在这个引用，否则 `BROWSER_STALE`。
2. **能力驱动。** 工具描述、system prompt、参数校验都从 `capabilities` 推导，不写 `if (backend === 'cdp')`。
3. **统一观察。** `{ targetId, url, title, revision, refs, text, truncated }`；`url` 去掉 query 和 fragment，表单值不进观察。
4. **权限与执行分离。** scope、轮次绑定、ownership、审批只有一份，两种 backend 共用。grant 语义仍是后端自己的：embedded 是每标签每轮的显式放行，CDP 是配置级同意加逐动作审批；域名白名单由 runtime 和 CLI 两侧执行。webview 和外部 Chrome 只负责把命令送出去。
5. **失败即关闭。** daemon 崩溃、页面导航、轮次结束、租约过期，都吊销授权并拒绝命令，不自动重放已经不确实的输入。

## 能力矩阵

| 动作 | embedded | cdp |
| --- | --- | --- |
| `observe` | 可见文本 + 目标引用 | 可访问性快照 + 引用 |
| `navigate` `back` `forward` `reload` | 有 | 有 |
| `click` `type` `scroll` `press` | 有 | 有 |
| `select`（必须带 `value`） | 无 | 有 |
| `read`、`screenshot` | 无 | CLI 有，工具面未暴露 |
| `eval` `storage` `cookies` `network route` `upload` | 无 | 默认无，显式开启并审批 |

工具 schema 的动作枚举直接由 runtime 能力生成，所以矩阵和模型能发出的动作一致，不再靠文档约束。`type` 在 CDP 上映射到 `fill`（先清空再填），和 embedded 的追加输入语义不同；提示词已经写明。

每个动作前 runtime 会再取一次 `tab list` 做 epoch 校验，所以一次 action 通常是 2–3 次 CLI 调用；这是为了避免拿旧 epoch 执行，不合并成一次。

## CLI 契约（已捕获）

在本机 macOS arm64、Chrome stable 上抓的 `agent-browser 0.39.1`，测试 fixture 与这里一致：

| 项 | 事实 |
| --- | --- |
| 输出 | 每次 `--json` 打一行 `{success, data, error}`；`data` 里恒有 `lifecycle`，适配层丢弃 |
| 失败 | `success:false`、`data:null`、`error` 是字符串，**退出码仍然是 0**；只能读 JSON |
| 版本 | `agent-browser --version` 打纯文本；只接受 `0.39.x`，其它版本在动手前拒绝 |
| 快照 | `{origin, refs:{e1:{role,name}}, removedRefs, snapshot}`；`refs` 是对象，文本里是 `[ref=e1]` |
| 标签 | `tab list` → `{tabs:[{tabId,targetId,title,url,active}]}`；`tab new` → `{tabId,targetId,url,total}` |
| 打开 | `open` → `{targetId,title,url}`，不返回 tabId，要靠 `tab list` 按 targetId 对上 |
| 动作 | `click` → `{clicked:"@e1"}`、`fill` → `{filled}`、`scroll` → `{scrolled:true}`、`press` → `{pressed}` |
| 关闭 | `close` → `{closed:true}` |

两个直接后果：

- **退出码不能当失败信号**，判断只看 `success`。
- `open` 自己也接受 `file://`，所以 URL 白名单必须在适配层之前用 `parseAddress` 做，不能指望 CLI 拒绝。

在受沙箱限制的宿主里（例如本仓库的 agent 沙箱），Chrome 起不来会报 `CDP response channel closed`，需要 `--args --no-sandbox` 才能跑；正式 Desktop 不应默认关掉 Chrome 自己的沙箱，这个参数只能作为本机排障开关。

## 错误码

| 码 | 含义 |
| --- | --- |
| `BROWSER_BINARY_MISSING` | 找不到 `agent-browser` 或 Chrome |
| `BROWSER_VERSION` | CLI 主版本不在支持范围 |
| `BROWSER_PROTOCOL` | `--json` 输出不符合契约 |
| `BROWSER_DAEMON` | 进程启动失败、异常退出、socket 失效 |
| `BROWSER_TIMEOUT` | 启动、动作或空闲回收超时 |
| `BROWSER_UNSUPPORTED` | 当前 backend 不支持该动作 |
| `BROWSER_GRANT` `BROWSER_STALE` `BROWSER_RUN` `BROWSER_OWNER` | 沿用现有授权语义 |
| `BROWSER_APPROVAL` | 用户未批准或审批服务不可用 |

其余沿用现有协议错误：`BROWSER_INPUT`、`BROWSER_URL`、`BROWSER_TARGET`、`BROWSER_SECRET`、`BROWSER_BUSY`、`BROWSER_CLOSED`、`BROWSER_SCOPE`、`BROWSER_LIMIT`、`BROWSER_RESULT`、`BROWSER_OFFLINE`、`BROWSER_GUEST`、`BROWSER_REVOKED`。

所有错误都映射成工具失败，界面不能显示成“没发现问题”。

## 输出预算

- 单次观察：`text` 不超过 24 KiB，引用不超过 500 个，超出截断并标 `truncated: true`。
- 工具结果整体：沿用现有 64 KiB 上限（`MAX_RESULT_BYTES`）；超出直接失败（`BROWSER_RESULT`），不静默截断，也没有 spill。
- 每次 `observe` 取完整 `snapshot -i`；差量快照还没有接入。

## 配置

```ts
{
  backend: 'embedded' | 'cdp',   // 默认 embedded，真机验证前不改默认
  cdp: {
    command: 'agent-browser',    // PATH 上的 CLI；插件不自带二进制
    headed: true,                // 默认可见，headless 必须显式关掉
    allowedDomains: [],          // 空表示不限制；匹配主机或其子域
    extraArgs: [],               // 透传全局参数，例如本机排障用的 --args --no-sandbox
    timeoutMs: 30000
  }
}
```

CDP 的授权口径和 embedded 不同：embedded 是“每个标签、每一轮由用户在侧边栏显式放行”；CDP 是**在配置里选择 `backend: 'cdp'` 即视为同意使用外部 Chrome**，此外每个非 `observe` 动作仍然逐次走官方审批。模型看到的 `grantRevision` 恒为 0，`epoch` 是后端方案里的目标修订号。

## 安全边界

- **不执行模型提供的 JavaScript**，也不接受模型给的 CDP 命令、选择器或 IPC；CDP 只是内部传输。
- 默认使用 Chrome for Testing 和隔离 profile；复用登录态必须由用户显式选择。
- 域名白名单由用户在授权时确认，不是模型自己给。
- 每个非 `observe` 动作走官方审批，理由里带 backend、真实 URL 和动作参数。
- 密码、支付、验证码继续由现有过滤器挡住；cookies、storage、HAR 默认不暴露。
- 快照里 `textbox`/`combobox` 等角色后面的当前值会被剥离，表单值不进观察（`redactSnapshot`）。
- 不把 `agent-browser` 二进制打进仓库，也不替用户安装；缺了就报 `BROWSER_BINARY_MISSING` 和安装命令。

## 阶段

| 阶段 | 内容 | 做完是什么样 |
| --- | --- | --- |
| P0 | 本文、能力矩阵、错误码、roadmap 措辞 | 文档定案，零行为变化 |
| P1 | `src/contract/` + 假 backend + 一致性套件 | 同一套用例能跑所有 backend |
| P2 | 抽 authority，现有代码迁进 `backends/embedded/` | 现有测试不改语义仍通过，行为不变 |
| P3 | `backends/agent-browser/`：进程、CLI、解析、配置 | 切到 `cdp` 能打开、观察、点击、多标签 |
| P4 | 审批、脱敏、预算、`doctor`、失败语义 | 杀掉 daemon、断网、取消都留下失败且无进程 |
| P5 | 提示词、文档、版本、打包 Desktop 记录 | Web 与 Desktop 各一条证据 |
| P6 | `electron` backend：侧边栏 webview 挂 CDP | 可见与精确控制同体（可选） |

P2 是全计划风险最高的一步：只搬不改，测试先行；`dsh-x-browser/trace` 事件当作回归信号。

## 测试

- **一致性套件**：同一组用例跑 fake、embedded（受限能力）、scripted agent-browser 三种后端。
- **假 CLI**：CLI 门面只依赖注入的 runner；覆盖空结果、非零退出、JSON 损坏、超时、被杀、超量输出。
- **真机**：2026-10-20 用 agent-browser 0.39.1 + Chrome stable 跑过 `open → observe(e1) → click`（epoch 2→3→4）和两个标签（t1/t2、关掉 t1 后 t2 仍在）。这是适配层证据，不进 CI，也不代表打包 Desktop。
- **可复现**：`DSH_X_BROWSER_REAL=1 node --test packages/dsh-x-browser/test/browser-real.test.ts`，或 `node scripts/browser-cdp-smoke.mjs` 打印一份 JSON 摘要。可选 `DSH_X_BROWSER_CLI` / `DSH_X_BROWSER_URL` / `DSH_X_BROWSER_ARGS`（JSON 数组）/ `DSH_X_BROWSER_HOME`；默认跳过。
- **桌面**：打包 Desktop 里的 CDP 行为还没有记录。

## 还没定的

- 打包 Desktop 内的 CDP 行为（端口、窗口、关闭）还没有记录。
- 真机弹窗和下载的边界行为。
- Windows 上的进程回收。
- `read`、`screenshot`、`eval` 最终暴露到哪一层。
