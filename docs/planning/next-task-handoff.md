# 下一开发上下文交接

当前方向：design-v2 / P0。当前设计 work item [#94](https://github.com/ntygod/zhiwei-next/issues/94)，分支 docs/94-cognitive-agent-design。PR/HEAD/CI 必须实时回读；本文不预填批准或合入结果。

## 先读什么

1. [整体设计](design-baseline.md)、[产品愿景](../product/product-vision.md)、[路线图](roadmap.md)。
2. [完整任务卡](implementation-plan.md)中要做的一项及其合同。
3. [过渡映射](design-transition.md)了解旧成果/约束，目标目录最近的 AGENTS。
4. Repository Reconciliation；检查人类输入、Incident、primary PR 与实际 HEAD。

## 当前真实起点

main 1872955 已有 Runtime v1、SQLite Ledger v1、工具链/CLI 方向、受保护诊断、场景运行器与安全合成实验。当前 domain/cognition/context 的哨兵不等于本设计实现。PR #91/#93 已合入；D-04/D-08 在旧正式登记仍 Proposed，不能把准备结构与实验批准当决策接受。

本次 #94 只交付完整设计、依赖/任务/验收与导航；不修改 apps/packages 产品代码，不接入真实数据/模型，不运行未来产品场景。新 ADR 必须独立审查后接受，最终当前 HEAD 仍走原 R3/CI/来源与受保护合入。

## 第一个可执行目标

P0-01：沿现有 decision-execution-layer，把 ADR0014/0015 的真实合成实验登记为 Evidence Ready；由独立上下文实际复跑并逐项接受，绑定精确 HEAD 与 proposalSha256；再按原 G-2 卡验收。本设计选择已明确，任务是证据/有限接受与边界落实。不要重写实验或放宽 checker。

P0-02 随后完成原 G-5 的规模/持久性/演进基线并冻结代表性夹具。之后按 P1-01→P1-09 交付一条有界的工作台/任务/记忆/结果链。不要先建通用插件系统或把首个界面推迟到旧 M6。

## 工作纪律

每次只领取就绪的一个用户结果；创建/复用 canonical Issue，分支含编号，第一个实质提交创建 Draft primary PR。任务卡中的测试/失败/恢复是最低具体证据，npm run check 与旧独立审查规则继续执行。当前设计 PR 不为自身降低门禁；新文件导航不代表旧测试可以删除。

正常答复与进度优先向用户说明能力、限制与下一结果，不把历史 Runtime 身份和治理细节混进产品体验。#67/#44 原文保留，#15 独立维护；不批量创建远期 Issue。