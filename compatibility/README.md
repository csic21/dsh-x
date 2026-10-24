# 官方 DSH 版本与扩展兼容

本目录保存加载准入、发布资格与历史证据。它不自动修改插件、不升级用户安装，也不发布。

## 当前口径

| 概念 | 声明位置 | 当前值 | 谁在强制 |
| --- | --- | --- | --- |
| 加载准入 | 各包 `engines.dsh`（`policy.json` → `supportedRuntimeRange`） | `^0.2.0-rc.2 \|\| ^0.2.1-rc.2` | 官方 CLI / Host |
| 加载准入（备用） | 各包 `peerDependencies` 的 `@deepseek-ai/dsh*`，与上面逐字一致 | 同上 | 官方 CLI / Host |
| 市场兼容 | `market-index.json` 每个版本的 `engines.dsh` | 同上 | 官方 Discover |
| 发布基线 | `policy.json` → `baseline` | `0.2.1-rc.3`（精确） | 本仓库测试 |

官方判定顺序是**先看 `engines.dsh`，有就只看它、完全忽略 peer 范围**；没有 `engines.dsh` 时才逐个检查 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer。两条路径都用 semver 的 `includePrerelease`。

这就是 0.9.x 及更早版本在 `0.2.1-rc.3` 上显示「不兼容」的原因：那些版本的 `engines.dsh` 被写成精确的 `0.2.1-rc.2`，而精确版本不匹配 `rc.3`，peer 范围写多宽都不会被读到。现在 `engines.dsh` 与 peer 范围共用同一个联合范围，两条判定路径给出同样的结论。

联合范围而不是单个 `^0.2.0-rc.2`：原生 semver 对预发布版本有一条 tuple 规则，单个 `^0.2.0-rc.2` 在**默认**语义下不会选中 `0.2.1-rc.*`，pnpm 会把 workspace 的开发解析降级；写成联合后默认与 `includePrerelease` 两种语义都准入两个基线，解析仍取较高的 `0.2.1-rc.3`。

范围上界停在 `0.2.x`：`0.3.0` 被排除。新 minor 需要重新验证并单独放宽，不允许为了发布而顺手扩大。

## 测试守住的不变量

`test/peer-ranges.test.js` 直接 import 官方 `@deepseek-ai/dsh-app-boot` 的 `evaluatePluginCompatibility`，用它而不是自己重写一遍 semver 规则，检查：

1. 所有包的 `engines.dsh` 逐字等于 `supportedRuntimeRange`；
2. 所有插件的 `@deepseek-ai/dsh*` peer 逐字等于同一个范围；
3. 官方判定在 `baseline` 与每个 `additionalBaselines` 上都放行；
4. 官方判定放行下一个 patch（`0.2.1-rc.4` 一类的后续版本），并拒绝下一个 minor；
5. 额外基线记录状态与证据范围。

`test/market-index.test.js` 用官方 `parseMarketIndex` 校验生成的市场索引，用官方判定确认最新条目在每个基线上都可安装，并检查每个版本的 Git 安装 spec。

## 证据范围

- `0.2.1-rc.3`：当前基线。构建、类型检查、全量测试（453 项，452 通过 1 跳过）、市场索引格式与安装 spec 已跑通。
- `0.2.1-rc.2`：上一基线，当时同样跑通了构建、类型检查、包内测试、跨包集成测试与市场索引；当前 checkout 不再对它重跑，但共享范围仍然准入它。
- `0.2.0-rc.2`：只做过安装与启动冒烟，证据强度较低；共享范围准入它，但没有新的验证。
- Electron / 打包 Desktop 内的 Browser 行为：**未覆盖**，需要应用侧验证。
- 真实行情源、凭据、付费模型调用：**未覆盖**，取决于用户自己的配置。

`evidence/` 里的 JSON 是历史套件证据（Code + Agents 时代），保留用于追溯；当前仓库不再发布套件，也不再跑套件矩阵。

## 本地检查

```sh
node --test test/peer-ranges.test.js test/market-index.test.js
pnpm run typecheck
pnpm test
```
