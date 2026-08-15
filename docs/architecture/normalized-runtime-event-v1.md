# NormalizedRuntimeEvent v1

`NormalizedRuntimeEvent v1` 是 M0 Runtime 事实进入 Observation 链路前的稳定协议边界。Pi Adapter 负责把已经验证的 SDK、Extension、RPC 和 Host 输入映射到该协议；协议不认识 Pi 类型，SQLite Ledger 也只消费该协议。

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

### 身份和幂等

`eventId` 只对来源位置做 SHA-256：Workspace、Runtime Session、Runtime Instance、Source Surface、Sequence Domain 和 Sequence Value。同一来源位置被不同正文占用时，`eventId` 相同而 `idempotencyKey` 不同，Ledger 必须报告冲突。

`idempotencyKey` 对完整 canonical semantic body 做 SHA-256。`observedAt` 属于正文；重放必须复用首次边界注入值，不能重新读取墙钟。

### 顺序

顺序只在以下流键内单调：

```text
workspaceId
+ runtimeSessionId
+ runtimeInstanceId
+ source.adapter/runtime/surface
+ sequence.domain
```

不同域都可以从 `1` 开始。数组位置、时间戳、Fixture 行号和未来 SQLite row ID 都不能建立跨域全序。

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
| `session.identity` | start/resume/replace/shutdown/invalidate/rebind |
| `snapshot.state` | Runtime-neutral State Snapshot |
| `snapshot.messages` | Runtime-neutral Messages Snapshot |
| `process.boundary` | Worker spawn、Extension shutdown、exit、close |
| `host.action` | Host 本地 send-command、close-stdin、request-signal；不与 Process Boundary 合并 |
| `runtime.unknown` | 未知事件的 canonical diagnostic |

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

`willRetry=true` 只表达当时的 Retry 计划，取消、`abortRetry()` 或 exhaustion 可能使后续 Run 不存在。

## 关联

Correlation 分为两组：

- `observed`：Runtime/Host 实际提供的 Request、Provider Response 或 Session Object identity；
- `normalized`：边界显式注入的 Prompt、Agent Run、Turn、Message、Tool Call 和 RPC Request identity。

Adapter 不允许为缺失事实生成随机 ID。Tool completed 必须有 `normalized.toolCallId`，并通过 `sourceEventIds` 明确引用 declaration；这样 Parallel Tool 的完成顺序不依赖数组位置。

## JSON 与未知事件

`zhiwei-json-v1` 只接受有限、无环、无 alias 的 JSON primitive、dense Array 和 plain/null-prototype Object。Accessor、Symbol、exotic prototype、`Date/Map/Set`、非有限数与 `-0` 均拒绝。

未知 Runtime Event 不保存 Raw payload，只保存：

```text
sourceType
sorted unique top-level keys
SHA-256(canonical UTF-8 payload)
canonicalization = zhiwei-json-v1
```

## Fixture 覆盖

`packages/protocol/fixtures/normalized-runtime-event-v1.json` 固定来源为 Issue #32 合并提交 `374a27505c4a150cbcb63c1b8f6c1afb3bfb4448`，覆盖四个 Source Surface、Prompt acceptance、Agent、Message、Tool lineage、Retry exhaustion、Compaction lineage、Session Replacement、stdin EOF / signal Host Action、Extension shutdown、Process exit/close 和 unknown vocabulary。

`npm run check:normalized-runtime-event-v1` 同时验证 Fixture、禁止字段、协议包依赖边界和 Adapter 的显式注入约束。

## 不在 v1 中

- SQLite schema、row/revision/cursor 和 migration；
- Daemon Worker Supervisor；
- Cognition Observation 或 MemoryClaim；
- Message 正文的长期保留政策；
- 模型请求级 Step；
- 从 Assistant 文本推断成功；
- Pi Raw payload、类实例或 SDK enum；
- 跨 sequence domain 的 `globalSequence`。
