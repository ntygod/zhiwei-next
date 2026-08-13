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

仓库当前为 Public + GitHub Free。Ruleset `20776157`已 active；2026-08-13 owner/admin live readback确认没有 bypass actor。服务端要求 `main`只能经最新 base上的 Pull Request、GitHub Actions `check`、线性历史与已解决 Review Thread进入，并且只允许 squash、禁止 force push和删除。正常写入仍必须使用非默认分支和 Pull Request；Main Provenance继续独立审计实际进入默认分支的来源。

仓库级 Actions只允许运行固定完整 SHA的 GitHub-owned Action；所有 external contributor的 fork运行都要求维护者批准，默认 Workflow Token为 read-only且不能批准 Pull Request。2026-08-13 owner/admin读回确认 Secret scanning和 push protection已启用；validity checks保持禁用，因为外部 credential issuer查询的副作用尚未纳入本次治理授权。

普通临时 `GITHUB_TOKEN`不能读取 Ruleset `bypass_actors`或 Repository `security_and_analysis`。这两类管理员字段以版本化 owner/admin读回作为当前证据；Repository Hygiene只持续核验 Token可读子集。仓库不保存 PAT或其他长期管理员 Secret，降低凭证暴露面的代价是管理员字段漂移要到新的 owner/admin读回或其他治理信号才会被发现。

## 最近完成

### Runtime 证据

- Pi `v0.84.1` Release Tag、npm Artifact identity、SDK动态导入和无凭证 RPC空 Session；
- Pi SDK / Extension正常单 Tool生命周期与真实 `toolCallId`关联；
- 自动 Retry恢复、Follow-up队列、流式取消、`abortRetry()`、Retry exhaustion；
- 并行 Tool声明、真实完成顺序和 Tool Result消息顺序分离；
- Manual Compaction：原始 Entry树、派生 Summary和当前模型上下文分层；
- Session Replacement：Shutdown、Invalidate、Rebind、Extension Start、Public Listener Attach和 `withSession()`边界；
- SDK / RPC同任务对照：发布 Artifact根导出 `runRpcMode`和 `RpcClient`，同一无工具 Prompt的核心事件投影、最终消息与正文一致；
- RPC真实 Prompt success Response是接受边界：wire index `4`，先于 `agent_start=5`、运行中 State Response `11`和 `agent_settled=35`，其后仍有29条 Runtime Event；
- 原始 RPC State变化为 `isStreaming=false → true → false`、`messageCount=0 → 1 → 2`；stdin EOF后 Extension `session_shutdown(reason=quit)`，Worker `exit=0 → close=0`；
- 发布 `RpcClient`在 Prompt前返回 `getMessages()=[]`，`prompt()`返回时可观察 `isStreaming=true / messageCount=1`，`agent_settled`后返回 `user → assistant`；
- 固定容器 verified Capture中，`RpcClient.stop()`的实现层 instrumentation真实观察到一次被接受的 `SIGTERM`请求、Extension Evidence在 Process Boundary前已落盘，以及 `exit(code=143, signal=null) → close(code=143, signal=null)`；请求列表没有 `SIGKILL`，但发布源码保留超时后的 `SIGKILL` fallback；
- 该关闭面和原始 JSONL宿主关闭 stdin EOF后的 `exit(0) → close(0)`必须分开；固定 Artifact、隔离 Probe、完整对象比较、两个精确 Checker和双层指纹是正式门禁。成功 Run `31639460875`已把 committed Fixture与 Artifact完整绑定；PR #60已合并，squash commit为 `e71f44fce5022a520a1cc3c081659cb7819cb77d`。

### Runtime 合同连续性

下面的精确结论继续作为 committed Fixture 与 Checker 的文档锚点：

- 自动重试恢复成功 Fixture：公共 `agent_end.willRetry=[true,false]`；Extension没有 `auto_retry_start/end`，被替代失败消息仍须从事件流持久化。
- Follow-up队列 Fixture：一个公共 Agent Run包含两个 Turn；Extension没有 `queue_update`；初始 `session.prompt()`会等到 Follow-up完成、队列排空和 Session idle 后返回。
- 下一层已验证用户取消、`abortRetry()`和 retry exhaustion。
- 取消、abortRetry与 Retry exhaustion Fixture：部分 Assistant消息以 `stopReason=aborted`保留；存在 willRetry=true 但没有后续 Agent Run；Retry exhaustion最终保留最后一次失败 Assistant。
- 并行 Tool ordering Fixture：完成顺序为 `beta → gamma → alpha`，消息顺序恢复为 `alpha → beta → gamma`。
- Compaction 与 Session Replacement Fixture：模型上下文变为 `compactionSummary → assistant`；Session对象按 `session-object-1 → session-object-2 → session-object-3`替换；旧 Public Listener不会自动迁移。
- 验证 Compaction与 Session Replacement 后，原始 Entry、派生 Summary、Session Object与 Listener Rebind仍保持不同来源。
- SDK / RPC parity Fixture：SDK Public与 RPC Runtime的语义投影均为 `agent_start → turn_start → user message → assistant message → turn_end → agent_end(willRetry=false) → agent_settled`；Command Response、State Snapshot、Extension和 Process Boundary仍分别保留来源。
- RPC JSONL `message_update`只保留 delta、不含累计 `partial`；SDK / Extension内部事件仍可能携带 `partial`，不能跨 Surface机械统一。
- 发布 `RpcClient`的 `prompt()` Promise和底层 Prompt Response同样只表达接受；Prompt前后 `get_messages`与运行中 State必须分别持久化。
- 本场景冻结的只是公开 `RpcClient`必需方法子集，不是全部公开 Surface；子集包含 `collectEvents`与 `getStderr`。动态原型枚举可见 TypeScript私有实现方法 `send`，但运行时可枚举不等同支持合同。
- 发布 `.d.ts`把 `process`声明为 `private`；Probe只用发布 JavaScript对应字段观测 `stop()`的 Signal请求与 Process Boundary，不把私有字段提升为公开 API或生产 Adapter依赖。
- 下一项 Runtime 证据为 Issue #32：RPC Worker异常退出、重启、Session恢复、非法 JSON、未知命令、Preflight拒绝和已接受后的 Provider Error。

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
final Assistant sha256       5604485dabc1a8b5d71db37611b23b7ddcc761238cd3621a309934d0fdf9c1f9
external Provider prompts    0
source state                 verified
capture head                 fe4aeb840fa3efed7d881679a78955af470896d9
capture workflow             31639460875
capture artifact             9158276952
capture artifact digest      sha256:0dbb2550690830b22d836fce9b48845ea4fd79c3661b05f5a73b9918c251429b
```

该 verified来源的固定容器 Fresh Capture、两个 Checker、committed Fixture校验与完整对象比较全部成功。Artifact ZIP只有一个 `122178`字节的 `result.json`；ZIP Digest、JSON SHA与 committed Fixture字节均已核对一致。

Manifest 是 Capture provenance 的机器事实源，并只允许两态：

- `candidate`：`head`为完整 Commit SHA，`workflowRun`、`artifactId`、`artifactDigest`全部为 `null`；只允许 Draft PR恢复，不满足 Ready或合并条件；
- `verified`：三项 provenance全部有效；非 Draft PR、`push main`、手动运行和定时 Gate强制 `--require-verified-source`，非 Draft PR再以 live provenance Checker绑定真实 Run / Artifact、证明来源 HEAD是当前 PR HEAD的真实祖先，并下载 ZIP确认其中唯一 `result.json`与 Manifest SHA及 committed Fixture完整字节相同。

SDK / RPC Workflow采用 fresh-first recovery：先在固定容器产生 Fresh Capture并通过两个脱敏 Checker，再验证 committed Fixture和完整对象相等性；只有合格 Fresh Evidence会上传，且其上传不受随后旧 Fixture漂移失败影响。PR运行显式 checkout并核对事件中的 head SHA，不使用默认 synthetic merge ref作为 Capture来源。旧 Fixture漂移因此会安全失败，但不会阻止下载本次合格 Evidence重建 candidate；未通过 Fresh Checker的失败 JSON不会冒充脱敏 Artifact。`jsonSha256`绑定解压后的规范 JSON字节；`artifactDigest`绑定 GitHub Actions `upload-artifact`生成的 ZIP Archive，二者不是同一摘要。

恢复 Packer对 Fresh JSON与解压输出使用同一个 8 MiB有界读取上限，以仓库绝对位置运行 Checker，并用 Fixture父目录排他锁、父目录 / Fixture目录身份句柄、内容寻址不可变分片、完整 staging回读与单 Manifest原子切换避免失败时混写活动 Fixture；目录替换、符号链接、非普通文件和并发 Packer均 fail closed。旧分片保留给已读取旧 Manifest的并发 Reader，显式 GC需先增加 Reader lease或版本保留协议；崩溃或目录身份异常残留锁需要先确认没有运行中的 Packer并检查 Fixture树后人工清理。

PR #60已完成 candidate收敛、真实 Artifact绑定、最终 HEAD的 R3独立审查和 verified来源 Gate，并已 squash合并。后续 Runtime工作必须继承其 Fresh / committed完整相等、双结果 Checker和来源 provenance边界，不能把历史 candidate状态重新描述为当前状态。

### Harness 与默认分支

- 渐进式 `AGENTS.md` 与 AI-primary Harness；
- Main Provenance、token-driven dispatch、Incident停机与恢复提案；
- 当前 `public-free-ruleset`模式、active Ruleset、Actions限制、Secret scanning / push protection与公开面审计；
- 2026-08-13 owner/admin字段版本化证据、临时 `GITHUB_TOKEN`持续读回子集和无长期管理员 PAT边界；
- 历史 `best-effort-private-free` 风险接受和两条 live provenance proof继续保留，但不再描述当前保护能力；
- Branch Cleanup按关闭 PR `head.sha`、开放 PR、默认分支、protection和当前 HEAD安全回收；
- `developmentPause.active=false`，Issue #9 已关闭且审计历史保留；
- Main Provenance Dispatch可能遭遇 GitHub API瞬时故障；失败必须可见并安全重跑，不能降低来源校验。

Issue #61是公开仓库治理前置：服务端设置已落地，当前 primary branch正在把 Ruleset、Actions、Secret scanning、fork / token边界与机器 Checker同步进仓库。#61合并并通过真实 post-merge回读前，Issue #32保持排队而不创建新的 Runtime primary branch。

### 历史连续性锚点

这些值是已经验证的自主交付链，不因后续项目状态压缩而删除：

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

### Work Item 生命周期治理

Issue #57 和 PR #59 建立 work-item lifecycle：

- 所有者直接创建的 Issue视为 `owner-input`，原始正文不改写、不因未排期关闭、不接收无关诊断；
- GitHub Issue 与 PR共用编号，任何自动写入前验证对象类型、标题、work item和必要的 HEAD；
- 一个 execution Issue最多一个 active branch和一个 primary PR；
- 分支必须包含 Issue编号；
- Review、Finalize和Integrate在同一 primary PR完成；
- 禁止 retirement、no-op、capability-test、integrator、finalizer和reviewer PR；
- PR CI 在 **pre-merge** 阶段实时验证 `work-item`、`owner-input` 和 `supersedes-pr` 的 GitHub对象类型；
- Repository Hygiene审计 WIP、对象类型和孤立 helper，并只按 exact-head reconciliation allowlist删除 legacy helper branch。

当前收敛结果：

- Issue #44《后台任务进度获取》保留为所有者产品输入，并完成事件驱动进度订阅的 triage；
- Issue #45 已由唯一 primary PR #60完成 SDK / RPC同任务对照；旧 PR #33只保留为未合并历史种子；
- Issue #31、#37 已作为 #45 的 duplicate关闭；
- Issue #61 是因仓库转为 Public触发的当前 R3治理前置；
- Issue #32 是 #61合并后立即恢复的下一项 canonical Runtime execution work item；
- Issue #49 等待 #32 后冻结 `NormalizedRuntimeEvent v1`；
- Issue #56 等待 #49 后实现 SQLite Observation Ledger；
- PR #33、#34 未完成 Draft已明确未交付并关闭；
- PR #48、#54、#55 retirement PR已关闭；
- 误创建的 no-op Issue #58 已标记 invalid并关闭，保留为真实仓库 capability-test反例。

机器事实源：

```text
docs/harness/work-item-lifecycle.md
scripts/work-item-policy.mjs
scripts/check-work-item-governance.mjs
.github/workflows/repository-hygiene.yml
docs/harness/reconciliation/2026-08-12-work-item-cleanup.json
```

## 当前治理能力

- GitHub Connector内容写入前创建并显式指定非默认分支；
- 普通变更通过 canonical Issue、包含编号的 branch、唯一 primary PR、CI和 squash merge进入 `main`；
- active默认分支 Ruleset在服务端要求 Pull Request、GitHub Actions `check`、最新 base、线性历史和 Review Thread解决；2026-08-13 owner/admin读回记录 `bypass_actors=[]`，仓库 merge设置也只允许 squash；
- Actions限制为固定 SHA的 GitHub-owned Action，external fork运行需批准，默认 Token为 read-only且不能批准 PR；
- Autonomous Merge与 Main Provenance Dispatch的 `workflow_run`写权限路径同时检查 same-repository source，实时 PR对象还会再次核对 `head.repo`；
- 2026-08-13 owner/admin读回记录 Secret scanning和 push protection已启用；validity checks因 issuer外部查询副作用保持禁用并记录原因；
- `R2/R3`要求绑定当前 HEAD的 cold-read AI审查；
- PR合同包含 `work-item`、`pr-role`、`owner-input`、`supersedes-pr`和既有风险字段；
- PR Checker从 GitHub Event Payload读取 title、branch和PR number；
- pre-merge PR CI通过只读 GitHub API确认 work-item是开放Issue、owner-input由仓库所有者创建、supersedes-pr是真实PR；
- Repository Hygiene在可信默认分支上下文中再次验证 Issue / PR对象类型；
- 外部 direct push由 Main Provenance的 `push`路径审计；
- `GITHUB_TOKEN`自动合并由 Dispatch / Receiver路径审计；
- 未验证 main更新创建 R3 Incident并阻断普通自动合并；
- Branch Cleanup处理关闭 PR分支；Repository Hygiene处理 exact-head legacy helper和仓库级WIP漂移；
- Repository Hygiene使用临时 `GITHUB_TOKEN`持续回读 Public visibility、merge methods、`main.protected`以及可见的 Ruleset身份、enforcement、条件与规则参数；它不声称在线验证 `bypass_actors`或 `security_and_analysis`。Main Provenance继续作为服务端 pre-receive规则之后的来源审计与恢复层。

## 当前 M0能力

已验证：

- Pi源码契约与发布 Artifact身份；
- SDK Root Exports、`runRpcMode`、公开 `RpcClient`必需方法子集（包含 `collectEvents`、`getStderr`）和无凭证 RPC空 Session；
- Prompt、Agent Run、Turn、Tool、Retry、Queue、Cancel、Compaction和Session Replacement关键边界；
- SDK与 RPC对同一无工具任务的 Prompt接受、运行中、最终消息、稳定和关闭边界；
- 发布 `RpcClient`的 Prompt前空消息、接受时运行中 State和完成后 `user → assistant`消息；
- Public SDK、Extension、RPC Command Response、RPC Runtime Event、State Snapshot、stdin EOF、Host `RpcClient.stop()`调用和 Process Boundary的来源差异；实际 ChildProcess Signal请求与 `exit(143) → close(143)`已有固定容器 verified Evidence；
- Tool真实完成顺序与消息持久化顺序不能合并；
- 被 Retry替代或取消的证据不能只从最终 `session.messages`重建；
- Compaction Summary不能覆盖原始 Session Entry或未来 Observation；
- Session Replacement后旧 Listener不会自动迁移；
- Runtime Fixture、隔离 Probe、Harness、架构边界和基础测试由 CI持续检查。

尚未冻结：

- RPC Worker异常退出、重启、Session恢复和协议 / Provider错误边界；
- 正式 `NormalizedRuntimeEvent v1`；
- SQLite Observation Ledger Schema与实现。

## 当前队列与顺序

严格按依赖推进：

1. **Issue #61**：完成 Public + Free Ruleset、Actions、Secret scanning、fork / Token边界和机器事实源的 R3治理闭环；
2. **Issue #32**：#61合并后从最新 `main`创建 `spike/32-rpc-worker-lifecycle`，验证异常 EOF / 退出、重启、Session恢复和错误边界；
3. **Issue #49**：创建 `feat/49-normalized-runtime-event-v1`，消费全部真实Fixture冻结协议；
4. **Issue #56**：创建 `feat/56-sqlite-observation-ledger-v1`，实现append-only SQLite Ledger。

Issue #56已有 pre-governance snapshot：

```text
branch feat/m0-sqlite-observation-ledger-v1
head   0da4e97e5cac42add96a55285976a93afd992495
```

该分支是冻结、未审查、未交付的代码快照，不是完成结果。解锁后从最新 main创建符合新规则的 #56分支，逐项审查是否复用，不直接合并旧快照。

Issue #44 是跨 M0 Runtime、未来 Delegation和桌面体验的 owner-input；#45只提供底层事件驱动证据，不代表后台任务进度体验已经交付。

## 已知风险

- 仓库管理员仍可修改、禁用或删除 Ruleset以及仓库安全设置；Repository Hygiene持续暴露删除和 Token可读漂移，管理员字段则依赖新的 owner/admin读回或其他治理信号，任何审计都不能让管理员权限变成不可变；
- 普通 `GITHUB_TOKEN`看不到 bypass actors与 security-and-analysis管理员字段；不保存长期管理员 PAT降低凭证风险，但这些字段的漂移只能靠 revisit trigger后的 owner/admin读回或其他治理信号发现；
- Required Check名称或 GitHub Actions App身份漂移会 fail closed并阻塞全部合并；修复必须走 R3治理，不能增加 bypass；
- Public仓库的源码、Issue、PR历史和有意上传的脱敏 Artifact公开可读；公开面审计观察到610条历史 Actions artifact记录，但没有逐字节审计历史 Artifact，现行 Workflow仍必须在上传前脱敏并使用明确的短保留期；
- 旧 Probe Workflow的 `if: always()`已移除；Capture或脱敏 Checker失败时不再上传 failure JSON，不能把失败诊断冒充公开 Evidence；
- Secret scanning与 push protection降低误提交风险但不能替代禁止真实记忆、凭证、生产数据和私有仓库内容进入 Commit或 Artifact；validity checks仍未启用；
- External fork的只读 CI仍执行不受信任代码；same-repository `workflow_run`门禁、无 Secret和最小 Token必须保持，不能依赖运行批准本身建立信任；
- Branch Cleanup与Repository Hygiene的 `deleteRef`没有原子 compare-and-delete，最终复核和删除间有极短可恢复竞态；
- Repository Hygiene只删除 exact-head allowlist或合规 helper，不猜测删除来源不明分支；
- 独立 AI审查仍使用同一仓库身份下的 cold-read评论协议，尚无独立Reviewer Bot；
- 同一最终 HEAD多次成功 CI可能产生重复但幂等 provenance dispatch，Issue #15跟踪；
- Pi Runtime获取与执行目前位于同一联网容器；未来可拆为联网获取和断网执行；
- RPC成功路径、正常 EOF与 `RpcClient.stop()`实现层 SIGTERM / `exit(143) → close(143)`已有固定容器 verified Evidence。发布源码中的 `SIGKILL` fallback、Restart / Resume / Error仍必须按各自场景保留来源，其中 Worker恢复与错误语义由 #32独立冻结，不能从当前成功 Fixture外推；
- 在仓库转回 Private、方案或默认分支变化、Ruleset / Secret scanning漂移、管理员字段相关变更后读回证据未刷新、提议引入长期管理员 PAT、真实用户记忆、生产凭证、多人写入、生产发布或 active Ruleset下仍出现未经授权的 direct-main更新时，必须重新评估风险接受。

## 产品能力状态

- Pi source-and-runtime baseline已验证到正常Tool、Retry、Follow-up、Cancel、并行Tool、Compaction、Session Replacement和 SDK / RPC同任务对照；
- owner-input与自主开发Work Item治理已建立；
- 真实Observation持久化、记忆、Context、Attention、后台委托和桌面端尚未进入产品实现；
- M0继续以 #32 → #49 → #56 的依赖链推进，不提前把旧分支或未审查代码声明为完成。
