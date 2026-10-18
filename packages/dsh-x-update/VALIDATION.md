# Validation

## 已执行

- `node scripts/build-package.mjs packages/dsh-x-update`：Host TypeScript 与客户端 esbuild 产物构建通过。
- `node --test packages/dsh-x-update/test/*.test.ts`：34 个测试全部通过，覆盖 SemVer、Atom / REST 解析、插件清单校验、更新决策、profile 读取、服务状态和设置页渲染。
  - 只读检查：兼容的 `plugins-v*` 产生插件更新，不创建 `$DSH_HOME/updates`。
  - 运行时不同、缺少已安装插件包、未知运行时和发布源失败都能给出阻塞或错误状态。
  - 中英文案键一致，设置页渲染插件版本、运行时和 Release 链接。
- 使用公开仓库 `csic21/dsh-x` 的 Releases Atom 与 `build-manifest.json` 做只读检查；不下载安装包。

## 未验证

- 真实 GitHub Release 升级（当前仓库还没有包含本版本的 `plugins-v*` 产物）。
- 真实 Desktop / Web 页面中的交互与视觉。
- 官方 Plugins 页面从本插件给出的 Release 链接完成安装的端到端流程。

因此，检查、决策、profile 读取和 Host/RPC 加载可以验证；**本插件不负责安装，自动安装不属于它的能力**。
