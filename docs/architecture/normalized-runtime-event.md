# NormalizedRuntimeEvent v1

状态：**M0 协议候选**

关联：Issue #47。

## 目的

`NormalizedRuntimeEvent` 是知微在 Pi 与 Observation Ledger 之间的防腐协议。它把 SDK、Extension、RPC 和宿主生命周期转换成 Runtime 中立、可验证、可回放的事件，同时保留每个来源表面的真实差异。

它解决的问题不是“把所有事件改成同一个名字”，而是：

> 在不丢失来源、因果关系、稳定边界和负证据的前提下，为持久化层提供一个不依赖 Pi 类型的事件合同。

## 位置与依赖方向

```text
Pi SDK / Extension / RPC / Host
              ↓
packages/pi-adapter
              ↓
NormalizedRuntimeEvent v1
              ↓
packages/protocol
              ↓
Observation Ledger（后续）
```

约束：

- `packages/protocol` 不导入 Pi SDK、Node I/O、数据库、网络或系统时间 API；
- 只有 `packages/pi-adapter` 认识 Pi 风格输入；
- `observedAt`、Workspace、Session、关联 ID 和源序号都由边界显式传入；
- 协议不保存原始 Pi Payload，也不把模型原始思维链写入事件。

## 事件信封

每个事件都包含：

```text
protocolVersion
事件自身 eventId
确定性 idempotencyKey
workspaceId
runtimeSessionId
sourceSurface
sourceSequence
sourceEventType
observedAt
provenance
durability
correlation
data
```

### `sourceSurface`

```text
sdk
extension
rpc
host
```

同名事件来自不同表面时不视为等价。例如：

- SDK `agent_end` 可以携带 `willRetry`；
- Extension `agent_end` 在已验证版本中没有该增强；
- RPC Prompt Response 是协议响应，不是 Agent 稳定边界；
- Host 才能表达 Session Object 创建、失效、重新绑定和 Worker Exit。

### `provenance`

```text
observed
host-synthesized
```

`host-synthesized` 不是“虚构事件”，而是由宿主在真实边界产生、上游没有同名事件的产品事实，例如：

- SDK Session 对象成功创建；
- 旧 Session 对象失效；
- 新 Session 重新绑定；
- Prompt 最终稳定；
- Worker 退出。

宿主事件必须有可审计的触发条件，不能用来补造 Pi 未暴露的数据字段。

### `durability`

```text
transient
boundary
stable
```

含义：

- `transient`：流式增量或进度，默认不直接成为长期 Observation；
- `boundary`：有独立语义的状态转换，应进入 Runtime Ledger；
- `stable`：本层级可以认为已稳定，但不代表更高层资源已经释放。

例子：

```text
message_update                  transient
message_end                     boundary
queue_update(empty)             boundary
agent_end                       boundary
agent_settled                   stable
prompt RPC response             boundary
prompt settled                  stable
session_shutdown                boundary
worker exited                   stable
```

稳定是分层的：`agent_settled`、Prompt Settled、Session Shutdown、RPC EOF 和 Worker Exit 不能折叠成一个“完成”。

## 幂等与顺序

`idempotencyKey` 由下列字段确定性组成：

```text
protocolVersion
workspaceId
runtimeSessionId
sourceSurface
sourceSequence
sourceEventType
```

字符串采用长度前缀编码，避免分隔符碰撞。相同输入必须生成相同 Key；不同源序号必须生成不同 Key。

流校验按以下范围要求 `sourceSequence` 严格递增：

```text
workspaceId + runtimeSessionId + sourceSurface
```

不同来源表面有独立序列。因此 SDK 与 Extension 都可以从 `1` 开始，但同一 SDK 流不能倒退、重复或静默覆盖。

`eventId` 默认由幂等 Key 派生，也允许由边界显式传入。Ledger 以后同时对 `eventId` 与 `idempotencyKey` 建立唯一约束。

## 关联模型

事件可以关联：

```text
promptId
agentRunId
turnId
messageId
toolCallId
rpcRequestId
workerId
previousRuntimeSessionId
targetRuntimeSessionId
```

规则：

- Tool Event 必须携带真实 `toolCallId`，Payload 与 Correlation 必须一致；
- RPC Request/Response 必须携带真实 Request ID，Payload 与 Correlation 必须一致；
- Message Event 必须有 `messageId`；
- Turn Event 必须有 `turnId`；
- Agent Run Event 必须有 `agentRunId`；
- Prompt Event 必须有 `promptId`；
- Worker Event 必须有 `workerId`；
- Session Replacement 同时保留 Previous 和 Target Session Identity。

协议不要求所有关联一次产生。Adapter 可以在上游缺少稳定 ID 时使用宿主预先分配的 ID，但必须在事件进入协议之前完成，不能由存储层根据到达顺序猜测。

## Payload Union

v1 包含十一类 Runtime 中立 Payload：

```text
session
prompt
agent-run
turn
message
tool
queue
retry
compaction
rpc
worker
```

### Session

```text
created
started
before-switch
shutdown
invalidated
rebound
```

`created`、`invalidated` 和 `rebound` 是 Host Boundary。`started`、`before-switch` 和 `shutdown` 可以来自 Extension 或其他真实来源。

### Prompt

```text
submitted
accepted
rejected
settled
```

`accepted` 不能使用 `stable` Durability。RPC Prompt Response 即使成功，也只表明命令被协议接收或处理；只有后续显式 `settled` 才代表 Prompt 稳定。

### Agent Run

```text
started
ended(willRetry=true|false|unknown)
settled
```

`willRetry=true` 表示事件发生时 Runtime 计划重试，不保证后续一定出现新 Run。`abortRetry()` 已证明可以在 Backoff 中终止后续 Run。

Extension 缺少 `willRetry` 时使用：

```text
willRetry = unknown
```

不得根据 SDK 同时发生的事件把值复制到 Extension 来源事件中。

### Turn

```text
started
ended(outcome)
```

Prompt、Agent Run 和 Turn 不是一一对应：

- Retry 可以让一个 Prompt 包含多个 Agent Run；
- Follow-up 可以让一个 Agent Run 包含多个 Turn；
- Tool Use 可以在同一 Run 中形成后续 Turn。

### Message

```text
started
delta
completed
```

`delta` 必须是 `transient`；`completed` 不能是 `transient`。正文由 `contentRef` 引用，协议只携带必要的长度、角色、Stop Reason 和错误码。

部分取消的 Assistant 消息可以：

```text
phase = completed
stopReason = aborted
```

并保留部分内容引用。

### Tool

```text
declared
started
progress
completed
result-message
```

并行 Tool Fixture 已证明：

```text
声明顺序          alpha → beta → gamma
真实完成顺序      beta  → gamma → alpha
结果消息顺序      alpha → beta  → gamma
```

因此协议分别保留 `declarationIndex`、完成事件源序列和 `resultMessageIndex`，不能从其中一个顺序推导另一个。

### Queue

Queue 是状态 Snapshot：

```text
steeringCount
followUpCount
可选 Message Refs
```

空队列不能使用 `stable` Durability，因为 Follow-up Fixture 已证明队列清空后仍有用户消息、Assistant 响应、Turn End、Agent End 和 Settled。

### Retry

```text
scheduled
completed
```

记录 Attempt、Max Attempts、Delay、Success 和 Error Code。Retry 事件与每次 `agent_end` 分别保存。

### Compaction

```text
started
completed
```

记录 Trigger Reason、是否由 Extension 提供结果、是否 Aborted、是否计划 Retry、Summary Ref、源 Entry 数和压缩后 Context Message 数。

`summaryRef` 是派生上下文引用，不是原始 Observation。原始 Session Entry / Runtime Event 必须继续存在。

### RPC

```text
request
response
eof
```

Request/Response 使用同一个 `rpcRequestId`。Response 中 `accepted=true` 不代表 Prompt Settled。

JSONL Framing Error、EOF 与 Worker Exit 是不同事实；`eof` 不能是 `transient`。

### Worker

```text
started
exited
```

Worker Exit 是 Host Synthesized Stable Boundary，记录 Exit Code 和 Signal，但不替代 Session Shutdown 或 Prompt Settled。

## 已冻结 Fixture 对协议的约束

| Fixture | v1 必须表达 |
|---|---|
| 正常 Tool | Tool Call ID、Tool Start/Progress/End、Result Message、Agent End、Settled、Shutdown |
| Retry Success | 多个 Agent Run、每次 `willRetry`、Retry Attempt、最终单次 Settled |
| Follow-up | Queue Snapshot、一个 Run 多个 Turn、空队列不是完成 |
| Cancel / Retry Exhaustion | `aborted` Message、`willRetry=true` 无后续 Run、最终失败 Attempt |
| Parallel Tool | 声明、完成、结果消息三种顺序与真实 Tool Call ID |
| Compaction | 原始 Entry 与派生 Summary 分离、Public / Extension 来源差异 |
| Session Replacement | Old/New Session Identity、Shutdown、Invalidation、Rebind、Listener 迁移 |
| SDK / RPC Parity | Prompt Response 早于 Agent End、Request/Response/Event/Message/EOF/Exit 分离 |

## 禁止推断

Adapter 和 Ledger 不得：

- 把第一次 `agent_end`当成 Prompt 完成；
- 把 `willRetry=true`当成后续 Run 必然存在；
- 从 Extension `agent_end`推断 SDK 的 `willRetry`；
- 把空 Queue 当成 Prompt Settled；
- 把 Follow-up 固定映射为新 Agent Run；
- 只从最终 `session.messages` 重建 Retry 或取消历史；
- 从 Tool 完成顺序推导 Tool Result Message 顺序；
- 把 Compaction Summary 写成原始用户事实；
- 假设旧 Public Listener 会迁移到 Replacement Session；
- 把 RPC Prompt Response 当成 Agent 完成；
- 把 `agent_settled`、Session Shutdown、RPC EOF 和 Worker Exit 合并；
- 直接持久化每个流式 Delta 为长期 Observation；
- 在 `pi-adapter` 之外引入 Pi SDK 类型。

## 与 Observation Ledger 的关系

后续 Ledger Schema 至少需要：

- Event Envelope 的全部身份、来源、顺序和关联字段；
- `data.kind` 与版本化 Payload；
- `durability` 和 `provenance`；
- `eventId` / `idempotencyKey` 唯一约束；
- 每个 Source Stream 的单调序列检查；
- 内容正文与 Runtime Event 分离的引用策略；
- 原始 Observation 与 Compaction / Context Projection 分离；
- Session Replacement 后仍可按 Previous / Target Identity 回放。

SQLite Ledger 实现前，v1 仍是仓库内协议候选。若后续 Fixture 发现语义缺口，应通过新增字段、明确兼容规则或协议 v2 演进，不能静默改变已持久化事件的含义。
