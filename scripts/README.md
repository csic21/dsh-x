# scripts

本机运行时用的脚本放这里。现在没有文件。

跟最新内核由流水线的 `kernel_ref` 负责，不在这里做 `git pull`。

| 文件 | 职责 |
|---|---|
| `env.sh` | 读本机 `kernel.local.json`，导出 home 和内核路径 |
| `desktop.sh` | 用那份内核启动 Desktop |
| `desktop-plugin.mjs` | 调用内核里的 Desktop CLI |
| `link-plugins.sh` | 把 `packages/` 里的包 `link:` 进 desktop profile |

这些脚本只在本机要跑插件时才需要。只打安装包时，走 `.github/workflows/desktop-package.yml`。
