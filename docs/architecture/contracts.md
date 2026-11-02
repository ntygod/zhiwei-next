# 接口、数据与提交合同

状态：SA1 设计。以下为知微自有协议 v1，独立于 Pi 原生类型。规范接口不代表已经有可调用服务。

## 1. 命令与事件信封

```typescript
type CommandEnvelope = {
  schemaVersion: 1;
  commandId: string;
  idempotencyKey: string;
  workspaceId: string;
  expectedRevision?: number;
  kind: string;
  payload: unknown; // 每个 kind 有独立严格 schema，不透传给 Runtime
};
type CommandReceipt = {
  commandId: string;
  status: 'accepted' | 'rejected' | 'conflict';
  aggregateId?: string;
  revision?: number;
  inputId?: string;
  reasonCode?: string;
};
type ProductEvent = {
  schemaVersion: 1;
  eventId: string;
  kind: string;
  aggregateId: string;
  revision: number;
  occurredAt: string;
  correlationId: string;
  contentRef?: string;
};
```

Owner/principal 由认证层注入，不接受 payload 自称。workspaceId 也必须属于当前主体范围。相同幂等键、相同规范化内容返回原 receipt；内容不同返回 conflict。重放也要检查当前读取资格，不能借历史回执泄漏已删除正文。

accepted 表示命令持久接纳；业务结果与 input applied 通过事件/查询取得。不存在“HTTP 200 就是任务成功”的语义。

## 2. 外部 API

| 方法与路径 | 输入或命令 | 输出 |
|---|---|---|
| POST /v1/conversations | workspace、audience | Conversation reference |
| POST /v1/conversations/:id/inputs | 内容引用、可选 taskRef、intentHint、expectedTaskRevision | input receipt；不等待任务结束 |
| GET /v1/inputs/:id | 当前可见 input | accepted/associated/delivered/applied 等状态及依据 |
| GET /v1/conversations/:id | 分页游标 | 可见消息、事项关联与完整性 |
| POST /v1/goals | intent、criteria、deadline、确认来源 | Goal revision |
| POST /v1/goals/:id/commands | revise/pause/resume/abandon | 新版本与受影响事项 |
| POST /v1/tasks | request、goalRef?、criteria、profile | Task receipt |
| POST /v1/tasks/:id/commands | supplement/revise/pause/continue/cancel/retry/respond | 新 receipt 与控制生效版本 |
| GET /v1/tasks/:id | 当前读取资格 | Task、Assignment、Job、Outcome 和等待原因 |
| GET /v1/tasks/:id/activity | scope、分页 cursor | 可观察动作、依据、结果与计划区别 |
| POST /v1/tasks/:id/verify | 精确 Task/Artifact/criteria 版本 | verification job；非模型自证 |
| POST /v1/tasks/:id/feedback | 精确 Outcome、criterion、明确反馈 | 新证据/判定，不改历史 |
| POST /v1/memory/search | scope、用途、validAt、query、limit | 合格 Markdown 版本与证据引用 |
| GET /v1/memory/:id/versions/:version | 目的地与读取资格 | 正文或 unavailable |
| POST /v1/memory/commands | import/propose/confirm/correct/forget | 候选/提交/清除 receipt |
| POST /v1/procedures/:id/commands | trial/accept/suspend/retire | 新状态/版本；不授工具权 |
| GET /v1/opportunities | scope、状态 | 候选/准备成果/whyNow |
| POST /v1/opportunities/:id/commands | handle/snooze/disable/authorize | 反馈或具体授权提案 |
| POST /v1/grants | 完整提案与可信用户来源 | Grant revision |
| POST /v1/grants/:id/revoke | expectedRevision | 撤销 receipt；在途限制 |
| POST /v1/approvals/:id/answer | proposalRevision、allow-once/allow-bounded/deny | 有效或陈旧回复 |
| POST /v1/sources/commands | connect/configure/pause/revoke，credentialHandle | 来源状态和游标 |
| POST /v1/devices/commands | register/confirm/revoke，公钥与挑战 | 设备身份/撤销结果 |
| POST /v1/content/uploads | purpose、scope、类型、大小、保留 | 一次性 upload reservation |
| PUT /v1/content/uploads/:id | 获准字节流 | staged ContentRef；尚不可作为事实 |
| GET /v1/operations/:id | 操作身份 | 备份/导入/清除等分项结果 |
| POST /v1/system/stop | 明确作用域 | 停止新派发、排队和在途核对摘要 |
| GET /v1/events | bound cursor | SSE 事实订阅 |

自然语言入口可提出与这些命令等价的意图，不能绕过同一 schema、身份、版本和权限检查。原始外部事件保留 source trust，不通过“调用 inputs API”伪装为用户直接指令。

## 3. 外部事件订阅

SSE cursor 绑定 owner、workspace、audience、权限版本和 recoveryEpoch；使用 opaque 值，不暴露全局事件计数。断线可从持久 Outbox 回放；过期 cursor 返回需要重新取 snapshot 的明确错误。身份撤销后关闭流并拒绝重放。

事件种类包括 input.accepted/associated/applied、task.state-changed、job.progress/settled、artifact.committed、outcome.committed、memory.invalidated、opportunity.changed、approval.required、delivery.settled、recovery.required。心跳是传输保活，不是任务进展；查询/订阅不调用模型。

消费者慢时合并可替代进度、发 snapshot-required 或关闭连接；唯一终态和权限失效通过持久日志恢复。低层 token delta 是有界临时流，不承诺逐 token 重放。

## 4. 内部能力端口

| 端口 | 责任与必要返回 |
|---|---|
| SourcePort | pull(cursor)/verifyWebhook/normalize/dispose；返回稳定事件身份与删除/版本 |
| RouterPort | classify scoped batch；返回归属/新任务/澄清提案与依据 |
| ContextPort | compile exact qualified refs；返回 Snapshot、预算与选择理由 |
| RuntimeAdapter | create/start/steer/enqueue/interrupt/events/dispose；见 Runtime 文档 |
| ActionPort | prepare/dispatch/reconcile/cancel；返回许可、回执或 unknown |
| ExecutionNodePort | capabilities/start/read/stop/events；要求 action token 与 fencing |
| MemoryPort | search/read/propose/commit/invalidate；不让调用者指定 active 权限 |
| VerificationPort | verify(criteria, artifactVersion, evidence)；逐项结果 |
| DeliveryPort | prepare/send/reconcile；目的地、内容版本、回执 |
| SupervisorPort | inspect/request-recovery/pause；无普通写工具 |

Router 和 Worker 看到的是这些端口的受限工具投影。端口实现不暴露控制库连接、对象桶管理权限或通用凭据读取工具。

## 5. 控制库逻辑表

| 表组 | 关键数据与约束 |
|---|---|
| owner / workspace / configuration_revision | 主体、范围、配置版本；跨 owner FK 禁止 |
| source_account / principal_binding / source_cursor | 来源身份、权限与持久读取位置；显示名不作身份 |
| trigger / thread / correlation / subscription | UQ(source,eventKey,version,kind)；订阅用途与资格；关联不自动路由 |
| conversation / input_receipt / inbox | UQ(owner,idempotencyKey)；输入归属、每 aggregate 顺序与应用记录 |
| goal / commitment / task / task_revision | 当前状态与不可变意图版本；一个 Goal 的多个任务不共享隐式预算 |
| assignment / checkpoint / resource_claim | 每 Task 一个 active Assignment；资源写者唯一；fencing 单调 |
| durable_job / job_event | dueAt、owner、lease、deadline、attempt、结果；调度可重领不重复效果 |
| grant / approval / budget_reservation | 精确作用域与额度；reservation UQ(actionId)，审批版本绑定 |
| action_attempt / receipt | 派发前登记、回执/unknown/核对；同键不同参数拒绝 |
| memory_document / memory_version / memory_dependency | 不可变对象引用、当前提交版本、来源/生命周期/访问元数据；不存记忆正文作为事实副本 |
| artifact / outcome / criterion_result / memory_use | 精确产物与标准；exposure/adoption/benefit 分开 |
| opportunity / opportunity_feedback / learning_run | topicKey、来源版本、再次评估条件、预算与可撤回版本 |
| outbox / delivery | 内容引用、受众、幂等键、发送观察与回执 |
| invalidation_operation / control_head_cache | 当前失效操作与独立恢复 head 的应用位置；cache 不是外部 head 真源 |

所有带正文的字段实际保存 ContentRef 或受保留策略管理的有限数据；受限索引表独立标为 derived。SQL schema/迁移须在实现时版本化，不能把本表当作已经存在的数据库。

## 6. 提交目录

| 事务 | 同一提交必须成立 |
|---|---|
| T01 接收 | Trigger/正文引用 + Inbox + source cursor + receipt |
| T02 意图 | 输入关联 + Task/Goal revision + 旧执行失效 + 待调度 Outbox |
| T03 分配 | 当前版本/Grant 资格 + Assignment lease + ResourceClaim + 队列领取 |
| T04 动作 | ActionAttempt + PolicyDecision + budget reservation；发送/结算另有真实回执事务 |
| T05 结果 | 当前版本资格 + Artifact refs + criterion results + Outcome/Episode + Outbox |
| T06 记忆 | Markdown 对象存在/完整 + CAS 版本 + 来源/依赖 + invalidation + Outbox |
| T07 学习/主动 | 输入版本仍有效 + 候选/反馈 + job completion + 预算/唤醒 |
| T08 投递 | audience/内容/Grant 当前有效 + Delivery + 回执或 unknown |

事务采用短锁与必要 CAS/serializable 重试；读取版本改变时整体重新评价，不能只重试 SQL 写最后一条记录。无外部 I/O 藏在数据库事务内部。

## 7. 不可回退的失效与恢复控制

确认过的纠正、删除和授权撤销不能因恢复旧备份重新生效。独立恢复控制域只保存受控 ID、版本失效集合和操作身份，不保存被删内容。

提交顺序：

1. 数据库事务登记 invalidation_operation，并将受影响范围置为 admission-frozen；所有读/发送/派发检查此状态。
2. 将单调失效记录写入独立控制域，以条件写更新其 head。记录绑定 installationId、前驱摘要和操作 ID；重试按操作 ID 幂等。
3. 数据库事务施加失效、递增相应 epoch、更新 appliedHead、写 Outbox；只有完成后才解除该范围冻结并确认操作完成。

第 2 步失败时保持冻结并显示 pending，不假称遗忘完成。独立 head 已推进但 DB 未完成，重启/恢复必须先重放失效再开放。并行操作按安装控制序列串行提交；旧备份不能创建较低的 head。部署管理员同时恶意替换所有状态不在此保证内。

若新版本正文丢失但旧版本已被确认失效，恢复结果是 unavailable，而不是重新使用旧版本。外部控制域的可靠存储和恢复演练是生产启用条件，不可用普通对象桶中一个可任意覆盖的 JSON 冒充。

## 8. 错误与兼容

公开错误类别：validation、unauthorized、forbidden、not-found、conflict、stale、unsupported、budget-exhausted、waiting-dependency、unavailable、needs-reconciliation。不存在性对无权限主体统一处理；日志不返回秘密或未获准路径。

协议主版本不兼容拒绝连接；新增可选字段允许忽略，新增必需状态/控制含义需要 capability 协商。Runtime/Connector 的未知关键事件隔离并标 incomplete，不能静默丢弃。配置变更不能改变已发生事件的解释。
