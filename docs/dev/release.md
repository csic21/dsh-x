# 发布流程

发布的是**插件 Git 版本**，不是桌面应用，也不是 npm 包。五个包各自有 `version`。`plugins-v*` tag 只标记「这次发布哪一个 commit」，不再要求五个包同一个号。

## 版本规则

- 只给改过的包升 `version`。没改的包保持原号，索引里也不会出现新条目。
- tag 名仍是 `plugins-v<版本>`，例如只发布 Code `0.6.1` 时打 `plugins-v0.6.1`。tag 不必等于另外四个包的版本。
- 每个包的每个版本只钉一次，钉在**第一次**带上这个版本的 tag。以后的 tag 即使还含着旧版本，也不改它的安装 commit。
- 升版本但包目录没变化，或者包目录变了却不升版本，`node scripts/check-plugin-release.mjs` 会失败。`docs/` 和 `scripts/` 的改动不算包变化。
- 每个包的 `engines.dsh` 与 `@deepseek-ai/dsh*` peer 范围必须逐字等于 `compatibility/policy.json` 的 `supportedRuntimeRange`。
- 不要写精确版本：官方判定先看 `engines.dsh`，精确值会让其它运行时的用户看到「不兼容」，peer 范围写得再宽也不会被读到。
- `policy.json` 的 `baseline` 记录跑过完整测试的运行时（这是运行时基线，不是插件版本）。
- 兼容版本不得为了发布放宽；新运行时需要先有真实证据。

## 发一个版本

```sh
# 确保工作区干净、测试通过、lockfile 同步
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test

# 只改动过的包升 version。例如这次只改了 Code：
# packages/dsh-x-code/package.json  0.6.0 → 0.6.1
git add -A
git commit -m "release: dsh-x-code 0.6.1"
node scripts/check-plugin-release.mjs
git tag plugins-v0.6.1
git push origin main --tags
```

推送 tag 后：

| 工作流 | 内容 |
| --- | --- |
| `plugin-release.yml` | 先核对各包版本有没有漏升或空升，再安装锁定依赖、类型检查、构建、全量测试，生成 `market-index.json` artifact |
| `docs-pages.yml` | 重新构建文档站点；`prebuild` 生成市场索引并随 Pages 发布 |

Docs 工作流在 `main` 与 `plugins-v*` 上都会运行，`fetch-depth: 0` 让它能读取全部 tag。发布完成后：

- `https://csic21.github.io/dsh-x/market-index.json` 出现新版本；
- 用户在 Discover 刷新后看到 **Update available**；
- 官方对第三方插件没有一键升级，用户卸载旧版本后安装新条目。

## 市场索引如何生成

`scripts/generate-market-index.mjs`：

1. 读取所有 `plugins-v*` tag 的 commit、时间与各包自己的 `package.json` version；
2. 跳过低于 `0.2.0` 的旧 tag（旧包形状不同）；
3. 同一个包版本只保留最早的 tag，并生成 `source: { type: 'git', url, commit, path }`；
4. 如果工作树已提交且没有未提交的包改动，也把当前 HEAD 版本加入索引；未提交的改动会被跳过，避免索引指向不含该版本的 commit；
5. 输出 `docs/public/market-index.json`，由 Pages 发布。

不要在发布后手改索引；重新打 tag 或修生成器。

## 发布前检查

```sh
node --test test/market-index.test.js
node --test test/plugin-artifacts.test.js test/peer-ranges.test.js
pnpm --filter dsh-x-code test
```

`test/market-index.test.js` 使用官方 `parseMarketIndex` 校验格式 1，并检查每个版本的 Git 安装 spec。

## 升级到新的官方运行时

1. 在 `compatibility/policy.json` 更新 `baseline`（版本 + SHA-512 + 状态），把原基线挪进 `additionalBaselines`。
2. 跑完整测试，保留证据。
3. 新运行时落在同一个 minor 内时，`engines.dsh` 的联合范围已经覆盖它，不需要改包；跨 minor 时先改 `supportedRuntimeRange` 并同步所有包的 `engines.dsh` 与 peer。
4. 在 `additionalBaselines` 记录每个旧基线的证据范围。
5. 在单独的、经过审查的提交里完成这些改动；不要和功能改动混在一起。

## 验证边界

发布说明只承诺实际验证过的内容：

- ✅ 构建、类型检查、包内测试、跨包集成测试、市场索引格式与安装 spec。
- ❌ Electron 页面渲染与 Browser 的原生行为、真实行情源与凭据、安装期依赖构建脚本、跨版本数据迁移。

不要把这些未覆盖项写进 Release notes 当作已验证。
