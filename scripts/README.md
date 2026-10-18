# 本机运行与验证

操作脚本只放这里，不修改官方内核。桌面打包仍走原有 Actions；以下脚本针对官方 npm CLI 的普通 `web` profile，不操作 Desktop 保留 profile。

## 安装官方测试版本

Node.js `^22.19.0 || >=24.0.0`。使用官方 npm 发布包，建议安装到独立目录：

```sh
npm install --prefix ../dsh-runtime @deepseek-ai/dsh@0.2.1-alpha.5
../dsh-runtime/node_modules/.bin/dsh --version
pnpm install --frozen-lockfile
pnpm test # 自动先构建各插件客户端
```

这里 `pnpm install` 只安装插件开发/测试依赖，官方内核源码不进入本仓库；依赖的 install/postinstall 默认不执行，`pnpm-workspace.yaml` 只放行官方 `@deepseek-ai/dsh-subprocess-local`、esbuild、node-pty、koffi。根不声明 `packageManager`，pnpm 版本跟内核仓库走（当前 `11.28.5`）。

## 将五个插件链接到独立 home

```sh
node scripts/link-plugins.mjs --dsh ../dsh-runtime/node_modules/.bin/dsh --profile web --home /绝对路径/dsh-x-home
DSH_HOME=/绝对路径/dsh-x-home ../dsh-runtime/node_modules/.bin/dsh web --no-open
```

脚本将 `dsh-x-plan`、`dsh-x-stock`、`dsh-x-chat`、`dsh-x-agents`、`dsh-x-code` 通过官方 `dsh plugin add link:` 安装；已有 profile 保持原有组合包并追加这些插件。`link:` 指向当前 checkout，移动目录后需要重新链接。默认 home 是 `~/.dsh-x`，建议测试时明确传入临时目录。缓存目录受限时，可以传 `--store-dir /可写目录 --cache-dir /可写目录`。不要使用该脚本修改 `desktop` profile。

## 无密钥启动冒烟测试

```sh
node scripts/smoke-web.mjs --dsh ../dsh-runtime/node_modules/.bin/dsh --home /绝对路径/dsh-x-home
```

启动 localhost 随机端口、不打开浏览器；使用本次启动的临时引导 token 换取 cookie，检查首页 HTTP 200/HTML 与股票只读 RPC，再关闭进程。token 不写入输出。它验证服务器启动，不等于浏览器交互、真实模型问答或真实行情验证。

单测/集成测试说明见 `TEST_REPORT.md`。股票凭据、聊天路由和外部 ACP 登录方式分别见相应插件的 README。不要将任何凭据或运行 home 提交到仓库。

Code (`dsh-x-code`) 已加入 link 脚本。它可独立启用/禁用；只读浏览和默认 DSH 模型快照审查不依赖 Agents，所选问题修复依赖 Agents。源码范围与限制详见 `packages/dsh-x-code/README.md`。

## 开发者套件与真实包验证

推荐入口是 `dsh-x-suite`，精确依赖 Code + Agents；Chat、Plan、Stocks、Browser 按需单独安装。开发用“五插件链接”脚本不是套件发布方式，默认也不启用 Browser。套件说明见 `packages/dsh-x-suite/README.md`。

```sh
pnpm run build
node scripts/check-suite-install.mjs --home /绝对路径/dsh-home --profile web --dsh-version 0.2.1-alpha.5
node scripts/test-suite-install.mjs \
  --dsh /绝对路径/dsh-runtime/node_modules/.bin/dsh \
  --dsh-version 0.2.1-alpha.5 \
  --report /绝对路径/suite-install-report.json
```

前者只检查精确版本、构建产物和 profile 的重复选择，不改配置。后者要求 PATH 上的 pnpm 与 `compatibility/policy.json` 中的精确版本一致；把真实构建产物打包，并通过真实官方 CLI 和 Web Host 检查安装、单项/整套启停、组合、测试版本替换与移除；所有 home、缓存和配置都在临时目录，操作完成后清理。它只向公开 npm registry 下载依赖，不转发 npm credentials，不启动模型或原生供应商登录。升级使用明确标注的本地版本 fixture，不冒充已经发布的升级或真实用户数据迁移。结果必须同时检查退出码和 JSON 报告。

官方候选版本发现、容器隔离和定时工作流启用条件见 `compatibility/README.md`。这份 Suite 报告不证明 Electron 页面渲染或 Browser 原生行为；Windows Desktop 专项证据见 `docs/desktop-browser-proof.md`。
