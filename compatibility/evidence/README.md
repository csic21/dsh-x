# 已完成的本地基线证据

`suite-baseline.json` 是 2026-10-17 在隔离临时 home 上真正执行官方 DSH CLI、pnpm 与 Web Host 的结果。它记录实际运行版本、检查结果和真实打包产物 SHA-512；`fixture: true` 的套件版本只用于升级与拒绝测试，未发布。

证据范围为 Code + Agents 的套件安装与管理，不包含 Browser / Electron、真实模型、原生供应商账号或用户数据迁移。它不是尚未执行的 GitHub 候选容器作业或定时监控结果。包没有发布到公共 registry，本地测试 registry 仅用于提供待发布的精确依赖。
