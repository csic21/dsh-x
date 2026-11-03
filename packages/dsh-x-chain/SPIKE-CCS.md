# CCS spike：三个死穴的结论

对象：`llm/stream` 短路（论文里的 CCS），在 Desktop 运行时 **0.2.1-rc.5** 上读源码验证。仓库基线是 rc.3，结论按 rc.5 记录；接口形状两版一致。

## 结论速览

| 问题 | 结论 | 证据 |
| --- | --- | --- |
| ① loop 是否接受没有 `replayState` 的 `finish` | **接受**，不是阻塞项 | `StreamChunk.finish.replayState?` 本就可选；loop 只在存在时写进 message.source；两个内置适配器都实现了缺失回退 |
| ② 缺 `usage` 会不会炸掉计量 | **不会**；只是不产生 provider 用量样本 | `tokenMeter` 的 `usageOf()` 找不到就跳过该次 fold，上下文估算走 `estimateMessage()` |
| ③ 合成回合进日志/UI 会不会被当成真实模型输出 | **会，而且是无法从插件侧修好的账目问题** | `createAssistantMessage()` 把 `source.kind` 硬编码成 `'model'`，provider/model 取自请求；没有任何 provenance 字段 |

## ① replayState

`llm/stream` 是普通 waterfall：监听器可以完全不调 `next()`，直接返回自己的 `AsyncIterable<StreamChunk>`（`dsh-llm` 的 `streamWithRegistration`）。loop 侧：

- `AssistantStreamAttempt.finish` 的注释写明 “Terminal reason, defaulting to stop when the stream omitted one”，`finish` 缺失也不会挂；
- 提交 `assistant/message` 时 `replayState` 是条件展开：`...(live.replayState === void 0 ? {} : { replayState: ... })`；
- 适配器侧：`dsh-llm-deepseek` 在 `source.replayState === undefined` 时返回 `undefined` 走重建；`dsh-llm-pi-ai` 在同样条件下走 `foreignAssistant(message)`。

所以合成的 `finish` 不带 replayState 是合法的，代价只是下一个请求从 content blocks 重建，而不是原生回放。带签名 reasoning 的 provider（Anthropic 一类）会丢掉签名，但工具调用块本身能重建。

## ② usage

`tokenMeter` 的 fold 只在 `assistant/message.data.usage` 或该次 stream 的最后一个 `usage` chunk 存在时推进：`usageOf(event)` 返回 `undefined` 就跳过，overall totals 保留上一次的值。上下文尺寸另有 `estimateMessage()` 按内容估算。

含义：短路一次调用时**不写 usage 在语义上是对的**——那次 provider 调用确实没发生，没有 token 可报。副作用是压力值会停留在这步之前，可能让压缩晚一步；不致命，但不能拿“省了多少 token”去编数字。

## ③ 合成回合

这是唯一真正的死穴。loop 提交消息时调用 `createAssistantMessage()`，而这个函数把 `source.kind` 写死为 `'model'`，`source.provider` / `source.model` 直接取自这次请求：

- 会话日志里会出现一条“某 provider / 某 model 产生的 assistant 回合”，而那个 provider 实际没有被调用；
- `deriveMessages()` 与 UI 都按普通 assistant step 渲染，模型标签显示的是那个 provider；
- 重放是一致的（日志自洽），但**归因是假的**，成本账也没有对应的 provider 用量。

插件侧没有合法的绕过方式：`ModelMessageSource` 只有 `kind: 'model'` 一种形状，`assistant/message` 也没有第二个来源字段。可以用自定义 `plugin:` 记录在旁边标注，但那条 assistant 回合本身仍然声称是模型产出——这正是本仓库不愿写进日志的东西。

## 建议

- ①② 已排除，不再是“需 spike”的问题。
- ③ 不解决就不做 CCS。可行的解法都在内核侧：给消息来源增加一个 plugin/decision-replay 变体，或者提供“复用已记录决策”的正式钩子；两者都需要官方 schema 变更，不适合用第三方插件伪造。
- 在那之前，`chain_run` 的 B 路线是能诚实交付的上限：动作银行、回执守卫、原生分派、可审计的 `tool/ptc-dispatch` 对，全部有真实日志。

如果哪天内核给出了 provenance 字段，A 路线的实现路径已经很短：`llm/stream` 监听器命中 eligible 节点 → 合成 `block-start(tool-call)` / `tool-call-delta` / `block-end` / `finish{tool-calls}`，不调 `next()`，并按真实执行回执写 `tool/ptc-dispatch`。
