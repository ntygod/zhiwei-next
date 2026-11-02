# 任务调度、工具与结果

状态：SA1 设计。所有执行由同一 Task/Assignment/Action 账本解释；Runtime 的内部多步推理由 Harness 原生 Agent Loop 管理。原生进程内 Job registry 不能代替知微的持久任务/效果账本。

## 1. 创建与计划

Task 接受明确请求或已授予的持续职责，保存 intent、scope、资源、完成标准、预算、deadline、关联输入与 Goal。简单问答也有轻量 Task，但不强制变成长期 Goal。

Router 可以提出工作拆分；Coordinator 校验每个子任务有独立结果、依赖无环、继承范围和预算，之后才提交。默认任务树最大深度 4、单目标最多 32 个未结子任务；可配置但不能通过创建新 Goal 重置预算。Worker 不自由创建不可追踪的子 Agent 群。

每个计划步骤说明预期产物、可观察检查点和阻塞条件。未知步骤可以在执行后补充，但完成标准、权限或总预算的扩大需要合法的新 revision/Grant。

## 2. 调度与并行

控制库中的 Job 是调度真源。消费者以短事务 `FOR UPDATE SKIP LOCKED` 领取到期作业、生成 lease 与 fencing token，提交后才进行 I/O。LISTEN/NOTIFY 只作唤醒；丢通知由有界数据库扫描补齐，不调用模型轮询。

优先级：撤权/取消 > 用户交互和审批 > 已承诺任务的继续 > 到期准备 > 普通主动调查 > 学习与索引维护。每类有公平轮转和最大等待监测，低优先级不会无限饥饿；后台工作不得占满交互保留配额。

运行初值：每 Owner 最多 4 个执行 Worker、Router 每上下文分区最多 1 个推理步骤、后台学习最多 1 个、每设备并发由注册能力决定。任务预算与设备资源上限同时生效。总负载超额进入持久队列，不创建无限进程。

## 3. 资源冲突

对会修改共享对象的工作登记 ResourceClaim：规范化文件根/仓库分支/外部对象 ID、read/write 模式、有效期、持有者 epoch。一个共享对象同一时间最多一个写者；跨任务允许并行研究，但不能直接并行覆盖同一文件。

代码任务使用独立 checkout/worktree 或容器目录；向共同目标发布时检查 baseVersion、生成差异、验证后提交。文件产物同样以版本发布。外部对象变化造成冲突时暂停发布并重新读取，不自动采用最后写入获胜。

租约仅表达协调权，不是持续授权。租约过期的 Worker 可能仍在运行；Gateway 与 Execution Agent 必须拒绝旧 fencing token 的新动作。

ResourceClaim 的运行租约与未决效果隔离分开。任何写 action 已获得可执行许可、已派发或结果 unknown 时，关联资源进入或保持 quarantined；租约到期、Worker 丢失、任务取消/终结都不能自动释放。不同 Task/Workspace/SourceAccount 对同一物理或外部目标必须得到同一 resourceKey，不能换身份绕过隔离。

释放需要具体证据：动作确已终结且回执/状态已核对，或最终资源端原子验证 expectedVersion/fencing 并能证明旧请求以后不会再提交。仅在派发前读过 baseVersion、仅观察当前值或等待一段时间都不够。无法取得最终性证据时阻塞该资源的冲突写，允许不冲突的只读/独立资源工作；不以普通“继续”或新 Grant 解除。恢复时从独立 EffectFence 重建这些隔离项。

## 4. 异步 Job 生命周期

```text
requested -> accepted -> running -> stopping -> stopped
                         -> succeeded | failed | unknown
```

Job spec 包含 owner/task/assignment、工具类型、资源、参数内容引用、deadline、预算、回执格式。JobHandle 入队后立即返回。进度只报告已观察到的阶段、检查点和可数总量；没有总量不生成百分比。

Job 输出分块有 sequence 与字节上限；大正文进入获准内容对象，消息只带摘要和引用。stdout/stderr 可能包含敏感内容，须按任务数据策略过滤、截断或不保留；不是默认全量日志。

取消 Job 先停止接纳新步骤，再请求中断；仅在实际进程/远端状态得到确认后显示 stopped。网络超时、进程被杀与外部动作已撤销是不同事实。

Runtime 返回“已启动”后休止时，Task 保存必要 Job/子任务/待应用输入集合并进入 waiting-job，而不直接验证结束。Job 完成事件先更新该集合，再唤醒原任务的有效 Assignment；Worker 内存已释放时按当前 Checkpoint 重建。崩溃前已接纳动作的真实回执可以由 Gateway 追加到原 action 的历史，但旧 Worker 不得直接修改当前 Task。必要工作仍 pending 时不产生 partial/unverifiable 终态；取消或显式放弃某个必要步骤必须记录新的用户决定和真实部分成果。

## 5. 动作派发与权限

Action Gateway 每次检查：绑定身份、当前版本/epoch、主体、动作、资源、目的地、数据类别、次数/费用/时长和有效期。ALLOW/ASK/DENY 的原因与所用 Grant revision 持久记录。

```text
T1：验证当前状态，登记稳定 logicalOperationId、ActionAttempt 和预算 reservation，提交
独立记录：将 EffectFence intent 持久到普通备份之外，取得 durable receipt
T2：取得短 admission 锁，再验撤销/版本与 EffectFence，标记 dispatched，提交
外部 I/O：只接受登记过的 actionId 和短期签名能力
T3：先持久独立效果回执，再保存控制库观察/回执、结算预算并提交 Outbox
```

数据库事务不跨网络等待。撤权与接纳同一动作必须通过同一序列化边界；DB 提交与远端真正执行之间仍存在不可消除的故障窗口。能力令牌仅限单一 actionId、参数摘要、资源、到期和执行节点，节点不得将其解释为通用凭据。

这里 dispatched 表示已经进入“可能发生效果”的边界，不证明远端实际执行；实际发送观察与最终确认分别记录。EffectFence 服务不可用时不签发新的外部效果令牌。效果已发生但独立回执写入失败时保留 intent/unknown 和资源隔离，不能先确认完成。详细的恢复屏障见[提交合同](contracts.md)。

在途操作可能已经完成，不能许诺撤权瞬间撤回远端效果。控制面失联时 Execution Agent 默认停止接纳新动作；已接纳的动作按其短期许可完成或中断并报告。

## 6. 幂等与结果未知

外部系统支持 idempotency key 时，使用稳定 actionId。返回丢失后优先查询具体回执/资源版本。无幂等支持且不能证明未发生的写入进入 `needs-reconciliation`，不得重发邮件、重复建 PR 或重复购买。

内部投递至少一次；接收者以 actionId/inputId/eventId 去重。相同 ID 不同内容拒绝并保留诊断。预算预留也按 actionId 幂等，恢复和重试不能再次获得完整额度。

logicalOperationId 在首次动作意图提交时分配，绑定 Task/intent/计划步骤，跨 attempt、Worker 和普通恢复保持稳定；已存在的效果不能通过生成新 actionId 重做。恢复还会按 Task/资源设置整段时间窗的核对屏障，防止重新规划出新步骤 ID 绕过历史效果。

只有 transient 且可证明安全的步骤允许自动重试，默认一次。认证失败、撤销、数据损坏、协议不兼容、未知副作用不进入自动重试。重试策略及累计消耗是任务状态，不由 Runtime 默默重置。

## 7. 结果验证

验收条件在执行前声明：artifact-content、deterministic-test、tool-receipt、user-confirmation、model-assisted。每项结果为 pass/fail/unknown/not-applicable，并指向精确 Artifact/证据版本、检查人或验证器版本。

文件存在不等于内容合格；shell 退出 0 不等于任务目标达到；模型评审只能作为特定质量建议，不能独自认证授权、安全、外部效果或数据正确性。

只有[待办屏障](domain.md)满足后才归约终态。必需项全部 pass 且无未知效果为 completed；工作已经结束且有可用成果但不完整为 partial；有确定失败为 failed；工作已经结束但证据不足为 unverifiable。正在运行的 Job 和检查不是“缺证据失败”。用户取消优先保留 cancelled 及实际部分成果；未知效果和资源隔离仍独立存续。后续新证据产生新 Outcome revision，不改写旧判定。

## 8. Supervisor 与进展

基础监测包括进程/连接、lease、队列年龄、deadline、预算、事件序列缺口。任务监测包括最后有效检查点、重复错误类别、产物版本和未知条件是否变化。

有合法等待条件或有心跳的长计算，不仅因为暂时没有新文件就判停滞。达到阈值时最多发起一次受预算的语义诊断，输入仅含行动摘要、检查点和错误，不包含原始思维链。

Supervisor 可请求查询回执、重建已确认无未知效果的 Worker、暂停任务或上报具体阻塞。它不能给自己增加工具、改 Grant、删除失败记录、放宽验收或在线改核心代码。监督进程自身由部署管理器重启，避免“监督者故障无人知道”。

## 9. 默认持续职责

持续职责是用户明确授予的 Goal/Commitment + Grant + 调度规则。完成一次任务不取消职责，也不无限续期授权。每次唤醒检查目标仍活跃、当前来源与许可、上次结果、重复键和预算；用户暂停职责会撤销其未来调度并终止不再获准的准备。
