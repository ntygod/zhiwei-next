# Pi 集成边界

## 决策

Pi是知微默认 Agent Runtime，但不是产品本体。优先使用 SDK、Extension和 RPC，不维护深度 Fork。

## 当前 M0基线

| 项目 | 当前值 |
|---|---|
| 权威上游 | `earendil-works/pi` |
| Release Tag | `v0.84.1` |
| Tag Commit | `53fa77ccd8a279eb87e92294ef3687b03ff80112` |
| Coding Agent包 | `@earendil-works/pi-coding-agent@0.84.1` |
| Node要求 | `>=22.19.0` |
| Registry Artifact | integrity与 shasum已核对 |
| SDK动态导入 | 已验证 |
| RPC空会话启动 | 已验证，无凭证、无 Prompt |
| SDK正常单 Tool会话 | 已验证，无外部 Provider、无副作用 |
| Extension正常单 Tool生命周期 | 已验证，包含 Tool、settled与 shutdown边界 |
| 自动重试恢复成功 | 已验证，首次 retryable error后第二次 Run成功 |
| Retry公共/Extension表面差异 | 已验证，Extension无 Retry专有事件和 `willRetry`增强 |
| 验证状态 | `source-and-runtime-verified-retry-success` |

完整来源、失败恢复记录和隔离模型见 [`docs/spikes/pi-runtime-contract/`](../spikes/pi-runtime-contract/README.md)。机器结果：

```text
packages/pi-adapter/fixtures/pi-artifact-runtime.json
packages/pi-adapter/fixtures/pi-lifecycle-normal-tool.json
packages/pi-adapter/fixtures/pi-lifecycle-retry-success.json
```

当前固定的是 **M0契约基线**，不是生产依赖承诺。仓库仍未将 Pi加入正式依赖，也未冻结 `NormalizedRuntimeEvent`。

## 三个不同的集成表面

Pi至少暴露三类不能混为一谈的表面：

| 表面 | 用途 | 当前确认程度 |
|---|---|---|
| `AgentSession` SDK | Node/TypeScript进程内嵌入、Session控制和公开事件订阅 | 发布 Artifact、空 Session、正常 Tool和 Retry恢复均已动态验证 |
| Extension lifecycle | Context、工具策略、Compaction、Session切换与 Shutdown Hook | 正常 Tool和 Retry底层 Run已动态验证；没有公共 Retry专有事件增强 |
| RPC JSONL | 子进程隔离、非 Node客户端和 Worker边界 | framing、命令类型及无凭证空 Session启动已验证；真实任务时序待录制 |

`pi-adapter`必须显式标记事件来自哪个表面，不能仅凭同名事件假设载荷和时序相同。

## npm Artifact信任边界

第三方 Pi Artifact的动态验证采用隔离 CI，而不是在普通检查 Job或私有 checkout中执行。

约束包括：

- 精确包版本；
- registry integrity、shasum与实际 Tarball字节交叉核对；
- Tarball manifest与源码基线公开表面比对；
- 禁用 npm install scripts；
- digest-pinned Node容器；
- 容器只读根文件系统、非 root、零 capability、no-new-privileges；
- 不挂载宿主仓库，只挂载只读 curated probe bundle；
- 不传 GitHub Secret、真实 Provider Credential、用户数据或完整环境变量；
- Runtime场景只使用 Pi发布包自带内存 Faux Provider；
- Normal Tool的 `echo`和 Retry场景都没有外部副作用；
- 只输出脱敏、可机器复验结果。

这些验证证明发布 Artifact的公开 manifest与目标运行表面符合当前基线。它们不是完整供应链审计，也不证明 Tarball每个源码字节都可由 Git Tag可重现构建得到。

## 已验证的正常单 Tool生命周期

固定场景：

```text
interactive prompt
  → Faux assistant tool call: echo(value=lifecycle-input)
  → echo start / update / end
  → tool result
  → Faux final assistant text
  → agent_end(willRetry=false)
  → agent_settled
  → host-owned session_shutdown(reason=exit)
```

关键证据：

- Faux Provider调用两次，剩余响应为零；
- 发送给外部 Provider的 Prompt数为零；
- `AgentSession` Tool Start/Update/End、Extension `tool_call` / `tool_result`与 Tool `execute`使用真实 `toolCallId = zhiwei-tool-call-1`；
- Session消息角色顺序为 `user → assistant → toolResult → assistant`；
- 正常路径只有一次 `agent_end`、一次 `agent_settled`；
- `agent_end < agent_settled < session_shutdown`；
- fresh CI Capture与 committed Fixture完整契约指纹一致。

详细事件表见 [`normal-tool-lifecycle.md`](../spikes/pi-runtime-contract/normal-tool-lifecycle.md)。

## 已验证的自动重试恢复生命周期

详细事件表见 [`retry-success-lifecycle.md`](../spikes/pi-runtime-contract/retry-success-lifecycle.md)。

固定场景：

```text
retry.enabled=true
maxRetries=3
baseDelayMs=1

Run 1 → overloaded_error
Run 2 → Retry recovered.
```

公共 `AgentSession`顺序：

```text
失败消息与 turn_end(error)
  → agent_end(willRetry=true)
  → auto_retry_start(attempt=1)
  → 恢复 Run
  → auto_retry_end(success=true)
  → turn_end(stop)
  → agent_end(willRetry=false)
  → agent_settled
```

关键证据：

- Faux Provider调用两次，外部 Prompt数为零；
- 公共 `agent_end.willRetry`依次为 `[true, false]`；
- `auto_retry_start`和 `auto_retry_end`各一次；
- 最终 `agent_settled`只有一次；
- `session.prompt()`返回时 `isIdle=true`且 `isRetrying=false`；
- Session最终消息角色只有 `user → assistant`；
- 第一次失败 Assistant消息虽未保留在最终 `session.messages`，但仍完整存在于 Runtime事件流；
- fresh CI Capture与 committed Fixture完整指纹一致。

### Public SDK与 Extension差异

Extension没有收到以下 Session级 Retry语义：

```text
auto_retry_start
auto_retry_end
agent_end.willRetry
```

两次 Extension `agent_end`都没有 `willRetry`。因此：

> Extension事件适合观察底层 Agent生命周期，但不能替代 `AgentSession.subscribe()`提供的 Session级 Retry语义。

知微必须把事件来源作为协议字段，不能把同名 `agent_end`无损合并。

### 对 Observation Ledger的直接约束

最终 `session.messages`不会保留第一次失败 Assistant尝试，因此 Ledger不能仅在 Session结束后读取最终消息来重建历史。它必须按 Runtime事件记录：

- 被重试替代的失败消息；
- `turn_end(error)`；
- 第一次 `agent_end(willRetry=true)`；
- Retry attempt与原因；
- 恢复 Run及最终稳定边界。

## Extension生命周期映射

| Pi Extension生命周期 | 知微动作 | 当前证据 |
|---|---|---|
| session_start | 建立 Runtime Session映射 | SDK `createAgentSession` Fixture中 Inline Extension未观察到；不能作为唯一建链入口 |
| input | 写入用户 Observation | 已观察，为 Inline Extension首事件 |
| before_agent_start | 请求 Context Capsule（M2） | 已观察 |
| context | 控制每次模型调用认知预算（M2） | 未纳入当前 Capture |
| tool_call | Policy评估（M5） | Normal Tool已观察，携带真实 `toolCallId`和结构化 input |
| tool_result | 写入证据和 Outcome线索 | Normal Tool已观察，与 `tool_call`使用同一 ID |
| agent_end | 一次底层 Agent Run结束 | Normal和 Retry均已观察；Extension不携带 Session层 `willRetry` |
| auto_retry_start/end | Session自动重试状态 | Extension未观察；必须从 Public SDK或等价 Session表面获得 |
| agent_settled | 形成 Session本轮稳定边界 | Normal和 Retry均已观察，发生在最终 `agent_end`之后 |
| session_before_compact | 固化工作状态（M2） | 待 Compaction Fixture |
| session_shutdown | 完成会话/Worker收尾 | 已观察；由宿主通过 ExtensionRunner明确发出 |

### `session_start`真实边界

本次使用：

```text
createAgentSession({
  sessionStartEvent: { type: session_start, reason: startup },
  extensionFactories: [inlineExtension]
})
```

但发布 Artifact的 Inline Extension事件序列从 `input`开始，没有收到 `session_start`。因此：

> 知微必须在 SDK Session创建成功的宿主边界建立 Session映射，不能只依赖 Extension `session_start`。

### `session_shutdown`真实边界

`AgentSession.dispose()`负责释放订阅和资源，不替宿主表达产品级 Shutdown语义。Fixture在 Session idle后由宿主显式发出：

```text
session.extensionRunner.emit({ type: session_shutdown, reason: exit })
```

随后再 `dispose()`。因此 `session_shutdown`、`agent_settled`和进程退出必须分别建模。

## SDK契约要点

固定源码与动态 Fixture已经确认：

- `AgentSession.subscribe()`提供 Agent/Turn/Message/Tool/Retry生命周期；
- 一个 Prompt可能包含多个底层 Agent Run；
- Tool Start/Update/End都携带真实 `toolCallId`；
- Tool Result Message在 Tool Execution End之后进入消息流；
- 一个 Tool Use会结束当前 Turn并触发新 Turn获取最终 Assistant输出；
- Public `agent_end`带 `willRetry`，Extension同名事件不具备该增强；
- `auto_retry_start/end`属于 Session表面，不是 Extension生命周期；
- Session最终 idle后才发出一次 `agent_settled`；
- 被 Retry替代的失败消息可能不在最终 `session.messages`；
- `AgentSessionRuntime`替换 Session后，旧订阅不会自动迁移；
- 并行工具完成事件顺序和 Tool Result消息顺序可能不同；
- Message Update是流式分块，不是持久化领域边界。

发布 Artifact已确认 root exports：

```text
createAgentSession
createAgentSessionRuntime
SessionManager
ModelRuntime
```

动态 Fixture还使用：

```text
DefaultResourceLoader
SettingsManager
defineTool
@earendil-works/pi-ai/providers/faux
```

因此知微不得：

- 自行编造 Tool Call关联键；
- 把第一次 `agent_end`当成 Prompt最终结果；
- 从 Extension `agent_end`推断 `willRetry`；
- 只从最终 `session.messages`重建失败/Retry历史；
- 把 `agent_settled`、Extension Shutdown和 Worker进程退出合并；
- 仅凭事件到达顺序重建 Assistant原始并行工具顺序；
- 把每一个流式 `message_update`直接写成长期 Observation；
- 把 Extension `session_start`当作 SDK嵌入场景唯一建链事件。

## RPC契约要点

RPC使用 stdin/stdout严格 JSONL：

- 只以 LF (`\n`)分隔记录；
- 输入可以是 CRLF，但 JSON字符串内部 `U+2028` / `U+2029`必须保留；
- 不能使用 Node `readline`作为协议 reader；
- Command可选 `id`会回传到对应 Response；
- `bash_execution_update.id`关联原 Bash Command；
- Prompt Response成功只代表被接受/排队，运行失败仍通过事件和消息表达。

动态验证已经证明 `pi --mode rpc --no-session`在零 Provider Credential、零 Prompt下完成：

```text
get_state
get_messages
```

原始 Session ID只检查存在性，不进入持久化 Fixture。

## Adapter规则

1. 只有 `packages/pi-adapter`可以导入 Pi SDK类型。
2. 所有 Pi事件先转成 `NormalizedRuntimeEvent`。
3. 每个规范化事件必须标记来源表面；不得假设 Public SDK、Extension和 RPC载荷等价。
4. 原始 Pi Payload是否保留由 Observation数据策略决定，不能默认完整落盘。
5. Pi Session是执行状态，不是长期记忆真源。
6. Pi版本升级必须通过源码基线、Registry Artifact检查、Adapter Contract Tests和真实会话回放。
7. Source-derived Fixture必须明确标记，不能伪装成 Runtime Capture。
8. Runtime Fixture必须记录环境、来源、隔离方式和未验证边界。
9. 未验证行为必须作为 Open Question保留，不能为匹配预想 Schema补字段。
10. SDK Session映射由宿主 Session创建边界负责；Extension `session_start`只能作为附加信号。
11. `session_shutdown`由宿主明确发出并单独记录；`dispose()`只负责资源释放。
12. 一个 Prompt可包含多个 Agent Run；每次 `agent_end`、Retry状态和最终 `agent_settled`分别记录。
13. 被 Retry替代且未进入最终 Session消息列表的失败证据仍必须持久化。

## M0后续技术验证

下一步继续验证：

- Follow-up队列与最终 `agent_settled`；
- 用户取消、`abortRetry()`和 retry exhaustion边界；
- 并行 Tool Call / Tool Result完整序列；
- Compaction前后可回放信息；
- Session Replacement后的重新订阅；
- RPC真实 Prompt、Worker退出、重启和错误边界；
- SDK与 RPC对同一场景的事件差异。

完成这些 Runtime Fixtures前，不冻结正式 Observation协议，也不开始 SQLite Ledger实现。
