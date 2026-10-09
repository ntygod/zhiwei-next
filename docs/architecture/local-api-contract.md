# 本地 API、命令与事件详设

状态：architecture-1 / Local API v1 目标，尚未实现这些业务 endpoint。已有 health/meta/doctor 使用[原诊断合同](local-diagnostics.md)，诊断凭据不能访问这里的数据接口。

## 1. 协议分层

Web/CLI/Electron/MCP 都调用同一命令与查询服务。HTTP/SSE 是首个传输；桌面 preload 只能转发白名单 DTO，不能暴露任意 HTTP、路径、SQL 或进程调用。P5 的 MCP tool 是同一服务的受限映射，不建立第二套记忆行为。

请求按顺序经过：头部/体积限制→通道认证→Origin/CSRF（浏览器）→DTO/parser→主体/资源范围→command幂等与revision→领域规则→事务→安全响应。验证完成前不读取资源正文，不调用模型或工具。

## 2. 公共类型

| 类型 | 约束 |
|---|---|
| OpaqueId | 非空、长度有界、无路径语义；客户端不得据格式推断权限 |
| Revision / Epoch | 非负安全整数；创建 expectedRevision=0，已有聚合从 1 开始 |
| UtcInstant | 明确 UTC 的 ISO 时间，严格解析，不能把非法日期自动修正 |
| EntityRef | kind + id + revision；查询当前版本也返回实际 revision |
| ContentRef | contentId + contentVersion；正文仅通过受保护读取入口解析 |
| ScopeSelector | global 或单 Workspace，以及可选 Task/Session；不能同时选择任意多个 Workspace |
| ExternalCursor | Daemon 生成的不透明、有界 token，仅表示某身份/范围/世代的位置 |

```json
{
  "schemaVersion": 1,
  "commandId": "cmd-example-1",
  "idempotencyKey": "client-operation-example-1",
  "workspaceId": "workspace-example-1",
  "expectedRevision": 3,
  "payload": {}
}
```

workspaceId 对 Workspace 内命令必需；创建 Workspace/首次配对等安装级命令不带此字段，由独立 schema 定义。URL 与 body 同时出现的身份必须相同。commandId 用于关联，idempotencyKey 用于重试；两者都不能授权或选择调用者身份。

客户端提供的 commandId/idempotencyKey 即使格式合法也不视为可公开日志内容；内部操作/diagnostic ID 由服务端生成，原客户端键按受保护请求资料保存与到期，不回显到其他范围或模型。上游/用户自带 ID 不能绕过正文保留规则。

```json
{
  "schemaVersion": 1,
  "commandId": "cmd-example-1",
  "status": "committed",
  "aggregate": {"kind": "task", "id": "task-example-1", "revision": 4},
  "eventCursor": "opaque-scoped-cursor",
  "result": {"taskState": "READY"}
}
```

202 表示命令已持久接受、工作仍在进行；不是“只放入内存”。创建资源可用 201，同步完成的命令用 200。请求未 commit 不返回 committed。一次命令影响多个对象时，aggregate 指命令的主聚合/操作记录，result 返回受影响版本列表及水位，不伪称全部对象一个 revision。

## 3. 完整接口目录

每个写入口都消费公共 command envelope；下表仅列 payload 的业务部分。返回结果均携带读取或提交水位。所有列名均为目标合同，前端不能假定未开放阶段已支持。

### 安装、配置与项目

| HTTP | 输入/资格 | 输出 | 阶段 |
|---|---|---|---|
| POST /v1/pair | 一次性 bootstrapCode + clientNonce + clientKind；严格固定 Origin | 浏览器会话 Cookie/CSRF 或受控客户端会话；不返回模型密钥 | P1 |
| GET /v1/capabilities | 已认证 | protocolVersions、开放功能、Runtime profile 的 supported/limited/unsupported、限制 | P1 |
| POST /v1/workspaces | name、purpose、dataPolicyRevision；安装级用户权限 | Workspace Ref | P1 |
| GET /v1/workspaces | 用户有权管理的 Workspace；不开放给任意 Runtime | 分页列表/可用状态，名称按内容权限 | P1 |
| GET /v1/workspaces/:id | 精确授权范围 | 项目当前概况与 revision | P1 |
| POST /v1/workspaces/:id/commands | rename/update-purpose/pause/resume、expectedRevision | 新 revision；不隐含删除/跨域共享 | P1 |
| GET /v1/settings | 安装/Workspace 的配置读取权限 | 配置 revision、凭据 handle/可用性，不含 secret | P1 |
| POST /v1/settings/commands | set-model-profile/set-data-policy/set-runtime-profile/revoke-credential 等显式 kind | validated/committed revision 或明确失败 | P1/P4 |

配置候选先校验，普通修改影响下一 Session；权限收紧立即生效。set-data-policy 不自动扩张既有内容的许可，需要相应用户授权与新的策略版本。

数据策略操作必须声明 application=future-only 或 existing-and-future。前者只改新数据的默认保留，不能作为放宽现有隐私/权限的手段；后者对已有对象执行控制日志先行的收紧。Grant/模型目的地撤销始终即时限制已有任务，不受 future-only 选项影响。

### 会话、目标与任务

| HTTP | 输入/资格 | 输出 | 阶段 |
|---|---|---|---|
| POST /v1/sessions | workspaceId、runtime/model profile、交互类型 | 固定 Workspace 的 Session/Contract Ref | P1 |
| GET /v1/sessions/:id | 可见 Session | 消息/任务分页、完整性与最后持久水位 | P1 |
| POST /v1/goals | intent、criteria、deadline?、priority、确认来源 | Goal Ref 或需确认的建议 | P1 |
| POST /v1/goals/:id/commands | revise/pause/resume/abandon、内容与 expectedRevision | 新 Goal revision、受影响任务/提醒清单 | P1 |
| POST /v1/tasks | sessionId、request、goalRef?、acceptanceChecks、executionProfile | Task Ref / READY 或明确等待状态 | P1 |
| GET /v1/tasks | workspace、state filter、cursor、limit | Task summaries，不返回所有历史正文 | P1 |
| GET /v1/tasks/:id | 当前 scope | Task/active attempt/Outcome/Artifact refs/last progress | P1 |
| POST /v1/tasks/:id/commands | continue/respond/pause/cancel/retry/confirm-result/revise-request | 新状态；语义变更增加 intentRevision | P1/P4 |
| GET /v1/tasks/:id/explanation | 精确 attempt 或当前；仍需正文权限 | 目标/依据/动作/结果与未知项，不含思维链 | P1 |

用户发普通聊天即创建或关联轻量 Task，不强迫其建立长期 Goal。respond 必须引用当前 pendingQuestionId；approve 必须走精确审批提案，不能把聊天里的“同意”无条件用于其他待批动作。

### 记忆、做法与内容

| HTTP | 输入/资格 | 输出 | 阶段 |
|---|---|---|---|
| POST /v1/memory/search | query、ScopeSelector、kinds、validAt?、knownAt?、limit≤50 | 当前合格命中、版本、依据、选择理由、降级标记 | P1 |
| POST /v1/memory/commands | remember/correct/forget、targetRef、evidenceRefs、内容或删除模式 | 新版本/失效水位/清除 operation | P1 |
| GET /v1/memory/:id/explanation | 精确版本/历史时间、获准 scope | provenance、有效性、纠正链、当前影响 | P1 |
| GET /v1/procedures | scope、state、taskClass | 做法、适用范围、证据/试用摘要 | P2 |
| POST /v1/procedures/:id/commands | trial/accept/reject/suspend/retire、targetVersion、反馈 | 新状态/版本；无工具授权增长 | P2 |
| POST /v1/content/uploads | scope、purpose、privacy、保留策略、大小/类型 | 有时效且仅本次有效的 upload reservation | P1 |
| PUT /v1/content/uploads/:id | 受限二进制流与 reservation | staged ContentRef；不是 available | P1 |
| GET /v1/artifacts/:id | 精确版本及正文资格 | 内容/安全预览或 unavailable | P1 |
| GET /v1/operations/:id | 所属用户/范围 | 导入、清除、备份、恢复等长操作的分项状态 | P1/P4 |
| POST /v1/operations/:id/commands | 按具体操作允许的 retry/resume/cancel、expectedRevision | 新操作状态；已持久遗忘/收紧不回撤，未知副作用不盲重试 | P1/P4 |

remember/correct 的 evidenceRefs 必须可解析到来源片段；引用文本与原文不匹配时拒绝。forget 默认是逻辑停止使用，物理清除参数与副本范围明确列出。清除需要精确用户授权，不能把模糊文本解析成“删除所有资料”。

### 主动、授权与连接器

| HTTP | 输入/资格 | 输出 | 阶段 |
|---|---|---|---|
| GET /v1/attention | scope、状态、分页 | 关联目标、whyNow、准备成果/建议操作 | P3 |
| POST /v1/attention/:id/feedback | handled/snooze/irrelevant/disable + until? | 持久反馈；不隐含行动同意 | P3 |
| POST /v1/commitments | 目标、触发规则、期限/时区、用户确认 | Commitment Ref 与下一计划时刻 | P3 |
| POST /v1/commitments/:id/commands | revise/pause/cancel | 更新调度与对应提醒 | P3 |
| GET /v1/approvals | scope、待批状态 | 精确动作、对象、正文/差异、权限/预算 | P1/P4 |
| POST /v1/approvals/:id/decision | allow-once/allow-bounded/deny、proposalRevision | Grant/拒绝记录；陈旧提案冲突 | P1/P4 |
| POST /v1/grants | 已审阅的动作/资源/外发/期限/预算与用户来源 | Grant Ref | P1有限/P4 |
| POST /v1/grants/:id/revoke | expectedRevision | 新 policyEpoch、停止/核对状态 | P1/P4 |
| POST /v1/delegations | Task Ref、Grant Ref、schedule、budget | 后台委托；不扩大 Task 完成标准 | P4 |
| POST /v1/delegations/:id/commands | pause/resume/cancel/reconcile | 状态与必要用户核对 | P4 |
| GET /v1/connectors | 当前范围管理权限 | 状态、来源范围、游标新鲜度、错误类别 | P3 |
| POST /v1/connectors/commands | configure/pause/resume/revoke、受控 credentialHandle | 配置 revision 与同步作业 | P3/P4 |
| POST /v1/backup | 授权目标、加密/保留 profile | backup operation | P4 |
| POST /v1/restore | 精确 manifest、控制状态关系、用户授权 | 隔离恢复 operation；不立即替换数据库 | P4 |
| POST /v1/execution/stop | 用户 kill switch | 停新派发、取消排队、在途核对摘要 | P4 |

同一个 Grant 必须完整覆盖一次 action 的主体、范围、资源、动作、外发与额度；不能把多个各自不完整的 Grant 拼成更大权限。批量动作在计划里明确拆分，分别判定与记录部分完成。

## 4. 事件通道

`GET /v1/events?workspaceId=...&afterCursor=...` 返回 SSE；未提供 cursor 时先取显式快照。认证与 scope 持续有效，每条内容发送前重验。心跳是 SSE comment，不是业务进度，不调用模型。

```text
id: opaque-scoped-cursor
event: task.state_changed
data: {"schemaVersion":1,"eventId":"event-example-1","workspaceId":"workspace-example-1","aggregate":{"kind":"task","id":"task-example-1","revision":4},"occurredAt":"2026-10-09T10:00:00Z","payload":{"state":"VERIFYING"}}

```

| 事件 | 消费者动作 | 不能推断 |
|---|---|---|
| task.created / task.state_changed | 更新对应 revision | RUNNING 就一定有持续进展 |
| task.progress | 更新结构化阶段/检查点 | 文本长度等于进度百分比 |
| task.output_delta | 只更新临时区，带 attempt/request 身份 | 已保存或已验证 |
| task.output_invalidated | 清除该请求临时内容/陈旧结果视图 | 删除已发送到远端的内容 |
| outcome.committed / artifact.available | 展示验证/内容资格后的结果 | 所有 goal 已完成 |
| memory.changed / memory.invalidated | 丢弃旧缓存、重读受影响条目 | 自动采用旧渲染文本 |
| learning.proposed / procedure.changed | 展示审阅/做法状态 | ACTIVE 赋予任何权限 |
| attention.changed | 更新今天页、按用户通知设置展示 | 用户同意执行 |
| approval.required / grant.revoked | 审批或停止后续动作 | 撤销前在途动作绝无效果 |
| operation.progress / operation.completed | 展示分项状态 | partial 等于全部清除/恢复完成 |
| runtime.unavailable / service.degraded | 显示可行恢复动作 | 静默切换 Provider |

这些是 ProductEvent，不重命名/替代原 Runtime v1 event。原始来源事件由 Adapter/Store 留存其合同，客户端消费脱敏、范围过滤后的产品事件。

## 5. 外部 cursor 与一致快照

内部 commitCursor 是数据库提交位置；ExternalCursor 包含 installationId、recoveryEpoch、principalId、scopeSelectionHash、projectionGeneration、commitCursor、expiry，由 Daemon 使用专用密钥认证加密后编码。选择 AES-256-GCM；每个 principal+scope 的密钥仅在 Daemon 内存中，使用 96-bit 随机 nonce 并在该密钥生命周期内检查不重复，格式头作为附加认证数据。每密钥最多 100000 个 token 后轮换，旧 token 明确过期；重启不恢复密钥。密钥不进入 Runtime、备份或日志。此选择用于防篡改和隐藏跨 Workspace 活动位置，不代替当前授权校验。

cursor 过期、换用户/Scope、恢复世代变化、projection generation 改变时，返回 unavailable + reason=cursor_expired，客户端重新 snapshot。恢复旧 cursor 不重新授权；同一用户从 A 换 B 也不能复用 A 的 token。密钥轮换使旧 cursor 失效，允许安全重取快照。

snapshot 在一致 DB 视图读取，返回 asOfCursor 与聚合 revision；订阅从该位置之后开始，允许重复 eventId 但不得跨过未处理事件。客户端按 eventId 去重、按聚合 revision 更新，收到更旧 revision 不覆盖新状态。临时 output_delta 不改变持久 revision。

## 6. 错误合同

```json
{
  "schemaVersion": 1,
  "commandId": "cmd-example-1",
  "error": {
    "code": "revision_conflict",
    "reason": "stale_intent",
    "safeMessage": "任务要求已经更新，请使用当前版本重试。",
    "retryable": false,
    "diagnosticId": "diagnostic-example-1"
  }
}
```

| HTTP | code / 典型 reason | 重试方式 |
|---|---|---|
| 400/413/415 | validation / invalid_shape、too_large、unsupported_media | 修正输入，不重复原坏请求 |
| 401 | unauthenticated / expired_session | 重新认证，不能复用诊断 token |
| 403 | forbidden / action_not_granted、privacy_blocked | 缩小范围或获得具体授权 |
| 404 | not_found | 同时用于不可见对象，避免存在性泄漏 |
| 409 | revision_conflict / stale_intent、stale_context；idempotency_conflict | 重读当前状态；不盲目覆盖 |
| 410 | unavailable / cursor_expired、content_purged | 快照重同步；被清正文不自动补回 |
| 422 | unsupported / runtime_capability、protocol_version | 选择已验证能力，不静默 fallback |
| 429 | budget_exceeded / rate_limit、token_limit、required_context_over_budget | 等配额/调整明确限制 |
| 503 | unavailable / dependency_down、recovery_required | 按可行恢复路径重试 |
| 500 | corruption / integrity_failed | 停用相关路径、诊断与恢复，不能自动绕过 |

incomplete、cancelled、needs_reconciliation 是任务/操作结果中的明确领域原因，不能都变成 500。响应不含原生异常、文件绝对路径、Prompt、令牌或未知对象的摘要。

## 7. 幂等与版本

写幂等键绑定主体、command kind 和规范化语义输入。同键同输入返回原 durable receipt；同键不同输入 409。若原结果正文已清除，只能返回允许的状态与 unavailable，不能重新执行或返回被删内容。新的 action 不能因为 HTTP retry 产生新外部幂等键。

请求体默认 1 MiB，附件默认 20 MiB，分页 limit≤50。未知必需字段、enum 或 schema 主版本拒绝；可选扩展必须在 capabilities 中声明。客户端不认识新事件时进入显式版本不兼容/快照模式，不能丢事件后仍称完整同步。

## 8. 界面与降级

Client State 以 server revision 为准。可乐观显示输入已提交中，但失败时回退并说明；审批、遗忘、结果完成不做伪成功乐观提交。SSE 断线显示最后确认时刻；模型不可用时仍可按权限查看项目、纠错与导出。缓存响应 no-store，正文不写持久浏览器存储。

事件流格式与重连机制参考 [WHATWG Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)（2026-10-09 核对）；本设计额外定义 scope/epoch/版本语义，浏览器自动重连本身不证明业务连续性。
