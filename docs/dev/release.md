# 发布流程

发布的是**插件 Git 版本**，不是桌面应用，也不是 npm 包。所有包同版本，由 `plugins-v*` tag 统一驱动。

## 版本规则

- tag 名是 `plugins-v<version>`，例如 `plugins-v0.2.0`；所有包的 `version` 必须与它完全一致。
- 每个包 `engines.dsh` 精确等于 `compatibility/policy.json` 的 `baseline.version`（完整验证用的运行时）。
- 每个包对官方 `@deepseek-ai/dsh*` 的 peer 范围必须与 `policy.json` 的 `supportedPeerRange` 一致。
- 兼容版本不得为了发布放宽；新运行时需要先有真实证据。

## 发一个版本

```sh
# 确保工作区干净、测试通过、lockfile 同步
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test

# 更新三个包的 version 与需要的说明，然后提交
git add -A
git commit -m "release: 0.2.0"
git tag plugins-v0.2.0
git push origin main --tags
```

推送 tag 后：

| 工作流 | 内容 |
| --- | --- |
| `plugin-release.yml` | 安装锁定依赖、类型检查、构建、全量测试，生成 `market-index.json` artifact |
| `docs-pages.yml` | 重新构建文档站点；`prebuild` 生成市场索引并随 Pages 发布 |

Docs 工作流在 `main` 与 `plugins-v*` 上都会运行，`fetch-depth: 0` 让它能读取全部 tag。发布完成后：

- `https://csic21.github.io/dsh-x/market-index.json` 出现新版本；
- 用户在 Discover 刷新后看到 **Update available**；
- 官方对第三方插件没有一键升级，用户卸载旧版本后安装新条目。

## 市场索引如何生成

`scripts/generate-market-index.mjs`：

1. 读取所有 `plugins-v*` tag 的 commit、时间与包清单；
2. 跳过低于 `0.2.0` 的旧 tag（旧包形状不同）；
3. 为每个包生成 `source: { type: 'git', url, commit, path }`；
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

1. 在 `compatibility/policy.json` 更新 `baseline`（版本 + SHA-512 + 状态）。
2. 把所有包的 `engines.dsh` 改成新版本。
3. 跑完整测试，保留证据。
4. 若新运行时也要保持“可加载”，把 peer 范围扩到覆盖它，并在 `additionalBaselines` 记录证据范围。
5. 在单独的、经过审查的提交里完成这些改动；不要和功能改动混在一起。

## 验证边界

发布说明只承诺实际验证过的内容：

- ✅ 构建、类型检查、包内测试、跨包集成测试、市场索引格式与安装 spec。
- ❌ Electron 页面渲染与 Browser 的原生行为、真实行情源与凭据、安装期依赖构建脚本、跨版本数据迁移。

不要把这些未覆盖项写进 Release notes 当作已验证。
