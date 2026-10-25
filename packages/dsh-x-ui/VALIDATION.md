# 验证记录

本文件记录 `dsh-x-ui` 在当前环境里实际跑过的检查，以及**没有**验证的部分。不要把安装成功当成视觉验证。

## 已运行（仓库内）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 构建 | `node scripts/build-package.mjs packages/dsh-x-ui` | 通过；产出 `lib/index.js`、`lib/client.js`、`.d.ts` |
| 类型检查 | `tsc -p tsconfig.json`（strict，含 test） | 通过，无输出 |
| 存储与归一化 | `node --test test/store.test.ts` | 8 项通过 |
| 路由校验 | `node --test test/routes.test.ts` | 5 项通过 |
| 材质与 token 契约 | `node --test test/material.test.ts` | 8 项通过 |
| 客户端装配 | `node --test test/client.test.ts` | 5 项通过 |
| 入库产物 | `node --test test/plugin-artifacts.test.js` | 通过，含本包 |
| 版本范围准入 | `node --test test/peer-ranges.test.js` | 通过，含本包 |

材质与 token 的断言覆盖：token 层每项都是 `{ light, dark }` 字符串对；只改"面"不改文字/状态/品牌色；样式表为每个被引用的 `--dxu-*` 提供定义；表面填充必须走官方 `--dsw-static-*` 原始色板；锚点不得是构建哈希类名；浓度变化确实改变不透明度与模糊；两个开关各自只摘掉自己那一层；`prefers-reduced-transparency` 与 `prefers-reduced-motion` 都被处理。

客户端断言覆盖：设置行注册进 `settings.general.item` 且自带 locale 与 controller；启用时只注册一层 token 覆盖并绘制材质；关掉后 token 层被释放且样式清空；改设置会重绘而不是堆叠多层；卸载后插件自己的 `<style>` 全部移除。

## 未验证（明确不在本仓库范围）

- **真实浏览器渲染**：模糊、饱和度、混色、渐变叠加的最终观感没有截图验证。仓库内用的是 jsdom，不产生布局，也不渲染 `backdrop-filter`。
- **浅色/深色并排对比**：逻辑上两套变量都已生成，但没有在真实界面里逐屏核对对比度。
- **Desktop 原生 vibrancy 叠加效果**：`data-platform=darwin` 下底色层降到 72% 是依据主进程 `vibrancy: "sidebar"` 的静态推断，没有在打包应用里实测。
- **官方 token 与 `data-*` 钩子的长期稳定性**：覆盖层每个值都带官方默认值作为 fallback，但钩子被重命名时玻璃会减少而不是报错；这一点依赖官方文档化契约，没有跨版本回归证据。
