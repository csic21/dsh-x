# Validation

## 已执行

- `node scripts/build-package.mjs packages/dsh-x-update`：Host TypeScript 与客户端 esbuild 产物构建通过。
- `node --test packages/dsh-x-update/test/*.test.ts test/update-bootstrap.test.js`：52 个测试，51 通过、1 跳过（沙箱禁止 `hdiutil` 创建镜像）。
  - SemVer 与 prerelease 顺序。
  - Atom / REST Release 解析、tag 分类、资产 URL。
  - 桌面和插件清单校验、`SHA256SUMS` 校验和路径穿越拒绝。
  - 插件更新 / 应用更新 / 内核不兼容 / 无兼容桌面版本 / 部分插件更新的决策。
  - 本地发行清单、profile 插件版本、空依赖与缺失 profile 的读取。
  - 下载校验、暂存清单、篡改拒绝。
  - macOS / Windows helper 脚本内容与平台限制。
  - 设置页视图模型与中英文案键一致性。
- 使用真实公开仓库 `csic21/dsh-x` 的 Releases Atom 与 `build-manifest.json` 做只读检查：检查时安装 `0.1.1` / 内核 `0.2.1-rc.2`，最新 `desktop-v0.1.1`，最新 `plugins-v0.1.0`（runtime `0.2.1-alpha.5`），结论为已是最新，未下载任何文件。
- 在临时 Web profile 中通过官方 Desktop CLI 链接本包并启动真实 Host：`/api/dsh-x-update/status` 返回 200，客户端模块出现在首页注入中，启动日志无错误。

## 未验证

- 真实 macOS DMG 的替换与回滚（本地沙箱禁止 `hdiutil` 创建镜像，helper 的完整替换测试被跳过；没有执行会替换当前 `/Applications/DSH-X.app` 的操作）。
- 真实 Windows EXE 的静默 `/S /D=` 安装、进程等待和重启。
- 代码签名、公证、Windows 发行签名；当前只校验发布清单的哈希。
- 断电、磁盘写满、helper 被系统注销、安装目录无写权限等失败路径。
- 从真实旧版本到新版本的用户数据迁移；只使用本地 fixture 验证了 pending 清单和版本判断。
- 真实的 GitHub Release 升级（当前仓库还没有包含本插件的 `plugins-v0.1.1` / `desktop-v0.1.2` 产物）。

因此，构建、决策、下载校验和 Host/RPC 加载已通过；**整包自动替换尚不能称为已验证**。
