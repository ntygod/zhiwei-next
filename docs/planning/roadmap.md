# 产品路线图

路线图按能力门槛，而不是按发布日期划分。上一阶段的验收场景没有通过，不进入下一阶段。

## M0：能观察

规范化 Pi 生命周期，建立 Workspace、Session、Observation、SQLite Ledger、最小 CLI 和真实会话回放。

## M1：记得对

实现 MemoryCandidate、MemoryClaim、provenance、Scope、FTS5、remember/search/correct/forget/explain。

## M2：保持连续

实现 Context Compiler、固定预算的 Context Capsule、Goal/工作状态和本轮记忆解释。

## M3：能够学习

实现 Outcome 验证、自动候选、Procedure Candidate、晋升/退役和任务后学习审阅。

## M4：想得早

实现常驻 Daemon、Scheduler、DUE/FOLLOW_UP/CONFLICT Attention、收件箱、冷却与反馈。默认不执行外部动作。

## M5：做得稳

实现 Delegation、PolicyGrant、预算、暂停恢复、Sandbox Profile 和后台 Pi Worker。

## M6：成为完整产品

实现桌面端、Today、Workspace、Memory、Attention、Delegation、Audit、安装升级、备份导出和核心连接器。

## M7：成为跨 Agent 认知层

稳定 Cognition Protocol，接入 Codex、Claude、MCP、可选加密同步和移动端审批。

## 共同验收红线

- Workspace 泄漏为零；
- 未授权副作用为零；
- 用户纠正后旧结论停止生效；
- 所有认知和行动具备解释链；
- 不以旧知微功能覆盖率衡量进度。
