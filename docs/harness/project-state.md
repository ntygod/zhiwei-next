# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: active
updated: 2026-08-12
-->

## 当前定位

知微处于 **M0：能观察**。AI-primary 自主开发运行模式为：

```text
best-effort-private-free
```

仓库保持 Private + GitHub Free。所有者已接受缺少服务端 pre-receive 默认分支硬保护的残余风险；正常写入仍必须使用非默认分支和 Pull Request。

## 最近完成

### Runtime 证据

- Pi `v0.84.1` Release Tag、npm Artifact identity、SDK动态导入和无凭证 RPC空 Session；
- Pi SDK / Extension正常单 Tool生命周期与真实 `toolCallId`关联；
- 自动 Retry恢复、Follow-up队列、流式取消、`abortRetry()`、Retry exhaustion；
- 并行 Tool声明、真实完成顺序和 Tool Result消息顺序分离；
- Manual Compaction：原始 Entry树、派生 Summary和当前模型上下文分层；
- Session Replacement：Shutdown、Invalidate、Rebind、Extension Start、Public Listener Attach和 `withSession()`边界；
- SDK / RPC同任务对照：发布 Artifact根导出 `runRpcMode`和 `RpcClient`，同一无工具 Prompt的核心事件投影、最终消息与正文一致；
- RPC Prompt success Response是接受边界：wire index `4`，先于 `agent_start=5`、运行中 State Response `11`和 `agent_settled=35`，其后仍有29条 Runtime Event；
- RPC State真实变化为 `isStreaming=false → true → false`、`messageCount=0 → 1 → 2`；stdin EOF后 Extension `session_shutdown(reason=quit)`，Worker `exit=0 → close=0`；
- 以上 Fixture由固定 Artifact、隔离 Probe、精确 Checker和双层指纹持续验证。

### Runtime 合同连续性

下面的精确结论继续作为 committed Fixture 与 Checker 的文档锚点：

- 自动重试恢复成功 Fixture：公共 `agent_end.willRetry=[true,false]`；Extension没有 `auto_retry_start/end`，被替代失败消息仍须从事件流持久化。
- Follow-up队列 Fixture：一个公共 Agent Run包含两个 Turn；Extension没有 `queue_update`；初始 `session.prompt()`会等到 Follow-up完成、队列排空和 Session idle 后返回。
- 下一层已验证用户取消、`abortRetry()`和 retry exhaustion。
- 取消、abortRetry与 Retry exhaustion Fixture：部分 Assistant消息以 `stopReason=aborted`保留；存在 willRetry=true 但没有后续 Agent Run；Retry exhaustion最终保留最后一次失败 Assistant。
- 并行 Tool ordering Fixture：完成顺序为 `beta → gamma → alpha`，消息顺序恢复为 `alpha → beta → gamma`。
- 验证 Compaction与 Session Replacement后形成 Compaction 与 Session Replacement Fixture：模型上下文变为 `compactionSummary → assistant`；Session对象按 `session-object-1 → session-object-2 → session-object-3`替换；旧 Public Listener不会自动迁移。
- SDK / RPC parity Fixture：SDK Public与 RPC Runtime的语义投影均为 `agent_start → turn_start → user message → assistant message → turn_end → agent_end(willRetry=false) → agent_settled`；Command Response、State Snapshot、Extension和 Process Boundary仍分别保留来源。
- RPC JSONL `message_update`只保留 delta、不含累计 `partial`；SDK / Extension内部事件仍可能携带 `partial`，不能跨 Surface机械统一。
- 下一项 Runtime 证据为 Issue #32：RPC Worker EOF、退出、重启、Session恢复、非法 JSON、未知命令、Preflight拒绝和已接受后的 Provider Error。

SDK / RPC parity committed Fixture：

```text
manifest                     packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json
outer fingerprint            6af9788dc9a2cf2326cbc6dbd9914d90b5ffb50687761fb652404631367f8e92
capture fingerprint          d8b42a078a8655e840fc8ef5029ac0997f3f33f00168f84cb7a3cfcc92b1a0ac
final Assistant sha256       5604485dabc1a8b5d71db37611b23b7ddcc761238cd3621a309934d0fdf9c1f9
external Provider prompts    0
```

### Harness 与默认分支

- 渐进式 `AGENTS.md` 与 AI-primary Harness；
- Main Provenance、token-driven dispatch、Incident停机与恢复提案；
- `best-effort-private-free` 风险接受和两条 live provenance proof；
- Branch Cleanup按关闭 PR `head.sha`、开放 PR、默认分支、protection和当前 HEAD安全回收；
- `developmentPause.active=false`，Issue #9 已关闭且审计历史保留；
- Main Provenance Dispatch可能遭遇 GitHub API瞬时故障；失败必须可见并安全重跑，不能降低来源校验。

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
- Issue #45 由唯一 primary PR #60完成 SDK / RPC同任务对照；旧 PR #33只保留为未合并历史种子；
- Issue #31、#37 已作为 #45 的 duplicate关闭；
- Issue #32 是当前下一项 canonical execution work item；
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
- `R2/R3`要求绑定当前 HEAD的 cold-read AI审查；
- PR合同包含 `work-item`、`pr-role`、`owner-input`、`supersedes-pr`和既有风险字段；
- PR Checker从 GitHub Event Payload读取 title、branch和PR number；
- pre-merge PR CI通过只读 GitHub API确认 work-item是开放Issue、owner-input由仓库所有者创建、supersedes-pr是真实PR；
- Repository Hygiene在可信默认分支上下文中再次验证 Issue / PR对象类型；
- 外部 direct push由 Main Provenance的 `push`路径审计；
- `GITHUB_TOKEN`自动合并由 Dispatch / Receiver路径审计；
- 未验证 main更新创建 R3 Incident并阻断普通自动合并；
- Branch Cleanup处理关闭 PR分支；Repository Hygiene处理 exact-head legacy helper和仓库级WIP漂移；
- 当前模式是 post-push检测与恢复提案，不是服务端硬保护。

## 当前 M0能力

已验证：

- Pi源码契约与发布 Artifact身份；
- SDK Root Exports、`runRpcMode`、`RpcClient`和无凭证 RPC空 Session；
- Prompt、Agent Run、Turn、Tool、Retry、Queue、Cancel、Compaction和Session Replacement关键边界；
- SDK与 RPC对同一无工具任务的 Prompt接受、运行中、最终消息、稳定和关闭边界；
- Public SDK、Extension、RPC Command Response、RPC Runtime Event、State Snapshot和 Process Boundary的来源差异；
- Tool真实完成顺序与消息持久化顺序不能合并；
- 被 Retry替代或取消的证据不能只从最终 `session.messages`重建；
- Compaction Summary不能覆盖原始 Session Entry或未来 Observation；
- Session Replacement后旧 Listener不会自动迁移；
- Runtime Fixture、隔离 Probe、Harness、架构边界和基础测试由 CI持续检查。

尚未冻结：

- RPC Worker重启、Session恢复和协议 / Provider错误边界；
- 正式 `NormalizedRuntimeEvent v1`；
- SQLite Observation Ledger Schema与实现。

## 当前队列与顺序

严格按依赖推进：

1. **Issue #32**：创建 `spike/32-rpc-worker-lifecycle`，验证EOF、退出、重启、Session恢复和错误边界；
2. **Issue #49**：创建 `feat/49-normalized-runtime-event-v1`，消费全部真实Fixture冻结协议；
3. **Issue #56**：创建 `feat/56-sqlite-observation-ledger-v1`，实现append-only SQLite Ledger。

Issue #56已有 pre-governance snapshot：

```text
branch feat/m0-sqlite-observation-ledger-v1
head   0da4e97e5cac42add96a55285976a93afd992495
```

该分支是冻结、未审查、未交付的代码快照，不是完成结果。解锁后从最新 main创建符合新规则的 #56分支，逐项审查是否复用，不直接合并旧快照。

Issue #44 是跨 M0 Runtime、未来 Delegation和桌面体验的 owner-input；#45只提供底层事件驱动证据，不代表后台任务进度体验已经交付。

## 已知风险

- GitHub当前方案无法从服务端事前阻止 direct-main写入；
- 具有 `contents: write` 的主体仍可能先产生 Commit，再被检测；
- 仓库内 Workflow不能抵御同一 direct Commit同时篡改检测逻辑的最坏情况；
- Branch Cleanup与Repository Hygiene的 `deleteRef`没有原子 compare-and-delete，最终复核和删除间有极短可恢复竞态；
- Repository Hygiene只删除 exact-head allowlist或合规 helper，不猜测删除来源不明分支；
- 独立 AI审查仍使用同一仓库身份下的 cold-read评论协议，尚无独立Reviewer Bot；
- 同一最终 HEAD多次成功 CI可能产生重复但幂等 provenance dispatch，Issue #15跟踪；
- Pi Runtime获取与执行目前位于同一联网容器；未来可拆为联网获取和断网执行；
- RPC成功路径已经验证，但 Restart / Resume / Error仍必须由 #32独立冻结，不能从当前 Fixture外推；
- 在真实用户记忆、生产凭证、多人写入、生产发布或第二次 direct-main Incident出现时，必须重新评估风险接受。

## 产品能力状态

- Pi source-and-runtime baseline已验证到正常Tool、Retry、Follow-up、Cancel、并行Tool、Compaction、Session Replacement和 SDK / RPC同任务对照；
- owner-input与自主开发Work Item治理已建立；
- 真实Observation持久化、记忆、Context、Attention、后台委托和桌面端尚未进入产品实现；
- M0继续以 #32 → #49 → #56 的依赖链推进，不提前把旧分支或未审查代码声明为完成。
