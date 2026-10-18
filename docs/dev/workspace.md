# 仓库与本地开发

本仓库是**插件库**：插件源码、本机链接/验证脚本、市场索引生成器。官方内核不进来，桌面应用与安装器也不进来。

## 环境

| 依赖 | 要求 |
| --- | --- |
| Node.js | `^22.19.0 \|\| >=24.0.0` |
| pnpm | 与 `compatibility/policy.json` 一致（当前 `11.28.5`） |
| 官方 DSH | 只有跑真实安装/启动检查时才需要，建议装在独立目录 |

不需要在本仓库旁边放一份内核源码。只有要在本机调试官方内核时，才从 `kernel.local.example.json` 复制出 `kernel.local.json` 写本机路径（不提交）。

## 目录

```text
packages/<包名>/          插件源码；一个目录一个包，目录名等于包名
  src/                    TypeScript 源码；src/client/ 是浏览器侧
  lib/                    构建产物（入库）：宿主 JS、.d.ts、client.js
  test/                   TypeScript 测试，直接跑 src
  tsconfig.json           类型检查（含测试，不产出）
  tsconfig.build.json     宿主构建（tsc 产出 lib/，排除 src/client）
compatibility/            官方版本准入与兼容策略
docs/                     本网站（独立 npm 工程）与市场索引 public 目录
scripts/                  构建、link、市场索引生成
test/                     跨包与官方运行时集成测试
```

规则：操作脚本只放 `scripts/`；不提交凭据、`.credentials.yaml`、`~/.dsh` 里的任何文件；不往内核仓库提交插件源码或补丁。

## 常用命令

```sh
pnpm install --frozen-lockfile
pnpm run typecheck                      # 全部包
pnpm test                               # 先构建，再跑单元 + 集成测试
node scripts/build-package.mjs packages/dsh-x-code   # 单独构建一个包
node scripts/generate-market-index.mjs --output docs/public/market-index.json
```

测试直接跑 `src`；根级冒烟测试验证入库的 `lib/` 能加载。

::: tip `lib/` 的取舍
`lib/` 随源码入库，好处是 Git 安装不需要先构建。代价是它与源码可能漂移，而且 **TypeScript 产出的 `.d.ts` 不是字节稳定的**（同一份源码重新构建可能出现键序差异），所以不要用 `git diff --exit-code` 去守它。
:::

## 本机链接插件

```sh
TEST_HOME="$(mktemp -d)"

node scripts/link-plugins.mjs \
  --dsh /path/to/dsh-runtime/node_modules/.bin/dsh \
  --profile web --home "$TEST_HOME"

DSH_HOME="$TEST_HOME" /path/to/dsh-runtime/node_modules/.bin/dsh web --no-open
```

`link:` 指向当前 checkout，移动目录后要重新链接。链接脚本不会碰 `desktop` profile。

## 市场索引

`scripts/generate-market-index.mjs` 从 `plugins-v*` tag 和当前工作树生成格式 1 的索引：

- 每个版本钉到 40 位 commit，`source.path` 指向 `packages/<包名>`；
- 当前工作树版本也会出现，便于在首个新 tag 前本地验证；
- `docs/public/market-index.json` 由文档构建生成，不提交。

本地校验：

```sh
node --test test/market-index.test.js
```

它会用官方 `@deepseek-ai/dsh-plugin-market-index` 的 `parseMarketIndex` 验证生成结果，并检查 `marketInstallTarget` 的 Git spec。

## 改兼容声明前先看测试

`test/peer-ranges.test.js` 锁住三条不变量：

1. 所有插件的 `@deepseek-ai/dsh*` peer 必须逐字等于 `policy.json` 的 `supportedPeerRange`。
2. 所有包的 `engines.dsh` 必须等于 `policy.json` 的 `baseline.version`。
3. 每个声明的基线都要被 peer 范围覆盖，且额外基线必须有状态和证据范围。

想放宽或收窄兼容，改 `policy.json` 与各包 `package.json`，让测试通过，并附上真实的准入证据——不要为了发布临时放宽。
