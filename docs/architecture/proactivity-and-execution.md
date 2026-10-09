# 主动协作与受控执行

状态：design-v2。P3 交付主动建议与准备，P4 交付有界后台执行；P1 的直接任务已经需要最小 Policy，不等到 P4 才做安全边界。

## 触发与价值判断

允许的触发来自用户确认的 Goal/Commitment、授权 Connector 的新版本、任务状态、证据冲突和明确时间表。没有长期目标时不扫描所有历史“找点事做”。服务通过持久订阅和定时队列唤醒，不让模型循环轮询是否有事。

候选保存 trigger、goalRef、evidenceRefs、delta、whyNow、deadline、suggestedAction、estimatedCost、expiry、dedupeKey。先确定性检查 scope、许可、证据新鲜度、冷却、预算、目标仍活跃；必要时才调用一次模型评价 relevance/urgency/actionability，每项 low/medium/high + 依据，不伪造精确概率。

| 选择 | 条件 | 结果 |
|---|---|---|
| silence | 相关性低、证据不足、重复、已处理、超过负担预算 | 有界原因记录，不通知 |
| prepare | 有用且可用已授权读取/本地草稿完成 | 保存可撤销草稿，不外发、不改外部数据 |
| notify | 有明确目标关联、时机与用户可做动作，通知预算允许 | AttentionItem 进入今天/系统通知 |
| execute | 用户直接请求或有效后台 Grant，独立 Policy 重验通过 | 创建 Delegation/Task，不由 Attention 自行调用工具 |

准备也有成本和访问副作用，必须有明确 preparation profile，不能把“只准备”当成网络/文件读取的免授权理由。自动发信、提交 PR、付费、购买等均不属于准备。

## 首版打扰控制

默认非紧急系统通知每天最多 3 条、同类同目标 24 小时冷却、quiet hours 22:00—08:00（用户时区）、无系统通知权限时只留应用内条目。紧急类别仅为用户显式设定且有期限的承诺，仍去重并受单次规则；不得用模型认为紧急绕过静音。

去重键由 scope + goal/commitment + triggerKind + sourceVersion 组成；相同事项新证据可以更新原条目，不重新发一条。到期、目标暂停、源失效、用户处理即 stale/resolved。snooze 持久化具体唤醒时间；irrelevant 影响同类排序但不推导永久用户偏好；disable 是强规则立即生效。忽略只记 no_response，不记不满意，更不记授权。

时区变化重算未来调度，保留原计划时间/规则。睡眠恢复只补仍有价值的逾期事项，合并为一个摘要；不能把所有错过的通知集中轰炸。用户取消承诺同时取消对应调度与准备作业。

## 执行合同

Delegation 绑定 Task revision、完成标准、可用工具、resource scope、Grant、预算、deadline、checkpoint 与用户可观察输出。授权主体是知微具体任务/Runtime 身份，不是任意自称该 Agent 的消息。

ActionAttempt：PREPARED → AUTHORIZED → DISPATCHED → CONFIRMED / FAILED / UNKNOWN；UNKNOWN → RECONCILED / NEEDS_USER。Task 状态见[领域模型](domain-model.md)。派发前持久写 action、PolicyDecision、预算 reservation 与幂等键；返回后持久回执。未经持久登记不产生外部副作用。

外部系统支持幂等键时使用稳定键；不支持时先记录意图并在超时后查询回执/资源状态。无法确定就让用户核对，禁止因为 Worker 重启/HTTP 重试而重复发送。没有普遍的 exactly-once 保证。

## 权限、停止与恢复

Grant 必须限定主体、Workspace、工具/动作、资源（规范化文件根、域名或精确对象）、外发类别、有效期、次数、token/成本/时长。模型不能修改 Grant。委托暂停停止新派发；取消先撤销剩余额度并通知运行体，在途副作用根据回执核对。远端已完成不可“取消成功”掩盖。

只有只读、可证明幂等的步骤可在有效 checkpoint 恢复；新配置/权限撤销使 checkpoint 需重验。P4 默认最多自动重试 1 次，且仅在分类为 transient 且安全可重试时；权限/协议/数据损坏不自动重试。后台 deadline、预算耗尽进入明确等待/终态，不通过新任务绕过。

权限收紧在下一模型发送、工具派发和复用内容边界强制执行；无法中断的在途请求记录此限制并撤销后续行动。kill switch 停止新执行、取消排队、通知 Worker，保留审计和必要结果核对。

## 连接器顺序

P1 仅显式选择的本地文件只读与隔离草稿目录；P3 增加用户配置的只读日历（ICS 导入/订阅）及 GitHub 仓库事件；P4 首批写能力为指定 Workspace 文件产物发布和指定 GitHub 仓库 Issue/PR 操作。每种 Connector 独立声明读取/写入、认证、游标、重放、去重、撤销与退订。

邮件发送、购物、金融交易不作为首批自动写入能力。未来每个写 Connector 是独立 R3 任务，有 dry-run、真实受控回执/重复请求测试、凭据撤销和恢复。不能通过通用 shell 绕过尚未实现的 Connector。

## 主动性评价

在标注的合成时间线测有价值提醒命中、错过窗口、重复/静音违规、误触发、成本；同时设“什么也不做”和固定规则提醒基线。线上仅记录获准反馈，通知点击不是任务收益。新策略先 shadow mode 产候选不发通知，验收后按类别开放。具体阈值见[验收标准](../planning/acceptance-criteria.md)。