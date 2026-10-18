# 发布流程

发布的是**插件 tgz**，不是桌面应用，也不是 npm 包。所有包同版本，由套件版本统一驱动。

## 版本规则

- `dsh-x-suite` 的版本就是 Release 版本；八个包的 `version` 必须与它完全一致。
- 每个包 `engines.dsh` 精确等于 `compatibility/policy.json` 的 `baseline.version`（完整验证用的运行时）。
- 每个包对官方 `@deepseek-ai/dsh*` 的 peer 范围必须与 `policy.json` 的 `supportedPeerRange` 一致。
- 兼容版本不得为了发布放宽；新运行时需要先有真实证据。

## 发一个版本

```sh
# 确保工作区干净、测试通过、lockfile 同步
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test

git tag plugins-v0.1.3 <待发布提交>
git push origin plugins-v0.1.3
```

推送 tag 后 `.github/workflows/plugin-release.yml` 会依次执行：

| 阶段 | 内容 |
| --- | --- |
| build | 安装锁定依赖、类型检查、全量测试、打包八个 tgz、生成 `SHA256SUMS`、校验清单、上传 artifact |
| admit | 矩阵安装两个固定完整性的官方运行时（`next`、`latest`），各装一次真实 tgz，启动官方 Web Host 并调用插件 RPC |
| qualify | 在基线运行时上跑完整套件矩阵：安装、单项/整套启停、混合源、升级 fixture、移除、不兼容拒绝 |
| publish | 三道门都通过后创建 GitHub 预发布版本 |

publish 上传的资产包括：所有 tgz、`SHA256SUMS`、`build-manifest.json`、`INSTALL.md`、`install-plugins.mjs`、套件安装报告与两个基线的准入报告。

## 演练与定时检查

- **手动演练**：在 Actions 里对 `plugin-release.yml` 运行 `workflow_dispatch`。默认只跑 build + admit（快路径），勾选 `full_qualification` 才跑完整矩阵。手动运行**永远不会**创建 Release。
- **每日检查**：同一 workflow 的 `schedule` 在默认分支上重跑整条流水线（不发布），用来发现上游或依赖漂移。
- **上游发现**：`upstream-compatibility.yml` 每日检查 npm 上的新官方版本，在隔离容器里尝试准入并保存证据；它不会自动改本仓库的版本声明。

## 本地复现发布检查

```sh
node scripts/package-plugin-release.mjs --output /tmp/dsh-plugin-release --tag plugins-v0.1.3
node scripts/install-release-test-runtime.mjs /tmp/dsh-release-runtime --baseline next
node scripts/test-suite-install.mjs \
  --dsh /tmp/dsh-release-runtime/node_modules/.bin/dsh \
  --dsh-version 0.2.1-rc.2 --release-dir /tmp/dsh-plugin-release \
  --report /tmp/dsh-plugin-release/suite-install-report.json
```

注意 `test-suite-install.mjs` 要求 PATH 上的 pnpm 与 `policy.json` 完全一致，且只接受基线运行时。第二个基线用 `check-peer-admission.mjs` 验证。

## 升级到新的官方运行时

1. 在 `compatibility/policy.json` 更新 `baseline`（版本 + SHA-512 + 状态）。
2. 把所有包的 `engines.dsh` 改成新版本。
3. 跑 `test-suite-install.mjs` 的完整矩阵，保留报告。
4. 若新运行时也要保持"可加载"（例如它成了 npm `latest`），把 peer 范围扩到覆盖它，并加 `additionalBaselines` 记录证据范围。
5. 在单独的、经过审查的提交里完成这些改动；不要和功能改动混在一起。

## 发布包的结构

- 套件 tgz 里通过 `bundledDependencies` 携带同版本的 Code 与 Agents，第三方依赖仍由用户平台解析（避免携带构建机的原生二进制）。
- 普通 `npm pack packages/dsh-x-suite` 不能替代 Release 产物：它要求两个组件已在 registry 上。
- 每个 Release 都附带 `install-plugins.mjs`，并被 `SHA256SUMS` 覆盖，所以用户不需要 checkout 仓库就能安装。

## 验证边界

发布说明只承诺流水线实际验证过的内容：

- ✅ 官方 CLI 安装、bundle 选中、Web Host 启动、插件 RPC、套件矩阵。
- ❌ Electron 页面渲染与 Browser 的原生行为、供应商登录与真实模型调用、安装期依赖构建脚本、跨版本数据迁移。

不要把这些未覆盖项写进 Release notes 当作已验证。
