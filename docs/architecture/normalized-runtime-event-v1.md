# NormalizedRuntimeEvent v1

`NormalizedRuntimeEvent v1` 是 M0 Runtime 事实进入 Observation 链路前的稳定协议边界。Pi Adapter 负责把已经验证的 SDK、Extension、RPC 与 Host 输入映射到该协议；协议不认识 Pi 类型，后续 SQLite Ledger 也只消费该协议。

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

`eventId` 标识一个 **source slot**，其输入是：

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

`source.eventType`、时间、Correlation、Payload 与 Links 都是该位置上观测到的语义正文，不进入 source slot。这样同一来源序号若从 `agent_start` 漂移成其他事件，不会获得一个新 ID 逃逸；它会形成：

```text
same eventId
different idempotencyKey
relation = source-slot-conflict
```

`idempotencyKey` 对完整 canonical semantic body 做 SHA-256。完全相同的 Event 是 `exact-replay`；不同 source slot 是 `distinct`。

`observedAt` 属于正文。重放必须复用首次边界注入值，不能重新读取墙钟。

## 顺序与 cross-domain 边界

顺序只在以下流键内单调：

```text
workspaceId
+ runtimeSessionId
+ runtimeInstanceId
+ source.adapter/runtime/surface
+ sequence.domain
```

不同域都可以从 `1` 开始。数组位置只用于验证显式 Links 指向已经摄入的事实，不表示 cross-domain Runtime 全序。时间戳、Fixture 行号和未来 SQLite row ID 也不能建立跨域因果。

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

### Host Action、Extension Shutdown 与 Process Boundary

以下事实不可合并：

```text
Host close-stdin / request-signal    Host Action, host-synthesized
Extension session_shutdown          Session identity, observed
ChildProcess spawn / exit / close   Process Boundary, observed
```

Host 请求 SIGTERM 不等于 ChildProcess 最终的 `code/signal`。Extension Shutdown 也不是 Process exit/close；它保留 Session reason 与 Session Object identity。

## 生命周期关系

Trace validator 只验证显式 Correlation：

- 带 `agentRunId` 的 Agent end/settled 必须有更早的 start；settled 还必须有更早的 end；
- 带 `turnId` 的 Turn end 必须有更早的 Turn start，且 Turn 必须属于已开始的 Agent Run；
- 带 `messageId` 的 update/end 必须有更早的 Message start，并保持 role 不变；
- Tool start/completed 必须通过 `sourceEventIds` 精确链接同 Runtime Session、同 `toolCallId`、同 `toolName` 的 declaration；
- Compaction completed 必须同时有 `sourceEventIds` 与 `replacesEventIds`，并保持在同一 Runtime Session；
- Links 只能指向同 Workspace、已经摄入的事实。

缺失 Correlation 保持缺失；Validator 不用猜测补造关联。`willRetry=true` 只表示当时计划，取消或 `abortRetry()` 仍可使后续 Agent Run 不存在。

## 持久性、稳定性与 compatibility

- Message update 固定为 `ephemeral + update + ignorable`；
- Agent settled 固定为 `durable + settled + required`；
- 其他当前稳定事实使用 `durable + boundary`；
- `runtime.unknown` 可以是 `ignorable` 或 `required`。

通用摄入可以保存 required unknown；但任何宣称“完整重放”的消费者必须调用 replay validator，并对 **required unknown** fail closed。只有明确 ignorable 的未知信息事件可以跳过。

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

`zhiwei-json-v1` 只接受有限、无环、无 alias 的 JSON primitive、dense Array 与 plain/null-prototype Object。Accessor、Symbol、exotic prototype、`Date/Map/Set`、非有限数与 `-0` 均拒绝。协议内纯 SHA-256 有标准测试向量，避免依赖 Node API。

未知 Runtime Event 不保存 Raw payload，只保存：

```text
sourceType
sorted unique top-level keys
SHA-256(canonical UTF-8 payload)
canonicalization = zhiwei-json-v1
```

## Contract Fixture

`packages/protocol/fixtures/normalized-runtime-event-v1.fixture.ts` 是确定性的可执行 Fixture。它引用 Issue #32 合并提交 `374a27505c4a150cbcb63c1b8f6c1afb3bfb4448`，构造 41 个事件并覆盖：

- 四个 Source Surface；
- Process spawn、Prompt acceptance、Agent/Turn/Message、Tool lineage、Queue、State/Messages Snapshot、Compaction lineage；
- Host stdin EOF、Extension Shutdown、Process exit/close；
- Preflight rejection；
- 部分 Assistant `stopReason=aborted`、`willRetry=true`、Retry scheduled/aborted 与 settled；
- Session Replacement、Listener Rebind、SIGTERM Host Action 与 `exit(143) → close(143)`；
- ignorable unknown vocabulary。

Checker 用协议构造器生成 Event ID，并验证事件数、Payload kind、Surface、关系、canonical hash 与禁止字段。Fixture 不提交一份需要人工同步几十个预计算 ID 的巨大 JSON。

## 不在 v1 中

- SQLite schema、row/revision/cursor 与 migration；
- Daemon Worker Supervisor；
- Cognition Observation 或 MemoryClaim；
- Message 正文的长期保留政策；
- 模型请求级 Step；
- 从 Assistant 文本推断成功；
- Pi Raw payload、类实例或 SDK enum；
- cross-domain `globalSequence`。
