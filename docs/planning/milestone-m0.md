# M0 实施计划：能观察

## 目标

将 Pi Agent Runtime 的生命周期转换为知微自己的、不可变、可查询、可回放的 Observation Ledger。

M0 结束时，系统仍然不会“记忆用户”。它只忠实记录证据，为后续认知能力建立可靠地基。

## 明确不做

- MemoryCandidate / MemoryClaim 自动提取；
- FTS5 和向量检索；
- Context 注入；
- 主动提醒；
- Delegation 和长期授权；
- 桌面端；
- 旧知微数据迁移。

## Workstream A：Pi Runtime Spike

1. 固定一个经过验证的 Pi Commit/Package 版本。
2. 验证 SDK、Extension、RPC 三种嵌入方式。
3. 记录完整事件顺序和异常路径。
4. 确定 Session、Turn、Tool Call、Tool Result 的稳定关联键。
5. 建立 Adapter Contract Fixtures。

产物：ADR、事件样本、选择结论和最小可运行 Worker。

## Workstream B：Normalized Protocol

1. 完善 `NormalizedRuntimeEvent` 版本策略。
2. 区分用户输入、模型输出、工具调用、工具结果和会话事件。
3. 定义脱敏和 Raw Payload 保存策略。
4. 增加事件幂等键和因果关联字段。

产物：协议 Schema 与兼容测试。

## Workstream C：Observation Ledger

1. 设计 SQLite Schema。
2. 建立迁移机制和 WAL 配置。
3. 实现 append-only Observation Repository。
4. 实现按 Session 查询和时间顺序回放。
5. 添加重复事件、部分失败和事务测试。

产物：本地数据库和可恢复 Ledger。

## Workstream D：Daemon 与 Worker

1. Daemon 管理 Pi Worker 生命周期。
2. Worker 通过本地协议发送规范化事件。
3. 实现健康状态、优雅退出、崩溃检测和重连。
4. 明确一个 Session 的所有权和并发规则。

产物：真实 Pi 会话到 Ledger 的完整链路。

## Workstream E：CLI 与可观察性

```text
zhiwei doctor
zhiwei sessions list
zhiwei sessions show <id>
zhiwei sessions replay <id>
```

CLI 输出人类可读摘要，并支持 JSON 供测试使用。

## Workstream F：端到端验收

### 场景 1：正常会话

用户输入 → 工具调用 → 工具结果 → 最终回答 → Agent Settled → Session Shutdown，事件顺序和关联完整。

### 场景 2：用户取消

取消不会被记录为成功，也不会凭空产生 Assistant Outcome。

### 场景 3：Worker 崩溃

已提交事件保留；Daemon 标记 Session Interrupted；重启不会重复写入。

### 场景 4：Compaction

压缩前后仍能解释原始事件与当前执行状态的关系。

## 完成定义

- 一条真实 Pi 会话可被录制、重启后查询并确定性回放；
- Ledger 中没有未关联的 Tool Result；
- 重复事件不产生重复 Observation；
- 取消、失败、崩溃和正常完成语义明确；
- `npm run check` 和 M0 场景测试全绿；
- 文档与实际事件序列一致。
