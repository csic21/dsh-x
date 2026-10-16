# dsh-x

这个 git 只放我们自己的代码。官方内核不在这里，也不做成子模块。

内核只在两个时刻出现：

- **打包**：Actions 按 `kernel_ref` 检出官方仓库，跑官方 Desktop 打包命令。要跟最新内核，改的是这次流水线的 ref，不是本仓库里的一份拷贝。
- **运行**：本机如果要改插件并看到它加载，旁边放一份内核克隆，`kernel.local.json` 指过去。Desktop 启动后，用 `link:` 加载 `packages/` 里的包。

不跑、不打包的时候，本仓库不需要内核目录。

## 本仓库

```text
dsh-x/
  packages/<包名>/              插件源码。一个目录一个包，目录名等于包名
                                 现在有 packages/dsh-x-plan/
  .github/workflows/            打包时检出内核、产出安装包
  packaging/                    平台、签名、插件为什么还不进安装包
  kernel.local.example.json     本机运行时的路径样例
  scripts/                      本机启动和 link 用的脚本，现在还没有文件
  package.json                  私有根，不声明 packageManager
  pnpm-workspace.yaml           只收录 packages/*
```

| 目录 | 什么时候用到内核 |
|---|---|
| `packages/` | 不用。这里只是我们的源码 |
| `.github/workflows/` | 打包。检出 `kernel_ref`，不把内核提交进这个 git |
| `scripts/` | 本机运行。读取 `kernel.local.json` 里的路径 |

`kernel.local.json` 从样例复制，已在 `.gitignore` 里。它只描述本机路径，不负责更新内核。

## 不在这个 git 里

| 位置 | 是什么 |
|---|---|
| 官方 `deepseek-ai/deepseek-harness` | 内核。流水线临时检出，或本机另放一份克隆 |
| `~/.dsh-x` | 运行数据：密钥、desktop profile、用户指令、Electron 数据 |

home 不用默认的 `~/.dsh`。用户级指令在 `~/.dsh-x/agents/`，由 `DSH_AGENTS_HOME` 指向那里。

```text
~/.dsh-x/
  .credentials.yaml
  profiles/desktop/             link: 记在这里，不记在内核仓库里
  agents/AGENTS.md
  agents/skills/
  plans/<会话>/               dsh-x-plan 写下的计划、批准副本和验收结论
  electron-user-data/
  logs/
```

## 安装包

打包规则在 `packaging/README.md`。官方 Desktop 能出的是 macOS arm64、macOS x64、Windows x64。Linux 没有这条打包路径。

`.github/workflows/desktop-package.yml` 手动运行，打未签名的 macOS arm64 和 Windows x64。`link:` 的本机路径不会打进安装包。
