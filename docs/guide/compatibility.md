# 版本与兼容

DSH-X 有两个独立的版本口径，混在一起谈很容易得出错误结论。

| 概念 | 声明在哪 | 谁在强制 | 当前值 |
| --- | --- | --- | --- |
| 加载准入 | 各包 `engines.dsh`，以及与之逐字一致的 `peerDependencies` | 官方 CLI / Host | `^0.2.0-rc.2 \|\| ^0.2.1-rc.2` |
| 发布基线 | `compatibility/policy.json` 的 `baseline` | 本仓库的测试 | `0.2.1-rc.3`（精确） |

## 官方实际怎么判定

官方 `evaluatePluginCompatibility` 的顺序是：

1. 有 `engines.dsh` → **只看它**，`peerDependencies` 完全不读；
2. 没有 `engines.dsh` → 逐个检查 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` peer 的范围。

两条路径都用 semver 的 `includePrerelease`。安装（`dsh plugin add`）、profile 启动、市场 Discover 三处用的是同一个函数。

### 之前为什么显示「不兼容」

`0.9.x` 及更早的版本把 `engines.dsh` 写成精确的 `0.2.1-rc.2`。精确版本不等于 `0.2.1-rc.3`，于是第 1 条直接判不兼容——**peer 范围写多宽都没用，因为它根本不会被读到**。这也是为什么 `0.2.0-rc.2` 上同样被判不兼容，尽管文档一度声称它可用。

现在 `engines.dsh` 和 peer 范围共用同一个联合范围，两条判定路径结论一致：

```json
"engines": { "dsh": "^0.2.0-rc.2 || ^0.2.1-rc.2" },
"peerDependencies": { "@deepseek-ai/dsh-tools": "^0.2.0-rc.2 || ^0.2.1-rc.2" }
```

## 范围为什么写成联合

单个 `^0.2.0-rc.2` 在官方判定（`includePrerelease: true`）下能覆盖两个基线，但在**默认** semver 语义下，预发布版本有一条 tuple 规则：`0.2.1-rc.2` 不会被 `^0.2.0-rc.2` 匹配。pnpm 解析依赖时用的是默认语义，会把开发环境降级到 0.2.0-rc.2。

写成联合范围后：

- 官方判定：`0.2.0-rc.2`、`0.2.1-rc.2`、`0.2.1-rc.3` 及后续 0.2.x 都准入，`0.3.0` 被排除。
- pnpm 默认解析：仍然停在 `0.2.1-rc.3`，开发环境不降级。

上界停在 `0.2.x` 是有意的：新 minor 意味着 API 可能变化，需要重新验证后单独放宽。

## 市场索引如何判断兼容

`market-index.json` 为每个版本记录 `engines.dsh`。Discover 用同一个官方判定计算：

- 没有兼容版本时不显示可安装的默认项；
- 有兼容版本时默认选择最高的非预发布版本，否则选择最高的兼容预发布版本；
- 版本豁免只能由官方页面显式授予，不能由索引绕过。

索引里旧版本的精确 pin 会保留原样——它们本来就只对当时那个运行时成立，这正好让 Discover 在 rc.3 上只推荐新版本。

## 证据范围

| 范围 | 结果 |
| --- | --- |
| `0.2.1-rc.3` 构建、类型检查、全量测试（453 项） | 通过 |
| 市场索引格式 1 校验、Git 安装目标生成 | 通过 |
| 官方判定在 `0.2.0-rc.2` / `0.2.1-rc.2` / `0.2.1-rc.3` 上放行 | 由 `test/peer-ranges.test.js` 用官方函数守住 |
| 官方 CLI 在 `0.2.1-rc.3` 上安装 Git 目标 | 由发布后的人工/发布检查确认 |
| Electron / 打包 Desktop 内的 Browser 行为 | **未覆盖**，需要应用侧验证 |
| 真实证券行情、凭据、付费模型调用 | **未覆盖**，取决于用户自己的配置 |

`compatibility/evidence/` 里的 JSON 是历史套件证据，保留用于追溯；当前仓库不再发布套件，也不再跑套件矩阵。

## 版本不匹配会发生什么

| 场景 | 结果 |
| --- | --- |
| `engines.dsh` 不覆盖你的运行时 | 官方 CLI 直接拒绝安装：`installation rejected: Plugin ... is incompatible with dsh ...` |
| 绕过安装检查、profile 里已有不兼容插件 | Host 在组合时拒绝该行，bundle 被跳过并记录诊断 |
| 市场索引里没有兼容版本 | Discover 不提供可安装的默认版本 |
| profile 里残留旧版本 | 卸载后安装目标版本，按提示重启 |

装不上时可以先确认原因：

```sh
node -e "import('@deepseek-ai/dsh-app-boot').then(({evaluatePluginCompatibility:e})=>console.log(e(JSON.parse(require('fs').readFileSync('package.json')),{},process.argv[1])))" 0.2.1-rc.3
```

（在插件包目录里运行；输出 `undefined` 表示放行。）

## 明确未覆盖的部分

以下内容**不在**本仓库的验证范围内，发布说明也不会替它们背书：

- Electron / 打包应用内的 Browser 渲染与交互。
- 真实行情源、Finnhub 订阅覆盖、证券代码存在性。
- 安装时的依赖构建脚本。
- 跨版本的数据迁移。
