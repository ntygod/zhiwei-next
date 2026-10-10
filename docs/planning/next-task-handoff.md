# 下一开发上下文交接

当前方向：design-v2 / P0。当前设计 work item [#94](https://github.com/ntygod/zhiwei-next/issues/94)，分支 docs/94-cognitive-agent-design。PR/HEAD/CI 必须实时回读；本文不预填批准或合入结果。

## 先读什么

所有者后续要求补齐实施级架构，由 [#96](https://github.com/ntygod/zhiwei-next/issues/96) 承接；当前先完成这份详细架构的审查/交付，再进入下方 P0 实现前置。入口是[详细架构设计](../architecture/detailed-design.md)，包含模块端口、数据/事务、API、时序、认知算法与部署。它不自动完成 P0-01 或任何产品工作包。

ADR0018 已通过[真实独立设计接受](../architecture/architecture-acceptance.md)。开始下一实现任务前先确认 [PR #97](https://github.com/ntygod/zhiwei-next/pull/97) 已按最终 HEAD 门禁合入；选定任务已直接引用对应详设，按这些合同实施，不重新建立平行的一套协议/存储设计。

1. [整体设计](design-baseline.md)、[产品愿景](../product/product-vision.md)、[路线图](roadmap.md)。
2. [完整任务卡](implementation-plan.md)中要做的一项及其合同。
3. [过渡映射](design-transition.md)了解旧成果/约束，目标目录最近的 AGENTS。
4. Repository Reconciliation；检查人类输入、Incident、primary PR 与实际 HEAD。

## 当前真实起点

main 1872955 已有 Runtime v1、SQLite Ledger v1、工具链/CLI 方向、受保护诊断、场景运行器与安全合成实验。当前 domain/cognition/context 的哨兵不等于本设计实现。PR #91/#93 已合入；D-04/D-08 在旧正式登记仍 Proposed，不能把准备结构与实验批准当决策接受。

本次 #94 / [PR #95](https://github.com/ntygod/zhiwei-next/pull/95)只交付完整设计、依赖/任务/验收与导航；不修改产品实现，不接真实数据/模型，不运行未来产品场景。ADR0016/0017 已按[真实独立设计接受](design-acceptance.md)定案；登记后的最终 HEAD 仍走原 R3/CI/来源与受保护合入。先核实 PR95 已合入，再推进下一执行任务。

## 下一可执行目标

先核实 [#100](https://github.com/ntygod/zhiwei-next/issues/100)规划 primary 已按旧规则独立 R3 与全部门禁合入，再为 P0-03 创建独立 implementation work item；未合入时不按本规划写产品代码。

P0-03 只准备 Task/Outcome 纯内存领域合同与确定性测试，范围见[准备边界](core-preparation-boundary.md)。无真实数据、运行入口、模型、I/O、存储或副作用；不沿用原型代码作为核心事实源，不自建 Agent Loop。完成组件不表示正式 Z03/Z16 或 P1-01 已完成。

P0-01 仍沿原 decision-execution-layer 完成 ADR0014/0015 实证登记、独立复跑/逐项接受与 G-2 验收。当前受限实验不执行、不换环境绕过、不伪造通过；保留未完成状态。P0-02 仍等待 P0-01，按原 G-5 取得规模/持久性/演进基线。P1-01 必须同时等到 P0-02 与 P0-03 完成，之后原 P1-01→P1-09 正式接入链不变。

原型 [PR99](https://github.com/ntygod/zhiwei-next/pull/99)因方向调整关闭未合并，保留 Draft/未验收历史；精确源码 `dded6fd30d93a95deb9fe7724d153c19b02e295e`。#98 未交付，浏览器验收未完成，不再占用核心开发 WIP。恢复需重新对账、重新授权当前方向并完成原验收，不能继承旧代码复核为合入批准。

## 工作纪律

每次只领取就绪的一个用户结果；创建/复用 canonical Issue，分支含编号，第一个实质提交创建 Draft primary PR。任务卡中的测试/失败/恢复是最低具体证据，npm run check 与旧独立审查规则继续执行。当前设计 PR 不为自身降低门禁；新文件导航不代表旧测试可以删除。

正常答复与进度优先向用户说明能力、限制与下一结果，不把历史 Runtime 身份和治理细节混进产品体验。#67/#44 原文保留，#15 独立维护；不批量创建远期 Issue。
