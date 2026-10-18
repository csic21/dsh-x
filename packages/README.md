# packages

一个目录一个插件包。目录名等于 `package.json` 的 `name`。这里只放 DeepSeek Harness 插件；桌面应用、安装器和 DMG/EXE 发行不在本仓库。

不要把插件源码放进官方内核仓库。

根上的 `pnpm-workspace.yaml` 用 `packages/*` 收这些目录，并声明 workspace 相关设置。本仓库根不声明 `packageManager`，pnpm 版本跟内核仓库走（当前 `11.28.5`）。

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
- `dsh-x-suite`：默认组合，精确依赖 Code + Agents。
- `dsh-x-code`：Code 文件树、源码/差异、持久快照审查与显式问题修复；独立开关，默认 DSH 模型审查，修复复用 Agents。
- `dsh-x-agents`：Codex/OpenCode/Claude/Grok 原生执行与审批、状态、模型目录。
- `dsh-x-plan`：外部 ACP 规划、用户批准、交叉验收；计划档案放在官方 home 的 `plans/`。
- `dsh-x-stock`：A 股自选管理、独立详情页与冲突退让底条；可替换行情接口，另含 Finnhub 只读报价工具。
- `dsh-x-chat`：原生 LLM 只读独立问答工具。
- `dsh-x-browser`：实验性；受控浏览器操作与权限边界，Electron 行为不在本仓库验证。
- `dsh-x-update`：只检查公开插件发布并给出 Release 链接；不下载、不安装、不写额外目录。

新插件针对官方 `0.2.1-rc.2` 验证；预发布 API 变化快，升级内核后应重新运行全部测试。

## 官方位置

插件只使用官方 `~/.dsh`、官方 `profileContext.dir` 和官方 Electron userData。不要新建 `~/.dsh-x` 等独立 home，不要改动官方 `sessions/`。各包的 profile 级状态目录见根 [README](../README.md)。

## TypeScript 迁移进度

八个包均已迁移：`dsh-x-chat`、`dsh-x-suite`、`dsh-x-browser`、`dsh-x-code`、`dsh-x-agents`、`dsh-x-plan`、`dsh-x-stock`、`dsh-x-update`。宿主/前端源码和包内测试主文件使用 TypeScript，统一生成 `lib/`；`strict` 检查覆盖源码与测试。Code 已移除读取 Agents JavaScript 的临时 `allowJs` 设置。原生子进程测试的可执行 `.mjs` 夹具保留原格式。

根级集成测试及操作脚本加载构建后的宿主入口；需要直接复用浏览器纯模型的脚本读取 `.ts` 模块。运行这些脚本前先执行 `pnpm run build`。

迁移后的全仓回归为 762 项：760 通过、0 失败、2 项按环境跳过。八个包的构建、严格类型检查与打包产物检查均通过；官方 CLI/Web Host 的十项套件管理复核见 [迁移安装证据](../compatibility/evidence/typescript-migration-suite-2026-10-18.json)。
