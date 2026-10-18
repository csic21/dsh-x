# 已完成的本地基线证据

`suite-baseline.json` 是 2026-10-17 在隔离临时 home 上真正执行官方 DSH CLI、pnpm 与 Web Host 的结果。它记录实际运行版本、检查结果和真实打包产物 SHA-512；`fixture: true` 的套件版本只用于升级与拒绝测试，未发布。

证据范围为 Code + Agents 的套件安装与管理，不包含 Browser / Electron、真实模型、原生供应商账号或用户数据迁移。它不是尚未执行的 GitHub 候选容器作业或定时监控结果。包没有发布到公共 registry，本地测试 registry 仅用于提供待发布的精确依赖。

`typescript-migration-suite-2026-10-18.json` 记录本次 TypeScript 迁移后的真实套件复核：官方 DSH `0.2.1-alpha.5`、pnpm `11.28.5`，十项安装/启停/组合/版本替换/拒绝/卸载检查均通过。CLI 和包管理器仅安装到临时目录，所有 profile/home/cache 隔离，检查结束后测试目录已清理。报告中的升级版本仍仅为本地 fixture。此报告不扩大到 Electron、供应商登录、真实模型或用户数据迁移。
