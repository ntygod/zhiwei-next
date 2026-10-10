# 领域模型

状态：design-v2 目标。P1-01 / #110 正在提供正式 `*V2` 领域类型、纯状态转换及合成合同测试；下面的产品服务/持久行为仍是目标。旧 `MemoryScope` / `MemoryKind` 保持 Bootstrap 语义，不作为新合同的隐式别名；持久结构由后续新迁移实现，不改写已发布 Runtime v1。

## P1-01 实现与版本边界

新入口在 `domain` / `cognition-core` / `protocol` 的公开 index 中显式导出，当前没有生产消费者。`ScopeV2` 将 Global、Workspace、Task、Session 分开，后两者始终带 Workspace；privacy/sourceTrust/epistemic 是独立字段。结构包含关系不代表读取、共享或模型许可；最严来源隐私不能因派生变宽。字段、UTC 毫秒时间、安全整数、不可执行的数据形状与证据身份在边界验证，ID 和时间仍由调用者注入。

`EntityRefV2` 用 `kind/id/revision` 表示聚合快照；`VersionRefV2`、`ClaimVersionRefV2` 和 `ContentRefV2` 明确表达不可变内容版本。已有 TaskAttempt 没有自有 revision，`TaskAttemptRefV2` 使用 `taskId/attemptId/intentRevision`，不虚构版本。Claim 的聚合 CAS revision 与内容 version 不混用；生命周期变化保存历史，纠正创建新 version 并指向精确旧版本。纯函数仅比较给定内存快照，实际 Store 仍须在同一事务重验并提交。

Candidate/Claim/Hypothesis/Goal 的纯转换返回脱离输入的新快照及必要原始动作记录；接受需要精确候选绑定与明确用户确认或独立结构化验证。模型来源只产生候选/假设，不能凭自评取得事实或任何授权。`SUPPORTED` 假设仍是 inferred；Goal 完成需要逐项绑定原标准的有界证据。Episode、WorkingState、Procedure 在本任务仅有结构/基础不变量，没有学习晋升或服务执行能力。输入里的来源声明与检查记录须由未来受控边界认证，合法结构本身不是已经执行、已经授权或已经持久提交的证明。

Observation v2 与 Local API v1 使用独立版本和 Fixture；Runtime v1、诊断 API、Ledger v1、固定迁移、原 Bootstrap/P0-03 导出均保留。产品接线、跨会话/真实存储/权限与真实场景验收不在本切片证明范围。

P0-03 当前增加仅供合成内存验证的 `Task` / `TaskAttempt`、`AcceptanceCriterion` / `CriterionResult` / `Outcome` 类型及纯转换/归约；没有生产调用方，也不完成 P1-01。实现边界见[准备边界](../planning/core-preparation-boundary.md)。输入时间为规范 UTC 毫秒字符串，ID 与 revision 由调用方传入。原 MemoryScope、MemoryKind、Runtime v1 与既有哨兵保持。

`createTask` 登记首 attempt；`transitionTask` 返回新 Task 和含触发引用/固定原因码的转换记录，CAS 只比较内存版本，不证明持久并发。`retryTask` 与 `reviseTaskIntent` 仅在旧 attempt 终态后追加新 attempt；普通状态变化不增加意图版本。P0-03 不实现活跃目标修订的真实 fence 失效，须先停止/核对旧尝试。暂停请求保持 RUNNING，合成停止记录到达且无未知动作才显示 PAUSED；无已证明 checkpoint 的 PAUSED 不开放原 attempt continue，可取消后新建 attempt。

`deriveOutcome` 校验精确意图/标准/方法、证据引用、时间和完整结果集，再归约；必需标准 N/A、unknown 和 model-assisted 自述不算 pass。取消优先保留 cancelled；未核对动作禁止归约。已终态尝试的新证据可生成同 Outcome ID 的下一 revision，而不修改原 attempt/Outcome；该纯结果仍须正式 P1 提交边界决定如何发布。证据、停止/派发准备记录仅是调用方提供的结构化输入，不证明真实授权、验证器执行、产物质量或运行体已停止。Z03/Z16 只获得组件证据，不是端到端验收。

字段落库、索引与事务见[持久化详设](persistence-and-recovery.md)，跨进程身份与运行 fence 见[运行详设](runtime-coordination.md)。领域对象的语义以本文为准，物理实现不能把 Runtime role、lease 或缓存身份当作长期事实/授权。

## 身份与正交维度

持久对象使用不可复用 ID、UTC 时间，由边界注入。可变聚合有 revision；命令带 expectedRevision 和 idempotencyKey。引用指向精确版本。同幂等键同内容返回原结果，不同内容拒绝。

| 维度 | 定义 | 约束 |
|---|---|---|
| Scope | global / workspace(workspaceId) / task(workspaceId,taskId) / session(workspaceId,sessionId) | workspace 不漂移，短期范围不自动升级 |
| privacy | model-allowed / local-only | 前者仍需外发授权；后者不发送给任何模型，包括本地模型 |
| sourceTrust | user-direct / verified-tool / external-content / model-derived | 来源可信不保证内容为真；网页指令不变用户指令 |
| epistemic | asserted / verified / inferred | ACTIVE 不代表绝对真；inferred 只能作假设使用 |
| validity | validFrom/validUntil 与 recordedAt 分开 | 记录时间不替代事实生效时间 |

local-only 可由本地确定性规则处理；未来放宽到本地模型须明确新数据策略和确认。Global 也经授权/隐私过滤。摘要、连接、索引、上下文继承来源最严格的隐私与范围，跨 Workspace 资料不能合并成可共享摘要。

## 对象合同

| 对象 | 必需数据 | Owner / 阶段 |
|---|---|---|
| Workspace | 名称、目的、数据策略 revision、默认运行 profile | workspace service / P1 |
| Session | workspace、类型、contract revision、Runtime 关联、状态 | session service / P1 |
| Observation | 来源/事件、scope/privacy、时间、获准正文或不可变引用、完整性 | Ledger / v1 已有，正文策略 P0/P1 |
| Episode | taskAttempt、起止、目标快照、行动/产物/结果引用、未决项、可重建摘要 | cognition-core / P1 |
| MemoryCandidate | 命题/类型、证据版本、提取器版本、接受条件、过期 | cognition-core / P1 手动/P2 自动 |
| MemoryClaim | 内容、kind、epistemic、支持/反驳证据、scope/privacy、有效时间、版本/生命周期 | cognition-core / P1 |
| Hypothesis | 可证伪命题、依据、替代解释、待验证问题、期限/状态 | cognition-core / P1 |
| Goal | 期望、完成标准、优先级、期限、范围、确认来源、状态 | cognition-core / P1 |
| Task | goal 可空、请求、acceptanceChecks、限制、intentRevision、attempt 列表、状态 | task service / P1 |
| WorkingState | Task revision、当前步骤、已知/未知、待输入、下一步、依据 | cognition-core / P1 |
| Commitment | 责任人、承诺动作、到期/触发、来源、提醒策略、状态 | cognition-core / P3 |
| Procedure | 类别、前提、步骤、验证器、失败/禁止边界、证据、试用统计、版本 | cognition-core / P2 |
| ContextCapsule | 请求/任务/配置身份、精确引用、有序正文/引用、选择原因、预算、认知水位 | context-compiler / P1 |
| DecisionRecord | 类型、依据、候选动作摘要、决定/原因码、策略版本 | coordinator / P1 |
| MemoryUse | exposure/adoption/outcome/benefit 的分别记录与关联 | cognition-core / P1/P2 |
| Outcome | taskAttempt、criteriaResults、结果、验证方法/证据/人/时间 | cognition-core / P1 |
| AttentionItem | 目标/承诺、触发依据、whyNow、建议、过期/去重、反馈 | attention service / P3 |
| Delegation | Task、Grant、预算、调度、暂停/取消策略、恢复点 | execution service / P4 |
| PolicyGrant | 主体、范围、资源、动作、外发、次数/成本/时间、撤销 epoch | policy service / P1 有限/P4 后台 |
| ActionAttempt | 动作摘要、授权决定、幂等键、外部回执/核对状态 | execution service / P4 |
| Artifact | 内容/引用、版本/校验、scope/privacy、创建任务、验证 | artifact store / P1 |

EnvironmentSnapshot 与 CapabilityProfile 首先是从 Observation、能力声明和实际错误产生的 read model，保存新鲜度、来源、已验证范围。不是让模型直接改写的世界真相；未证明的能力标 unavailable。

## 认知生命周期

Claim kind 首版为 fact/preference/constraint/decision。Goal/Task/Procedure 是独立聚合，不用 Claim kind 代替它们的生命周期。Episode 整理经历，摘要变化不能覆盖底层证据。

Claim：ACTIVE → SUPERSEDED / DISPUTED / EXPIRED / FORGOTTEN。纠正事务写入新版本、旧版本 superseded、依赖失效与 Outbox。DISPUTED 只能在冲突区并列呈现，不作为确定事实；inferred 通过 Hypothesis 路径进入验证，不进入事实区。

Candidate：PENDING → ACCEPTED / REJECTED / EXPIRED。按来源/命题/提取器版本去重。直接“记住某偏好”可引用原话形成 asserted Claim；模型摘要不能作为唯一依据形成事实，验证必须指向独立检查或明确确认。

Hypothesis：OPEN → SUPPORTED / REFUTED / EXPIRED / WITHDRAWN。SUPPORTED 仍须通过接受规则才能生成 verified Claim。假设可指导读取、实验或澄清，不能赋权或扩大范围。

## 目标、任务与结果

```text
Goal: PROPOSED → ACTIVE ↔ PAUSED → ACHIEVED | ABANDONED
Task: CREATED → READY → RUNNING → VERIFYING → COMPLETED | PARTIAL | FAILED | UNVERIFIABLE
                         ↘ WAITING_INPUT / WAITING_APPROVAL / PAUSED → READY
       非终态 → CANCELLING → CANCELLED 或 NEEDS_RECONCILIATION
```

重试生成新 attempt；同 attempt 恢复须证明 checkpoint 有效且无重复副作用。Runtime settled 只允许进入 VERIFYING。Goal 完成依赖目标标准，不是子任务退出数。用户改目标生成新 revision，受影响任务重检/取消；模型不得自行放宽标准。

Task 的 intentRevision 在请求、目标、验收或授权范围发生语义变化时递增；普通运行状态的 revision/CAS 与它分开。每次派发绑定 taskAttempt、intentRevision、cognitionEpoch、policyEpoch、recoveryEpoch 和精确依赖版本，避免把普通进度更新误判为目标变化。

NEEDS_RECONCILIATION 经可信回执或明确用户核对后进入 VERIFYING，再按已发生结果转为 CANCELLED/PARTIAL/FAILED 等终态；继续工作须新 attempt 与有效授权。PAUSED 只能在停止新派发且运行体已确认到达可暂停边界后显示，不能把仍不可取消的在途外部动作伪装为已暂停。

PolicyGrant 状态为 ACTIVE/REVOKED/EXPIRED/INACTIVE；恢复旧备份统一产生新的 recoveryEpoch，历史 Grant 仅作审计且不得转回 ACTIVE，用户重新授权创建新 Grant。它与正常 Worker 重启（保留未撤销的当前授权并重验）不是同一种恢复。

Outcome 为 completed/partial/failed/cancelled/unverifiable；每个 criterion 分别 pass/fail/unknown/not-applicable 并解释。人类确认与工具成功均是有界证据，不能扩写为未检查项通过。新证据产生新 Outcome revision。

## 依赖失效

持久有向依赖为 source version → claim/summary/procedure/context/plan/attention。纠正/遗忘同步提高 cognitionEpoch，撤销提高 policyEpoch，并设置不可用标记。读取和发送检查 epoch/精确版本；Outbox 异步清索引和重算，不能等待全图重算才阻止旧内容。

历史 Capsule 不原位编辑；尚未发送的作废重编，已发送的不能撤回远端所见，下一模型/工具边界须停止受影响任务或重开。结果接收、正文物化、Artifact/Outcome/Episode 提交及 UI 发布同样重验派发绑定，不能假定一定还有下一次工具调用。因纠正迟到的结果只能按保留许可作为失效历史，不可成为当前 completed 结果；因遗忘迟到的派生正文不得重新成为可用内容或进入学习，只留获准最小拒收元数据。删除正文后摘要不能兜底作证，重建返回明确 unavailable。

## 不变量

无证据不能形成可用 Claim；纠正优先于陈旧派生；先 scope/privacy/lifecycle 后排序；模型不扩大 Grant；失败/未知不计成功；索引可重建；解释保存行动/依据/结果摘要，禁止原始思维链。自动验收见[验收标准](../planning/acceptance-criteria.md)。
