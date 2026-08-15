# ADR 0005：冻结 `NormalizedRuntimeEvent v1`

- 状态：Accepted
- 日期：2026-08-15
- 关联：Issue #49、Issue #32、后续 Issue #56

## 背景

Pi 的 SDK、Extension、RPC 与 Host 暴露不同事件和生命周期边界。已合并 Runtime Fixtures 证明：Prompt 接受不是 Agent 完成，`agent_end(willRetry=true)` 不是后续 Run 的保证，Queue 清空不是 Prompt 完成，Compaction Summary 不是原始事实，Session Object、Runtime Session、Worker Instance、Extension Shutdown 与 Process Boundary 也不是同一身份。

直接把 Pi 对象写入 Ledger，会把版本、类结构与竞态扩散到 Store、Daemon 和 UI；反过来，过早把所有来源压成一条“会话时间线”，又会制造不存在的 cross-domain 全序和因果关系。

## 决策

采用版本化、Runtime 中立的 `NormalizedRuntimeEvent v1`：

1. 每个 source slot 由 `workspaceId + runtimeSessionId + runtimeInstanceId + adapter/runtime/surface + sequence domain/value` 定位；`source.eventType` 与 Payload 是该 slot 的语义正文，不进入 Event ID。
2. `eventId` 是 source slot 的确定性 SHA-256；`idempotencyKey` 包含完整 canonical semantic body。同一 slot、不同事件类型或正文形成 `source-slot-conflict`。
3. v1 固定 canonical body、Event ID、Idempotency Key 与完整 Contract Fixture hash 的 golden vectors；这些值变化需要显式版本决策。
4. 顺序只在声明的 source stream 内单调，不建立 `globalSequence`。
5. 时间、Runtime correlation 与 Session identity 由边界显式注入；协议与 Adapter 不读取墙钟、不生成随机关联。
6. SDK、Extension、RPC、Host 通过 `source.surface` 保留。Command Response、Runtime lifecycle、Snapshot、Host Action、Session identity 与 Process Boundary 使用不同 Payload kind。
7. Prompt Response 使用 `preflight-result`；它只表达接受或拒绝，不表达 Agent、Turn、Message 或任务完成。
8. Host close-stdin / signal request 是 Host Action；Extension shutdown 是 Session identity；ChildProcess spawn/exit/close 是 Host-observed Process Boundary。
9. Session Replacement 按真实边界表达：Extension shutdown、Host invalidation、Extension start、Host replacement aggregate 与 Host listener rebind 分离。Host 聚合 replacement 必须 source-link old/new 事实。
10. Message、State Snapshot 与 Messages Snapshot 使用 closed、字段级 Runtime-neutral projection，不保存任意 Raw Pi JSON；Tool input/result 只保留 Tool contract JSON。
11. Payload 按 lifecycle phase 分型；已知 stable vocabulary 固定为 `required`。Message update 是 `ephemeral + update + ignorable`，Agent settled 是 `durable + settled + required`。
12. Tool start/completion 必须通过 `sourceEventIds` 引用同 Session、同 Runtime Instance、同 Tool Call ID、同 Tool Name 的 declaration；双方已知的 Agent Run / Turn correlation 必须一致。
13. Compaction completed 必须同时记录 `sourceEventIds` 与 `replacesEventIds`，不覆盖来源。
14. 未知事件只保存来源类型、排序字段名与 `zhiwei-json-v1` payload SHA-256。完整重放对 required unknown fail closed。
15. JSON 边界拒绝 accessor、exotic prototype、稀疏数组、alias/cycle、Symbol、非有限数和 `-0`，并生成 detached snapshot。
16. `NormalizedRuntimeEvent`、Cognition `Observation`、SQLite row/revision 是三种对象，通过 ID 引用而不是互相嵌套为真源。

## Contract Fixture 形式

采用确定性的可执行 Scenario Fixture。Fixture 调用正式构造器生成 60 个事件；Checker 验证完整 canonical hash、已合并 Runtime evidence fingerprint、四个 Surface、所有 Payload kind、来源归属、关系与禁止字段。

固定 Fixture hash：

```text
8147f73a7bb74d4518f46c5f7f4cfccc7bd2760728f81bdd115f31f6e82a5b44
```

## 备选方案

### 直接持久化 Pi SDK 类型或任意 JSON Snapshot

拒绝。即使先做 JSON snapshot，任意 State、Message 或 provider object 仍会把 Pi 结构冻结进协议。Adapter 必须逐字段投影。

### Event ID 包含 source.eventType

拒绝。同一 source sequence slot 若事件类型漂移，会获得新 ID 并绕过冲突检测。

### 所有事件使用单一 `globalSequence`

拒绝。Host action、Worker output、Extension callback 与 Process observation 没有已证明的跨域全序。

### 把 Replacement 作为 Extension 原生事件

拒绝。真实 Fixture 只证明 Extension shutdown/start，以及 Host invalidation/rebind。聚合 replacement 若需要，只能作为 source-linked Host-synthesized fact。

### 只保存最终 Messages

拒绝。会丢失 Prompt Preflight、Retry、Queue、Provider Error、Shutdown 与 Process 边界。

### 引入全面插件框架

拒绝。当前只采纳 Service Definition / Provider / Consumer 的职责分离，不引入 Cordis，也不替换 Pi Runtime。

## 后果

- Issue #56 可以按 source slot 建立唯一约束，区分 exact replay、source-slot conflict 与 distinct fact，而不依赖 Pi 类型或 SQLite row order 推断因果。
- Adapter 必须显式提供 Runtime identity、sequence、time 与实际观测 correlation，并逐字段构造中立 projection；缺失关联保持缺失。
- 单事件 DB read validation 可以拒绝缺少 Tool/Compaction/Session 必备结构的损坏记录；Trace replay 再验证跨事件关系。
- 完整重放消费者必须显式拒绝 required unknown vocabulary。
- 新事件含义、必填字段、canonicalization、ID slot 或 compatibility 变化需要新协议版本；不能在 v1 中静默复用字段。
- v1 不承诺模型请求级 Step，也不决定长期 Message 正文保留政策。
