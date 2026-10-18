# 版本与兼容

DSH-X 有两个独立的版本口径，混在一起谈很容易得出错误结论。

| 概念 | 声明在哪 | 谁在强制 | 当前值 |
| --- | --- | --- | --- |
| 加载准入 | 各插件 `package.json` 的 `peerDependencies`（`@deepseek-ai/dsh*`） | 官方 CLI / Host | `^0.2.0-rc.2 \|\| ^0.2.1-rc.2` |
| 发布资格 | 各包 `engines.dsh` 与 `compatibility/policy.json` 的 `baseline` | 本仓库的测试与市场索引 | `0.2.1-rc.2`（精确） |

## 为什么官方不认 `engines.dsh`

官方在 composition 边界检查的是插件 `peerDependencies` 里 `@deepseek-ai/dsh` 和 `@deepseek-ai/dsh-*` 的范围，判定使用 semver 的 `includePrerelease`；**`engines.dsh` 不参与准入**。

所以：

- 想让插件在你的运行时上加载，关键是 **peer 范围**是否覆盖你的版本。
- `engines.dsh` 说明“这一版是在哪个运行时上做完整验证的”，同时被市场索引用来判断兼容性。

## peer 范围为什么写成联合

```json
"@deepseek-ai/dsh-tools": "^0.2.0-rc.2 || ^0.2.1-rc.2"
```

单个 `^0.2.0-rc.2` 在官方判定（`includePrerelease: true`）下能覆盖两个基线，但在**默认** semver 语义下，预发布版本有一条 tuple 规则：`0.2.1-rc.2` 不会被 `^0.2.0-rc.2` 匹配。pnpm 解析依赖时用的是默认语义，会把开发环境降级到 0.2.0-rc.2。

写成联合范围后：

- 官方判定：`0.2.0-rc.2`、`0.2.1-rc.2` 及后续 0.2.x 都准入，`0.3.0` 被排除。
- pnpm 默认解析：仍然停在 `0.2.1-rc.2`，开发环境不降级。

## 市场索引如何判断兼容

`market-index.json` 为每个版本记录 `engines.dsh`。Discover 会用与安装相同的兼容检查计算：

- 没有兼容版本时不显示可安装的默认项；
- 有兼容版本时默认选择最高的非预发布版本，否则选择最高的兼容预发布版本；
- 版本豁免只能由官方页面显式授予，不能由索引绕过。

## 证据范围

| 范围 | 结果 |
| --- | --- |
| `0.2.1-rc.2` 构建、类型检查、包内测试、跨包集成测试 | 通过 |
| 市场索引格式 1 校验、Git 安装目标生成 | 通过 |
| 官方 CLI 在 `0.2.1-rc.2` 上安装 Git 目标 | 由发布后的人工/发布检查确认 |
| Electron / 打包 Desktop 内的 Browser 行为 | **未覆盖**，需要应用侧验证 |
| 真实证券行情、凭据、付费模型调用 | **未覆盖**，取决于用户自己的配置 |

`compatibility/evidence/` 里的 JSON 是历史套件证据，保留用于追溯；当前仓库不再发布套件，也不再跑套件矩阵。

## 版本不匹配会发生什么

| 场景 | 结果 |
| --- | --- |
| peer 范围不覆盖你的运行时 | 官方 CLI 直接拒绝安装：`installation rejected: Plugin ... is incompatible with dsh ...` |
| 绕过安装检查、profile 里已有不兼容插件 | Host 在组合时拒绝该行，bundle 被跳过并记录诊断 |
| 市场索引里没有兼容版本 | Discover 不提供可安装的默认版本 |
| profile 里残留旧版本 | 卸载后安装目标版本，按提示重启 |

## 明确未覆盖的部分

以下内容**不在**本仓库的验证范围内，发布说明也不会替它们背书：

- Electron / 打包应用内的 Browser 渲染与交互。
- 真实行情源、Finnhub 订阅覆盖、证券代码存在性。
- 安装时的依赖构建脚本。
- 跨版本的数据迁移。
