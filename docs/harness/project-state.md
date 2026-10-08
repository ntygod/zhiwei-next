# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: active
updated: 2026-10-08
-->

## 当前工作：G-3a 固定工具链与完整类型检查

canonical 为 [Issue #82](https://github.com/ntygod/zhiwei-next/issues/82)，唯一分支 `chore/82-formal-toolchain`，primary 为 [PR #83](https://github.com/ntygod/zhiwei-next/pull/83)。起点 `main@4a565f0f26ba747275d4a024e0f1211b24f65acf` 已交付 G-1 有限基线：PR #81 [最终独立审查](https://github.com/ntygod/zhiwei-next/pull/81#issuecomment-6063364919)、[Ready CI](https://github.com/ntygod/zhiwei-next/actions/runs/37801655818)、[受保护合并](https://github.com/ntygod/zhiwei-next/actions/runs/37802221249)、[来源核验](https://github.com/ntygod/zhiwei-next/actions/runs/37802251253)及[回读](https://github.com/ntygod/zhiwei-next/actions/runs/37802274027)分开保存，不作为新候选的批准。

本项固定版本/完整 strict 编译/官方 Pi client 类型面/安装隔离与负例，详见[工具链边界](../architecture/formal-toolchain.md)与 Proposed ADR 0011。root SDK 官方声明仍有 46 个诊断，不把 client 子路径通过写成 root SDK 兼容。D-07 整体仍 Proposed，不实现 Session、WorkerSupervisor、Daemon 或 M0-4；当前完整 HEAD 的独立 R3、fresh Ready CI、全部动态矩阵及受保护交付尚待 PR 实证。

当前PR已按[Runtime来源记录](../spikes/pi-runtime-contract/README.md)核对本PR成功SDK及Worker两attempt的原ZIP、内容身份和完整对象相等。Worker两次均在完整比较成功后由临时guard产生受控CLI失败，非Runtime故障；CLI已恢复原blob。来源metadata与内容指纹分开记录；实现HEAD `2d70ea8fe05277b9cad241b4238ed88d9744fbe1` 的Draft动态CI已成功，最终完整HEAD仍待独立R3与真实Ready live gate；本次续期不改变G-1历史决议或D-07状态。

以下 G-1 与更早开发记录是历史快照，保留全部被审身份、原始状态与机器锚点。它们不表示本项 WIP，不继承批准。

## 当前工作：G-1 有限执行决议

2026-10-08 本项起点为 `main@9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d`，已含 PR #77/#79 的静态包归属、合成输入和真实临时 SQLite 演进实证。canonical execution 为 [Issue #80](https://github.com/ntygod/zhiwei-next/issues/80)，唯一分支 `chore/80-current-decision-evidence`，primary 为 [PR #81](https://github.com/ntygod/zhiwei-next/pull/81)；新完整 HEAD、CI 和最终独立审查以实时对象为准。

[当前执行决议](../planning/current-decisions.md)是单一执行状态入口，原源登记及 JSON 是历史 Proposed 快照；[状态层说明](../planning/decision-execution-layer.md)记录严格 opt-in 校验、有限范围和审查身份。D-01/02/10 已依据 [PR #81 的真实逐项决策审查](https://github.com/ntygod/zhiwei-next/pull/81#issuecomment-6062783403)记 Accepted，reviewed HEAD 为 `4eae854403dc6596a0db7297dcf756137c848ec7`，回读观测为 `2026-10-08T15:05:32Z`。ADR 0007—0010 仅状态行改变，被审正文/范围/实验摘要不变。该评论只批准历史 proposal；PR #77/#79 仍仅属实验批准。状态登记后的新完整 HEAD 待全新独立 cold review、fresh Ready CI、受保护合入与来源回读，不继承未来批准。

[G-1 原卡逐项验收记录](../planning/g1-baseline-acceptance.md)已分别核对三项完成条件和两类失败路径，本 PR 候选实质条件满足；尚不宣称已合入 main 交付，不从三个 Accepted 自动算完成，也不要求先交付未来产品能力。待本 PR 最终审查/CI/合入回读完成后，按原依赖选择 G-2/G-3 就绪工作；D-04/G-2 保留授权、D-09 owner/升级并发、D-03/G-5 性能与硬件持久性仍约束相关产品实施。D-02 只覆盖 table/index/trigger/xinfo，view 未覆盖且旧态验证在 BEGIN IMMEDIATE 前。本项不实现 Session、生产迁移、Host 或新权限，不改原质量门。#67 整体、M0 与正式会话链仍未完成。

以下 PR #71/#73/#69/#75 开发期间的文字及机器锚点是**历史快照**，保留供现有测试与审计定位；其中“当前”“未合并”“review-required”只描述当时，不表示本次 WIP 或对新 HEAD 的批准。不开展完整 G-6a 历史重构，不删除/放宽 Ledger 历史锚点测试。project-state 更新命中既有 Runtime 来源路径时，按现行合同取证，不为减少重采成本省略应有状态或修改门禁。

## 历史开发起点（PR #71 期间）

本次整理对应 Issue #70 / PR #71。执行顺序以 [M0—M7 执行计划](../planning/execution-plan.md) 为准，当前仍是 [M0：能观察](../planning/milestone-m0.md)，没有进入记忆或完整 UI 阶段。计划随 PR #71 合入 main 后生效，其中的 Proposed 决策仍须分别取证、形成 ADR 并审查。

2026-10-08 对账时，main 为 `843c09569360184592f3d5cecb3b1b165eba6af7`；PR #66 已合并，Issue #49 已关闭。正式 `NormalizedRuntimeEvent v1`、Pi 事件映射和契约 Fixture 已进入主分支；SQLite Ledger、正式 Worker/Daemon 链路和 CLI 查询回放尚未交付。本文件此前将 #66 记为待完成的状态已在本次整理中纠正，README 同步提供当前入口。

本文件保存有日期的交接快照。开工时仍须实时核对 Incident、人类新输入、PR HEAD、CI 和分支，不能把下方历史 Fixture/审查身份当成当前候选批准。

## 历史产品 WIP：Issue #56 / PR #69（现已合入）

| 项目 | 对账结果 |
|---|---|
| 工作包 | M0-1：SQLite append-only Observation Ledger v1 收口 |
| canonical Issue / primary PR | Issue #56 / PR #69 |
| 状态 | open / Draft / 未合并 |
| 唯一 active 产品分支 | `feat/56-sqlite-observation-ledger-v1` |
| 候选 HEAD | `f4b94886020ea5c67c302f6eac2db518ac6bde27` |
| 基线 | `main@843c09569360184592f3d5cecb3b1b165eba6af7` |
| 待完成 | 当前 HEAD 的全新独立 R2 cold review、Ready CI、受保护合并和合入回读 |

旧 HEAD `ba04fca042f3495b3fc4886da992cbb727b7cd0b` 的 `CHANGES_REQUESTED` 和 6 项 blocker 不代表当前 HEAD 已获批准。当前候选已有修复及历史 Draft CI 证据，但本规划整理不替代产品审查、不移动产品分支、不将候选代码计入 main。下一轮从 #69 的当前真实完整身份继续，不新建替代 Ledger PR；如需适配新的 main，仍在 #69 完成并重新审查最终 HEAD。

## 历史 Ledger 候选继续记录（保留测试锚点）

<!-- zhiwei-active-primary
work-item: #56
primary-pr: #69
branch: feat/56-sqlite-observation-ledger-v1
status: review-required
-->

当前等待独立 R2 cold review。#69 原候选 `f4b94886020ea5c67c302f6eac2db518ac6bde27` 的独立复核发现：Schema 对象过滤将 LIKE 的 `_` 当通配符，遗漏 `sqlitex_*` 用户表/trigger；新库初始化锁冲突被归为 migration 而非稳定 `sqlite` 错误。该候选的 55 项 Ledger/129 项全仓检查通过不代表上述负例通过或已获批准。

本轮仍在同一 #56/#69 修正两处边界并加入真实临时 SQLite 回归。提前独立复核进一步覆盖安装时真实 SQLITE_FULL 及 metadata/history I/O 错误；这些 operational cause 同样交给公开 sqlite 错误边界，SQL/constraint/history 语义失败仍保持 migration 分类。从 `main@dea55a9780ba8ad0ae22494d2664396c02dbcbb3` 保留已合入规划、Runtime 来源和精确清理记录，合并冲突只在本文件对齐。实际最终 HEAD、修复验证与审查结论以 PR 为准，旧审查不继承到新 HEAD；本文件不宣称 Ledger 已合入。

## 历史工作队列与仓库对账（PR #71/#69 期间）

1. 完成 M0-1（#56 / #69）；
2. 依次选择 G-1 → G-2 → G-3 → G-4 → G-5 中前置已满足的实质目标；
3. 再按计划推进 M0-2…M0-8，整体 M0 阶段门通过后进入 M1。

Issue #67 保留架构父项；Issue #44 保留后台进度的 owner-input 原文和开放状态，由 M0-7、M5-6、M6-4 分阶段承接。Issue #15 复用为低优先级 G-6b，不阻塞产品主线。不批量创建远期工作包 Issue；本次入口和事实同步不宣称 G-1 或完整 G-6 已交付。

旧 PR #68 已关闭、未合并，由 #69 supersede。旧分支 `feat/m0-sqlite-observation-ledger-v1` 当前为 `5d5aef1dd7bfd7b6b7812a9b0d4975dbd7963af0`，已不同于 2026-08-12 的冻结快照。核验结果：其产品父提交 `9126ca35e4afbc2c137cfa8978e0eae7bd97529f` 已由 #69 保留，唯一额外提交只加入废弃的 `.github/workflows/issue56-ledger-bootstrap.yml`。

本次在[现有精确身份清理记录](reconciliation/2026-08-12-work-item-cleanup.json)追加该旧 HEAD，保留原快照登记作为历史，不改清理策略、Workflow 或检查器。仅在 PR #71 经 R3 审查合入后，由既有 Repository Hygiene 重查默认分支、protection、开放 PR 和完整 HEAD 再回收；HEAD 移动或重新获得开放 PR 时必须保留。实际删除结果以该 Workflow 回读为准。

回收前已制作完整历史 Git bundle，并在独立临时裸仓库恢复验证：HEAD 为 `5d5aef1dd7bfd7b6b7812a9b0d4975dbd7963af0`，tree 为 `b7534e3eafb564287defc2194720ef76b8599439`。恢复时先通过受审查 PR 撤销本次精确清理登记，再从保存的完整 SHA/bundle 重建分支；不得 reset main 或覆盖 #69。文档可 revert，已登记 Issue、PR 和审计记录保留。

## 治理状态

知微处于 **M0：能观察**，AI-primary 自主开发模式为：

```text
public-free-ruleset
```

仓库为 **Public + GitHub Free**。Ruleset `20776157` 处于 active；owner/admin live readback 已确认无 bypass。普通临时 `GITHUB_TOKEN`不能读取 `bypass_actors` 与 `security_and_analysis`；仓库不保存 PAT或其他长期管理员 Secret。历史 `best-effort-private-free` 只作为连续性证据。

`developmentPause.active=false`，Issue #9 已关闭。

## 已进入 main 的 Runtime 基线

- PR #60已合并；
- Issue #61 已完成 Public Ruleset 与 required evidence 闭环；
- Issue #32 已由 PR #64 完成，其合并基线为 `374a27505c4a150cbcb63c1b8f6c1afb3bfb4448`；
- Issue #49 已由 PR #66 完成，协议合并基线为 `843c09569360184592f3d5cecb3b1b165eba6af7`；
- Pi SDK / Extension、RPC、Host、Tool、Retry、Queue、Cancel、Compaction、Session Replacement 与 Process Boundary 的脱敏 Fixture 已进入 main。

## SDK / RPC verified Fixture 连续性

本连续性表按现行 Harness 与 manifest 同步至 PR #83；PR #81 原来源保留在 Runtime 历史记录。SDK / RPC parity当前 `verified` Fixture身份：

```text
source state                 verified
capture head                 2d70ea8fe05277b9cad241b4238ed88d9744fbe1
capture workflow             37822256937
capture artifact             11569408126
capture artifact digest      sha256:bca83082df22cddba1157bbfcaded5761fe6d71bd579c166f1c40d2e514f5eea
```

PR #71 历史取证：2026-10-08 的 Ready 检查发现旧公开 Artifact 返回 404。本次重新绑定 SDK/RPC 的成功 Draft Capture，以及 RPC Worker run `37748698280` 在 `44336fbaa512ef6351ef39d01380323ad6562b78` 的 attempts 2/3；两份 Worker `result.json` 各 72,731 bytes、逐字节一致，且与完整 committed Fixture 相等。正式协议、Payload、Normalizer、内容哈希、Workflow 和检查器保持不变；临时 recapture-only guard 已从最终候选恢复。公开 Artifact 有保留期限，续期和单作业重跑的核验方式见 [Runtime 取证记录](../spikes/pi-runtime-contract/README.md)。

## 已合入协议的 Fixture 与历史证据

`NormalizedRuntimeEvent v1` 的协议、Pi Adapter、74-event Fixture、文档身份门禁与 Compaction start lineage 已通过 PR #66 合入。以下保留该 PR 的取证连续性，不再表示它是当前 WIP，也不能用于批准 #69：

- 历史 SDK/RPC parity Manifest 绑定 PR #66 的成功 Draft Capture run `32088804546` 与 Artifact `9307625961`；
- 历史 RPC Worker v2 来源绑定 PR #66 Draft 中同一 run `32090005181` 的 attempts 1/2；两次 Capture、Fresh validation、committed Fixture validation 和 Artifact upload 均成功，只有在完整对象相等后设置的受控 compare 步骤失败；
- 两个 RPC Worker Artifact 的唯一 `result.json` 逐字节一致，均为 72,731 bytes，SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`；
- 临时 recapture 代码与 source-export workflow 未进入最终候选；合入代码使用正式完整对象比较路径。

Contract Fixture 当前为 **74-event**，固定 canonical hash：

```text
b6630cff347af84e43eca74e2d76c1b786cbe8fab71b9eab4e76df10c8110d2b
```

Issue #56 使用已合入 main 的正式协议，不消费历史 Draft HEAD。

## 历史 R2 审查连续性锚点

旧审查 `d77c66abff429219c0ac95ba405c57057e56b929` 的 verdict 为 `CHANGES_REQUESTED`；后续提交已经分别关闭 `willRetry=unavailable`、`retry.lifecycle/completed` 与 Tool Result Message 相关 blocker。该历史结论只用于机械连续性，不授权当前新 HEAD。

## committed Runtime 连续性锚点

以下句子由历史 Checker 机械读取，项目状态压缩不得删除：

- **自动重试恢复成功 Fixture**：公共`agent_end.willRetry=[true,false]`；Extension没有 `auto_retry_start/end`，失败Message仍从事件流持久化。
- **Follow-up队列 Fixture**：一个公共 Agent Run包含两个 Turn；Extension没有 `queue_update`；初始 `session.prompt()`会等到 Follow-up完成、Queue排空和Session idle后返回。
- 已验证用户取消、`abortRetry()`和 retry exhaustion；**取消、abortRetry与 Retry exhaustion Fixture**中，部分 Assistant消息以 `stopReason=aborted`保留，存在willRetry=true 但没有后续 Agent Run，Retry exhaustion最终保留最后一次失败 Assistant。
- **并行 Tool ordering Fixture**：完成顺序为 `beta → gamma → alpha`，消息顺序恢复为 `alpha → beta → gamma`。
- **Compaction 与 Session Replacement Fixture**：模型Context为`compactionSummary → assistant`；Session对象为`session-object-1 → session-object-2 → session-object-3`；旧 Public Listener不会自动迁移。验证 Compaction与 Session Replacement后，原始Entry、派生Summary、Session Object与Listener Rebind仍保持不同来源。
- **RPC真实 Prompt**：Command Response、Runtime Event、State / Messages、Extension Shutdown与Process Boundary分别保存。
- Main Provenance Dispatch可能遭遇 GitHub API瞬时故障；当前由即时dispatch与reconciler闭环，不能通过降低来源校验解决。

## Harness 与 Work Item 治理

- Issue #61 已完成 Public Ruleset、required evidence 聚合与 post-merge provenance 闭环；
- **Issue #57** 已完成仓库级 `work-item lifecycle` 治理；
- **Issue #45** 是已完成的 SDK / RPC parity canonical execution Issue；
- Issue #44 保持 owner-input；Issue #56 的协议前置已完成，当前产品候选见上方 PR #69；
- 每个 primary PR 在 pre-merge 阶段验证 work item 对象类型、开放状态、分支编号、owner-input 来源与 supersedes 关系；
- 一个 execution Issue 最多一个 active branch 和一个开放 primary PR；
- R2/R3 要求当前最终 HEAD 绑定的独立 AI cold review，作者自审不能替代。

## Runtime 合同连续性

后续协议和 Ledger 必须保留 SDK、Extension、RPC 与 Host Surface；Prompt、Agent Run、Turn、Message、Tool Call、Retry attempt、Session Object、Runtime Session、Worker Instance、Host Action、Extension Shutdown、Process exit/close 与 Compaction lineage。不得从 Prompt success、Queue 清空、最终 Messages、Agent settled 或 Process exit code 单独推断任务成功。

## 历史连续性锚点

```text
PR #12 final CI                 31498003965
PR #12 Autonomous Merge         31498045898
PR #12 Provenance Dispatch      31498045864
PR #12 Provenance Receiver      31498068302
PR #13 final CI                 31499190699
PR #13 Autonomous Merge         31499233718
PR #13 Provenance Dispatch      31499233680
PR #13 Provenance Receiver      31499253092
PR #13 merge commit             10c963ef8bee978543dccf73047d3bd2d18baae5
```

机器证明：

```text
docs/harness/provenance-proofs/2026-08-11-pr-12.json
docs/harness/provenance-proofs/2026-08-11-pr-13.json
```

历史机械锚点继续保留在本文件，完整的状态/历史分离留给 G-6a；本次不修改依赖这些锚点的机器检查。

## 历史 PR #69 Ready 来源回读与续期

a1f9cd4 的产品冷审、138项测试与Draft CI通过后，Ready live provenance拒绝了继承PR71的来源，因为现行冻结合同要求RPC Worker来源关联当前PR。现按PR69本身的真实来源记录续期：SDK成功run37760933918；RPC run37763595121的attempts1/2均完成capture、fresh/committed校验和完整对象相等，之后才由显式recapture-only guard额外制造CLI失败。它不是Runtime失败，也不是正常完整比较失败。

两份Worker Artifact重新公开下载仍可读，72731字节result.json逐字节相同且与完整committed对象深相等。临时guard已恢复为原CLI blob fba36da923a94cd2b9ba024f020089e3ef313d90，协议、normalizer、Workflow、validator、内容指纹和接受谓词无净变化。本轮最终交付风险升R3；原产品R2批准不授权新的来源HEAD，当前仍等待新最终完整HEAD的独立R3冷审、Ready全CI与受保护合入。

## 历史 PR #75 来源闭环状态

G-1a文档切片在83df4e09获独立R2，但Ready因当前PR来源关联被拒。现按[真实采集记录](../spikes/pi-runtime-contract/README.md)续期SDK与RPC来源，两Worker attempts的完整相等后受控CLI失败已明确记录，临时guard已恢复原blob。当前交付升R3，等待新最终完整HEAD的独立审查和fresh Ready CI；不复用83df批准，也不把来源更新视为新增产品能力。

## 历史 PR #77 来源闭环状态

G-1b当前PR77已按[真实Runtime取证记录](../spikes/pi-runtime-contract/README.md)准备本PR成功SDK来源与Worker两attempt来源。完整比较成功后才制造受控CLI失败，最终CLI已恢复原blob；不改内容指纹与接受谓词。冷审修复文件包装器/空suite误计与入口键序重复后，实验45项、目录精确运行30项与全仓138项分别验证；来源续期使最终风险为R3，等待最终完整HEAD新独立审查与fresh Ready CI，不复用PR75审查或宣布D-10接受。

## 历史 PR #79 来源闭环状态

G-1c当前PR79已按[真实Runtime取证记录](../spikes/pi-runtime-contract/README.md)核对本PR成功SDK与Worker两attempt；完整比较成功后受控CLI失败的原日志/原ZIP均保留，CLI现已恢复原blob。D01 50项、D02 35项、既有G1b45项与全仓138项各自验证，不合加。仍等待新最终完整HEAD独立R3/fresh ReadyCI；不改变原11项Proposed，不宣称真实模型输入/生产升级/任意SQLite对象覆盖。

## 历史 PR #81 来源取证状态（正式决议审查前）

本PR已按[真实Runtime记录](../spikes/pi-runtime-contract/README.md)核齐当前PR成功SDK及Worker两attempt来源，原CLI已恢复。取证时执行层仍是3项Evidence Ready、8项Proposed、零Accepted；当时需先有真实逐项决议审查，才能登记状态，并对新最终完整HEAD独立R3/fresh Ready，不拿来源或旧实验批准代替接受。
