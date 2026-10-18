# 编辑本仓库

本仓库只有插件源码、本机运行脚本和打包流水线。官方内核在打包或本机启动时才接上，不放进这个 git，也不做成子模块。

- 不要把 `deepseek-harness` 加进本仓库，也不要往内核仓库提交、打补丁或放插件源码。
- 不要把密钥、`.credentials.yaml`、`~/.dsh` 或 `~/.dsh-x` 里的文件提交到这里。
- 一个插件一个目录，放在 `packages/<包名>/`。包名和目录名相同。
- 操作脚本只放在 `scripts/`。不要把脚本写进内核仓库，也不要写进 home。
- `kernel.local.json` 只在本机，从 `kernel.local.example.json` 复制。不要提交。
- 不要把签名证书、公证密钥或 `.env.macos` / `.env.windows` 提交到这里。打包只通过 `.github/workflows/desktop-package.yml` 调用内核仓库里的官方命令。
- 用户已授权 DSH-X 外层安装器：官方应用仍由上述 workflow 调用官方命令编译，本仓库的 `scripts/desktop-distribution/` 可以组装外层 DMG/EXE、携带插件并通过官方 Desktop CLI 安装。不得改写官方源码、可执行文件或 `app.asar`，不得直接生成或改写用户 profile；首次初始化由官方应用完成。安装器使用官方原生用户目录（`~/.dsh` 与官方 Electron userData），不另建 DSH-X 用户目录。
