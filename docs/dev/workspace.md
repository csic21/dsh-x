# 仓库与本地开发

本仓库是**插件库**：插件源码、本机链接/验证脚本、插件打包流水线。官方内核不进来，桌面应用与安装器也不进来。

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
compatibility/            官方版本准入与兼容检查
packaging/plugins.md      插件 tgz 的发布与安装
scripts/                  本机 link、验证、打包脚本
test/                     跨包与官方运行时集成测试
docs/                     本网站（独立 npm 工程，不参与插件 workspace）
```

规则：操作脚本只放 `scripts/`；不提交凭据、`.credentials.yaml`、`~/.dsh` 里的任何文件；不往内核仓库提交插件源码或补丁。

## 常用命令

```sh
pnpm install --frozen-lockfile
pnpm run typecheck                      # 全部包
pnpm test                               # 先构建，再跑单元 + 集成测试
node scripts/build-package.mjs packages/dsh-x-code   # 单独构建一个包
```

测试直接跑 `src`；根级冒烟测试验证入库的 `lib/` 能加载。

::: tip `lib/` 的取舍
`lib/` 随源码入库，好处是 `link:` 安装不需要先构建。代价是它与源码可能漂移，而且 **TypeScript 产出的 `.d.ts` 不是字节稳定的**（同一份源码重新构建可能出现键序差异），所以不要用 `git diff --exit-code` 去守它。
:::

## 本机开发一套插件

```sh
TEST_HOME="$(mktemp -d)"

# 把六个插件 link: 进一个临时官方 home 的 web profile
node scripts/link-plugins.mjs \
  --dsh /path/to/dsh-runtime/node_modules/.bin/dsh \
  --profile web --home "$TEST_HOME"

# 用同一个 home 启动（不打开浏览器）
DSH_HOME="$TEST_HOME" /path/to/dsh-runtime/node_modules/.bin/dsh web --no-open
```

`link:` 指向当前 checkout，移动目录后要重新链接。链接脚本不会碰 `desktop` profile。

无密钥启动冒烟：

```sh
node scripts/smoke-web.mjs --dsh /path/to/dsh-runtime/node_modules/.bin/dsh --home "$TEST_HOME"
```

它启动随机端口、用本次启动的引导 token 换 cookie，检查首页与股票只读 RPC，然后关闭进程。token 不会出现在输出里。

## 用真实发布资产验证

```sh
# 打包当前 checkout（输出目录必须不存在）
node scripts/package-plugin-release.mjs --output /tmp/dsh-plugin-release --tag plugins-v0.1.3

# 装一个精确版本的官方运行时（按 policy.json 的版本与完整性）
node scripts/install-release-test-runtime.mjs /tmp/dsh-release-runtime --baseline next

# 完整套件矩阵：安装、启停、混合源、升级 fixture、移除、不兼容拒绝
node scripts/test-suite-install.mjs \
  --dsh /tmp/dsh-release-runtime/node_modules/.bin/dsh \
  --dsh-version 0.2.1-rc.2 \
  --release-dir /tmp/dsh-plugin-release \
  --report /tmp/dsh-plugin-release/suite-install-report.json

# 第二个基线的准入（只证明安装 + 启动 + RPC）
node scripts/install-release-test-runtime.mjs /tmp/dsh-latest-runtime --baseline latest
node scripts/check-peer-admission.mjs \
  --dsh /tmp/dsh-latest-runtime/node_modules/.bin/dsh \
  --dsh-version 0.2.0-rc.2 \
  --release-dir /tmp/dsh-plugin-release \
  --report /tmp/admission-latest.json
```

这些检查的所有 home、缓存与配置都在临时目录，结束后清理；只向公开 npm 下载依赖，不转发凭据，不启动模型或原生登录。

## 改兼容声明前先看测试

`test/peer-ranges.test.js` 锁住三条不变量：

1. 所有插件的 `@deepseek-ai/dsh*` peer 必须逐字等于 `policy.json` 的 `supportedPeerRange`。
2. 所有包的 `engines.dsh` 必须等于 `policy.json` 的 `baseline.version`。
3. 每个声明的基线都要被 peer 范围覆盖，且额外基线必须有状态和证据范围。

想放宽或收窄兼容，改 `policy.json` 与各包 `package.json`，让测试通过，并附上真实的准入/矩阵证据——不要为了发布临时放宽。
