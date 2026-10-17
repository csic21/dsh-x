# Developer Suite 验证记录

2026-10-17，Linux 测试环境，Node.js 24.19.0，官方 npm `@deepseek-ai/dsh@0.2.1-alpha.5` 与 pnpm 11.28.5。未修改内核。完整机器可读记录见 `../../compatibility/evidence/suite-baseline.json`。

真实构建 Code、Agents 后，使用 `npm pack --ignore-scripts` 产生组件与 suite tarball；临时 registry 提供这些精确版本，官方 CLI 安装到临时 home。实际启动官方 Web Host，通过经过认证的测试探针读取官方 Loader、客户端模块图与 Plugins 服务状态。

已通过的 10 项检查：

1. 从打包产物安装套件，Code 与 Agents 各一个 active fiber 和客户端模块。
2. 官方单插件禁用、再启用。
3. 官方整个 suite bundle 禁用、再启用。
4. 同版本独立包与 suite 混装时无重复实例；取消独立 bundle 选择后，单行管理恢复。
5. 通过真实 CLI 替换升级版本的 suite 测试包。
6. 替换保留 suite 已禁用状态。
7. Code 不依赖 Agents 激活。
8. 官方 registry 预检拒绝声明不兼容 engines 的版本，profile manifest 不变。
9. 移除 suite 后，独立选择的 Code 保留。
10. 先独立包、后 suite 的相反顺序同样无重复实例。

升级用的是明确标记的本地版本 fixture，没有发布这些版本。第 8 项不覆盖 tarball 安装后的回滚修复。仅有 pnpm 成功输出不算成功，每一步均要求官方 CLI 成功和实际 Host 状态匹配；版本拒绝则要求官方明确的兼容性拒绝诊断。

最终仓库 `npm test`（自动先构建客户端）通过 689/689，0 失败、0 跳过。这里的 Linux Web Host 证据不代表 Electron、用户界面视觉交互、原生厂商登录、付费模型执行、真实用户数据迁移或新上游版本已验证。Desktop 专项流程另见 `../../docs/desktop-browser-proof.md`。
