# 历史证据

这里的 JSON 均来自 Code + Agents 套件时代，保留用于追溯当时的官方 CLI、pnpm 与 Web Host 行为：

- `suite-baseline.json`：2026-10-17 在隔离临时 home 上执行套件安装与管理的真实结果；`fixture: true` 的版本只用于升级与拒绝测试。
- `typescript-migration-suite-2026-10-18.json`：TypeScript 迁移后的套件复核（官方 DSH `0.2.1-alpha.5`）。
- `rc2-suite-2026-10-18.json`：`0.2.1-rc.2` 基线的套件矩阵。

当前仓库已移除套件、Agents、Plan、Chat 与 Update，这些报告不再描述现行包形状；不要用它们证明当前三个插件的安装或更新。

现行证据由 `docs/dev/release.md` 与 `compatibility/README.md` 描述的检查产生。
