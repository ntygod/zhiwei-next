# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: active
updated: 2026-08-15
-->

## 当前定位

知微处于 **M0：能观察**，AI-primary自主开发模式为：

```text
public-free-ruleset
```

仓库为 **Public + GitHub Free**。Ruleset `20776157`处于active；2026-08-13的owner/admin live readback确认没有bypass。正常写入只能经非默认分支、Pull Request、最新base、GitHub Actions required `check`、线性历史和已解决Review Thread进入`main`。

唯一required `check`是无`needs`、无checkout、仅`actions: read`的observer。它只接受当前`github.run_id + github.run_attempt`内的`CI required evidence`。普通临时 `GITHUB_TOKEN`不能读取管理员字段，包括`bypass_actors`与`security_and_analysis`；仓库不保存 PAT或其他长期管理员 Secret。历史 `best-effort-private-free` 记录只作为连续性证据。

`developmentPause.active=false`，Issue #9 已关闭。

## 已进入 main 的 Runtime 基线

- Pi `v0.84.1` Release、npm Artifact identity、精确published shrinkwrap依赖闭包、SDK动态导入与无凭证RPC空Session；
- Pi SDK / Extension正常Tool、自动Retry、Follow-up队列、取消、Retry exhaustion、并行Tool、Compaction和Session Replacement；
- SDK / RPC同任务的Prompt接受、运行中State、最终Messages、`agent_settled`与关闭边界；
- `RpcClient.stop()`的SIGTERM请求及`exit(143) → close(143)`；原始JSONL stdin EOF为`exit(0) → close(0)`；
- PR #60已合并，SDK / RPC parity squash commit为`e71f44fce5022a520a1cc3c081659cb7819cb77d`；
- Issue #32已由PR #64完成，exact-head R3、Ready live provenance、required `check`与Main Provenance均成功；squash commit为`374a27505c4a150cbcb63c1b8f6c1afb3bfb4448`。

### Issue #32 冻结的 RPC Worker 合同

- malformed JSON和unknown command后Worker继续可用；
- stdout使用strict byte LF reader，拒绝空record、CRLF、非法UTF-8和未LF终止尾片；
- Prompt success Response只代表接受，不表示Agent Run完成；
- Worker输出/Process与Host `clientActions`使用不同连续序列，`crossDomainTotalOrder=false`；
- stdin EOF、Extension Shutdown、exit与close分别保存；
- 第二个真实Worker恢复相同Runtime Session与先前Messages；
- Preflight拒绝不启动Agent Run；已接受Provider Error由Assistant error、`agent_end(willRetry=false)`和`agent_settled`表达；
- Provider Error竞态State只有在完整running/settled对象与真实顺序验证成功后才从稳定Fixture排除；
- SDK/RPC与Worker Fresh Capture、committed Fixture和完整对象比较保持连续。

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

历史schema v1 Manifest、内容寻址Part和Base Loader只保留为不可变输入，不表示当前协议。

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
capture head                 32287c7d33482ca58bd65b46438f3cc8552a3df3
capture workflow             31781721009
capture artifact             9211959728
capture artifact digest      sha256:01c7a87fe73ac05c5ea295ddddd51809b294a502072c61e97819d77589565cc7
external Provider prompts    0
```

该verified来源属于PR #64，来源HEAD是当前main交付的祖先；Ready live provenance已在最终PR #64 exact HEAD实际成功。

## 当前 WIP：Issue #49 / PR #66

唯一active branch为：

```text
feat/49-normalized-runtime-event-v1
```

唯一primary PR为#66，当前保持Draft。分支从最新`main@374a27505c4a150cbcb63c1b8f6c1afb3bfb4448`创建；首个协议提交为`88e6ce7805a7d0bad4b4f640b7e565f8c1fb3088`。

候选`NormalizedRuntimeEvent v1`当前冻结：

- Workspace、Runtime Session、Runtime Instance与Source Surface分离；
- 顺序只在声明的source stream内单调，不存在`globalSequence`；
- `eventId`标识来源位置，`idempotencyKey`还包含canonical semantic body；
- Prompt Response使用`preflight-result`，不表示Agent或任务完成；
- Command Response、Agent/Turn/Message/Tool、Queue、Retry、Compaction、Session identity、Snapshot、Host Action和Process Boundary分型；
- stdin EOF与Signal Request是Host Action，Extension Shutdown、exit和close是观测到的Process/Extension边界；
- Correlation只保留边界显式注入或实际观测的ID，不生成随机关联；
- Tool completion显式引用同Runtime Session的declaration；Parallel Tool不借用数组顺序；
- Compaction completion保留`sourceEventIds`与`replacesEventIds`，不覆盖原始事实；
- `zhiwei-json-v1`拒绝accessor、exotic prototype、稀疏Array、alias/cycle、Symbol、非有限数字和`-0`；
- Unknown Event只保留source type、排序字段名和canonical payload SHA-256，不透传Raw Pi对象；
- `NormalizedRuntimeEvent`、Cognition Observation与SQLite row/revision保持三层分离。

Contract Fixture引用Issue #32 merge commit，覆盖四个Source Surface、Prompt acceptance、Tool/Compaction lineage、Retry exhaustion、Session Replacement、Host EOF/Signal、Extension Shutdown、Process exit/close和unknown vocabulary。

当前Draft尚未完成全仓CI、作者最终自审或当前最终HEAD绑定的独立R2 cold review；不得被Issue #56消费。

## Runtime 合同连续性

后续协议和Ledger必须保留：

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
docs/architecture/normalized-runtime-event-v1.md
docs/adr/0005-normalized-runtime-event-v1.md
docs/spikes/pi-runtime-contract/README.md
packages/protocol/fixtures/normalized-runtime-event-v1.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest-v2.json
```

## committed Runtime 连续性锚点

以下句子由历史Checker机械读取，项目状态压缩不得删除：

- **自动重试恢复成功 Fixture**：公共`agent_end.willRetry=[true,false]`；Extension没有 `auto_retry_start/end`，失败Message仍从事件流持久化。
- **Follow-up队列 Fixture**：一个公共 Agent Run包含两个 Turn；Extension没有 `queue_update`；初始 `session.prompt()`会等到 Follow-up完成、Queue排空和Session idle后返回。
- 已验证用户取消、`abortRetry()`和 retry exhaustion；**取消、abortRetry与 Retry exhaustion Fixture**中，部分 Assistant消息以 `stopReason=aborted`保留，存在willRetry=true 但没有后续 Agent Run，Retry exhaustion最终保留最后一次失败 Assistant。
- **并行 Tool ordering Fixture**：完成顺序为 `beta → gamma → alpha`，消息顺序恢复为 `alpha → beta → gamma`。
- **Compaction 与 Session Replacement Fixture**：模型Context为`compactionSummary → assistant`；Session对象为`session-object-1 → session-object-2 → session-object-3`；旧 Public Listener不会自动迁移。验证 Compaction与 Session Replacement后，原始Entry、派生Summary、Session Object与Listener Rebind仍保持不同来源。
- **RPC真实 Prompt**：Command Response、Runtime Event、State / Messages、Extension Shutdown与Process Boundary分别保存。
- Main Provenance Dispatch可能遭遇 GitHub API瞬时故障；当前由即时dispatch与reconciler闭环，不能通过降低来源校验解决。

## Harness 与 Work Item治理

- Issue #61已由PR #63完成Public Ruleset、required evidence聚合与post-merge provenance闭环；
- **Issue #57** 已完成仓库级`work-item lifecycle`治理；
- **Issue #45** 是已完成的SDK / RPC parity canonical execution Issue；
- Issue #44保持owner-input；Issue #56等待Issue #49正式协议；
- 每个primary PR在pre-merge阶段执行work-item lifecycle对象校验，并验证开放状态、分支编号、owner-input来源与supersedes关系；
- 一个execution Issue最多一个active branch和一个开放primary PR；
- `R2/R3`要求当前最终HEAD绑定的独立AI cold review，作者自审不能替代。

## Work Item 状态与顺序

当前正常WIP只有Issue #49 / PR #66：

1. 完成`NormalizedRuntimeEvent v1`、Pi Adapter、Fixture、Checker、ADR与Project State；
2. 在完整Checkout运行`npm run check`并修复全部回归；
3. 对最终完整SHA执行独立R2 cold review；
4. APPROVED后转Ready，经required `check`与受保护squash merge进入main；
5. Issue #56从当时最新main创建合规分支，实现append-only SQLite Observation Ledger；
6. 后续Daemon / Worker Supervisor只消费已合并协议与Ledger。

Issue #56的pre-governance snapshot：

```text
branch feat/m0-sqlite-observation-ledger-v1
head   0da4e97e5cac42add96a55285976a93afd992495
```

该快照冻结、未审查、未交付，正式Ledger实现必须重新从最新main创建合规分支。

## 当前 M0 能力

已验证Pi源码、Artifact与内部依赖闭包，SDK/RPC公开面，Tool/Retry/Queue/Cancel/Compaction/Replacement边界，以及RPC Worker协议错误恢复、EOF、SIGTERM、Restart / Resume、Preflight拒绝和已接受Provider Error。

正在交付：

- 正式`NormalizedRuntimeEvent v1`与Pi防腐层映射。

尚未交付：

- SQLite Observation Ledger；
- 真实Daemon / Worker Supervisor链路；
- Session list/show/replay端到端闭环。

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
- external fork只读CI仍执行不受信代码，same-repository`workflow_run`、无Secret与最小Token必须保持；
- Public仓库源码、Issue、PR历史和有意上传的脱敏Artifact公开可读，未脱敏失败结果不得上传；
- `NormalizedRuntimeEvent v1`仍需完整仓库CI与独立R2审查；
- 当前Runtime Fixture不覆盖RPC Tool、Steering、Follow-up、Compaction / Replacement命令、SIGKILL、OOM、Host崩溃、Windows信号差异或真实网络Provider。
