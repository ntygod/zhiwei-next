# 领域对象、真源与生命周期

状态：SA1 设计。所有持久对象使用不可复用 ID、UTC 时间、schemaVersion；更新带 expectedRevision。时间、ID、I/O 和模型均由边界提供。

## 1. 核心对象

| 对象 | 含义与关键字段 | 真源 |
|---|---|---|
| Owner | 实例所有者、认证主体、策略版本 | 控制库 |
| SourceAccount | 外部连接、账户身份、读写许可、游标 | 控制库；秘密在凭据服务 |
| PrincipalBinding | 某来源账号与 Owner/受托身份的明确绑定 | 控制库；不能从同名或 Prompt 推断 |
| Workspace | 工作范围、默认数据策略、配置版本 | 控制库 |
| Trigger | 不可变事件元数据、来源键、sourceVersion、正文引用、trust、observedAt | 控制库 + 可清除内容对象 |
| Thread | 来源侧事件串，例如一封往来邮件或一个 PR | 控制库 |
| Conversation | 用户感知的持续对话，关联多个 Thread/Task | 控制库；不等于 Runtime Session |
| Correlation | 相关对象的关系与依据；不授予路由/读权限 | 控制库 |
| Subscription | Thread → Task 的受控订阅，范围、用途、有效期 | 控制库 |
| Goal / Commitment | 用户确认的目标/持续责任，完成标准、期限、触发条件 | 控制库；认知内容引用 Markdown |
| Task | 一项可验收工作，goalRef?、intentRevision、criteria、budget、scope | 控制库 |
| Assignment | Task 某次执行与 Worker/设备/Runtime 的绑定 | 控制库 |
| InputReceipt | 新消息的接收、归属、投递和生效状态 | 控制库 |
| Job / ActionAttempt | 异步工具工作及其外部效果，幂等键、派发证据、回执 | 控制库；设备保留最小未确认回执 |
| EffectFence | 不随普通备份回退的动作意图/确认记录，logicalOperationId、actionId、task/intent、resourceKey | 独立恢复控制域；控制库为工作投影 |
| Outcome / Artifact | 逐项验收结果与精确产物版本 | 控制库 + 内容对象 |
| MemoryDocument | 一份有来源的事实、偏好、经历、假设或做法 | 不可变 Markdown 对象 + 有效版本目录 |
| MemoryUse | 暴露、采用、结果和收益的分别记录 | 控制库 |
| Opportunity | 主动帮助候选、证据、whyNow、重新评估条件 | 控制库，必要正文放内容对象 |
| LearningRun | 归纳/调查/试用的输入、预算、输出及质量记录 | 控制库 |
| Grant | 主体、资源、动作、目的地、期限、预算与撤销版本 | 控制库 |
| Delivery | 对指定受众的待投递内容、权限、回执 | 控制库 + 内容对象 |

## 2. 五个正交维度

- `scope`：owner-private / workspace / task；scope 扩大必须显式确认。
- `audience`：具体主对话、邮件收件集合或群/话题。可在私有主对话中看见，不等于可发给外部群。
- `placement`：cloud 或指定 device；设备本地资料只在获准后离开设备。
- `modelUse`：forbidden 或 approved-destinations；本地模型也是一个需要声明的数据接收目的地。
- `epistemic`：user-asserted、source-reported、verified、inferred。可信来源不等于所有内容真实；inferred 只能作假设。

摘要、向量、关联与产物继承来源的最严格限制。混合多个来源不会自动消除原范围限制。Global 不是免过滤区。

## 3. 身份与关联

`ownerId`、`workspaceId`、`conversationId`、`threadId`、`taskId`、`assignmentId`、`runtimeSessionId`、`inputId`、`actionId`、`deliveryId` 分别建模。上游未提供的 ID 不能伪装为原生 ID；适配器生成的关联明确标为 host-owned。

一个 Task 同时最多一个 active Assignment；不同 Task 可并行。一个 Thread 可以订阅多个 Task，但写控制命令必须解析到明确目标；订阅 fan-out 只传播有资格的上下文，不传播发件人的控制权限。

自然语言关联是模型提议，提交需要检查目标存在、主体可控制、范围与当前版本匹配。多个候选会产生不同业务效果时发出一次具体澄清，不猜测批量执行。

## 4. 状态机

```text
Task:
  queued -> running -> verifying -> completed | partial | failed | unverifiable
  queued/running -> waiting-input | waiting-event | waiting-job | waiting-device | waiting-approval
  waiting-* -> queued（条件满足且仍有授权）
  running -> pausing -> paused
  非终态 -> cancelling -> cancelled | needs-reconciliation
  needs-reconciliation -> verifying | cancelled | waiting-input

Assignment:
  allocated -> starting -> active -> draining -> closed
  starting/active/draining -> lost -> reconciled | blocked

InputReceipt:
  accepted -> associated -> delivered -> applied | superseded | rejected | unknown

ActionAttempt:
  prepared -> authorized -> dispatched -> confirmed | failed | unknown
  unknown -> reconciled | needs-user

ResourceClaim:
  leased -> quarantined（在途/unknown）-> released（最终性证据）

MemoryDocument:
  candidate -> active -> superseded | disputed | expired | forgotten
  inferred 文档保持 hypothesis 类型，不能仅凭置信度成为 verified

Opportunity:
  pending-evidence -> actionable -> preparing | waiting-window | awaiting-decision
  preparing -> ready-to-deliver
  非终态 -> resolved | dismissed | expired

Procedure:
  candidate -> trial -> active -> suspended | retired
```

`pausing/cancelling` 是请求，`paused/cancelled` 是已观察到的边界。Runtime idle/settled 只更新 Runtime 活动事实，不直接改变 Task 为 verifying。仍有必要 Job、子任务、未应用控制输入或待核对效果时，Task 保持 running/background 或进入对应 waiting-*；Worker 的暂时休止不结束其任务所有权。

进入 verifying 必须有绑定当前 intentRevision 的完成提案，并满足待办屏障：必要 Job/子任务已终结，已接纳输入均已应用、被新输入取代或明确拒绝，未知效果已核对，且没有未解决的用户决定。Verifier 判断证据质量；“还在执行”和“执行完但缺证据”必须区分。验证过程中需要异步检查时回到 waiting-job/event，取得检查结果后再 verifying，不提前生成 unverifiable 终态。独立后继工作必须正式转交给另一个有授权的 Task，不能通过遗忘子任务来满足屏障。

修改目标/验收/读取范围使 `intentRevision` 增加；单纯进度更新只增加对象 revision。已完成任务的新要求创建新 attempt 或后继 Task，保留旧 Outcome；不得抹去失败历史。用户修改验收标准必须有明确来源，模型不能为自己放宽标准。

## 5. 运行水位

每次执行绑定：`assignmentEpoch`、`intentRevision`、`policyEpoch`、`memoryEpoch`、`recoveryEpoch`、精确依赖版本、有效期。按实际目的只比较相关 workspace/owner 水位，避免无关记忆更新使所有任务失效。

在模型发送、工具派发、结果提交、外部投递四个边界重验。纠正后的迟到结果即使没有下一次工具调用，也不能作为当前成果发布。数据遗忘后的迟到正文不得重新物化。

## 6. 不变量

- D01：没有独立来源或明确用户陈述，不能形成可用事实。
- D02：读资格检查先于搜索排序、解密和向模型注入。
- D03：控制权限来自认证与 Grant，不来自 Thread 订阅、记忆、模型或附件。
- D04：旧 Assignment/旧版本不得提交当前状态。
- D05：未知效果先核对；一个幂等键不能对应不同内容。
- D06：纠正是新版本；遗忘停止使用并清理受管副本。
- D07：Worker 不能自证 Task 成功；验证结果有精确标准和证据。
- D08：运行数据与模型会话分离；丢失 Session 不等于丢失目标或恢复授权。
- D09：缓存、向量、摘要不是授权或证据真源。
- D10：本项目不持久化原始思维链；解释只来自可观察事实和标明性质的摘要。
- D11：普通备份恢复不能擦除已发生或可能发生的效果事实；重新授权不解除恢复核对屏障。
- D12：写资源隔离的释放依据是效果最终性，不是租约到期、Runtime 退出或 Task 显示终态。
