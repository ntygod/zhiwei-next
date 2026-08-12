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
| Follow-up队列 | 已验证，同一公共 Run内两个 Turn、队列先非空后清空、最终单次 `agent_settled` |
| Queue公共/Extension表面差异 | 已验证，公共 Session有 `queue_update`，Extension无队列事件 |
| 取消与 Retry终止边界 | 已验证：流式 `session.abort()`、Backoff期间 `abortRetry()`与 Retry exhaustion |
| Cancel / Retry公共与 Extension差异 | 已验证，Extension仍不提供 `auto_retry_start/end`或 `willRetry`增强 |
| 并行 Tool ordering | 已验证，完成顺序 `beta → gamma → alpha`，Tool Result消息顺序 `alpha → beta → gamma` |
| 并行 Tool公共/Extension表面 | 已验证，Public end与 Extension result跟随真实完成，消息与 `turn_end.toolResults`恢复声明顺序 |
| Manual Compaction | 已验证，当前上下文变为 `compactionSummary → assistant`，原始 Entry树保留并追加 Compaction Entry |
| Compaction Public/Extension表面 | 已验证，Public只有 start/end且 `entry_appended=0`；Extension提供 before/compact与确定性 Summary |
| Session Replacement | 已验证，Original → New → Resume，Session File与内存 Session Object分别变化 |
| Replacement Rebind | 已验证，旧 Public Listener不会自动迁移，Extension绑定与 Public Listener必须显式 Rebind |
| 验证状态 | `source-and-runtime-verified-retry-success` → `source-and-runtime-verified-follow-up-queue` → `source-and-runtime-verified-cancel-retry-exhaustion` → `source-and-runtime-verified-parallel-tool-ordering` → `source-and-runtime-verified-compaction-session-replacement` |

完整来源、失败恢复记录和隔离模型见 [`docs/spikes/pi-runtime-contract/`](../spikes/pi-runtime-contract/README.md)。机器结果：

```text
packages/pi-adapter/fixtures/pi-artifact-runtime.json
packages/pi-adapter/fixtures/pi-lifecycle-normal-tool.json
packages/pi-adapter/fixtures/pi-lifecycle-retry-success.json
packages/pi-adapter/fixtures/pi-lifecycle-follow-up-queue.json
packages/pi-adapter/fixtures/pi-lifecycle-cancel-retry-exhaustion.json
packages/pi-adapter/fixtures/pi-lifecycle-parallel-tool-ordering.json
packages/pi-adapter/fixtures/pi-lifecycle-compaction-session-replacement.json
```

当前固定的是 **M0契约基线**，不是生产依赖承诺。仓库仍未将 Pi加入正式依赖，也未冻结 `NormalizedRuntimeEvent`。

## 三个不同的集成表面

Pi至少暴露三类不能混为一谈的表面：

| 表面 | 用途 | 当前确认程度 |
|---|---|---|
| `AgentSession` SDK | Node/TypeScript进程内嵌入、Session控制和公开事件订阅 | 发布 Artifact、空 Session、正常 Tool、Retry、Follow-up、取消、exhaustion、并行 Tool、Compaction与 Session Replacement均已动态验证 |
| Extension lifecycle | Context、工具策略、Compaction、Session切换与 Shutdown Hook | 正常 Tool、Retry、Follow-up、取消、exhaustion、并行 Tool、Compaction与 Session Replacement生命周期已动态验证；没有公共 Retry或 Queue专有增强 |
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
- Normal Tool的 `echo`、Retry、Follow-up、取消/耗尽、并行 `ordered_echo`、Compaction和 Session Replacement场景都没有外部业务副作用；
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
- fresh CI Capture与 committed Fixture完整契约指纹一致。

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

## 已验证的 Follow-up队列生命周期

详细事件表见 [`follow-up-queue-lifecycle.md`](../spikes/pi-runtime-contract/follow-up-queue-lifecycle.md)。

固定场景：

```text
Initial prompt
  → 第一个 Assistant message_start
  → session.followUp(queued message)
  → queue_update(followUp=[queued message])
  → First response complete.
  → 第二个 Turn开始
  → queue_update(followUp=[])
  → queued user message
  → Follow-up response complete.
  → agent_end(willRetry=false)
  → agent_settled
```

关键证据：

- Faux Provider调用两次，外部 Prompt数为零；
- 公共 `agent_start=1`、`turn_start=2`、`turn_end=2`、`agent_end=1`、`agent_settled=1`；
- Follow-up在该固定场景中没有创建第二个公共 Agent Run，而是在同一 Run内追加第二个 Turn；
- 公共 `queue_update`先暴露非空 Follow-up，再在 queued user message进入事件流前暴露空队列；
- 队列清空后仍有完整的用户消息、Assistant响应、`turn_end`、`agent_end`和 `agent_settled`，所以队列为空不等于 Prompt完成；
- `session.messages`最终角色为 `user → assistant → user → assistant`；
- `session.prompt()`返回时 `isIdle=true`、Pending Message为零、Pending Follow-up为空；
- fresh CI Capture与 committed Fixture完整契约指纹一致。

### Public SDK与 Extension差异

公共 Session事件中：

```text
queue_update count = 2
```

Extension事件中：

```text
queue_update count = 0
```

捕获脚本已在 Inline Extension 中显式注册 `queue_update` Listener；注册成功但运行期间没有收到该事件，因此这里的零计数是 Runtime 负证据，而不是未订阅造成的结果。

因此：

> Follow-up队列是 Public Session表面的状态语义。Extension只能观察对应 Turn、Message、Agent和 Settled生命周期，不能无损重建队列何时填充或清空。

### 对 Observation Ledger的直接约束

Ledger需要分别记录：

- Follow-up请求何时由宿主排入；
- 公共 Session队列何时变为非空；
- 队列何时清空并进入后续 Turn；
- Follow-up用户消息和 Assistant结果；
- 最终单次 `agent_settled`。

不能仅凭 `queue_update(followUp=[])`关闭 Prompt，也不能把 Follow-up固定映射成新 Agent Run。

## 已验证的取消、abortRetry与 Retry exhaustion生命周期

详细事件表见 [`cancel-retry-exhaustion-lifecycle.md`](../spikes/pi-runtime-contract/cancel-retry-exhaustion-lifecycle.md)。

该复合 Fixture固定三种不能被统一成一个 `failed`状态的终止路径。

### 流式 `session.abort()`

公共 Session在 Assistant已经产生 `128`字符部分文本的 `message_update`上触发 `session.abort()`。真实边界为：

```text
partial message_update
  → session.abort()
  → message_end(stopReason=aborted, error=Request was aborted)
  → turn_end(stopReason=aborted)
  → agent_end(willRetry=false)
  → agent_settled
```

关键事实：

- 被取消的部分 Assistant仍保留在最终 `session.messages`；
- 最终 Assistant为 `stopReason=aborted`，错误为 `Request was aborted`，文本长度小于完整响应；
- `session.abort()`与原始 `session.prompt()`都 resolve；
- 取消不是 Retry，Provider只调用一次，最终 Session idle且非 retrying。

因此 Observation Ledger不能把用户取消归一化成“没有 Assistant消息”，也不能只记录最终布尔失败。

### Backoff期间 `abortRetry()`

首次 `overloaded_error`产生：

```text
agent_end(willRetry=true)
  → auto_retry_start(attempt=1, delayMs=10000)
  → session.abortRetry()
  → auto_retry_end(success=false, finalError=Retry cancelled)
  → agent_settled
```

Faux Provider只调用一次，预留给第二个 Run的响应保持未消费。由此得到必须写入协议的边界：

> `willRetry=true 不保证后续 Agent Run`。它只表达 `agent_end`发生时 Runtime已有重试计划；宿主可以在 Backoff期间取消该计划。

最终 `session.messages`只有用户消息，但失败 Assistant、`willRetry=true`、Backoff开始与 `Retry cancelled`仍完整存在于事件流。Ledger不得根据最终消息列表丢弃这些事实，也不得补造未发生的 Run。

### Retry exhaustion

固定 `maxRetries=2`时，初始调用加两次重试共调用 Provider三次。公共 `agent_end.willRetry`精确为：

```json
[true, true, false]
```

两次 `auto_retry_start`之后只有一个终止 `auto_retry_end(success=false, finalError=overloaded_error)`，发生在第三次 `agent_end(willRetry=false)`之后、最终 `agent_settled`之前。

前两次失败 Assistant只保留在事件流；最终 `session.messages`保留最后一次失败 Assistant，状态为 `stopReason=error`。**Prompt Promise仍正常 resolve**，所以 Promise完成不能被解释为任务成功；最终错误必须从 Runtime事件与消息读取。

### Public SDK与 Extension差异

这三个路径再次确认：Public Session提供 `willRetry`和 Retry专有事件，**Extension仍不提供 `auto_retry_start/end`**，Extension同名 `agent_end`也不携带 `willRetry`。Extension能够观察每个 Run的 Message、Turn、Agent和 Settled生命周期，但不能独立恢复 Session层重试计划、取消或耗尽语义。

Adapter必须保留事件来源，不能把 Public与 Extension事件无损合并，也不能为 Extension补造不存在的字段或事件。

### 对 Observation Ledger的直接约束

Ledger至少需要分别保存：

- 宿主取消动作及触发它的真实 Runtime事件；
- 部分 Assistant的 `aborted`状态、错误与文本摘要；
- `agent_end.willRetry`作为“当时计划”，而不是后续 Run存在证明；
- `abortRetry()`、被取消的 attempt、Backoff delay和 `Retry cancelled`；
- Retry exhaustion的 attempt、最终失败 Assistant和终止 Retry事件；
- Prompt Promise返回、`agent_settled`、宿主 `session_shutdown`三个独立边界。

## 已验证的并行 Tool 完成与消息顺序

详细事件表见 [`parallel-tool-ordering-lifecycle.md`](../spikes/pi-runtime-contract/parallel-tool-ordering-lifecycle.md)。

固定 Assistant声明顺序：

```text
alpha → beta → gamma
```

显式内存 Barrier让三个 Tool全部进入 `execute()`后，按以下顺序真实完成：

```text
beta → gamma → alpha
```

Public SDK与 Extension的完成表面跟随真实完成顺序：

```text
Tool execute end            beta → gamma → alpha
Public tool_execution_end   beta → gamma → alpha
Extension tool_result       beta → gamma → alpha
```

但 Tool Result消息和持久化表面恢复 Assistant声明顺序：

```text
Public/Extension Tool Result message  alpha → beta → gamma
Public/Extension turn_end.toolResults alpha → beta → gamma
final session.messages               alpha → beta → gamma
```

因此：

> 并行 Tool完成顺序与 Tool Result消息顺序是两个不同事实。不能仅凭 `tool_execution_end`或 Extension `tool_result`重建 Assistant原始声明，也不能从最终消息反推真实完成先后。

三个调用在任何一个完成前都已开始，证明当前固定场景确实进入并行执行。所有关联都使用发布 Artifact提供的真实 `toolCallId`；一个 Agent Run内包含 Tool Use Turn和最终 Assistant Turn，最终仍只有一次 `agent_end`和一次 `agent_settled`。

### 对 Observation Ledger的直接约束

Ledger需要分别记录：

- Assistant Tool Call声明顺序；
- Tool执行开始、更新和真实完成顺序；
- Public SDK与 Extension事件来源；
- Tool Result消息与 `turn_end.toolResults`顺序；
- 每个 `toolCallId`跨表面的关联；
- 全部 Tool完成后进入消息阶段的边界；
- 最终单次 `agent_settled`与独立宿主 shutdown。

完成事件和消息不能覆盖彼此；两组顺序都属于可审计证据。

## 已验证的 Compaction 与 Session Replacement

详细事件与状态表见 [`compaction-session-replacement-lifecycle.md`](../spikes/pi-runtime-contract/compaction-session-replacement-lifecycle.md)。

### Manual Compaction

固定两个 Seed Turn后，Extension在 `session_before_compact`中提供确定性 Summary。Provider调用数保持 `2 → 2`，证明没有额外模型摘要调用。

Public表面：

```text
compaction_start → compaction_end
Public `entry_appended` count = 0
```

Extension表面：

```text
session_before_compact(reason=manual)
  → session_compact(reason=manual, fromExtension=true)
```

压缩后的当前模型上下文为 `compactionSummary → assistant`，但 Session Entry树仍保留原始四条 Message Entry，并追加一个 Compaction Entry。因此 **Compaction Summary是派生上下文**，不能覆盖原始 Observation。

Public `entry_appended`没有出现，意味着 Adapter不能只依赖 Public事件发现 Compaction Entry；必须从 Session Manager / Entry树读取持久化结果，同时记录该负证据。

### Session Replacement

真实身份变化：

```text
Session Object  session-object-1 → session-object-2 → session-object-3
Session File    session-file-1 → session-file-2 → session-file-1
```

这证明 **Session File Identity与内存 Session Object Identity** 是两个不同维度。恢复同一个 Session File时，Runtime仍创建新的内存 Session Object。

Replacement顺序：

```text
session_before_switch
  → old session_shutdown
  → beforeSessionInvalidate
  → rebindSession:start
  → new session_start
  → bind Extensions
  → attach Public listener
  → rebindSession:end
  → withSession
```

旧 Public Listener不会自动迁移。原 Listener只收到 Original Session的 `7`个事件；显式 Rebind Listener分别绑定三个 Session Object并累计收到 `21`个事件。Adapter必须把重新订阅作为必需状态转换，并记录新旧身份和 Replacement Generation。

### 对 Observation Ledger的直接约束

Ledger必须分别保存：

- 压缩前原始 Entry与 Observation；
- 派生 Compaction Summary、Usage、`firstKeptEntry`与 Compaction Entry；
- 压缩后当前模型上下文；
- Public / Extension Compaction事件来源和 `entry_appended=0`负证据；
- Session File、Session Object与 Generation；
- Shutdown、Invalidate、Rebind、`withSession()`和新 Session Start；
- 旧 Listener未迁移与显式 Rebind；
- New Session空上下文、Resume原上下文和后续追加 Turn。

## Extension生命周期映射

| Pi生命周期 / Session事件 | 知微动作 | 当前证据 |
|---|---|---|
| session_start | 建立 Runtime Session映射 | 直接 SDK Fixture中 Inline Extension未观察到；`AgentSessionRuntime` Replacement经 `bindExtensions()`已观察 startup/new/resume；宿主创建与 Rebind仍是主边界 |
| input | 写入用户 Observation | 已观察，为 Inline Extension首事件 |
| before_agent_start | 请求 Context Capsule（M2） | 已观察 |
| context | 控制每次模型调用认知预算（M2） | 未纳入当前 Capture |
| tool_call | Policy评估（M5） | Normal与并行 Tool已观察，携带真实 `toolCallId`和结构化 input；并行时按声明顺序到达 |
| tool_result | 写入证据和 Outcome线索 | Normal与并行 Tool已观察；并行时按真实完成顺序到达，与后续消息顺序不同 |
| queue_update | 记录 Steering / Follow-up队列状态 | Public Session已观察；Extension未观察，必须保留来源差异 |
| agent_end | 一次底层 Agent Run结束 | Normal、Retry、Follow-up、Cancel和 exhaustion均已观察；Extension不携带 Session层 `willRetry` |
| auto_retry_start/end | Session自动重试状态 | Retry恢复、取消和 exhaustion均只在 Public Session观察；Extension未观察 |
| agent_settled | 形成 Session本轮稳定边界 | Normal、Retry、Follow-up、Cancel和 exhaustion均已观察，发生在最终 `agent_end`之后 |
| session_before_compact | 固化工作状态（M2） | Manual Compaction已观察，携带 Branch Entries、firstKeptEntry、reason与 signal |
| session_compact | 记录派生 Summary与 Compaction Entry | 已观察，`reason=manual`且 `fromExtension=true` |
| session_before_switch | 准备 Session Replacement | 已观察 new/resume，发生在旧 Shutdown前 |
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

- `AgentSession.subscribe()`提供 Agent、Turn、Message、Tool、Retry、Queue和最终 Settled生命周期；
- 一个 Prompt可包含多个 Agent Run，例如自动重试；
- 一个 Agent Run也可能包含多个 Turn，已验证 Follow-up场景即为一个 Run、两个 Turn；
- Tool Start/Update/End都携带真实 `toolCallId`；
- Tool Result Message在 Tool Execution End之后进入消息流；
- 一个 Tool Use会结束当前 Turn并触发新 Turn获取最终 Assistant输出；
- Public `agent_end`带 `willRetry`，Extension同名事件不具备该增强；
- `auto_retry_start/end`属于 Session表面，不是 Extension生命周期；
- Public `queue_update`属于 Session表面，Extension不提供等价队列事件；
- Queue清空表示消息离开待处理队列，不表示 Prompt完成；
- 流式取消会保留已经产生的部分 Assistant，并以 `stopReason=aborted`结束；
- `willRetry=true`只表示当时计划重试，不保证后续 Agent Run实际发生；
- `abortRetry()`可在 Backoff期间终止计划并产生 `auto_retry_end(success=false)`；
- Retry exhaustion的 `session.prompt()`仍可能 resolve，最后一次失败 Assistant才保留在最终消息列表；
- Session最终 idle后才发出一次 `agent_settled`；
- 被 Retry替代的失败消息可能不在最终 `session.messages`；
- Follow-up最终消息会保留在 `session.messages`，但排队时序仍只能从事件流获得；
- `AgentSessionRuntime`替换 Session后，旧 Public Listener不会自动迁移，必须在 `setRebindSession()`中重新绑定；
- Session File Identity与内存 Session Object Identity不能合并；恢复原 File仍创建新 Object；
- Manual Compaction的 Public表面只有 `compaction_start/end`，Compaction Entry必须从 Entry树确认；
- Compaction Summary是派生上下文，原始 Message Entry仍保留；
- 并行 Tool完成事件顺序与 Tool Result消息顺序已验证不同：完成按 `beta → gamma → alpha`，消息按 `alpha → beta → gamma`；
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
- 把 `willRetry=true`当成后续 Run一定发生；
- 把 Promise resolve当成任务成功；
- 从 Extension `agent_end`推断 `willRetry`；
- 从 Extension事件补造不存在的 `queue_update`；
- 把 Follow-up固定建模成新 Agent Run；
- 把队列清空当成 Prompt完成；
- 只从最终 `session.messages`重建失败、Retry或队列历史；
- 把 `agent_settled`、Extension Shutdown和 Worker进程退出合并；
- 仅凭 `tool_execution_end`或 Extension `tool_result`到达顺序重建 Assistant原始并行 Tool声明或 Tool Result消息顺序；
- 把每一个流式 `message_update`直接写成长期 Observation；
- 把 Extension `session_start`当作 SDK嵌入场景唯一建链事件；
- 用 Compaction Summary覆盖或删除原始 Observation；
- 仅凭 Public `entry_appended`发现 Compaction Entry；
- 把 Session File恢复误判为同一个内存 Session Object；
- 假设旧 Public Listener会跨 Session Replacement自动迁移。

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
12. Prompt、Agent Run和 Turn必须分别建模；不得假设它们一一对应。
13. 每次 `agent_end`、Retry状态和最终 `agent_settled`分别记录。
14. 被 Retry替代且未进入最终 Session消息列表的失败证据仍必须持久化。
15. Follow-up入队、公共 `queue_update`、后续 Turn与最终 Settled必须分别记录；队列为空不能替代稳定边界。
16. Extension缺少 Session层 Retry或 Queue事件时必须保留负证据，不能补造为等价事件。
17. 用户取消、Retry Backoff取消与 Retry exhaustion必须作为不同终止原因记录。
18. 部分 Assistant被取消后仍是持久化证据；不得因 `stopReason=aborted`丢弃文本摘要。
19. `willRetry=true`记录当时计划，必须允许后续由 `abortRetry()`终止且没有新 Run。
20. Prompt Promise返回只记录调用边界；任务成败由消息、Retry终止事件和最终 Settled共同决定。
21. 并行 Tool必须分别记录声明顺序、真实完成顺序和 Tool Result消息顺序；任一顺序都不能覆盖其他顺序。
22. 所有并行表面必须通过真实 `toolCallId`关联；不能用数组位置或完成先后编造关联键。
23. Compaction Summary必须标记为派生上下文；原始 Observation和 Session Entry不得被覆盖。
24. Compaction Public事件、Extension事件与 Entry树分别记录；`entry_appended`缺失不能解释为没有 Compaction Entry。
25. Session File Identity、内存 Session Object Identity和 Replacement Generation必须分别建模。
26. Session Replacement后必须显式 Rebind Public Listener；旧 Listener未迁移是需要持久化的负证据。

## M0后续技术验证

下一步继续验证：

- RPC真实 Prompt、Worker退出、重启和错误边界；
- SDK与 RPC对同一场景的事件差异。

完成 RPC真实任务与 Worker边界 Fixture前，不冻结正式 Observation协议，也不开始 SQLite Ledger实现。
