# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: active
updated: 2026-08-13
-->

## 当前定位

知微处于 **M0：能观察**。AI-primary 自主开发运行模式为：

```text
public-free-ruleset
```

仓库当前为 **Public + GitHub Free**。Ruleset `20776157`处于 active；2026-08-13 **owner/admin live readback**确认无 bypass。正常写入只能经非默认分支、Pull Request、最新 base、GitHub Actions required `check`、线性历史和已解决 Review Thread进入 `main`。

唯一 required `check`是无 `needs`、无 checkout、仅 `actions: read`的早注册 observer。它只接受当前 `github.run_id + github.run_attempt`内 `CI required evidence`的成功结果；内部 evidence再聚合五个 CI Probe和三套路径相关 standalone Workflow。仅重跑失败 Job不能复用 prior-attempt evidence，安全恢复必须使用 **Re-run all jobs**。

仓库级 Actions只允许固定完整 SHA的 GitHub-owned Action；external fork运行需维护者批准，默认 Workflow Token为 read-only且不能批准 Pull Request。Secret scanning和 push protection已启用；validity checks因外部 credential issuer查询副作用保持禁用。

普通临时 `GITHUB_TOKEN`不能读取 Ruleset `bypass_actors`或 Repository `security_and_analysis`。这两类管理员字段使用版本化 owner/admin读回作为当前证据；仓库**不保存 PAT或其他长期管理员 Secret**。历史 `best-effort-private-free`记录只保留为连续性证据，不再描述当前保护能力。

## 当前 Runtime 证据

### 已完成并进入 main

- Pi `v0.84.1` Release、npm Artifact identity、SDK动态导入与无凭证 RPC空 Session；
- **Pi SDK / Extension**正常单 Tool生命周期与真实 `toolCallId`；
- 自动 Retry、Follow-up队列、流式取消、`abortRetry()`与 Retry exhaustion；
- 并行 Tool声明、真实完成顺序和 Tool Result Message顺序分离；
- Manual Compaction：原始 Entry、派生 Summary和当前模型 Context分层；
- Session Replacement：Shutdown、Invalidate、Rebind、Extension Start、Public Listener Attach与 `withSession()`边界；
- SDK / RPC同任务成功路径：Prompt接受、运行中State、最终Messages、`agent_settled`与两类关闭面；
- 发布 `RpcClient.stop()`实现层已观察一次被接受的SIGTERM请求，以及`exit(143) → close(143)`；原始JSONL stdin EOF路径仍为`exit(0) → close(0)`；
- PR #60已合并，SDK / RPC parity原能力squash commit为`e71f44fce5022a520a1cc3c081659cb7819cb77d`。

### Issue #32 / PR #64 候选交付

Issue #32 当前唯一 active branch为 `spike/32-rpc-worker-lifecycle`，唯一 primary PR为 #64。当前真实 Artifact 与 committed Fixture已经冻结：

- malformed JSON与unknown command后Worker继续可用；
- JSON字符串中的`U+2028` / `U+2029`不会被错误切分；
- Prompt success Response先于`agent_start`、运行中State和`agent_settled`；
- State为`isStreaming=false → true → false`、`messageCount=0 → 1 → 2`；
- stdin EOF后Extension `session_shutdown(reason=quit)`，Worker `exit(0) → close(0)`；
- 第二个真实Worker恢复相同Session稳定别名与先前Messages，再追加新Prompt；
- idle SIGTERM后Extension shutdown先持久化，再`exit(143) → close(143)`；
- Preflight拒绝只产生一次失败Response，不启动Agent Run；
- 已接受后的Provider Error只保留原success Response，后续失败由Assistant error Message、`agent_end(willRetry=false)`和`agent_settled`表达；
- 两次成功Artifact各只有一个74,588字节`result.json`，并逐字节一致。

当前 Worker Fixture身份：

```text
manifest                     packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest.json
loader                       packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture.mjs
source head                  c0d782ce074e770d39876600feef3554d0471756
workflow run                 31677138404
source artifact              9172023070
comparison artifact          9171976965
artifact result sha256       a3bffda1548cd0619b28d89f389edf8ca7a0cb797ffb3f035195d4d03bc65946
outer fingerprint            cea0a302391a2e072a7a1767b0ed0115458e49e228c3ee57607a8e58f8c114ba
capture fingerprint          a30add6e0834c3cdc52ea198997d3ccd7bc3bebfaced456e47891bfafdf17631
external Provider prompts    0
```

PR #64 尚未合并；当前状态是“证据与 Fixture已验证、交付门禁进行中”，不能提前声明 Issue #32 已完成。

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

该 verified来源继续由Fresh Capture、两个结果Checker、committed Fixture完整对象比较和live provenance Gate保护。PR #64增加的Worker Fixture不能降低或替换这套既有门禁。

## Runtime 合同连续性

后续协议必须保留：

- SDK、Extension、RPC与Host的`sourceSurface`；
- Prompt Request、Command Response、Agent Run、Turn、Message、Tool Call与稳定边界；
- RPC Request ID、Runtime Event与State / Messages Snapshot；
- Worker Instance、Runtime Session、Session File / Object与Replacement Generation；
- stdin EOF、Signal Request、Extension Shutdown、Exit和Close；
- Preflight拒绝与已接受后的执行失败；
- Retry计划、Queue状态、取消、Compaction派生Context与原始Observation。

禁止从最终Messages、Promise返回、Prompt success Response、Queue清空、Compaction Summary或Process退出码单独推断“任务成功完成”。

机器事实源：

```text
docs/architecture/pi-integration.md
docs/architecture/pi-rpc-worker-lifecycle.md
docs/spikes/pi-runtime-contract/README.md
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest.json
```

## committed Runtime 连续性锚点

这些句子由历史 Fixture Checker机械读取，记录已经进入 main 的 Runtime 事实；项目状态压缩不得删除。

- **自动重试恢复成功 Fixture**：公共 `agent_end.willRetry=[true,false]`；Extension没有 `auto_retry_start/end`，被替代失败Message仍从事件流持久化。
- **Follow-up队列 Fixture**：一个公共 Agent Run包含两个 Turn；Extension没有 `queue_update`；初始 `session.prompt()`会等到 Follow-up完成、Queue排空和Session idle后返回。
- 已验证用户取消、`abortRetry()`和 retry exhaustion；**取消、abortRetry与 Retry exhaustion Fixture**中，部分 Assistant消息以 `stopReason=aborted`保留，存在willRetry=true 但没有后续 Agent Run，Retry exhaustion最终保留最后一次失败 Assistant。
- **并行 Tool ordering Fixture**：完成顺序为 `beta → gamma → alpha`，消息顺序恢复为 `alpha → beta → gamma`。
- **Compaction 与 Session Replacement Fixture**：模型Context为 `compactionSummary → assistant`；Session对象为 `session-object-1 → session-object-2 → session-object-3`；旧 Public Listener不会自动迁移。验证 Compaction与 Session Replacement后，原始Entry、派生Summary、Session Object与Listener Rebind仍保持不同来源。
- **RPC真实 Prompt**：Command Response、Runtime Event、State / Messages、Extension Shutdown与Process Boundary分别保存。
- Main Provenance Dispatch可能遭遇 GitHub API瞬时故障；当前由即时dispatch与reconciler闭环，不能通过降低来源校验解决。

## Harness 与默认分支

- `developmentPause.active=false`，Issue #9 已关闭，事故审计历史继续保留；
- Issue #61 已由PR #63完成Public Ruleset、required evidence聚合与post-merge provenance闭环；
- Main Provenance由Autonomous Merge即时dispatch与完成后reconciler共同覆盖；无法证明merge来源或dispatch时必须按`after`登记持久Incident；
- Repository Hygiene持续读取Public visibility、merge设置、`main.protected`与Token可见Ruleset子集；管理员字段依赖新的owner/admin读回；
- Branch Cleanup与Repository Hygiene只按exact HEAD、开放PR、default/protected状态安全回收，不猜测删除来源不明分支；
- `R2/R3`要求当前最终HEAD绑定的独立AI cold review；
- owner-authored Issue保留为`owner-input`，一个execution Issue最多一个active branch和一个primary PR；
- Review、Fixture固化、修复、文档同步与最终化都在同一primary PR完成。

## Work Item 状态与顺序

当前正常WIP只有 Issue #32 / PR #64。严格依赖顺序：

1. **Issue #32 / PR #64**：完成当前最终HEAD CI、Fresh / committed完整比较、R3独立审查和合并；
2. **Issue #49**：从最新main创建`feat/49-normalized-runtime-event-v1`，消费全部真实Runtime Fixture冻结协议；
3. **Issue #56**：在#49后创建合规分支，实现append-only SQLite Observation Ledger；
4. 后续Daemon / Worker Supervisor：消费已冻结协议实现健康状态、崩溃检测与重连。

Issue #44《后台任务进度获取》继续作为owner-input开放；Runtime事件驱动证据是其底层输入，但不代表产品体验已经交付。

Issue #56的pre-governance snapshot：

```text
branch feat/m0-sqlite-observation-ledger-v1
head   0da4e97e5cac42add96a55285976a93afd992495
```

该分支是冻结、未审查、未交付代码快照。正式 Ledger实现仍需重新从最新 main创建合规分支，逐项审查是否复用，不直接合并旧快照。

## 当前 M0 能力

已验证：

- Pi源码与发布Artifact身份；
- SDK Root Exports、公开`RpcClient`必需方法子集与无凭证RPC空Session；
- Prompt、Agent Run、Turn、Tool、Retry、Queue、Cancel、Compaction和Session Replacement关键边界；
- SDK与RPC对同一任务的接受、运行中、最终消息、stable和关闭边界；
- RPC Worker协议错误恢复、EOF、SIGTERM、Restart / Resume、Preflight拒绝与已接受Provider Error；
- Tool完成顺序与消息持久化顺序分离；
- Compaction Summary不能覆盖原始Observation；
- Session Replacement后旧Listener不会自动迁移；
- 固定Artifact、隔离Probe、双层指纹、committed Fixture与Fresh完整对象比较。

尚未交付：

- PR #64对应的main交付与Issue #32关闭；
- 正式`NormalizedRuntimeEvent v1`；
- SQLite Observation Ledger Schema与实现；
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

这些锚点继续证明Main Provenance、Incident closure与自主交付链的历史连续性，不因项目状态压缩而删除。

## 已知风险

- 仓库管理员仍可修改或禁用Ruleset与安全设置；任何漂移触发R3重评；
- 普通Token看不到管理员字段，不保存长期PAT降低凭证风险，但增加读回延迟；
- Required Check名称或GitHub Actions App身份漂移会fail closed；修复不能增加bypass；
- external fork的只读CI仍执行不受信代码，same-repository `workflow_run`、无Secret与最小Token必须保持；
- Public仓库源码、Issue、PR历史与有意上传的脱敏Artifact公开可读，失败或未脱敏结果不得上传；
- Branch Cleanup的最终复核与`deleteRef`间存在极短可恢复竞态；
- Main Provenance sender与reconciler可能产生相同`after`的安全重复dispatch，Issue #15继续跟踪更强去重；
- Pi Runtime获取与执行目前同处联网容器，未来可拆为联网获取与断网执行；
- Issue #32 Fixture不覆盖RPC Tool、Steering、Follow-up、Compaction / Replacement命令、网络RPC、多人并发、SIGKILL、OOM、宿主崩溃或Windows信号差异，不能从当前证据外推；
- PR #64是R3 Workflow与Runtime交付，在最终HEAD独立审查完成前保持Draft。

## 产品能力状态

- Pi source-and-runtime baseline已验证到正常Tool、Retry、Follow-up、Cancel、并行Tool、Compaction、Session Replacement、SDK / RPC同任务和RPC Worker恢复 / 错误边界；
- owner-input与自主Work Item治理已建立；
- 真实Observation持久化、记忆、Context、Attention、后台委托与桌面端尚未进入产品实现；
- M0在PR #64合并后按#49 → #56继续，不提前把旧分支、候选PR或未审查代码声明为完成。
