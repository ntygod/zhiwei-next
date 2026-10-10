# 下一开发上下文交接

当前方向：design-v2 / P0，停止视觉打磨，持续推进核心。当前独立实现 work item [#106](https://github.com/ntygod/zhiwei-next/issues/106)，分支 `feat/106-context-budget-core`；PR/HEAD/CI 必须实时回读，不预填批准或合入。

## 先读什么

1. [整体设计](design-baseline.md)、[详细架构 C05/C06](../architecture/detailed-design.md)、[认知流水线 §4–5](../architecture/cognitive-pipelines.md)。ADR0016—0018 已有独立设计接受，设计不是产品完成证明。
2. [完整任务卡](implementation-plan.md)、[精确准备边界](core-preparation-boundary.md)、[P0-04 预算合同](context-budget-preparation.md)。
3. 目标目录 AGENTS；Repository Reconciliation：人类新输入、Incident、primary PR、实际 main 与 HEAD。

## 当前真实起点

#104 / PR105 已完成规划并受保护合入 main `4d3d40926150b3fce122f8f20f6d7e8c50c735a8`，#104 已关闭；P0-04 精确准备合同对本独立任务生效，规则不在本次自改。

PR103 已受保护合入 main `c32a13d65fbf484e099bca432502f03ba00a61e1`，#102 已关闭。P0-03 纯 Task/Attempt/Outcome 组件已交付：新增69测试、完整393测试通过；无生产消费者，不证明 Z03/Z16 端到端、P1-01 整体或真实持久 CAS/验证器。

Runtime v1、SQLite Ledger v1、固定工具链/CLI、有限诊断与场景运行器保留。D-04/D-08 仍 Proposed，P0-01/P0-02 未完成。不得重跑受限实验、替换环境规避限制或把旧批准延伸到新范围。

## 下一可执行目标

[#106](https://github.com/ntygod/zhiwei-next/issues/106) / [PR107](https://github.com/ntygod/zhiwei-next/pull/107) 已实现预算合同指定的内存计算、固定渲染和35项独立测试，完整固定工具链 check 428/428通过；原规则要求完整 check、最终 HEAD 新独立 R3、当前 PR Runtime 来源、Ready CI、保护合入与 main 来源。未实际通过前不宣称完成；不创建另一 integrator/finalizer PR。

P0-04 depends=[]，不依赖 P0-03 计算；输入已取得的合成材料，固定渲染和精确计数，结果不是可发送 Capsule 或资格证明。保留旧 compileContext 哨兵，不接生产、检索、存储、Runtime、模型或发送。仅是 Z14 组件证据，Z14/Z15 正式验收仍由 P1 链交付。

P1-01 保留 P0-02/P0-03 并增加 P0-04，满足旧完整前阶段入口门，不伪称算法依赖；P1-06 保留 P1-05 并显式追加 P0-04。P0-01 原 D-04/D-08 实证登记、独立接受与 G-2 验收不变；P0-02 仍等待 P0-01/G-5，整个 P1 及以后正式接入链不越过安全/存储门。

原型 [PR99](https://github.com/ntygod/zhiwei-next/pull/99)关闭未合并，源码 `dded6fd30d93a95deb9fe7724d153c19b02e295e`；#98 未交付，浏览器验收未完成，不恢复视觉工作或旧未提交补丁。

## 工作纪律

每次只领取就绪的一个用户结果；创建/复用 canonical Issue，分支含编号，第一个实质提交创建 Draft primary PR。任务卡中的测试/失败/恢复是最低具体证据，npm run check 与旧独立审查规则继续执行。当前设计 PR 不为自身降低门禁；新文件导航不代表旧测试可以删除。

正常答复与进度优先向用户说明能力、限制与下一结果，不把历史 Runtime 身份和治理细节混进产品体验。#67/#44 原文保留，#15 独立维护；不批量创建远期 Issue。
