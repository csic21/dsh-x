# scripts

只放本机开发与发布辅助脚本，不放插件逻辑。

| 脚本 | 作用 |
| --- | --- |
| `build-package.mjs` | 构建单个包：清理 `lib/`、tsc 产出宿主 JS/`.d.ts`、esbuild 打包 `lib/client.js`。由各包 `build` script 调用。 |
| `link-plugins.mjs` | 把当前 checkout 的 Code、Stocks 与实验性 Browser 以 `link:` 装进一个官方 profile，供本机调试。 |
| `generate-market-index.mjs` | 从 `plugins-v*` tag 与当前工作树生成格式 1 的 `market-index.json`。每个包用自己的 version，同一版本钉在最早的 tag。Docs 构建会自动调用。 |
| `check-plugin-release.mjs` | 发布前检查：改了的包必须升版本，没改的包不能跟着升。 |

常用：

```sh
pnpm run build
pnpm run typecheck
pnpm test

node scripts/link-plugins.mjs --profile web --home "$HOME/.dsh"
node scripts/generate-market-index.mjs --output docs/public/market-index.json
node scripts/check-plugin-release.mjs
```

`link-plugins.mjs` 不操作 `desktop` profile；桌面版用自己的 Plugins 页面或自带 CLI。所有脚本只使用官方默认位置，不创建独立 home。

插件使用方式见 `docs/guide/`；发布流程见 `docs/dev/release.md`。
