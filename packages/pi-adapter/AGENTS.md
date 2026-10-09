# packages/pi-adapter/AGENTS.md

适用范围：`packages/pi-adapter/**`。这里是唯一允许认识 Pi SDK 的防腐层。

## 唯一职责

- 接收真实 Pi 生命周期事件；
- 将其转换为 `packages/protocol` 的 Runtime 中立结构；
- 保留必要的来源、顺序、关联和诊断信息；
- 隔离 Pi 版本变化，不让 SDK 类型泄漏到其他包。

## 禁止

- 直接写入 MemoryClaim、Goal、Procedure 或 Attention；
- 根据 Assistant 文本推断任务已成功；
- 在 Adapter 中实现长期存储、权限策略或产品逻辑；
- 为了匹配预想 Schema 而编造 Turn、Tool Call 或 causation ID；
- 把 Pi 原始对象直接透传给 Daemon、Store 或 UI。

## Runtime Spike 规则

- 未确认的 Pi 行为先用最小 Spike 和真实 Fixture 验证，再写生产映射。
- 固定并记录被验证的 Pi package/commit、Node 版本和启动方式。
- 覆盖正常完成、并行工具、取消、异常、Compaction、Shutdown 和 Worker 崩溃。
- 明确 `agent_settled`、最终回答和 `session_shutdown` 的区别，不合并成模糊的“完成”。
- 版本升级只通过 Adapter Contract Tests 扩散影响。

## 数据与隐私

- Raw payload 的保存、截断和脱敏遵循协议/安全文档，不自行默默删除字段。
- 日志不得打印凭证、完整工具结果、真实记忆或模型原始思维链。
- 未知事件应保留可诊断信息并安全失败，不能悄悄忽略导致 Ledger 不完整。

## 当前范围

当前 P0 只复用/核验可信 Observation 链路，不启用新的产品执行。P1-03 按[任务卡](../../docs/planning/implementation-plan.md)交付受控 Worker，P1-06 才消费经过资格、预算和授权验证的不可变 ContextCapsule；只负责传输/记录实际输入，不自行选择记忆或改写认知状态。

上下文注入必须遵守[认知合同](../../docs/architecture/cognitive-loop.md)的发送与迟到结果屏障。主动决策、学习、权限语义仍在各自核心/组合边界；不得在 Pi Adapter 内建设通用跨 Agent 框架或静默增强 Prompt。
