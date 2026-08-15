# ADR 0005：冻结 `NormalizedRuntimeEvent v1`

- 状态：Accepted
- 日期：2026-08-15
- 关联：Issue #49、Issue #32、后续 Issue #56

## 背景

Pi 的 SDK、Extension、RPC 与 Host 暴露不同的事件和生命周期边界。已合并 Runtime Fixtures 证明：Prompt 接受不是 Agent 完成，`agent_end(willRetry=true)` 不是后续 Run 的保证，Queue 清空不是 Prompt 完成，Compaction Summary 不是原始事实，Session Object、Runtime Session、Worker Instance、Extension Shutdown 与 Process Boundary 也不是同一身份。

直接把 Pi 对象写入 Ledger，会把版本、类结构与竞态扩散到 Store、Daemon 和 UI；反过来，过早把所有来源压成一条“会话时间线”，又会制造不存在的 cross-domain 全序和因果关系。

## 决策

采用版本化、Runtime 中立的 `NormalizedRuntimeEvent v1`：

1. 每个 source slot 由 `workspaceId + runtimeSessionId + runtimeInstanceId + adapter/runtime/surface + sequence domain/value` 定位；`source.eventType` 与 Payload 是该 slot 的语义正文，不进入 Event ID。
2. `eventId` 是 source slot 的确定性 SHA-256；`idempotencyKey` 还包含完整 canonical semantic body。同一 slot、不同事件类型或正文形成 `source-slot-conflict`，而不是换 ID 静默并存。
3. 顺序只在声明的 source stream 内单调，不建立 `globalSequence`。
4. 时间、Runtime correlation 与 Session identity 由边界显式注入；协议与 Adapter 不读取墙钟、不生成随机关联。
5. SDK、Extension、RPC、Host 通过 `source.surface` 保留。Command Response、Runtime lifecycle、Snapshot、Host Action、Session identity 与 Process Boundary 使用不同 Payload kind。
6. Prompt Response 使用 `preflight-result`；它只表达接受或拒绝，不表达 Agent、Turn、Message 或任务完成。
7. Host close-stdin / signal request 是 Host Action；Extension shutdown 是 Session identity；ChildProcess spawn/exit/close 是 Host-observed Process Boundary。
8. Message update 是 `ephemeral + update + ignorable`；稳定事实是 durable boundary，Agent settled 是 durable settled。
9. Tool start/completion 必须通过 `sourceEventIds` 引用同 Session、同 Tool Call ID、同 Tool Name 的 declaration。Compaction completed 必须同时记录 `sourceEventIds` 与 `replacesEventIds`，不覆盖来源。
10. 未知事件只保存来源类型、排序字段名与 `zhiwei-json-v1` payload SHA-256。通用摄入可保存 required unknown，但完整重放必须 fail closed；明确 ignorable 的信息事件可跳过。
11. JSON 边界拒绝 accessor、exotic prototype、稀疏数组、alias/cycle、Symbol、非有限数和 `-0`，并生成 detached snapshot。
12. `NormalizedRuntimeEvent`、Cognition `Observation`、SQLite row/revision 是三种对象，通过 ID 引用而不是互相嵌套为真源。

## Contract Fixture 形式

采用确定性的可执行 Scenario Fixture，而不是维护一份包含几十个预计算 ID 的巨大 JSON。Fixture 调用正式构造器生成 41 个事件；Checker 再验证事件数、四个 Surface、所有 Payload kind、关系、canonical hash 与禁止字段。这样 ID 算法或关系合同发生变化时，必须由代码与 Checker共同通过，不能靠手工批量替换哈希掩盖语义漂移。

## 备选方案

### 直接持久化 Pi SDK 类型

拒绝。会让 Pi 版本变化扩散到整个系统，并保存不可控类实例和 Raw payload。

### Event ID 包含 source.eventType

拒绝。同一 source sequence slot 若事件类型漂移，会获得新 ID 并绕过冲突检测。

### 所有事件使用单一 `globalSequence`

拒绝。Host action、Worker output、Extension callback 与 Process observation 没有已证明的跨域全序。

### 只保存最终 Messages

拒绝。会丢失 Prompt Preflight、Retry、Queue、Provider Error、Shutdown 与 Process 边界。

### 引入全面插件框架

拒绝。当前只采纳 Service Definition / Provider / Consumer 的职责分离，不引入 Cordis，也不替换 Pi Runtime。

## 后果

- Issue #56 可以按 source slot 建立唯一约束，区分 exact replay、source-slot conflict 与 distinct fact，而不依赖 Pi 类型或 SQLite row order 推断因果。
- Adapter 必须显式提供 Runtime identity、sequence、time 与已观测 correlation；缺失关联保持缺失。
- 完整重放消费者必须显式拒绝 required unknown vocabulary。
- 新事件含义或必填字段变化需要新协议版本；不能在 v1 中静默复用字段。
- v1 不承诺模型请求级 Step；只有未来 Fixture 证明稳定边界后再新增版本化表达。
