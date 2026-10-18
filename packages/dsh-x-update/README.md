# dsh-x-update

DSH-X 的插件更新检查器。它只读取公开 GitHub Releases 和当前 profile 的已安装版本，报告是否有兼容的插件更新；**不下载安装包、不修改 profile、不创建更新目录**。安装和升级仍由官方 Plugins 页面或 `dsh plugin` 完成。

## 检查规则

| 判断 | 结果 |
|---|---|
| 新 `plugins-v*` 发布中的插件版本高于已安装版本 | 插件更新可用 |
| 发布 `runtime` 精确等于当前 DSH 运行时 | 可以安装 |
| 发布 `runtime` 与当前运行时不同 | 阻塞，不能用当前运行时安装 |
| 发布版本更高，但没有覆盖已安装插件的 tgz | 阻塞，提示发布缺少对应包 |
| 已安装版本不低于发布 | 已是最新 |

`runtime` 必须**精确等于**当前 DSH 版本。插件只声明精确 `engines.dsh`，不能把邻近版本当成兼容。

## 数据与来源

- 更新源：`https://github.com/csic21/dsh-x/releases.atom`，不需要 GitHub token。
- 清单：`build-manifest.json`。
- 已安装版本：官方 `profileContext.dir` 下 profile 的 `package.json` 与 `node_modules/dsh-x-*/package.json`。
- 当前运行时：本包的精确 `engines.dsh`；官方加载器只会把本包装到同一运行时上。
- 不写任何文件；没有 `$DSH_HOME/updates`、`installer-packages` 或待应用清单。

## 配置

默认值在 `src/service.ts`，可在 bundle 的 row 上覆盖：

```yaml
- insert:
    - id: dsh-x-update
      name: dsh-x-update
      config:
        autoCheck: true
        checkIntervalHours: 6
        initialDelaySeconds: 20
```

- `autoCheck`：启动后延迟检查，并按间隔重复。
- `DSH_X_UPDATE_DISABLE=1`：进程级关闭自动检查，供离线冒烟测试使用。

## 安全边界

- 只读公开 metadata；默认只请求 GitHub 发布源（测试可用 `feedUrl` 覆盖到本机源）。
- 不执行下载内容、不校验安装包哈希、不安装；这些由官方 Plugins 页面负责。
- 只展示 Release 链接，不把第三方文案当作指令。

## 开发

```sh
pnpm run build --filter dsh-x-update
node --test packages/dsh-x-update/test/*.test.ts
```

`lib/` 是交付产物。`cordis.patch.yml` 只插入 Host 行；客户端模块通过 `lib/client.js` 注册 `settings.section`，不修改官方 shell。

## 相关

- 插件发布：`scripts/package-plugin-release.mjs`、`.github/workflows/plugin-release.yml`
- 官方插件管理：官方 Plugins 页面与 `dsh plugin`
