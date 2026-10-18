# 版本与兼容

DSH-X 有两个独立的版本口径，混在一起谈很容易得出错误结论。

| 概念 | 声明在哪 | 谁在强制 | 当前值 |
| --- | --- | --- | --- |
| 加载准入 | 各插件 `package.json` 的 `peerDependencies`（`@deepseek-ai/dsh*`） | 官方 CLI / Host | `^0.2.0-rc.2 \|\| ^0.2.1-rc.2` |
| 发布资格 | 各包 `engines.dsh` 与 `compatibility/policy.json` 的 `baseline` | 本仓库的发布流水线 | `0.2.1-rc.2`（精确） |

## 为什么官方不认 `engines.dsh`

官方在 composition 边界检查的是插件 `peerDependencies` 里 `@deepseek-ai/dsh` 和 `@deepseek-ai/dsh-*` 的范围，判定使用 semver 的 `includePrerelease`；**`engines.dsh` 不参与准入**。

所以：

- 想让插件在你的运行时上加载，关键是 **peer 范围**是否覆盖你的版本。
- `engines.dsh` 只说明"这一版是在哪个运行时上做完整验证的"，被本仓库的发布脚本使用。

## peer 范围为什么写成联合

```json
"@deepseek-ai/dsh-tools": "^0.2.0-rc.2 || ^0.2.1-rc.2"
```

单个 `^0.2.0-rc.2` 在官方判定（`includePrerelease: true`）下能覆盖两个基线，但在**默认** semver 语义下，预发布版本有一条 tuple 规则：`0.2.1-rc.2` 不会被 `^0.2.0-rc.2` 匹配。pnpm 解析依赖时用的是默认语义，会把开发环境降级到 0.2.0-rc.2。

写成联合范围后：

- 官方判定：`0.2.0-rc.2`、`0.2.1-rc.2` 及后续 0.2.x 都准入，`0.3.0` 被排除。
- pnpm 默认解析：仍然停在 `0.2.1-rc.2`，开发环境不降级。

## 两个基线的证据强度不同

| 基线 | npm 标签 | 覆盖 |
| --- | --- | --- |
| `0.2.1-rc.2` | `next` | 完整套件矩阵：安装、单项/整套启停、混合源、升级 fixture、移除、不兼容拒绝，加上两基线的准入冒烟 |
| `0.2.0-rc.2` | `latest` | 只到：官方 CLI 安装成功、bundle 被选中、官方 Web Host 启动、插件 RPC 可用 |

也就是说：**两个版本都能装**，但只有 `0.2.1-rc.2` 跑过完整回归。如果你在 `latest` 上遇到问题，第一步是把运行时升级到 `next` 再复现。

自己确认当前标签分布：

```sh
npm view @deepseek-ai/dsh dist-tags
dsh --version
```

::: warning 不要靠 `engines.dsh` 判断兼容
看到 `engines.dsh: 0.2.1-rc.2` 就以为"只能装 0.2.1-rc.2"是误解；看到它在别的版本上不一样也不要手改。准入看 peer，验证看 baseline。
:::

## 版本不匹配会发生什么

| 场景 | 结果 |
| --- | --- |
| peer 范围不覆盖你的运行时 | 官方 CLI 直接拒绝安装：`installation rejected: Plugin ... is incompatible with dsh ...` |
| 绕过安装检查、profile 里已有不兼容插件 | Host 在组合时拒绝该行，bundle 被跳过并记录诊断 |
| 套件与独立组件版本不同 | 不保证共存；先停用/移除一个来源 |
| profile 里残留旧版本 | 重新安装目标版本，按提示重启 |

## 每次发版会跑什么

发布流水线（`plugin-release.yml`）在创建 Release 前必须完成：

1. 类型检查 + 全仓单元 / 集成测试。
2. 打包八个 tgz，生成 `SHA256SUMS` 与 `build-manifest.json`。
3. **admission**：矩阵安装两个固定完整性的官方运行时（`next`、`latest`），各装一次真实 tgz，启动官方 Web Host 并调用插件 RPC。
4. **qualify**：在基线运行时上跑完整套件矩阵。

每日定时任务会重跑同样的流水线（不发布），用来发现漂移；`workflow_dispatch` 可以演练发布，默认只跑快路径。

## 明确未覆盖的部分

以下内容**不在**本仓库的验证范围内，发布说明也不会替它们背书：

- Electron / 打包应用内的页面渲染与交互（含 Browser 插件）。
- 供应商原生登录、账号有效性、真实付费模型调用。
- 安装时的依赖构建脚本（准入检查使用 `--ignore-scripts`）。
- 跨版本的发布数据迁移。

需要这些保证时，请在对应的应用仓库或真实环境中单独验证。
