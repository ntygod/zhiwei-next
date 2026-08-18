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
- Issue #32 已由 PR #64 完成，main 基线为 `374a27505c4a150cbcb63c1b8f6c1afb3bfb4448`；
- Pi SDK / Extension、RPC、Host、Tool、Retry、Queue、Cancel、Compaction、Session Replacement 与 Process Boundary 的脱敏 Fixture 已进入 main。

## SDK / RPC verified Fixture 连续性

SDK / RPC parity当前 `verified` Fixture身份：

```text
source state                 verified
capture head                 374015527ec80d0382d8ef52f61aff82380d102e
capture workflow             32088804546
capture artifact             9307625961
capture artifact digest      sha256:25e523c899615c1afe06e6a108c37de161a6015c024a8c29b25087d51b3f0275
```

## 当前 WIP：Issue #49 / PR #66

唯一 active branch：

```text
feat/49-normalized-runtime-event-v1
```

PR #66 保持 Draft，base 为 `main@374a27505c4a150cbcb63c1b8f6c1afb3bfb4448`。`NormalizedRuntimeEvent v1` 的协议、Pi Adapter、74-event Fixture、文档身份门禁与 Compaction start lineage 已完成；旧 HEAD `374015527ec80d0382d8ef52f61aff82380d102e` 曾获得独立 R2 `APPROVED`，但后续 Ready gate 发现 committed Runtime provenance 仍绑定 PR #64，因此该批准不会自动转用于当前候选。

当前候选额外完成 provenance 闭环：

- SDK/RPC parity Manifest 绑定 PR #66 的成功 Draft Capture run `32088804546` 与 Artifact `9307625961`；
- RPC Worker v2 绑定 PR #66 Draft 中同一 run `32090005181` 的 attempts 1/2；两次 Capture、Fresh validation、committed Fixture validation 和 Artifact upload 均成功，只有在完整对象相等后设置的受控 compare 步骤失败；
- 两个 RPC Worker Artifact 的唯一 `result.json` 逐字节一致，均为 72,731 bytes，SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`；
- 临时 recapture 代码与 source-export workflow 不进入最终候选；最终代码恢复正式完整对象比较路径。

Contract Fixture 当前为 **74-event**，固定 canonical hash：

```text
b6630cff347af84e43eca74e2d76c1b786cbe8fab71b9eab4e76df10c8110d2b
```

当前最终 HEAD 必须重新完成全量 exact-head CI 和独立 R2 cold review；通过前不转 Ready、不合并，Issue #56 不消费 Draft HEAD。

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
- Issue #44 保持 owner-input；Issue #56 等待 Issue #49 正式协议；
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

## 当前顺序

1. 完成当前 provenance 重绑候选的 exact-head CI；
2. 对新的完整 40 位 SHA 执行独立 R2 cold review；
3. APPROVED 后登记 `independent-review: complete`，转 Ready 并要求 fresh `ready=true` live provenance；
4. 经 required `check` 与 Autonomous Merge 受保护 squash merge进入 main；
5. Issue #56 从当时最新 main 实现 append-only SQLite Observation Ledger。
