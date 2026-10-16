# packages

一个目录一个插件包。目录名等于 `package.json` 的 `name`。

第一个插件是 `packages/dsh-x-plan/`。不要把插件源码放进官方内核仓库。

根上的 `pnpm-workspace.yaml` 用 `packages/*` 收这些目录。本仓库根不声明 `packageManager`，pnpm 版本跟内核仓库走。
