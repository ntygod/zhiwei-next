# 下一执行上下文交接

状态：当前导航为 Issue #90 / `spike/90-preintegration-safety`；下方旧任务是历史资料，须先回读真实对象。

## 当前 G-2 实证导航（2026-10-09）

- 起点 main `ab6052efbb84abe6f87bc6758bfd7e8143b73964`；canonical #90；唯一分支 `spike/90-preintegration-safety`；唯一 primary 为 Draft [PR #91](https://github.com/ntygod/zhiwei-next/pull/91)。
- ADR0014/0015 仍 Proposed；接入前实验 80 项作者测试已通过，具体范围见 g2-preintegration-evidence.md。最终完整 HEAD 审查/来源/CI 尚待完成。当前只使用合成材料、临时文件/数据库和本地接收器，不能接入真实用户数据或凭据。
- 本任务交付有限实证，不接受 D-04/D-08；既有 checker 要求来源 PR 与决议 PR 分离。后续用已合入历史证据在新的实质决议任务接受并验收原 G-2，禁止自我豁免或伪造 sourcePr。
- G-4 已按原卡交付 #88/PR89，main tree 与最终 R3 HEAD 一致；三项 PARTIAL、21 not-run，不是完整 M0。G-5 等 G-2，M0-2 等 G-5。
- 原工作包/source/checker、Accepted 决议及证据保持不变；实际状态与长期限制见 project-state 和 trust-and-safety。

## 历史 G-4 导航（2026-10-09）

原 G-1/G-3 前置已受保护交付，起点 main `b5115d47a091f2c954e29a9963257c218bc11032`；G-3 最终证据与精确树身份见[项目状态](../harness/project-state.md)和[G-3 原卡验收](g3-baseline-acceptance.md)。唯一 canonical 为 [#88](https://github.com/ntygod/zhiwei-next/issues/88)，feature branch `feat/88-executable-scenario-evidence`；primary PR 和最新完整 HEAD 必须实时回读。

当前实现与有限证据说明见 [G-4 场景运行器](g4-scenario-evidence.md)；不要把组件通过转换成原产品场景完成。

按原 [G-4 卡](engineering-execution.md#g-4--可执行场景与证据运行器基线)实现已有场景的执行、注入和证据；只调用现有公开模块，不把未来场景伪跑为成功。E0-02/03/04 的 Ledger 组件覆盖必须标 partial，原 24 场景和 S 别名不能重命名或当成验证等价。失败、跳过、未运行及故意错误/超时/未知场景/缺证据自测都要真实区分；输出绑定真实源 HEAD、环境与场景版本。原计划 JSON/checker、Accepted 决议历史、固定迁移和生产模块合同保持不变。

G-5 仍依赖未完成 G-2/G-4，M0-2 仍等 G-5；本项不实现生产 Host/Session、真实模型/数据/凭据或未来产品场景。最终 HEAD 必须新独立 R3、完整 check、适用动态矩阵、当前 PR 来源与 fresh Ready/受保护交付。#67 原文保持，不用父项记录无关 CI 诊断。

## 历史 G-3b 导航（2026-10-08）

起点 main41b1f8a 已交付 G-3a / PR #83 与 G-2a / PR #85，交付链接见[项目状态](../harness/project-state.md)。#86 的唯一 primary 为 [PR #87](https://github.com/ntygod/zhiwei-next/pull/87)。ADR 0011/0013 与 D-07 已按[实际有限审查](https://github.com/ntygod/zhiwei-next/pull/87#issuecomment-6070476496)接受，被审候选 37c6228 的所有历史文件保持原字节；随后才实现实际消费者 `scripts/probes/pi-rpc-state.mjs` 的[严格 CLI 合同](../architecture/pi-cli-state-contract.md)。禁止把 ./client 的 RemoteSession/CBOR 类型证明当成 JSONL 选择，禁止导入不支持的 root SDK 声明或换到 ./rpc-entry。

真实复跑基线、文件哈希、准确命令与 wrapper 计数见 [D-07 证据](d07-cli-evidence.md)及[当前决议](current-decisions.md)。独立接受不等于新代码批准；实现后仍需最终完整 HEAD 的 R3、全部正式 checks、fresh CI / live 来源与 main 回读；[原 G-3 三条件](g3-baseline-acceptance.md)逐项保留实际未运行项，不预记完成。D-04/D-08 / G-2 与 M0-4/5 保持未完成，不修改源工作包或 Accepted ADR 语义，不创建 finalizer PR。

## 历史 G-2a 导航（2026-10-08）

G-3a 已由 PR #83 受保护合入 `main@830e14626aca89100a8b33d775ccf39c7781c828`，证据见[项目状态](../harness/project-state.md)。当前唯一 primary 为 #85，分支 `feat/84-protected-local-diagnostics`，canonical Issue #84。只保护现有 health/meta/doctor，配置与真实负例见[本地诊断](../architecture/local-diagnostics.md)。ADR 0012 已按本 PR [真实有限决策审查](https://github.com/ntygod/zhiwei-next/pull/85#issuecomment-6069198884)记 Accepted，历史被审 HEAD/正文摘要见项目状态；状态更新后的新完整 HEAD 仍须全新独立 R3/fresh Ready，不继承历史候选或 G-3a 批准。

D-04/D-08 聚合与 G-2 其余保留/路径/工具/模型边界仍未完成，不解锁 M0。保留原源 JSON、原 checker、Accepted ADR 与历史机器锚点。接续先核 live HEAD、全部 check、适用动态矩阵和当前 PR 来源；不要为了省略 recapture 改 gate。

## 历史 G-3a 导航（2026-10-08）

G-1 已经 PR #81 在 main@4a565f0f26ba747275d4a024e0f1211b24f65acf 受保护交付，证据见[项目状态](../harness/project-state.md)。当前唯一 primary 为 #83，分支 chore/82-formal-toolchain。有限[工具链支持面](../architecture/formal-toolchain.md)不批准 D-07 整体、生产 SDK/RPC 路径或 M0-4；root SDK 声明缺陷明确保留。原工作包 JSON、原 checker、Accepted ADR 范围与历史证据保持不变。接续时先核当前 HEAD 的独立 R3、完整 check、fresh 动态矩阵、Ready CI 与来源回读，禁止借旧批准跳过。

## 当前执行导航（2026-10-08）

起点为 `main@9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d`，含 PR #77/#79 的有限实证。canonical Issue 为 [#80](https://github.com/ntygod/zhiwei-next/issues/80)，唯一分支 `chore/80-current-decision-evidence`。当前范围、状态、逐项证据及保留前置只看[当前执行决议](current-decisions.md)与[表示说明](decision-execution-layer.md)；原登记、源 JSON 和原 checker 保持历史冻结语义。

D-01/02/10 已依据 [PR #81 正式逐项决策审查](https://github.com/ntygod/zhiwei-next/pull/81#issuecomment-6062783403)记 Accepted；被审 HEAD `4eae854403dc6596a0db7297dcf756137c848ec7`、真实观测时间 `2026-10-08T15:05:32Z` 已逐项绑定。PR #77/#79 仍仅属实验批准。[G-1 原卡逐项验收](g1-baseline-acceptance.md)记录本 PR 候选三项条件与失败路径的实质证据；新完整 HEAD 仍待独立 cold review、fresh Ready CI、受保护合入及来源回读，不能自引用未来批准或将候选写为 main 交付。仅在这些条件完成后按原依赖推进 G-2/G-3；#67 整体与 M0 仍未完成。

先按[项目状态](../harness/project-state.md)及现行治理对账真实 PR/base/HEAD/CI/评论。Evidence Ready 候选只有当前实验文件与记录/历史 blob 一致时才就绪；Accepted 等终态保留被审候选的历史证据，不冻结后续产品源码，也不批准后续实现。ADR/决议范围改文必须重审，当前产品代码仍由其任务独立验证。不要创建 finalizer PR，不依本任务新规则授权受约束产品入口。

## 历史：#72 开工基线与当时产品目标

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
