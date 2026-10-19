# packages

一个目录一个插件包。目录名等于 `package.json` 的 `name`。这里只放 DeepSeek Harness 插件；桌面应用、安装器和 DMG/EXE 发行不在本仓库。

不要把插件源码放进官方内核仓库。

根上的 `pnpm-workspace.yaml` 用 `packages/*` 收这些目录。本仓库根不声明 `packageManager`，pnpm 版本跟官方要求走（当前 `11.28.5`）。

## 目录与产物

每个包用同一套结构：

```text
packages/<包名>/
  src/                 TypeScript 源码；src/client/ 是浏览器侧源码
  lib/                 构建产物（交付包入库）：宿主 JS、.d.ts、client.js
  test/                TypeScript 测试，直接跑 src
  tsconfig.json        类型检查，含 src 与 test，不产出
  tsconfig.build.json  宿主构建，tsc 产出 lib/，排除 src/client
```

根上的 `scripts/build-package.mjs` 是唯一的构建入口（根 `pnpm run build`，单包 `pnpm --filter <包名> run build`）：先清空 `lib/`，再按 `tsconfig.build.json` 产出宿主 JS 与 `.d.ts`，最后把 `src/client/index.ts` 打成 `lib/client.js`。React 与官方 `@deepseek-ai/*` 由宿主模块表提供，构建时保持 external；其余依赖进 bundle。

交付路径依赖预构建产物，各包的 `lib/` 随源码提交。测试直接跑 `src`，根级冒烟测试再验证入库产物能加载。

现有包：

- `dsh-x-code`：只读代码工作区；文件树、源码/差异、快照审查与 findings。审查使用当前配置的 DSH 模型，不含原生 Agent 审查或修复。
- `dsh-x-stock`：A 股自选管理、独立详情页与冲突退让底条；可替换行情接口，另含 Finnhub 只读报价工具。
- `dsh-x-browser`：实验性；Desktop 内嵌浏览器、受控操作与按轮授权。Electron 行为不在本仓库验证。
- `dsh-x-delegate`：把一个任务委派给本机 Codex、Grok 或 OpenCode。ACP 客户端和 Codex `exec --json` 折叠器都在本包内，不依赖官方 subagent 包。

全部源码与包内测试均为 TypeScript，`strict` 覆盖源码与测试。Code 不再读取已删除的 Agents 源码。

新插件针对官方 `0.2.1-rc.2` 验证；预发布 API 变化快，升级内核后应重新运行全部测试。

## 官方位置

插件只使用官方 `~/.dsh`、官方 `profileContext.dir` 和官方 Electron userData。不要新建 `~/.dsh-x` 等独立 home，不要改动官方 `sessions/`。各包的 profile 级状态目录见根 [README](../README.md)。
