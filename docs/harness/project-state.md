# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: active
updated: 2026-08-13
-->

## 当前定位

知微处于 **M0：能观察**，AI-primary 自主开发模式为：

```text
public-free-ruleset
```

仓库当前为 **Public + GitHub Free**。Ruleset `20776157`处于 active；2026-08-13 的 **owner/admin live readback**确认没有 bypass。正常写入只能经非默认分支、Pull Request、最新 base、GitHub Actions required `check`、线性历史和已解决 Review Thread进入 `main`。

唯一 required `check`是无 `needs`、无 checkout、仅 `actions: read`的 observer。它只接受当前 `github.run_id + github.run_attempt`内的 `CI required evidence`；内部 evidence聚合五个 CI Probe和三套路径相关 standalone Workflow。仅重跑失败 Job不能复用 prior-attempt evidence，安全恢复必须使用 **Re-run all jobs**。

普通临时 `GITHUB_TOKEN`不能读取 Ruleset `bypass_actors`或 Repository `security_and_analysis`。管理员字段使用版本化 owner/admin读回；仓库**不保存 PAT或其他长期管理员 Secret**。历史 `best-effort-private-free`记录只作为连续性证据。

## 已进入 main 的 Runtime 基线

- Pi `v0.84.1` Release、npm Artifact identity、SDK动态导入与无凭证 RPC空 Session；
- **Pi SDK / Extension**正常 Tool、自动 Retry、Follow-up队列、取消、Retry exhaustion、并行 Tool、Compaction和 Session Replacement；
- SDK / RPC同任务的 Prompt接受、运行中State、最终Messages、`agent_settled`与关闭边界；
- `RpcClient.stop()`的SIGTERM请求及`exit(143) → close(143)`；原始JSONL stdin EOF仍为`exit(0) → close(0)`；
- PR #60已合并，SDK / RPC parity squash commit为`e71f44fce5022a520a1cc3c081659cb7819cb77d`。

## Issue #32 / PR #64 候选交付

Issue #32 当前唯一 active branch为 `spike/32-rpc-worker-lifecycle`，唯一 primary PR为 #64。PR仍为 Draft，尚未进入 main。

当前候选证据已验证：

- malformed JSON和unknown command后Worker继续可用；
- JSON字符串内的`U+2028` / `U+2029`不会破坏 LF-only framing；
- Prompt success Response只代表接受，先于`agent_start`和`agent_settled`；
- 正常路径State为`isStreaming=false → true → false`、`messageCount=0 → 1 → 2`；
- stdin EOF后Extension `session_shutdown(reason=quit)`，再`exit(0) → close(0)`；
- 第二个真实Worker恢复相同Session稳定别名与先前Messages；
- idle SIGTERM前Extension shutdown证据已持久化，再`exit(143) → close(143)`；
- Preflight拒绝只产生一次失败Response，不启动Agent Run；
- 已接受后的Provider Error不生成第二个Prompt Response，失败由Assistant error Message、`agent_end(willRetry=false)`和`agent_settled`表达；
- Worker输出/进程边界与Host `clientActions`使用不同连续序列，`crossDomainTotalOrder=false`；
- Provider Error后的`get_state`只允许观察running或settled两种相位，竞态Snapshot经验证后不进入冻结Fixture。

### 当前规范化 Worker Fixture

```text
manifest                     packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest-v2.json
loader                       packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture.mjs
format                       gzip-plus-readable-case-replacement
source head                  19f3e93a2bdf4f6b66e4abef00509e9549b22f6b
workflow run                 31701880114
source artifact              9181642601
comparison artifact          9181575920
artifact result bytes        74587
artifact result sha256       8c9ee4fd4a1428e4977d2b81af2f1b10ac203f7086c418dc48b1bf31cc347d62
canonical JSON bytes         36265
canonical JSON sha256        1b2fd8aabbc3d76f0c9538db9f4c9cdd47a717ee9610d3cd564bb9d36531638a
outer fingerprint            b4715e2b896258fddec81e2f25f4c28056d24a8562547f46d6305127ebe0053c
capture fingerprint          511441fd6e09e7138cd23f92b7076e1c2c3978785303c1d6ff392f27f4e69ab0
external Provider prompts    0
```

### 历史 schema v1 Base

`rpc-worker-lifecycle-manifest.json`、内容寻址Part和`rpc-worker-lifecycle-base-fixture.mjs`保留为不可变历史输入，不再表示当前协议。历史Base来源为head `c0d782ce074e770d39876600feef3554d0471756`、workflow `31677138404`、Artifact `9172023070 / 9171976965`、outer fingerprint `cea0a302391a2e072a7a1767b0ed0115458e49e228c3ee57607a8e58f8c114ba`。

`npm run check:pi-rpc-worker-lifecycle`先用legacy Checker执行历史Base，再验证当前v2完整对象；Fresh Capture与v2 committed Fixture必须完整对象相等。

## SDK / RPC verified Fixture连续性

SDK / RPC parity当前 `verified` Fixture身份：

```text
manifest                     packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json
parts                        6
compressed bytes             9861
JSON bytes                   122178
compressed sha256            44d95e16d8078413c1afe94dd3c7a19bbcdbfad06d82a51a491d0ce8e4b3fbbb
JSON sha256                  a3f47e34c2bd78b16793c7aeacfdf4020c788e475dda252779603bc9e470034d
outer fingerprint            c99bcfb2872736e085750690965dd11dce1bc873b14b905b53a1e57defa3dcbf
capture fingerprint          70ce5607549b2d8342d7abba1312b2231c1a069a038dd39a9dbf23dd65ccb9c7
source state                 verified
capture head                 822a8100c04895dc6c20f50996dec30a73ac816f
capture workflow             31666316897
capture artifact             9168052320
capture artifact digest      sha256:7ba326de0b6e3d616d6bd0d1e1650d3609f31fc6f591df1004ff1d2ae6d5821e
external Provider prompts    0
```

该verified来源继续由Fresh Capture、两个结果Checker、committed Fixture完整对象比较和live provenance Gate保护；Worker Fixture不能降低这套既有门禁。

## Runtime 合同连续性

后续协议必须保留：

- SDK、Extension、RPC与Host的`sourceSurface`；
- Prompt Request、Command Response、Agent Run、Turn、Message、Tool Call与稳定边界；
- RPC Request ID、Runtime Event、State / Messages Snapshot；
- Worker Instance、Runtime Session、Session File / Object与Replacement Generation；
- stdin EOF、Signal Request、Extension Shutdown、Exit与Close；
- Preflight拒绝与已接受后的执行失败；
- Retry计划、Queue状态、取消、Compaction派生Context和原始Observation。

禁止从最终Messages、Promise返回、Prompt success Response、Queue清空、Compaction Summary或Process退出码单独推断任务成功。

机器事实源：

```text
docs/architecture/pi-integration.md
docs/architecture/pi-rpc-worker-lifecycle.md
docs/spikes/pi-runtime-contract/README.md
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest-v2.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle.md
```

## committed Runtime 连续性锚点

以下句子由历史Checker机械读取，项目状态压缩不得删除：

- **自动重试恢复成功 Fixture**：公共 `agent_end.willRetry=[true,false]`；Extension没有 `auto_retry_start/end`，失败Message仍从事件流持久化。
- **Follow-up队列 Fixture**：一个公共 Agent Run包含两个 Turn；Extension没有 `queue_update`；初始 `session.prompt()`会等到 Follow-up完成、Queue排空和Session idle后返回。
- 已验证用户取消、`abortRetry()`和 retry exhaustion；**取消、abortRetry与 Retry exhaustion Fixture**中，部分 Assistant消息以 `stopReason=aborted`保留，存在willRetry=true 但没有后续 Agent Run，Retry exhaustion最终保留最后一次失败 Assistant。
- **并行 Tool ordering Fixture**：完成顺序为 `beta → gamma → alpha`，消息顺序恢复为 `alpha → beta → gamma`。
- **Compaction 与 Session Replacement Fixture**：模型Context为 `compactionSummary → assistant`；Session对象为 `session-object-1 → session-object-2 → session-object-3`；旧 Public Listener不会自动迁移。验证 Compaction与 Session Replacement后，原始Entry、派生Summary、Session Object与Listener Rebind仍保持不同来源。
- **RPC真实 Prompt**：Command Response、Runtime Event、State / Messages、Extension Shutdown与Process Boundary分别保存。
- Main Provenance Dispatch可能遭遇 GitHub API瞬时故障；当前由即时dispatch与reconciler闭环，不能通过降低来源校验解决。

## Harness 与 Work Item治理

- `developmentPause.active=false`，Issue #9 已关闭，事故历史继续保留；
- Issue #61 已由PR #63完成Public Ruleset、required evidence聚合与post-merge provenance闭环；
- **Issue #57** 已完成仓库级 `work-item lifecycle` 治理：区分owner-input、execution、incident、governance与research；
- **Issue #45** 是已完成的SDK / RPC parity canonical execution Issue；Issue #32只扩展真实RPC Worker生命周期；
- Issue #44 保持owner-input；Issue #56等待正式协议；
- 每个primary PR必须在 **pre-merge** 验证work item对象类型、开放状态、分支编号、owner-input来源和supersedes关系；
- 一个execution Issue最多一个active branch和一个开放primary PR；Repository Hygiene只在exact HEAD、无开放PR且可恢复时回收登记分支；
- `R2/R3`要求当前最终HEAD绑定的独立AI cold review，作者自审不能替代。

## Work Item 状态与顺序

当前正常WIP只有 Issue #32 / PR #64：

1. Issue #32 / PR #64：完成最终HEAD CI、Fresh / committed完整比较、R3独立审查和合并；
2. Issue #49：从最新main创建`feat/49-normalized-runtime-event-v1`，消费全部真实Runtime Fixture冻结协议；
3. Issue #56：在#49后创建合规分支，实现append-only SQLite Observation Ledger；
4. 后续Daemon / Worker Supervisor消费已冻结协议。

Issue #56的pre-governance snapshot：

```text
branch feat/m0-sqlite-observation-ledger-v1
head   0da4e97e5cac42add96a55285976a93afd992495
```

该快照冻结、未审查、未交付，正式Ledger实现必须重新从最新main创建合规分支。

## 当前 M0 能力

已验证Pi源码与Artifact身份、SDK/RPC公开面、Tool/Retry/Queue/Cancel/Compaction/Replacement边界，以及RPC Worker协议错误恢复、EOF、SIGTERM、Restart / Resume、Preflight拒绝和已接受Provider Error。

尚未交付：

- PR #64对应的main交付与Issue #32关闭；
- 正式`NormalizedRuntimeEvent v1`；
- SQLite Observation Ledger；
- 真实Daemon / Worker Supervisor链路。

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

## 已知风险

- 管理员仍可修改Ruleset与安全设置，漂移触发R3重评；
- 普通Token看不到管理员字段，不保存长期PAT降低凭证风险但增加读回延迟；
- external fork只读CI仍执行不受信代码，same-repository `workflow_run`、无Secret与最小Token必须保持；
- Public仓库源码、Issue、PR历史和有意上传的脱敏Artifact公开可读，未脱敏失败结果不得上传；
- 当前Fixture不覆盖RPC Tool、Steering、Follow-up、Compaction / Replacement命令、SIGKILL、OOM、宿主崩溃或Windows信号差异；
- PR #64在最终HEAD独立审查完成前保持Draft。
