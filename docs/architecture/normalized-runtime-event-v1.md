# NormalizedRuntimeEvent v1

`NormalizedRuntimeEvent v1` 是 M0 Runtime 事实进入 Observation 链路前的稳定协议边界。Pi Adapter 把已经验证的 SDK、Extension、RPC 与 Host 输入转换为该协议；协议不认识 Pi 类型，后续 SQLite Ledger 也只消费该协议。

## Envelope

每个事件包含：

```text
protocolVersion = 1
eventId / idempotencyKey
workspaceId
runtimeSessionId
runtimeInstanceId
source { adapter, runtime implementation/version, surface, eventType }
sequence { domain, value }
observedAt
provenance
persistence / stability / compatibility
correlation { observed, normalized }
links { sourceEventIds, replacesEventIds }
data (closed Runtime-neutral union)
```

## Source slot、事件 ID 与冲突

`eventId` 标识一个 **source slot**，其输入固定为：

```text
protocolVersion
workspaceId
runtimeSessionId
runtimeInstanceId
source.adapter
source.runtime implementation/version
source.surface
sequence.domain
sequence.value
```

`source.eventType`、时间、Correlation、Payload 与 Links 是该位置上的语义正文，不进入 source slot。这样同一来源序号若从 `agent_start` 漂移成其他事件，不会获得新 ID 逃逸，而是形成：

```text
same eventId
different idempotencyKey
relation = source-slot-conflict
```

`idempotencyKey` 对完整 canonical semantic body 做 SHA-256。完全相同的 Event 是 `exact-replay`；不同 source slot 是 `distinct`。

`observedAt` 属于正文。重放必须复用首次边界注入值，不能重新读取墙钟。

v1 固定了 canonical body、Event ID 与 Idempotency Key 的 golden vectors；Contract Fixture 也固定完整 canonical hash。算法、字段组成或序列化规则变化时，必须显式做版本决策，而不能只同步修改构造器和测试。

## 顺序与 cross-domain 边界

顺序只在以下流键内单调：

```text
workspaceId
+ runtimeSessionId
+ runtimeInstanceId
+ source.adapter/runtime/surface
+ sequence.domain
```

不同域都可以从 `1` 开始。数组位置只作为显式 Links 的拓扑摄入顺序，不表示 cross-domain Runtime 全序。时间戳、Fixture 行号和未来 SQLite row ID 也不能建立跨域因果。

## Payload kinds

| kind | 语义 |
| --- | --- |
| `command.response` | RPC 命令结果；Prompt 只使用 `preflight-result` |
| `agent.lifecycle` | Agent Run 的 started / ended / settled |
| `turn.lifecycle` | Turn started / ended |
| `message.lifecycle` | Message started / updated / ended |
| `tool.lifecycle` | Tool declared / started / completed |
| `queue.changed` | Steering / Follow-up 队列状态 |
| `retry.lifecycle` | Retry scheduled / started / aborted / exhausted |
| `compaction.lifecycle` | Compaction started / completed；完成事件保留 lineage |
| `session.identity` | start/resume/replace/shutdown/invalidate/listener-rebound |
| `snapshot.state` | Runtime-neutral State Snapshot |
| `snapshot.messages` | Runtime-neutral Messages Snapshot |
| `process.boundary` | Host 观察到的 Worker spawn、exit、close |
| `host.action` | Host 本地 send-command、close-stdin、request-signal |
| `runtime.unknown` | 未知事件的 canonical diagnostic |

Payload Union 按 lifecycle phase 分型。Started、updated、ended、completed 等阶段只允许本阶段字段；例如 Turn start 不能携带 `toolResultCount`，Message end 不能携带 update delta，Tool started 不能携带 result。

## Runtime-neutral 字段级投影

Adapter 必须做**字段级投影**，不能只对 Raw Pi JSON 调用通用 snapshot 后原样保存。

### Message

Message lifecycle 只允许角色、content kind、stop/error 元数据、update delta，以及可选的中立文本投影：

```text
body = { text }
```

`body` 不能包含 Pi Message、content block、provider object 或其他任意 JSON 字段。v1 不决定长期正文保留策略：边界是否提供文本、Ledger 后续是否采用更严格保留规则属于独立决策；本协议只冻结允许出现时的中立形状。

### State Snapshot

State Snapshot 只允许：

```text
isStreaming
messageCount
pendingMessageCount
isCompacting?
isIdle?
steeringQueueCount?
followUpQueueCount?
```

Provider、Model class、Session object、callbacks 与 RPC client internals 不得进入协议。

### Messages Snapshot

每个 Snapshot item 只允许：

```text
role
contentKinds?
stopReason?
errorMessage?
text?
```

Adapter 对输入逐字段复制；额外 Pi 字段被丢弃，协议 parser 对落库后的额外字段 fail closed。

Tool input/result 仍允许有限 JSON，因为它们是 Tool contract 数据，而不是 Runtime event envelope；同样必须经过 `zhiwei-json-v1` snapshot、大小和结构边界。

## Host Action、Extension Shutdown 与 Process Boundary

以下事实不可合并：

```text
Host close-stdin / request-signal    Host Action, host-synthesized
Extension session_shutdown          Session identity, observed
ChildProcess spawn / exit / close   Process Boundary, observed
```

Host 请求 SIGTERM 不等于 ChildProcess 最终 `code/signal`。Extension Shutdown 也不是 Process exit/close；它保留 Session reason 与 Session Object identity。

## Session Replacement 与 Session Invalidation

已合并 Runtime Fixture 证明，Session Replacement 不是一个 Extension 原生 `session_replaced` 回调。v1 保留真实边界：

```text
Extension session_shutdown(old)        observed
→ Host Session Invalidation(old)       host-synthesized
→ Extension session_start(new, old)    observed
→ Host session_replaced aggregate      host-synthesized + sourceEventIds
→ Host listener-rebound(old → new)     host-synthesized
```

`session.identity/replaced` 是可选的 Host 聚合事实，必须显式链接已经摄入的 old shutdown 与 new start；它不能伪装成 Extension observation。Invalidation 与 Listener Rebind 必须分别存在，不能被 replacement 可选字段吞掉。

## 单事件校验与 Trace 校验

单事件 parser 负责不依赖历史即可判断的结构不变量：

- Tool lifecycle 必须有 `normalized.toolCallId`；
- Tool started/completed 必须恰好有一个 declaration `sourceEventIds`；
- Compaction completed 必须同时有 `sourceEventIds` 与 `replacesEventIds`；
- Session action 必须具备其 phase 所需 old/new identity；
- 已知 stable vocabulary 必须是 `compatibility=required`；
- Message update 固定为 `ephemeral + update + ignorable`；
- Agent settled 固定为 `durable + settled + required`。

Trace validator 只验证显式 Correlation 与 Links：

- 带 `agentRunId` 的 Agent end/settled 必须有更早 start；settled 还必须有更早 end；
- 带 `turnId` 的 Turn end 必须有更早 Turn start，且 Turn 属于已开始的 Agent Run；
- 带 `messageId` 的 update/end 必须有更早 Message start，并保持 role、Runtime Instance，以及双方都提供的 Agent Run / Turn ID 一致；
- Tool start/completed 必须链接同 Workspace、同 Runtime Session、同 Runtime Instance、同 Tool Call ID、同 Tool Name 的 declaration；双方都提供的 Agent Run / Turn ID 必须一致；
- Compaction lineage 保持在同一 Runtime Session；
- Links 只能指向同 Workspace、已经摄入的事实；
- 重复的 correlated start/end/settled 被拒绝。

缺失 Correlation 保持缺失；Validator 不用猜测补造关联。`willRetry=true` 只表示当时计划，取消或 `abortRetry()` 仍可使后续 Agent Run 不存在。

## Compatibility 与 replay

- 所有已知 durable 事实固定为 `required`；
- Message update 固定为 `ignorable`；
- `runtime.unknown` 可以是 `ignorable` 或 `required`；
- 通用摄入可以保存 required unknown；宣称“完整重放”的消费者必须对 **required unknown** fail closed。

Compatibility 不是任意调用方可修改的跳过开关。把已知 Agent、Message、Process 或 Session 事实标为 ignorable 会被 parser 拒绝。

## 禁止推断

以下事实均不能单独表示任务成功或 Prompt 完成：

- Prompt `success=true`；
- `session.prompt()` Promise 返回；
- Queue 清空；
- `agent_end(willRetry=true|false)`；
- 最终 Messages 存在；
- `agent_settled`；
- Process `exit(0)`；
- Assistant 文本看起来像成功。

## Correlation

Correlation 分为两组：

- `observed`：Runtime/Host 实际提供的 Request、Provider Response 或 Session Object identity；
- `normalized`：边界显式注入的 Prompt、Agent Run、Turn、Message、Tool Call 与 RPC Request identity。

Adapter 不读取墙钟、不调用随机数，也不为缺失事实生成 ID。

## JSON 与未知事件

`zhiwei-json-v1` 只接受有限、无环、无 alias 的 JSON primitive、dense Array 与 plain/null-prototype Object。Accessor、Symbol、exotic prototype、`Date/Map/Set`、非有限数与 `-0` 均拒绝。协议内纯 SHA-256 使用标准测试向量，避免依赖 Node API。

未知 Runtime Event 不保存 Raw payload，只保存：

```text
sourceType
sorted unique top-level keys
SHA-256(canonical UTF-8 payload)
canonicalization = zhiwei-json-v1
```

## Contract Fixture 与证据绑定

`packages/protocol/fixtures/normalized-runtime-event-v1.fixture.ts` 是确定性的可执行 Fixture。它引用 Issue #32 合并提交 `374a27505c4a150cbcb63c1b8f6c1afb3bfb4448`，并机器绑定以下已合并 Runtime 证据 fingerprint：

- Retry success；
- Cancel / Retry exhaustion；
- Parallel Tool ordering；
- Compaction / Session Replacement；
- SDK / RPC parity；
- RPC Worker lifecycle v2。

Fixture 构造 **60 个事件**，覆盖四个 Source Surface、Prompt acceptance/rejection、Agent/Turn/Message、Follow-up queue、并行 Tool 声明与 `beta → gamma → alpha` 完成顺序、`alpha → beta → gamma` Tool Result Message 顺序、Retry aborted/exhausted、Compaction lineage、Session Shutdown/Invalidation/Replacement/Rebind、Host EOF/SIGTERM、Process exit/close 和 ignorable unknown vocabulary。

Fixture canonical hash 固定为：

```text
8147f73a7bb74d4518f46c5f7f4cfccc7bd2760728f81bdd115f31f6e82a5b44
```

Checker 同时验证事件数、完整 hash、evidence fingerprint、Payload kind、Surface、关系、来源归属与禁止字段。不能通过手工整体替换生成值掩盖语义漂移。

## 不在 v1 中

- SQLite schema、row/revision/cursor 与 migration；
- Daemon Worker Supervisor；
- Cognition Observation 或 MemoryClaim；
- 长期 Message 正文保留政策；
- 模型请求级 Step；
- 从 Assistant 文本推断成功；
- Pi Raw payload、类实例或 SDK enum；
- cross-domain `globalSequence`。
