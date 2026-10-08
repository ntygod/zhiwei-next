# 下一执行上下文交接

状态：Issue #72 执行资料补全候选；不替代 live 对象核验，也不是 #69 的产品批准。

## 已合入基线与当前产品目标

- repository: `ntygod/zhiwei-next`
- 本项起点：`main@ebb926ffa5228941057e1d264aab3f353c35d109`，PR #71 已合并、#70 已完成关闭
- canonical 产品 work item：#56（Issue，M0-1）
- primary 产品 PR：#69（Pull Request）
- 2026-10-08 本项开工读取的候选：`feat/56-sqlite-observation-ledger-v1@f4b94886020ea5c67c302f6eac2db518ac6bde27`，open / draft / unmerged
- 本项资料补全：#72，`docs/72-execution-task-cards`；唯一 primary PR 以实时对象为准

这些身份只是有日期的快照。重新核验最新 main、PR/base/head、draft/merged_at、CI 与审查；HEAD 改变不得继承旧批准，不能把 API 的旧 base 字段误当作最新 main。若 #69 已合并，核对 squash、来源、测试和 #56 完成状态；若关闭未合并，查替代关系。需要对齐 main 时继续在同一产品 PR 修正并对最终完整 HEAD 重新 cold review。

## 既有成果与写入边界

PR #71 已完成执行基线、README/规划导航、当前状态纠正、Runtime 来源续期，以及旧 Ledger 分支的受审查精确清理。其来源 Manifest、架构说明、project-state 机械锚点、reconciliation、acceptance-criteria 及审计历史应保留，不能用旧附件或旧本地补丁回滚它们。旧分支已回收，不重新创建或删除；确需恢复只能按已接受恢复记录及现行权限办理。

本项只补充完整任务卡、来源明确的派生 JSON、场景映射和对应校验。#70 已有合入 primary PR，不重开或为它建立第二个 PR。#72 是新的实质文档结果，不是 no-op finalizer/reviewer/retirement，不计新增产品工作包。

## 每次开工的对账

按现行 [Work Item 生命周期](../harness/work-item-lifecycle.md) 检查 Incident、developmentPause、人类增量评论、开放 primary PR、陈旧 Draft、孤立分支、重复 Issue 和 WIP。本项开工时只有 #69 产品 WIP；没有开放 Main Incident，developmentPause.active=false。后续不能把该快照当永久无阻塞。

#67 是架构父项，#44 是后台进度 owner-input，#15 为 G-6b 维护项。保留原文和已有映射评论，不将 CI 或审查日志投到父需求，也不因计划完成关闭父项。远期不批量创建 Issue，规划 ID 不能填成 GitHub work-item。

## 队列与证据

先收口 #56/#69（M0-1），不消费未合入候选进行 M0-2。随后按 [总计划](execution-plan.md) 选择 G-1…G-5 有限基线与 M0-2…8；只有完整 M0 Gate 有证据才进入 M1。M1-3 在 M1-2 前，M5-7 在 M5-6 前，M6-8 在 M6-7 前；阶段门不以最大编号任务自动满足。D-01…11 仍为 Proposed，取证/实验/ADR 可先行，受约束实现须等决策接受。

交付记录必须包含真实 repo/Issue/PR/base/完整 HEAD、已运行命令/场景/环境、未运行项与原因、风险和恢复边界、独立审查身份、合入后来源回读、下一任务及就绪条件。只读检查、普通 CI、冷审批准、受保护合并与产品验收分别记录。真实调用缺能力时如实报告，不伪造写入，不通过另一通道绕过拒绝。
