# 编辑本仓库

本仓库只是 DeepSeek Harness 插件库：插件源码、本机链接/验证脚本和插件打包流水线。官方内核只在打包或本机启动时接上，不放进这个 git，也不做成子模块。桌面应用、安装器、bootstrap 和 DMG/EXE 发行不属于本仓库。

- 不要把 `deepseek-harness` 加进本仓库，也不要往内核仓库提交、打补丁或放插件源码。
- 不要把密钥、`.credentials.yaml`、`~/.dsh` 或任何运行 home 里的文件提交到这里。
- 一个插件一个目录，放在 `packages/<包名>/`。包名和目录名相同。
- 操作脚本只放在 `scripts/`。不要把脚本写进内核仓库，也不要写进 home。
- `kernel.local.json` 只在本机，从 `kernel.local.example.json` 复制。不要提交。
- 插件只使用官方默认位置：官方 `~/.dsh`、官方 `profileContext.dir` 与官方 Electron userData。不要新建 `~/.dsh-x` 等独立 home，不要搬动、重写或归档官方 `sessions/`，也不要让插件写入官方会话目录之外的自定义存储根。
- 本仓库不包含签名证书、公证密钥、`.env.macos` / `.env.windows`、桌面安装包或应用更新 helper。插件发布只通过 `.github/workflows/plugin-release.yml` 生成 tgz。
