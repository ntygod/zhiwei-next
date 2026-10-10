# 下一开发上下文交接

当前唯一实现为 [#116](https://github.com/ntygod/zhiwei-next/issues/116)，工作分支 `feat/116-persistent-task-sessions`，基于 protected main `da06c0cadfb75b33c4f8810f07fb39d75dde4d0a`。P1-03 / PR115 已保护合入并完成 main 来源回读，#114 关闭；完整基线 669 测试、120 strict roots。当前 P1-04 仍 `in_progress`，产品验收 `not_run`。

当前工作区重建不冒称原已测试 tree 恢复；每个新候选重新类型/事务/进程/API 全量验证和全新独立 R3。原 Runtime 来源仅读取同一原 artifact，不重新采集。完整新候选尚未通过交付门前，不开始下一实现。

## 先读

根/局部 AGENTS、[开发与验收分离](../harness/development-and-acceptance.md)、[执行索引](../harness/execution-mode.json)、原 [P1-04 任务](implementation-plan.md#p1-04--接通-session任务摄取与事件-api)，以及数据、领域、运行协调、本地 API、持久化与部署合同。ADR0018/0019 的有限 Accepted 决策不扩大为真实启用。

## 本项责任

- 一个产品 SQLite、固定新增前向迁移；v1/0001 与已应用 migration 不改。
- SessionContract/ownerEpoch、Task/Attempt/Outcome 历史、输入/WorkingState 真源，命令/Outbox/receipt 同事务；调用者历史快照不能证明合法旧状态。
- 由 recovery coordinator 选择 active store；重启失效旧 owner，不能复活原 lease 或宣称原生 checkpoint resume。
- 配对与 Scope/Origin/CSRF 数据 API 不接受旧诊断 token；外部 cursor 与内部持久位置分开；CLI 查询回放不调用模型。
- Worker 仍固定合成 profile；精确 spec/ALLOCATED 先落库，再 spawn；观察到 READY/来源映射后才 dispatch。settled 不自动成为任务成功。

## 验证与交付

正常类型、领域、真实临时事务、合成正常进程/API/CLI 验证持续进行，不等待产品后验收。受限旧 #90/preintegration-safety、Private 替换/备份攻击及等价争议诊断不运行或换路；具体拒绝原文上报。真实模型/账户/凭据/个人数据/部署仍关闭，官方 Pi+新扩展完整进程组合仍未认证。

最终须原完整 check、当前完整 HEAD 新独立 R3、当前 PR 原 SDK/Worker 来源续期、原 ZIP/完整比较、原 Ready CI/live、保护合入与 main 回读。不得复用旧 PR 来源、不修改接受条件；#98 原型仍暂停。P1-07 负责结果验证/Episode 消费，P1-09 只做 Alpha 验收，不推迟本项实际持久化代码。
