# dsh-x-update

DSH-X 的更新器。它把“插件更新”和“桌面应用/内核更新”分开，避免在旧内核上安装按新内核构建的插件。

## 两条路径

| 判断 | 结果 | 应用方式 |
|---|---|---|
| 新 `desktop-v*` 版本，或 `kernelVersion` 变化 | 应用更新 | 下载 DMG/EXE，校验 SHA-256；退出应用后替换整包并重启 |
| 新 `plugins-v*`，且 `runtime` 等于当前内核 | 插件更新 | 下载并校验 tgz，写入 `updates/pending-plugins.json`；下次启动由 `bootstrap.mjs` 通过官方 CLI 应用 |
| 新插件要求的 `runtime` 与当前内核不同 | 应用更新（若已有对应桌面版本）或阻塞 | 不会把不兼容插件装进当前 profile |
| 发布版本不高于已安装版本 | 无需更新 | — |

插件更新的 `runtime` 必须**精确等于**当前内核版本。DSH-X 的插件只声明精确 `engines.dsh`，不能把邻近版本当成兼容。

## 数据与来源

- 更新源：`https://github.com/csic21/dsh-x/releases.atom`，不需要 GitHub token。
- 桌面清单：`distribution-<target>.json` 与 `SHA256SUMS`。
- 插件清单：`build-manifest.json` 与 `SHA256SUMS`。
- 下载只接受 `github.com/<repository>/releases/download/...`。
- 状态与暂存：`$DSH_HOME/updates/`。
  - `status.json`：最近一次检查结果。
  - `pending-plugins.json`：待下次启动应用的插件包。
  - `pending-app.json`：待退出后安装的桌面安装包。
  - `app/<tag>/apply.log`：应用更新 helper 日志。
- 插件包会复制到 `$DSH_HOME/installer-packages/update-<tag>/`，保证 profile lockfile 的 `file:` 来源在应用升级后仍可解析。

## 配置

默认值在 `src/service.ts`，可在 bundle 的 row 上覆盖：

```yaml
- insert:
    - id: dsh-x-update
      name: dsh-x-update
      config:
        autoCheck: true
        autoDownload: true
        autoInstallApp: true
        checkIntervalHours: 6
        initialDelaySeconds: 20
```

- `autoCheck`：启动后延迟检查，并按间隔重复。
- `autoDownload`：发现更新后自动下载、校验并暂存。
- `autoInstallApp`：应用包暂存后启动 helper；helper 等到应用退出再替换。关闭后只保留 `pending-app.json`，由用户手动安装。
- `DSH_X_UPDATE_DISABLE=1`：进程级关闭自动检查、自动下载和自动安装，供桌面验收和离线冒烟测试使用；不改变已暂存的更新文件。
- `runtime` 不匹配时不会降级安装；没有对应内核的桌面版本时状态为阻塞。

## 安全边界

- 发布包未签名。自动应用更新只验证发布清单中的 SHA-256（以及插件包的 SHA-512），不验证代码签名、公证或发布者身份。
- GitHub 仓库和 Release 的写权限就是更新信任根；不要在多来源之间混用更新清单。
- 应用更新 helper 会替换整个 `DSH-X.app` / 安装目录，但不会删除 `$DSH_HOME` 下的用户数据、凭据或 profile。
- 更新失败时保留旧应用；macOS helper 在替换失败时回滚旧 bundle。Windows 依赖 NSIS 安装器的覆盖行为，不承诺失败自动回滚。

## 开发

```sh
pnpm run build --filter dsh-x-update
node --test packages/dsh-x-update/test/*.test.ts test/update-bootstrap.test.js
```

`lib/` 是交付产物。`cordis.patch.yml` 只插入 Host 行；客户端模块通过 `lib/client.js` 注册 `settings.section`，不修改官方 shell。

## 相关

- 桌面引导与应用插件安装：`scripts/desktop-distribution/bootstrap.mjs`
- 发布清单生成：`scripts/package-plugin-release.mjs`、`scripts/package-desktop-distribution.mjs`
- 更新决策与测试：`src/decision.ts`、`test/decision.test.ts`
