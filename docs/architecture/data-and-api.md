# 数据、事务与接口合同

状态：design-v2 目标。P0 完成接入前证据与基线；P1 实现 v2 内容生命周期、会话与本地 API。以下 DTO 是设计合同，不表示已有 endpoint。

## 真源与 Schema 演进

选择一个产品 SQLite 数据库（WAL，foreign_keys=ON，synchronous=FULL）与同一数据根下的内容目录。Daemon 是唯一正常写者。追加新 migration 与完整 schema manifest；不修改 0001、旧 NormalizedRuntimeEvent v1 或其测试。

现有 v1 inline Ledger 继续承载历史/合成合同；新产品 Observation 使用明确 v2 事件表示，元数据和正文引用分开。v1 到 v2 必须通过显式转换器与兼容 Fixture，不把 v1 body 偷换成引用。迁移保留旧表，只读审计；不能把含未知真实正文的旧库直接启用为新产品。相应 API 读 v1/v2 时明确版本；未知版本拒绝。

| 数据组 | 表/存储设计 | 原子边界 |
|---|---|---|
| 来源与事件 | observation_v2、source_stream、ingest_checkpoint；事件无敏感自由文本 | 事件追加与 committed checkpoint 同事务 |
| 正文 | content_object 元数据 + 随机 ID 文件；状态 staged/available/revoked/purged | 文件先写临时、flush/rename；再提交可见引用；失败留下可回收孤儿，不留下可见空引用 |
| 认知 | claim、claim_version、evidence_edge、hypothesis、episode、dependency_edge | 新版本/旧版失效/epoch/outbox 同事务 |
| 工作 | goal、task、task_attempt、working_state、commitment、artifact | 状态与结果/待发事件同事务 |
| 上下文 | session_contract、request_snapshot、context_member、memory_use | 快照持久化后才派发 |
| 执行 | grant、policy_decision、action_attempt、budget_reservation、job_lease | 授权重验/预算预留/attempt 登记先于副作用 |
| 学习与主动 | procedure_version、trial、learning_job、attention_item、feedback | 作业幂等、反馈与冷却同事务 |
| 恢复 | outbox、consumer_cursor、deletion_journal、config_revision | 状态已提交后才发布，不从通知成功推断事务成功 |

FTS5、向量、UI projection 都是可丢弃投影，有 schemaVersion、sourceWatermark、cognitionEpoch。关系用 SQLite 表，首版不加图数据库。内容随机 ID 不包含原始路径/文本；摘要属于敏感派生数据，按来源策略处理。

## 摄取与事件投影

Adapter 检查来源域与稳定关联，Store 验协议/哈希/顺序。received 不等于 committed，committed 不等于 projected，projected 不等于任务完成。API 的 acknowledgedSequence 仅指已提交前缀；不能以收进内存队列作为持久确认。

Runtime 序列按 source stream 排序；不存在跨来源天然全局时间序。产品 eventCursor 使用数据库单调提交序号。重复事件相同内容幂等，不同内容拒绝；缺号、失去上游记录、坏尾片标 gap/incomplete 并停止依赖该区间的验证。

Outbox 与业务事务一同写入，订阅服务至少一次发布；消费者按 eventId 去重、提交 cursor。背压时保存状态事件与最终内容，临时 Token 可以丢弃并通过最终快照恢复；不能丢弃唯一任务结果。落后超过保留窗口返回 cursor_expired，客户端取有水位的快照再继续，不拼接不一致历史。

## 并发与持久作业

正常启动持有数据根的独占进程锁；SQLite 写事务仍负责一致性，文件锁不是唯一保护。job_lease 含 ownerId、ownerEpoch、expiresAt；以事务 compare-and-set 领取，Worker 事件必须匹配 epoch。过期 owner 恢复后不能提交新结果或动作。

P1 一个 Worker；任务级串行命令队列。取消先提交意图/提升 epoch，再通知 Runtime。租约超时不等于外部动作没发生；副作用在途必须进入核对。应用重启：检查存储→恢复未发布 Outbox→失效旧 lease→核对动作→恢复安全可重试工作。

## 内容保留与恢复

第一次接入真实材料前，用户明确接受显示的 profile。首版建议值：普通会话/工具正文 30 天、未固定产物 90 天、最小运行元数据 180 天；接受的长期记忆及必要证据片段保留到用户遗忘/有效期结束。用户可选更短或完全不长期保留，不能默认把短期来源延长到永久。

长期证据片段是明确选定、带来源/许可的独立 content object，不是摘要兜底。源许可不允许保留片段时，引用过期使 Claim 不可用或等待新证据。事实有效期与文件保留期分别检查。

逻辑遗忘事务先写 deletion_journal、提高 epoch、禁用对象/依赖再回应；物理清除是独立有状态作业，遍历内容、FTS、缓存、产物副本、数据库/WAL、受管备份。只报告逐项已清除/待到期/失败/范围外；应用级文件删除不保证 SSD 取证不可恢复。

备份默认关闭；P4 可选择每日 7 份、每周 4 份、每月 3 份，界面明确最大恢复跨度。保留当前可信 deletion journal 于独立于被恢复备份的恢复状态区，保留至相关备份均失效。恢复先隔离、校验版本/完整性，再以最新 journal 施加失效，最后重建投影并切换。拿不到足够新状态时保持不可用，不用备份自身状态证明“没有遗忘”。不能抵御恶意管理员同时回滚全部可信状态，产品明确此边界。

## Local API v1

传输采用 loopback HTTP JSON 命令 + SSE 事件。浏览器会话认证与 CLI Bearer 各有权限域；现有 diagnostic token 仅用于原诊断路由。详细认证见[安全合同](trust-and-safety.md)。

命令统一 envelope：

```json
{
  "schemaVersion": 1,
  "commandId": "opaque-id",
  "idempotencyKey": "opaque-id",
  "workspaceId": "workspace-id",
  "expectedRevision": 3,
  "payload": {}
}
```

创建类 expectedRevision 为 0；无聚合写入的查询不需要该字段。回应包含 commandId、committedRevision、eventCursor、result；拒绝返回固定 code、safeMessage、retryable、diagnosticId，不回显密钥/原文。事务成功后响应丢失，以同键重试得到原结果。

| 操作 | 请求重点 | 结果/事件 |
|---|---|---|
| POST /v1/workspaces | name、purpose、dataPolicyRevision | Workspace、workspace.created |
| POST /v1/tasks | request、goalRef、acceptanceChecks、executionProfile | Task、task.created |
| POST /v1/tasks/:id/commands | continue/pause/cancel/respond、目标 revision | Task revision、task.state_changed |
| GET /v1/tasks/:id | scope 已认证 | 状态、产物引用、进度水位 |
| POST /v1/memory/search | query、scope、validAt、knownAt、limit | 合格结果与来源/版本，最多 50 |
| POST /v1/memory/commands | remember/correct/forget、targetVersion、evidenceRefs | 新版本/失效水位，memory.changed |
| GET /v1/memory/:id/explanation | 精确版本/获准范围 | 来源、有效性、影响；不泄漏不可见对象存在性 |
| POST /v1/grants | 主体、动作、资源、外发、时间/次数/预算 | Grant、grant.changed |
| POST /v1/grants/:id/revoke | expectedRevision | 新 epoch，grant.revoked |
| POST /v1/attention/:id/feedback | handled/snooze/irrelevant/disable、until | 持久反馈与新版本 |
| GET /v1/artifacts/:id | 授权与内容版本 | 有界内容或 unavailable |
| GET /v1/events | scope、afterCursor | 事件流、心跳，无模型调用 |
| POST /v1/backup、/restore | 具体路径/授权/manifest | 作业状态；P4 才启用 |

请求大小默认 1 MiB；附件走独立获准内容入口，单文件默认 20 MiB，超限显式拒绝。SSE 心跳为传输存活信号，不写成业务进展、不消耗模型 Token。每个事件含 schemaVersion/eventId/cursor/workspaceId/type/aggregateId/revision/occurredAt/payload，发送前按 scope 过滤。

## 错误与协议版本

固定错误族：validation、unauthenticated、forbidden、not_found、revision_conflict、idempotency_conflict、unsupported、budget_exceeded、unavailable、corruption、incomplete、cancelled、needs_reconciliation。越权对象查询返回不揭示存在性的 not_found；审计内部仍记录权限拒绝。

新增可选字段是兼容扩展，未知 enum/必需语义拒绝；破坏性变更使用新主版本及明确升级路径。新客户端不得假定旧 Daemon 支持写操作：先能力协商。Runtime v1 和 Local API v1 属不同协议，版本不混用。

## 性能与保证

目标负载为单用户、100000 Observations、10000 Claims、10 个 Workspace。P0 在声明硬件/磁盘/系统/数据种子上测现有强校验成本，P1 目标为本地搜索 p95 ≤250ms、上下文编译 p95 ≤500ms、非模型命令 p95 ≤300ms。模型与网络耗时独立报告，不计入本地耗时；指标是待验收预算，不是实测。

保留既有完整性验证；不能为了达标跳过检查。若失败先定位、优化确定性实现，再通过新 ADR 评估完整性等价方案。WAL+FULL 与进程 kill 恢复只证明所测边界，不承诺任意断电/硬件故障零丢失。