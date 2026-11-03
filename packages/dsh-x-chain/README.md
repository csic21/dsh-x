# dsh-x-chain

把「已经想清楚的下一步」一次性交给工具层执行：模型在**一次**调用里给出若干条完整字面动作，插件按顺序逐条走官方工具管线，守卫只读真实回执，任何一条不成立就把控制权交回模型。

它借的是 HarnessMM 论文里最保守的那一半——**动作银行 + 回执守卫**；没有做 `llm/stream` 短路那种「跳过模型调用」的 CCS，原因见下文。

| 工具 | 作用 |
| --- | --- |
| `chain_run` | 在一个 step 内顺序执行 1–32 条字面工具调用，支持回执守卫与失败即停 |

## 一个例子

```json
{
  "steps": [
    {
      "id": "write",
      "tool": "write",
      "arguments": { "path": "src/sum.ts", "content": "export const sum = (a: number, b: number) => a + b\n" }
    },
    {
      "id": "typecheck",
      "tool": "bash",
      "arguments": { "command": "pnpm -C packages/dsh-x-chain typecheck" },
      "when": [{ "step": "write", "ok": true }]
    },
    {
      "id": "test",
      "tool": "bash",
      "arguments": { "command": "pnpm -C packages/dsh-x-chain test" },
      "when": [{ "step": "typecheck", "path": "exitCode", "equals": 0 }]
    }
  ]
}
```

模型发一次 `chain_run`，写文件、类型检查、测试三步在一个 step 内完成；不需要在每次 `bash` 返回后再推理一轮。

## 合同

- 步骤按数组顺序执行，绝不并行。
- `arguments` 必须是**已经封闭**的字面量：插件不会用上一步的输出拼下一步的参数。依赖前一步结果才能决定的事，必须留到之后单独调用。
- 每一步通过 `ctx.tools.execute` 以嵌套调用分派：审批、沙箱、工具策略、取消与直接调用完全一致。
- 守卫只读**真实回执**：`ok`（是否成功）、`path`（结果值里的点路径，如 `exitCode`、`files.0.path`）、`equals`（期望值）。路径不存在或步骤没跑过都算不成立，即 fail closed。
- 守卫不成立：停在该步之前，返回已执行步骤与原因。
- 某步失败：默认停下；`continueOnError: true` 时继续，后续步骤可用 `{ "step": "x", "ok": false }` 显式接住失败。
- 不允许 `chain_run` 嵌套自己；白名单之外的工具在解析阶段就拒绝。

## 配置

`cordis.patch.yml` 的默认值：

```yaml
- id: dsh-x-chain
  config:
    enabled: true
    allowedTools: [bash, read, write, edit, glob, grep]
    maxSteps: 8
    maxStepChars: 1500
    continueOnError: false
```

- `allowedTools`：能被银行分派的工具名。默认只给文件与命令类；要链式调用别的工具（例如 `web_fetch`）就自己加。`chain_run` 永远被拒。
- `maxSteps`：1–32。
- `maxStepChars`：单步回执进入上下文的字符预算，200–20000；超长时保留头尾并标注省略量。
- `continueOnError`：失败后是否继续。

## 它省的是什么

`roundTripsSaved = max(0, 已执行步数 - 1)`，口径是**反事实**：假设没有银行时，第一步之后的每一步都需要一次新的模型调用才能决定。

这是诚实的上限，不是实测收益：

- 银行本身要一次模型调用来写出来，所以 3 步省 2 次，不是 3 次。
- 如果模型本来就会在一次回复里并行发多个独立调用，那些步骤并不会因为银行而变少。
- 回执仍然进入上下文，所以**不宣称 token 下降**。真正减少的是「工具返回 → 再推理 → 再调用」的往返次数。
- 一次调用里串行跑很久时，UI 上只有一条工具记录，中间步骤的回执都在这一条结果里。

## 与论文的关系

HarnessMM 的完整链路是 EDG（可执行决策图）→ GDR（带守卫的复用）→ CCS（认证回调替换）：命中的动作由 harness 直接顶替一次模型调用，并写一张「哪个慢回调确实没发生」的证书。

这里实现的是它的**保守子集**：

| 论文部件 | 本插件 | 说明 |
| --- | --- | --- |
| 字面动作银行 | ✅ `steps` | 参数必须预先封闭，不做语义推断 |
| 公开守卫 | ✅ `ok` / `path` / `equals` | 只读真实回执，不读预测值 |
| 原生执行 | ✅ `ctx.tools.execute` + `parent` token | 仍走原接口、原沙箱、原审批 |
| 失败即回退 | ✅ 停链并交还模型 | 不猜、不改参数 |
| CCS 跳过一次模型调用 | ❌ | 见下 |
| 替换证书 / 审计 | ❌ | B 路线没有「删掉一次回调」可证明 |

没有做 CCS 的原因不是接口不够，而是账目：DSH 要求 `Model-visible ⟺ logged`。在 `llm/stream` 里短路 `next()` 合成一条 assistant 消息，日志里会出现一条「某个 provider 的 assistant 回合」，而那个 provider 实际没被调用。要忠实实现，得先回答三个问题：

1. loop 是否接受没有 `replayState` 的 `finish`；
2. 缺 `usage` 会不会让 tokenMeter / 上下文压力计算失真；
3. 合成回合进入日志后，UI 与重放会不会把它当成真实模型输出。

这三条没有验证之前，本插件不写「省了 87%」这类数字。

## 嵌套调用与 Auto 预设

每一步都以 `tool/ptc-dispatch-start` / `tool/ptc-dispatch` 成对写入会话日志——和 `run_code` 的桥用同一套 log-only 词汇，`parentCallId` 是这次 `chain_run` 调用。这样：

- UI 能看到每个子调用的运行中和结束状态；
- Auto 权限预设的 reviewer 能在日志里找到待审调用，并拿到它的绑定 schema；没有这对事件时它会直接拒绝执行（`pending PTC call is missing`）。

代价要说清楚：**Auto 预设仍然逐步审查**。串 3 步就是 3 次 reviewer 调用，只是省掉了步骤之间的 3 次主模型往返。如果 reviewer 判定某一步需要人工批准，而当前策略是 `never`，该步会失败并停链——和直接调用同一工具的结果一致。

工具必须在调用者可见的 registry 视图里（预设把文件与命令工具注册在 agent 平面，而不是全局层），所以插件用调用它的 agent 作为 scope 去取 schema；某个工具被 restriction 挡掉时，这一步报「not registered in this session」并停下，不会绕过限制去执行。

## 安全边界

- 默认白名单只含 `bash`、`read`、`write`、`edit`、`glob`、`grep`。
- 银行不能读上一步输出再决定下一步，因此不存在「模型看不见的中间状态」。
- 嵌套调用仍会触发官方审批；一次批准只覆盖它自己那次调用。
- 插件不写会话目录、不存凭据、不改模型请求；状态只有这一条工具结果。

## 开发

```sh
pnpm -C packages/dsh-x-chain build
pnpm -C packages/dsh-x-chain typecheck
pnpm -C packages/dsh-x-chain test
```

测试会启动真实的 Cordis `ToolRuntime` 与官方 `SystemPrompt`，注册两个合成工具，再从 `ctx.tools.execute` 发起 `chain_run`——验证嵌套分派拿到 `parent` token、守卫读到真实结果值、失败即停与截断行为。模型驱动没有参与，也不访问网络。
