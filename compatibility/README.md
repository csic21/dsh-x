# 官方 DSH 版本与扩展兼容

本目录保存加载准入、发布资格与历史证据。它不自动修改插件、不升级用户安装，也不发布。

## 当前口径

| 概念 | 声明位置 | 当前值 | 谁在强制 |
| --- | --- | --- | --- |
| 加载准入 | `policy.json` → `supportedPeerRange`，各包 DSH peer 必须逐字一致 | `^0.2.0-rc.2 \|\| ^0.2.1-rc.2` | 官方 CLI / Host |
| 发布资格 | 各包 `engines.dsh` | `0.2.1-rc.2`（精确） | 本仓库测试与市场索引 |
| 市场兼容 | `market-index.json` 每个版本的 `engines.dsh` | 同上 | 官方 Discover |

官方在 composition 边界只读插件 `peerDependencies` 中 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` 的范围，判定时使用 semver 的 `includePrerelease`；它**不读 `engines.dsh`**。

联合范围而不是单个 `^0.2.0-rc.2`：原生 semver 对预发布版本有一条 tuple 规则，单个 `^0.2.0-rc.2` 在**默认**语义下只会选中 0.2.0-rc.2，pnpm 会把 workspace 的开发解析降级；写成联合后默认与 `includePrerelease` 两种语义都准入两个基线，解析仍取较高的 0.2.1-rc.2。

## 测试守住的不变量

`test/peer-ranges.test.js` 检查：

1. 所有插件的 `@deepseek-ai/dsh*` peer 逐字等于 `supportedPeerRange`；
2. 所有包的 `engines.dsh` 等于 `baseline.version`；
3. 每个声明的基线都被 peer 范围覆盖；
4. 额外基线记录状态与证据范围。

`test/market-index.test.js` 用官方 `parseMarketIndex` 校验生成的市场索引，并检查每个版本的 Git 安装 spec。

## 证据范围

- `0.2.1-rc.2`：构建、类型检查、包内测试、跨包集成测试、市场索引格式与安装 spec 已跑通。
- `0.2.0-rc.2`：只做过安装与启动冒烟，证据强度较低。
- Electron / 打包 Desktop 内的 Browser 行为：**未覆盖**，需要应用侧验证。
- 真实行情源、凭据、付费模型调用：**未覆盖**，取决于用户自己的配置。

`evidence/` 里的 JSON 是历史套件证据（Code + Agents 时代），保留用于追溯；当前仓库不再发布套件，也不再跑套件矩阵。

## 本地检查

```sh
node --test test/peer-ranges.test.js test/market-index.test.js
pnpm run typecheck
pnpm test
```
