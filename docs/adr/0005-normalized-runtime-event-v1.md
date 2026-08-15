# ADR 0005：冻结 `NormalizedRuntimeEvent v1`

- 状态：Accepted
- 日期：2026-08-15
- 关联：Issue #49、Issue #32、后续 Issue #56

## 背景

Pi 的 SDK、Extension、RPC 与 Host 暴露不同的事件和生命周期边界。已合并的 Runtime Fixtures 证明：Prompt 接受不是 Agent 完成，`agent_end(willRetry=true)` 不是后续 Run 的保证，Queue 清空不是 Prompt 完成，Compaction Summary 不是原始事实，Session Object、Runtime Session、Worker Instance 和 Process Boundary 也不是同一身份。

直接把 Pi 对象写入 Ledger，会把版本、类结构和竞态扩散到 Store、Daemon 和 UI；反过来，过早把所有来源压成一条“会话时间线”，又会制造不存在的全序和因果关系。

## 决策

采用版本化、Runtime 中立的 `NormalizedRuntimeEvent v1`：

1. 每个事件由 `workspaceId + runtimeSessionId + runtimeInstanceId + source + sequence domain/value` 定位；不同 sequence domain 之间没有全序。
2. `eventId` 是来源定位的确定性 SHA-256；`idempotencyKey` 还包含 canonical semantic body。同一位置、不同正文形成可诊断冲突，而不是静默去重。
3. 时间、Runtime correlation 和 Session identity 由边界显式注入；协议与 Adapter 不读取墙钟、不生成随机关联。
4. SDK、Extension、RPC、Host 通过 `source.surface` 保留。Command Response、Runtime lifecycle、Snapshot、Host Action 和 Process Boundary 使用不同 Payload kind。
5. Prompt Response 使用 `preflight-result`；它只表达接受或拒绝，不表达 Agent、Turn、Message 或任务完成。
6. Message update 是 `ephemeral + update`；长期持久化策略不由协议强行决定。
7. Compaction 等派生记录通过 `sourceEventIds` 和 `replacesEventIds` 指向原始事实，不覆盖或删除来源。
8. 未知事件只保存来源类型、排序去重字段名和 `zhiwei-json-v1` canonical payload SHA-256，不透传 Raw Runtime 对象。未知 required vocabulary 默认 fail closed；明确 ignorable 的信息事件可由兼容消费者跳过。
9. JSON 边界拒绝 accessor、exotic prototype、稀疏数组、alias/cycle、Symbol、非有限数和 `-0`，并生成 detached snapshot。
10. `NormalizedRuntimeEvent` 与 Cognition `Observation`、SQLite row/revision 是三种对象。后续层通过 ID 引用，不互相嵌套成真源。

## 备选方案

### 直接持久化 Pi SDK 类型

拒绝。会让 Pi 版本变化扩散到整个系统，并保存不可控类实例和 Raw payload。

### 所有事件使用单一 `globalSequence`

拒绝。Host action、Worker output、Extension callback 与 Process observation 没有已证明的跨域全序。

### 只保存最终 Messages

拒绝。会丢失 Prompt Preflight、Retry、Queue、Provider Error、Shutdown 和 Process 边界。

### 引入全面插件框架

拒绝。当前只采纳 Service Definition / Provider / Consumer 的职责分离，不引入 Cordis，也不替换 Pi Runtime。

## 后果

- Issue #56 可以按来源流建立幂等约束，而不依赖 Pi 类型或 SQLite row order 推断因果。
- Adapter 必须显式提供 Runtime identity、sequence、time 和已观测 correlation；缺失关联保持缺失。
- 新事件含义或必填字段变化需要新协议版本；不能在 v1 中静默复用字段。
- v1 不承诺模型请求级 Step；只有未来 Fixture 证明稳定边界后再新增版本化表达。
