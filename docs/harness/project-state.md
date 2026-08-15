# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: active
updated: 2026-08-15
-->

## 当前定位

知微处于 **M0：能观察**，AI-primary 自主开发模式为：

```text
public-free-ruleset
```

仓库为 **Public + GitHub Free**。Ruleset `20776157` 处于 active；2026-08-13 的 owner/admin live readback 确认没有 bypass。正常写入只能经非默认分支、Pull Request、最新 base、GitHub Actions required `check`、线性历史和已解决 Review Thread 进入 `main`。

唯一 required `check` 是无 `needs`、无 checkout、仅 `actions: read` 的 observer。它只接受当前 `github.run_id + github.run_attempt` 内的 `CI required evidence`。普通临时 `GITHUB_TOKEN`不能读取管理员字段，包括 `bypass_actors` 与 `security_and_analysis`；仓库不保存 PAT或其他长期管理员 Secret。历史 `best-effort-private-free` 记录只作为连续性证据。

`developmentPause.active=false`，Issue #9 已关闭。

## 已进入 main 的 Runtime 基线

- Pi `v0.84.1` Release、npm Artifact identity、精确 published shrinkwrap 依赖闭包、SDK 动态导入与无凭证 RPC 空 Session；
- Pi SDK / Extension 正常 Tool、自动 Retry、Follow-up 队列、取消、Retry exhaustion、并行 Tool、Compaction 和 Session Replacement；
- SDK / RPC 同任务的 Prompt 接受、运行中 State、最终 Messages、`agent_settled` 与关闭边界；
- `RpcClient.stop()` 的 SIGTERM 请求及 `exit(143) → close(143)`；原始 JSONL stdin EOF 为 `exit(0) → close(0)`；
- PR #60已合并，SDK / RPC parity squash commit 为 `e71f44fce5022a520a1cc3c081659cb7819cb77d`；
- Issue #32 已由 PR #64 完成，exact-head R3、Ready live provenance、required `check` 与 Main Provenance 均成功；squash commit 为 `374a27505c4a150cbcb63c1b8f6c1afb3bfb4448`。

### Issue #32 冻结的 RPC Worker 合同

- malformed JSON 和 unknown command 后 Worker 继续可用；
- stdout 使用 strict byte LF reader，拒绝空 record、CRLF、非法 UTF-8 和未 LF 终止尾片；
- Prompt success Response 只代表接受，不表示 Agent Run 完成；
- Worker 输出/Process 与 Host `clientActions` 使用不同连续序列，`crossDomainTotalOrder=false`；
- stdin EOF、Extension Shutdown、exit 与 close 分别保存；
- 第二个真实 Worker 恢复相同 Runtime Session 与先前 Messages；
- Preflight 拒绝不启动 Agent Run；已接受 Provider Error 由 Assistant error、`agent_end(willRetry=false)` 和 `agent_settled` 表达；
- Provider Error 竞态 State 只有在完整 running/settled 对象与真实顺序验证成功后才从稳定 Fixture 排除；
- SDK/RPC 与 Worker Fresh Capture、committed Fixture 和完整对象比较保持连续。

### 当前规范化 Worker Fixture

```text
manifest                     packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest-v2.json
loader                       packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture.mjs
normalizer                   packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalizer.mjs
provenance                   packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provenance.mjs
format                       gzip-plus-readable-case-replacement
source head                  19f3e93a2bdf4f6b66e4abef00509e9549b22f6b
workflow run                 31701880114
source run attempt           2
source artifact              9181642601
source artifact digest       sha256:d7d81bc279c7533777c130fb2b294460fa8a8fff5a2326bf6b2a4f0efd373b09
comparison run attempt       1
comparison artifact          9181575920
comparison artifact digest   sha256:b7c415e360338f562d3384d22f4c786d845bb78dddaf7b8b10447def94f4b73f
artifact result bytes        74587
artifact result sha256       8c9ee4fd4a1428e4977d2b81af2f1b10ac203f7086c418dc48b1bf31cc347d62
canonical JSON bytes         36265
canonical JSON sha256        1b2fd8aabbc3d76f0c9538db9f4c9cdd47a717ee9610d3cd564bb9d36531638a
outer fingerprint            b4715e2b896258fddec81e2f25f4c28056d24a8562547f46d6305127ebe0053c
capture fingerprint          511441fd6e09e7138cd23f92b7076e1c2c3978785303c1d6ff392f27f4e69ab0
external Provider prompts    0
```

历史 schema v1 Manifest、内容寻址 Part 和 Base Loader 只保留为不可变输入，不表示当前协议。

## SDK / RPC verified Fixture 连续性

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
capture head                 32287c7d33482ca58bd65b46438f3cc8552a3df3
capture workflow             31781721009
capture artifact             9211959728
capture artifact digest      sha256:01c7a87fe73ac05c5ea295ddddd51809b294a502072c61e97819d77589565cc7
external Provider prompts    0
```

该 verified 来源属于 PR #64，来源 HEAD 是当前 main 交付的祖先；Ready live provenance 已在最终 PR #64 exact HEAD 实际成功。

## 当前 WIP：Issue #49 / PR #66

唯一 active branch：

```text
feat/49-normalized-runtime-event-v1
```

唯一 primary PR 为 #66，保持 Draft，base 为 `main@374a27505c4a150cbcb63c1b8f6c1afb3bfb4448`。协议强化实现 checkpoint 为：

```text
bd36646b9da6a58815dc460f922713a1198e03e7
```

该 checkpoint 已完成作者自审发现的五组协议修复：

- Session Replacement 按真实来源拆成 Extension shutdown/start 与 Host invalidation/replacement/rebind；聚合 replacement 必须 source-link old/new 事实；
- Message、State Snapshot、Messages Snapshot 改为 closed、字段级 Runtime-neutral projection，不再把任意 Raw Pi JSON 写入 durable event；
- 单事件 parser 校验 Tool、Compaction、Session 必备结构；Trace validator 拒绝跨 Agent Run、Turn 或 Runtime Instance 借用关联；
- Payload 按 phase 分型，已知 stable vocabulary 固定为 `required`；Message update 与 unknown vocabulary 保留明确例外；
- canonical body、Event ID、Idempotency Key、60-event Fixture 完整 hash 与六组已合并 Runtime evidence fingerprint 均有机器锚点。

当前 `NormalizedRuntimeEvent v1` 候选冻结：

- Workspace、Runtime Session、Runtime Instance 与 Source Surface 分离；
- 顺序只在声明的 source stream 内单调，不存在 `globalSequence`；
- `eventId` 标识 source slot，`idempotencyKey` 包含 canonical semantic body；
- Prompt Response 使用 `preflight-result`，不表示 Agent 或任务完成；
- Command Response、Agent/Turn/Message/Tool、Queue、Retry、Compaction、Session identity、Snapshot、Host Action 与 Process Boundary 分型；
- stdin EOF 与 Signal Request 是 Host Action，Extension Shutdown、Process exit 与 close 是独立观测边界；
- Correlation 只保留边界显式注入或实际观测的 ID，不生成随机关联；
- Tool start/completion 显式引用同 Session、同 Runtime Instance 的 declaration；Parallel Tool 不借用数组顺序；
- Compaction completion 保留 `sourceEventIds` 与 `replacesEventIds`，不覆盖原始事实；
- `zhiwei-json-v1` 拒绝 accessor、exotic prototype、稀疏 Array、alias/cycle、Symbol、非有限数字和 `-0`；
- Unknown Event 只保留 source type、排序字段名和 canonical payload SHA-256，不透传 Raw Pi 对象；
- `NormalizedRuntimeEvent`、Cognition Observation 与 SQLite row/revision 保持三层分离。

Contract Fixture 直接绑定 Issue #32 merge commit 与 Retry、Cancel/Exhaustion、Parallel Tool、Compaction/Replacement、SDK/RPC、RPC Worker v2 的 accepted fingerprint；构造 60 个事件，固定 canonical hash：

```text
8147f73a7bb74d4518f46c5f7f4cfccc7bd2760728f81bdd115f31f6e82a5b44
```

GitHub Actions Draft generation `31882494489` 已完整成功；Static contracts Job `95006913400` 执行 `npm run check`，验证 60-event contract、全部历史 Runtime checker 与 51 个测试成功，三套路径相关 standalone workflows、`CI required evidence` 与最终 `check` observer 也全部成功。

作者最终自审：complete。当前剩余门禁只有最终完整 HEAD 绑定的独立 R2 cold review；独立批准前不得转 Ready，也不得让 Issue #56 消费 Draft HEAD。

## Runtime 合同连续性

后续协议和 Ledger 必须保留：

- SDK、Extension、RPC 与 Host 的 `sourceSurface`；
- Prompt Request、Command Response、Agent Run、Turn、Message、Tool Call 与稳定边界；
- RPC Request ID、Runtime Event、State / Messages Snapshot；
- Worker Instance、Runtime Session、Session File / Object 与 Replacement Generation；
- stdin EOF、Signal Request、Extension Shutdown、Exit 与 Close；
- Preflight 拒绝与已接受后的执行失败；
- Retry 计划、Queue 状态、取消、Compaction 派生 Context 和原始 Observation。

禁止从最终 Messages、Promise 返回、Prompt success Response、Queue 清空、Compaction Summary 或 Process 退出码单独推断任务成功。

机器事实源：

```text
docs/architecture/pi-integration.md
docs/architecture/pi-rpc-worker-lifecycle.md
docs/architecture/normalized-runtime-event-v1.md
docs/adr/0005-normalized-runtime-event-v1.md
docs/spikes/pi-runtime-contract/README.md
packages/protocol/fixtures/normalized-runtime-event-v1.fixture.ts
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest-v2.json
```

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

- Issue #61 已由 PR #63 完成 Public Ruleset、required evidence 聚合与 post-merge provenance 闭环；
- **Issue #57** 已完成仓库级 `work-item lifecycle` 治理；
- **Issue #45** 是已完成的 SDK / RPC parity canonical execution Issue；
- Issue #44 保持 owner-input；Issue #56 等待 Issue #49 正式协议；
- 每个 primary PR 在 pre-merge 阶段验证 work item 对象类型、开放状态、分支编号、owner-input 来源与 supersedes 关系；
- 一个 execution Issue 最多一个 active branch 和一个开放 primary PR；
- `R2/R3` 要求当前最终 HEAD 绑定的独立 AI cold review，作者自审不能替代。

## Work Item 状态与顺序

当前正常 WIP 只有 Issue #49 / PR #66：

1. `NormalizedRuntimeEvent v1`、Pi Adapter、Fixture、Checker、ADR 与 Project State：完成；
2. 完整 checkout `npm run check` 与 Draft standalone workflows：完成；
3. 对最终完整 SHA 执行独立 R2 cold review：待完成；
4. APPROVED 后转 Ready，经 required `check` 与受保护 squash merge 进入 main；
5. Issue #56 从当时最新 main 创建合规分支，实现 append-only SQLite Observation Ledger；
6. 后续 Daemon / Worker Supervisor 只消费已合并协议与 Ledger。

Issue #56 的 pre-governance snapshot：

```text
branch feat/m0-sqlite-observation-ledger-v1
head   0da4e97e5cac42add96a55285976a93afd992495
```

该快照冻结、未审查、未交付，正式 Ledger 实现必须重新从最新 main 创建合规分支。

## 当前 M0 能力

已验证 Pi 源码、Artifact 与内部依赖闭包，SDK/RPC 公开面，Tool/Retry/Queue/Cancel/Compaction/Replacement 边界，以及 RPC Worker 协议错误恢复、EOF、SIGTERM、Restart / Resume、Preflight 拒绝和已接受 Provider Error。

正在交付：

- 正式 `NormalizedRuntimeEvent v1` 与 Pi 防腐层映射；当前仅待独立 R2 审查和 merge gate。

尚未交付：

- SQLite Observation Ledger；
- 真实 Daemon / Worker Supervisor 链路；
- Session list/show/replay 端到端闭环。

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

- 管理员仍可修改 Ruleset 与安全设置，漂移触发 R3 重评；
- 普通 Token 看不到管理员字段，不保存长期 PAT 降低凭证风险但增加读回延迟；
- external fork 只读 CI 仍执行不受信代码，same-repository `workflow_run`、无 Secret 与最小 Token 必须保持；
- Public 仓库源码、Issue、PR 历史和有意上传的脱敏 Artifact 公开可读，未脱敏失败结果不得上传；
- `NormalizedRuntimeEvent v1` 仍需最终 exact-HEAD 独立 R2 审查；
- 当前 Runtime Fixture 不覆盖 RPC Tool、Steering、Follow-up、Compaction / Replacement 命令、SIGKILL、OOM、Host 崩溃、Windows 信号差异或真实网络 Provider。
