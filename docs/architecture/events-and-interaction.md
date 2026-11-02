# 事件路由与全双工交互

状态：SA1 设计。统一交互表示同一 Agent 身份，不表示所有渠道共享一份未经隔离的模型上下文。

## 1. 输入与可靠接收

输入来源：主对话命令、邮件、日历、GitHub、获准文件变化、任务/Job 结果、定时承诺、用户反馈。每个 Connector 声明读取范围、身份、稳定事件键、版本/游标、删除和重放语义。云端默认以邮箱/日历/GitHub 接口接入；设备文件事件通过 Execution Agent 的获准 watcher 接入。

Ingress 流程：

```text
认证传输与来源签名
-> 识别 SourceAccount/PrincipalBinding，不执行正文中的命令标记
-> 准入、大小、附件类型和读取权限检查
-> 写 Trigger、Inbox、正文引用及来源游标（同事务或可恢复的分段接收）
-> 返回 durable receipt
-> 唤醒路由消费者
```

同 sourceEventKey + sourceVersion + kind 的重复事件返回原 receipt。更正、删除、同键不同内容分别处理；不得用最后到达覆盖已有事件。正文上传完成但事务未提交的对象不可检索，之后由垃圾回收清理。游标只在事件持久化成功后推进；连接器断线恢复必须有重叠窗口去重或显式 gap 状态。

收到不等于已理解、已生效或完成。客户端可以凭 `inputId` 查询真实状态；服务未知时不自动重发同一动作。

## 2. Fast Path / Slow Path

先用代码检查来源、bot 自回声、订阅、明确目标、scope、失效版本和控制命令。明确的 cancel/revoke/status 不等待模型。其余候选才进入 Router 的语义判断。

新事项进入 Router；已有订阅的后续事件直接进入 Task Inbox。相关但未订阅的 Thread 只能供按需检索，Correlation 不自动路由。人工发来的新指令即使来自已订阅 Thread，也必须重新确认该发件人有控制权；无控制权的内容保持 external-context。

来源内容中的“帮我”“停止”“已批准”不直接构成命令。可信的所有者渠道可提交自然语言意图；模型解释后仍由命令边界验证。

## 3. 事件顺序与批处理

每个 Thread/Task Inbox 有单调接收序号；不制造跨设备和网络的真实全序。sourceOccurredAt 用于业务时间，receivedAt 用于到达时间，源版本用于过期判断。Thread 的多个事件可以合并成一次 Router 调用，但原始事件与各自 disposition 保留。

批处理按 owner、audience、workspace、policyEpoch 分区；控制事件优先。每批默认最多 20 条、内容预算 8k tokens，未处理项持久保留；这些是可调整运行初值，不是实测性能。负载拥堵时合并同一对象更新，不能合并掉取消、撤权、来源删除或唯一终态。

## 4. 执行中输入的四种语义

| 输入类型 | 立即行为 | 进入模型的时机 |
|---|---|---|
| 新的独立事项 | 记 receipt，创建/关联新的 Task，按资源排队 | 对应 Router 分区可立即处理；不等待旧 Task 完成 |
| 补充上下文 | 追加精确来源与 Task Inbox 序号 | Harness `agent.steer()` 的下一步骤接纳边界 |
| 改变目标/约束 | 先提交新 intentRevision 并冻结不兼容动作 | 视兼容性 steer，或 abort 后以新 Assignment 重建 |
| 停止/撤权 | 同步停止新派发，通知 Job/Worker，记录取消状态 | 无需等待模型理解；模型只接收已生效的控制事实 |

“顺便”“刚才那个”等指代不能只依赖消息最近位置；需结合任务关联、来源 Thread 和当前活动。归属不唯一时一次澄清，原任务继续其已有授权范围，存在潜在冲突的动作暂缓。

Harness `agent.steer()` 提交下一步骤输入并唤醒驱动器，`followup()` 提交下一轮输入，`inject()` 只加入上下文而不唤醒。它们都不承诺任意 CPU 指令处抢占。耗时工具必须使用异步 Job，因此一个工具调用只进行有界登记并返回 JobHandle；真正耗时工作在外部继续。输入接收、取消和授权服务不依赖 Worker 当前推理是否结束。

## 5. 输入的确认与生效

服务返回 `accepted`；关联后返回目标 Task/Conversation；Runtime 接收队列后为 `delivered`；仅在观察到该输入进入后续执行边界时记录 `applied`，带 observedTurn/Request 关联。不足以证明时保持 delivered/unknown，不能因为 SDK 返回 queued 就显示“已按新要求执行”。

控制事实的 `effectiveRevision` 与模型输入的 `applied` 分开：撤权可以已经生效，而模型还未处理通知。服务端可直接生成固定格式的状态确认，不为一句接收确认额外调用模型。

一条输入只对当前绑定投递一次；连接丢失时按 inputId 查受控 receipt。原生队列无法证明是否收下时标 unknown；保留原 Assignment，先读取队列/执行事实，不能盲目插入第二条。重建会话时明确说明哪些输入未证明已应用。

## 6. 异步工具协议

```text
tool.start(spec, idempotencyKey) -> { jobId, status: accepted }
tool.read(jobId, afterOffset) -> 当前已产生结果；有界、只读
tool.stop(jobId) -> { stopRequested: true }
job.progress / job.settled -> Task Inbox + 人类活动流
```

完成事件由宿主推送进入 Runtime，不通过模型循环调用 read/status 等待。网络丢事件由确定性后台对账补齐；这是基础设施查询，不消耗模型 tokens。Job 只能在最终回执持久后成为 settled。

短工具也有时限，超过阈值转 Job 或明确 unsupported。长任务不允许藏在同步工具里无限 await。异步执行、取消、进度和 owner 清理统一归 [执行合同](execution.md)。

## 7. 中途修改的完整时序

```text
用户：把报告重点改成部署成本
Ingress：持久接收 input-2
Router：关联 report-task，提出 intent revision 4
Coordinator：验证控制权，提交 revision 4，阻止 revision 3 的新动作
Worker：收到 steer；若已发请求不能安全继续，则 abort/drain
迟到输出：作为 stale 历史或按保留策略拒收，不成为 revision 4 成果
新绑定：只带仍合格材料与新要求，继续任务
Verifier：按 revision 4 标准验证
Delivery：发布新成果，保留旧版产生于何种要求的事实
```

如果用户只是增加一个兼容的参考来源，可保持同一 Assignment，但下一次模型/工具发送必须记录新的上下文版本。目标、授权或敏感内容变化不能被普通补充路径绕过。

## 8. 回复与外部投递

Worker 向 Router 提交结构化进度、问题和结果，不直接对人群聊。Router 为所有者生成简短结果；邮件/群/PR 回复通过受众隔离的生成上下文和 Delivery Gateway。

通知、回复、PR 评论均是外部效果。写入对象、目的地和内容版本必须绑定授权，不因用户曾经连接账户就无限自动发送。每个 Delivery 保存 idempotencyKey、payloadRef、audience、原因、回执/unknown。避免自身消息被 Connector 再次触发形成回声风暴。

## 9. 验收关联

覆盖 E01—E08：重复/乱序、跨入口关联、错误归属、忙时输入、新独立任务、修改与迟到结果、立即取消、长工具不阻塞。延迟目标是测试平台上非模型接收确认 p95≤500ms；语义响应时间单独记录，不用网络 ACK 冒充理解完成。
