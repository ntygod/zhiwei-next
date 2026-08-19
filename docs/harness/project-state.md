# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: active
updated: 2026-08-18
-->

## 当前定位

知微处于 **M0：能观察**，AI-primary 自主开发模式为：

```text
public-free-ruleset
```

仓库为 **Public + GitHub Free**。Ruleset `20776157` 处于 active；owner/admin live readback 已确认无 bypass。普通临时 `GITHUB_TOKEN`不能读取 `bypass_actors` 与 `security_and_analysis`；仓库不保存 PAT或其他长期管理员 Secret。历史 `best-effort-private-free` 只作为连续性证据。

`developmentPause.active=false`，Issue #9 已关闭。

## 已进入 main 的 Runtime 基线

- PR #60已合并；
- Issue #61 已完成 Public Ruleset 与 required evidence 闭环；
- Issue #32 已由 PR #64 完成；
- Issue #49 已由 PR #66 完成，`NormalizedRuntimeEvent v1` 已进入 main；
- 当前 main 基线为 `843c09569360184592f3d5cecb3b1b165eba6af7`；
- Pi SDK / Extension、RPC、Host、Tool、Retry、Queue、Cancel、Compaction、Session Replacement、Process Boundary 与 Runtime-neutral v1 协议的脱敏 Fixture 已进入 main。

## SDK / RPC verified Fixture 连续性

SDK / RPC parity当前 `verified` Fixture身份：

```text
source state                 verified
capture head                 374015527ec80d0382d8ef52f61aff82380d102e
capture workflow             32088804546
capture artifact             9307625961
capture artifact digest      sha256:25e523c899615c1afe06e6a108c37de161a6015c024a8c29b25087d51b3f0275
```

RPC Worker v2 committed evidence继续绑定 PR #66 的公开 attempts 1/2；两个 Artifact 的唯一 `result.json` 逐字节一致，均为 72,731 bytes，SHA-256：

```text
87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa
```

Contract Fixture 保持 **74-event**，固定 canonical hash：

```text
b6630cff347af84e43eca74e2d76c1b786cbe8fab71b9eab4e76df10c8110d2b
```

## 当前 WIP：Issue #56

唯一 active primary branch：

```text
feat/m0-sqlite-observation-ledger-v1
```

旧原型 HEAD `0da4e97e5cac42add96a55285976a93afd992495` 相对 PR #66 合并后的 main 已经 diverged，并仍消费旧的扁平 Runtime Event 字段。该 SHA只保留为 Migration checksum、WAL、事务、重启与 Cursor 测试结构参考；当前分支必须从最新 main 重建，不能整体 cherry-pick 旧 Schema。

SQLite Observation Ledger v1 的冻结方向：

- 只消费已合并的 `NormalizedRuntimeEvent v1`；
- canonical full event JSON 是数据库真源，索引列是读回时逐项复核的投影；
- source sequence scope为 Workspace、Runtime Session、Runtime Instance、Adapter、Runtime implementation/version、Surface 与 sequence domain；
- exact replay 在单调性检查之前处理；source-slot、idempotency 与 canonical-body冲突均 fail closed；
- 单条与批量写入使用真实 SQLite事务；批次中后续失败不会留下前缀新行；
- file DB使用 WAL，`:memory:`行为单独记录；
- 读取时重新调用正式单事件 parser，并机械验证 canonical bytes、SHA-256与全部投影；
- Migration history以连续 version、name、SHA-256和 `PRAGMA user_version`冻结，已应用 SQL不可改写；
- Row ID仅作为 ingestion Cursor，不被解释为 Runtime全局序或语义时间。

Issue #56 当前风险为 R2。获得当前最终 HEAD 绑定的独立 R2 `APPROVED` 前保持 Draft，不得转 Ready或合并。

## 历史 R2 审查连续性锚点

NormalizedRuntimeEvent v1 Contract Fixture 当前为 74-event，canonical hash：

```text
b6630cff347af84e43eca74e2d76c1b786cbe8fab71b9eab4e76df10c8110d2b
```

旧审查 HEAD `d77c66abff429219c0ac95ba405c57057e56b929` 的 verdict 为 `CHANGES_REQUESTED`。后续提交分别关闭了 `willRetry=unavailable`、`retry.lifecycle/completed` 与 Tool Result Message 的来源、关联和 lineage blocker；这些文字由协议连续性 Checker 机械读取，不能在 Project State 压缩时删除。

PR #66 后续还关闭了 Retry completion Run/Turn correlation、Fixture identity、Compaction start lineage与 normalized RPC Worker Artifact二次归一化缺口。最终批准 HEAD `d1aa5a727976bec3ca602a13ad007f032bf3bb8c` 经 fresh `ready=true` live provenance与 Autonomous Merge合入。历史结论只用于机械连续性，不授权 Issue #56 的新 HEAD。

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
- Issue #44 保持 owner-input；Issue #49 已关闭；Issue #56 当前是唯一 Ledger execution Issue；
- 每个 primary PR 在 pre-merge 阶段验证 work item 对象类型、开放状态、分支编号、owner-input 来源与 supersedes 关系；
- 一个 execution Issue 最多一个 active branch 和一个开放 primary PR；
- R2/R3 要求当前最终 HEAD 绑定的独立 AI cold review，作者自审不能替代。

## Runtime 合同连续性

后续协议和 Ledger 必须保留 SDK、Extension、RPC 与 Host Surface；Prompt、Agent Run、Turn、Message、Tool Call、Retry attempt、Session Object、Runtime Session、Worker Instance、Host Action、Extension Shutdown、Process exit/close 与 Compaction lineage。不得从 Prompt success、Queue 清空、最终 Messages、Agent settled 或 Process exit code 单独推断任务成功。

Ledger 不得用 SQLite Row ID、墙钟时间或仅 Surface 的 sequence 建立跨 source-domain total order；也不得把 Compaction Summary、Context Projection或最终 `session.messages` 作为原始 Runtime Event的覆盖写入。

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

## 当前顺序

1. 从 `main@843c09569360184592f3d5cecb3b1b165eba6af7` 重建 Issue #56同名 primary branch；
2. 实现 canonical v1 row、完整 source-stream sequence、Migration、事务、Cursor、WAL、重启、corruption与 integrity测试；
3. 在固定 Node 22.23.1上动态验证 `node:sqlite`与文件 Ledger；
4. 完成全量 exact-head CI与作者自审；
5. 对新的完整 40位 SHA执行独立 R2 cold review；
6. APPROVED 后登记 `independent-review: complete`，转 Ready并经受保护 Autonomous Merge进入 main。
