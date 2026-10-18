# DSH-X Developer Suite

这是官方 DSH 上的开发者插件组合包，不含自己的内核、Electron 壳或登录体系。

- 默认挂载 `dsh-x-code` 和 `dsh-x-agents`，依赖版本精确锁定。
- Code 文件浏览与默认 DSH 模型审查独立可用；原生修复需要 Agents。
- 启用 Agents 不等于初始化原生运行时、登录、读取模型目录或发送任务。现有官方审批和原生权限边界不变。
- Chat、Plan、Stocks 与 Browser 是独立可选插件，不是本套件依赖。Browser 的真实 Desktop 验证单独记录。
- Plan 当前仍有自己的 ACP 适配层；以后复用 Agents 是演进方向，不是当前已完成的能力。

## 安装

生产分发使用预构建 npm 包或依赖可解析、经过校验的 tarball，通过官方 Plugins 页面或 `dsh plugin --profile web add <安装规格>` 安装。包目前只在本仓库构建；这份说明不表示已发布到 npm。

`dsh.bundle.patch` 挂载两个真正的插件行。仅有 npm dependencies 并不会自动启用依赖包的 bundle。

GitHub Release 使用专门的打包脚本，将精确版本的 Code、Agents 预构建产物随套件携带；下载 Release 的 suite tgz 即可通过官方安装入口安装，第三方依赖仍需联网下载。私有仓库请先登录 GitHub 下载文件，不要将私有附件 URL 直接交给包管理器。安装时可加 `--config.auto-install-peers=false`，由官方 Host 提供共享模块。具体步骤与验证边界见 [插件发行](../../packaging/plugins.md)。

普通源码目录直接 `npm pack` 得到的 suite tgz 仍要求两个精确组件依赖在 registry 可获取，不能代替 GitHub Release 专用产物。目前未发布这些 npm 包，不能把包名当作已经可在公共 npm 安装。发行验证使用实际 Release tarball 和真实官方 CLI / Web Host，并检查套件首次安装不查询未发布组件；普通集成测试仍用临时本地 registry 验证 registry 安装路径。

安装前运行只读检查：`node scripts/check-suite-install.mjs --home /绝对路径/home --profile web --dsh-version 0.2.1-rc.2`。先用真实 CLI 的 `dsh --version` 核对版本。若已独立启用 Code 或 Agents，先在官方 Plugins 页面停用对应 bundle，再启用套件；不需要删除组件数据。检查不会改用户配置，也不能替代官方安装时的兼容检查。

Desktop 先启动一次以初始化 profile，再完全退出。使用 Desktop 自带的 `dsh plugin --profile desktop add <安装规格>`；npm 版 CLI 不可替换 Desktop 的依赖图。也可以使用 Desktop 自己的 Plugins 页面。开发用 `link:` 不是可移交给其他机器的安装产物。

## 独立安装、禁用与升级

两个插件沿用独立包的固定行 ID。相同版本同时存在时，官方 Loader 按 ID 维护同一个 Host 实例，客户端按 live entry 加载，不会双启；但重复来源会让官方管理器将组件行标为不可单独管理（`unaddressable`）。此时先停用独立组件 bundle，恢复唯一来源后再切换组件行。不要把这种防重复行为当作支持任意混装。

停用整个套件后，仍独立启用的组件继续有效。要完全停用某组件，应同时停用所有包含它的 bundle；只有唯一来源时才使用单行开关。

套件发布是一个测试过的精确版本组合。不要把不同版本的独立组件混进套件；要独立升级组件，先停用或移除套件，再安装目标版本。运行中的升级仍遵循官方插件管理器的重启要求。安装成功与激活成功分别检查，不能把 pnpm 的零退出码当作全部完成，也不能承诺激活失败会自动恢复旧版本。

`scripts/test-suite-install.mjs` 使用真实官方 CLI、打包后的本仓库组件、临时 profile 和本地测试 registry 验证安装、升级、组合、禁用及移除。测试不访问模型、不登录原生账号；通过不代表模型服务、Electron Browser 或所有平台已验证。
