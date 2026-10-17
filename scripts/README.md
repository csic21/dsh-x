# 本机运行与验证

操作脚本只放这里，不修改官方内核。桌面打包仍走原有 Actions；以下脚本针对官方 npm CLI 的普通 `web` profile，不操作 Desktop 保留 profile。

## 安装官方测试版本

Node.js `^22.19.0 || >=24.0.0`。使用官方 npm 发布包，建议安装到独立目录：

```sh
npm install --prefix ../dsh-runtime @deepseek-ai/dsh@0.2.1-alpha.5
../dsh-runtime/node_modules/.bin/dsh --version
npm ci --ignore-scripts
npm test # 自动先构建各插件客户端
```

这里 `npm ci` 只安装插件开发/测试依赖，官方内核源码不进入本仓库。根仍不声明 packageManager，原有 pnpm workspace 可继续使用。

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
