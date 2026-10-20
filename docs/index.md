---
layout: home

hero:
  name: DSH-X
  text: DeepSeek Harness 的可选插件库
  tagline: 在官方 DSH 上增加代码审查、A 股行情与浏览器控制（内嵌 tab 或外部 Chrome）。不替换内核，不打包桌面应用。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/install
    - theme: alt
      text: 插件一览
      link: /guide/plugins

features:
  - title: 只做插件
    details: 源码、本机链接脚本和市场索引。官方内核、桌面应用、安装器与 DMG/EXE 都不在这个仓库。
  - title: 走官方安装入口
    details: 在 Plugins → Discover 添加一个索引地址，或用官方 `dsh plugin` 安装；审批、凭据与语言都复用官方能力。
  - title: 可核对的版本口径
    details: 加载准入由 peer 范围决定，市场索引按 engines.dsh 计算兼容性，完整验证绑定精确运行时。
  - title: 一个索引，五个插件
    details: GitHub Pages 生成格式 1 的市场索引；每个版本钉在发布 commit 上，不依赖 npm 发布。
---

## 这是什么

DSH-X 是运行在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 上的插件集合。它和官方内核的关系是：

- **内核**由官方提供（npm 包或桌面应用），负责会话、模型、工具、审批、沙箱与 profile。
- **插件**由本仓库提供，作为官方 profile 的 bundle 挂载，只通过官方扩展点增加能力。
- 插件不创建自己的 home，不搬动官方 `sessions/`，也不接管凭据。

## 我该从哪里开始

| 我想…… | 看这里 |
| --- | --- |
| 装上插件并用起来 | [快速开始](/guide/install) |
| 知道有哪些插件 | [插件一览](/guide/plugins) |
| 在桌面版里安装 | [桌面版](/guide/desktop) |
| 搞清版本、peer 范围与验证边界 | [版本与兼容](/guide/compatibility) |
| 安装被拒、装完没反应 | [常见问题](/guide/troubleshooting) |
| 改插件、跑测试、发版本 | [仓库与本地开发](/dev/workspace) |

::: tip 先确认版本
插件对官方运行时是**有版本要求**的。安装前先跑 `dsh --version`，再对照 [版本与兼容](/guide/compatibility)。版本不匹配时官方会直接拒绝安装，这是预期行为。
:::
