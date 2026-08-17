# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: active
updated: 2026-08-17
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
capture head                 32287c7d33482ca58bd65b46438f3cc8552a3df3
capture workflow             31781721009
capture artifact             9211959728
capture artifact digest      sha256:01c7a87fe73ac05c5ea295ddddd51809b294a502072c61e97819d77589565cc7
```

## 当前 WIP：Issue #49 / PR #66

唯一 active branch：

```text
feat/49-normalized-runtime-event-v1
```

PR #66 保持 Draft，base 为 `main@374a27505c4a150cbcb63c1b8f6c1afb3bfb4448`。

上一轮独立 R2 审查绑定：

```text
head                         d77c66abff429219c0ac95ba405c57057e56b929
verdict                      CHANGES_REQUESTED
previous B1                  CLOSED
blocking findings            3
```

当前候选关闭三项协议缺口：

- Extension `agent_end` 使用显式 `willRetry=unavailable`，与 SDK boolean 分开且不允许省略；
- 成功 `auto_retry_end` 映射为 `retry.lifecycle/completed`，保存 attempt 与 success，并关联更早 Retry start；
- Tool Result Message 生命周期和 Messages Snapshot 保存 Tool Call ID、Tool name、success/error 与 completed Tool lineage，独立验证 completion 顺序和 Message 顺序；
- Session Object replacement 增加同一 Runtime Instance 内的正向场景，证明 Session Object、Runtime Session 与 Worker Instance 不等同。

Contract Fixture 当前为 **74-event**，固定 canonical hash：

```text
b6630cff347af84e43eca74e2d76c1b786cbe8fab71b9eab4e76df10c8110d2b
```

当前发布提交必须从 `d77c66abff429219c0ac95ba405c57057e56b929` 直接构造；发布后以 GitHub 当前公开完整 HEAD 为唯一审查对象。全量 exact-head CI 成功并获得新的独立 R2 APPROVED 前，不转 Ready、不合并，Issue #56 不消费 Draft HEAD。

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

1. 发布本轮三项 R2 修复并完成 exact-head CI；
2. 对新的完整 40 位 SHA 执行独立 R2 cold review；
3. APPROVED 后转 Ready，并经 required `check` 与受保护 squash merge 进入 main；
4. Issue #56 从当时最新 main 实现 append-only SQLite Observation Ledger。
