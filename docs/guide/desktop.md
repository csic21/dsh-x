# 桌面版

官方桌面应用（Electron）和 npm CLI 共用同一个官方 home，但 **profile 归属不同**。这一页讲清楚桌面版里怎么装、为什么有些命令不能用。

## 关键区别

| | npm CLI | 桌面应用 |
| --- | --- | --- |
| 典型 profile | `web` | `desktop` |
| 谁管理 profile | 你自己 | Electron 应用 |
| 能否用 `dsh plugin --profile desktop` | ❌ 会被拒绝 | ✅ 用桌面版自带 CLI |
| 插件入口 | `dsh plugin`、Plugins 页面 | Plugins 页面、桌面版自带 CLI |

`desktop` profile 由应用独占。用 npm 版 CLI 去改它，会得到：

```text
error: profile "desktop" is managed exclusively by the Electron application
```

这不是权限问题，而是设计：桌面应用会自己维护依赖图与启动顺序。**不要绕过它**，也不要用 npm CLI 替换桌面版的内核。

## 安装步骤

1. 启动一次桌面应用，让它初始化 `desktop` profile，然后**完全退出**（不是最小化）。
2. 打开桌面版的 **Plugins → Discover → Index sources**，添加
   `https://csic21.github.io/dsh-x/market-index.json`。
3. 在 Discover 里安装目标插件；桌面版会走自己的兼容检查与重启提示。
4. 按提示重启，确认 Plugins 页面里的 bundle 已启用。

需要命令行时，使用**应用自带**的那份 `dsh`（在应用的资源目录里，路径随安装方式和版本变化），不要用 npm 全局安装的 `dsh` 去改 `desktop` profile。

::: tip 最稳的路径
桌面版直接用它自己的 Plugins 页面和 Discover 索引。
:::

## AI Browser

`dsh-x-browser` 只面向 Desktop，且是实验性的。它需要 Electron 的 `dshDesktop.browser` 能力；Web 端只显示不支持提示。安装前请确认你接受“Electron 行为不在本仓库验证”这一边界。

## 升级

1. 退出应用。
2. 在 Discover 里卸载旧版本，再安装新版本（官方对第三方插件没有一键升级）。
3. 重启并检查状态。

不承诺失败自动回滚；不同版本不要混装。

## 为什么本仓库不打包桌面应用

桌面应用、安装器、bootstrap、DMG/EXE 发行都由独立的应用仓库负责。本仓库只保证：插件能被官方 Desktop 或官方 npm CLI 正常加载，并且安装路径走官方入口。

因此，这一页不提供应用下载链接，也不提供修改 `app.asar`、替换内核或注入启动参数的方法。
