# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: active
updated: 2026-08-12
-->

## 当前定位

知微处于 **M0：能观察**。AI-primary自主开发运行模式为：

```text
best-effort-private-free
```

仓库保持 Private + GitHub Free。所有者已经接受当前方案缺少服务端 pre-receive默认分支硬保护的残余风险；正常写入仍必须使用非默认分支和 Pull Request。

## 最近完成

- 新仓库初始化、产品蓝图、UI方向和模块化骨架；
- 渐进式 `AGENTS.md`与 AI-primary Harness；
- Pi `v0.84.1` Release Tag源码基线；
- npm Artifact的 Tarball digest、manifest、SDK动态导入和无凭证 RPC空 Session验证；
- Pi SDK / Extension无凭证正常单 Tool生命周期 Fixture；
- SDK、Extension和 Tool `execute()`使用同一真实 `toolCallId`，并将 Inline Extension未收到 `session_start`固化为负证据；
- 自动重试恢复成功 Fixture：首次 `overloaded_error`后第二次 Run成功，公共 `agent_end.willRetry=[true,false]`，最终单次 `agent_settled`；
- 确认 Extension没有 `auto_retry_start/end`或 `willRetry`增强，且最终 `session.messages`不能重建被替代失败 Run；
- Follow-up队列 Fixture：公共队列先非空后清空，一个公共 Agent Run包含两个 Turn，最终仍只有一次 `agent_end`和一次 `agent_settled`；
- 确认 Extension没有 `queue_update`，且队列清空早于 Follow-up用户消息进入事件流，不能把空队列当作 Prompt完成；
- 取消、abortRetry与 Retry exhaustion Fixture：用户取消、`abortRetry()`和 retry exhaustion三条路径均由固定 Pi Artifact动态验证；
- 部分 Assistant消息以 `stopReason=aborted`保留，`session.abort()`与原始 Prompt都 resolve，最终仍有单次 `agent_settled`；
- `agent_end(willRetry=true)`可在 Backoff期间被 `abortRetry()`终止，形成 **willRetry=true 但没有后续 Agent Run** 的真实边界；
- Retry exhaustion最终保留最后一次失败 Assistant，前两次失败只存在于事件流，Prompt Promise仍 resolve；
- 再次确认 Extension没有 `auto_retry_start/end`或 `willRetry`增强，不能独立重建 Session层 Cancel / Retry语义；
- 并行 Tool ordering Fixture：三个调用全部开始后，真实完成顺序为 `beta → gamma → alpha`，Public `tool_execution_end`与 Extension `tool_result`保持该顺序；
- Tool Result消息、`turn_end.toolResults`和最终 Session消息顺序恢复为 `alpha → beta → gamma`，证明完成顺序与消息顺序必须分开持久化；
- 三个并行 Tool全程使用真实 `toolCallId`关联，没有文件、Shell、网络或外部写副作用，最终仍为单次 `agent_settled`；
- Compaction 与 Session Replacement Fixture：Manual Compaction、New Session与 Resume原 Session均由固定 Pi Artifact动态验证；
- 已完成验证 Compaction与 Session Replacement；压缩与替换边界已进入机器契约。
- Compaction后当前上下文为 `compactionSummary → assistant`，原始 Message Entry仍完整保留并追加 Compaction Entry；
- Session Object变化为 `session-object-1 → session-object-2 → session-object-3`，Session File变化为 `session-file-1 → session-file-2 → session-file-1`；
- 旧 Public Listener不会自动迁移；Extension绑定、Public Listener与 Session身份必须在 Replacement后显式 Rebind；
- Branch Cleanup Harness已通过 PR #19进入默认分支并持续回收关闭 PR工作分支；
- Issue #9完整记录两次 direct-main误写和恢复；PR #10–#14建立并验证 Main Provenance、风险接受、事故停机与恢复链；
- `developmentPause.active=false`，Issue #9 已关闭；事故、风险接受和两条 provenance proof永久保留。

## 已验证的自主交付闭环

### PR #12

```text
final CI                 31498003965   success
Autonomous Merge         31498045898   success
Main Provenance Dispatch 31498045864   success
Main Provenance receiver 31498068302   success
merge commit             c05eba9f840c82d7b61494ae6bb06833d140d6c0
```

### PR #13

```text
final CI                 31499190699   success
Autonomous Merge         31499233718   success
Main Provenance Dispatch 31499233680   success
Main Provenance receiver 31499253092   success
merge commit             10c963ef8bee978543dccf73047d3bd2d18baae5
```

接收端对 PR #13输出：

```text
Authorized main update 10c963ef8bee978543dccf73047d3bd2d18baae5
from merged PR #13 via autonomous-merge.
```

机器记录：

```text
docs/harness/provenance-proofs/2026-08-11-pr-12.json
docs/harness/provenance-proofs/2026-08-11-pr-13.json
```

### PR #19 分支回收闭环

```text
final CI                 31512587717   success
Autonomous Merge         31512614348   success
Branch Cleanup           31512648543   success
Main Provenance Dispatch 31512614304   success
Main Provenance receiver 31512813253   success
merge commit             4367b17e37a596000b989279994ccfbd3e1aec4b
```

### PR #17 正常生命周期闭环

```text
final CI                 31514237829   success
Autonomous Merge         31514776762   success
Branch Cleanup           31514798179   success
Main Provenance Dispatch 31514776787   attempt 2 success
Main Provenance receiver 31515051623   success
merge commit             4a81aa5d50035a7c004ec5f7fca59b7ffc926675
```

首次 provenance dispatch因 GitHub API瞬时 `500 fetch failed`失败；重跑同一失败 Job后完成可信 receiver验证，没有修改 main或降低门禁。

## 当前治理能力

- GitHub Connector内容写入前必须创建并显式指定非默认分支；
- 普通变更通过 PR、CI、风险合同和 squash merge进入 `main`；
- `R2/R3`要求绑定当前 HEAD的 cold-read AI审查；
- 外部 direct push由 Main Provenance的 `push`路径审计；
- `GITHUB_TOKEN`自动合并由 `Main Provenance Dispatch → repository_dispatch → Main Provenance`路径审计；
- 未验证 main更新会创建 R3 Incident并阻断普通自动合并；
- 只有可信 push事件可生成 Draft恢复 PR，不可信 dispatch不能提供恢复 tree；
- 成功 Autonomous Merge后，Branch Cleanup按关闭 PR `head.sha`、开放 PR、默认分支、protection与当前 HEAD复核安全回收工作分支；
- 当前模式是 post-push检测与恢复提案，不是服务端硬保护；
- `developmentPause.active=false`，Issue #9 已关闭。

## 当前 M0能力

已验证：

- Pi源码契约与发布 Artifact身份；
- SDK Root Exports和无凭证 RPC空 Session；
- 正常单 Tool Prompt/Tool/Final Answer路径；
- SDK Tool Start/Update/End与 Extension `tool_call` / `tool_result`关联；
- 正常路径 `agent_end(willRetry=false) < agent_settled < session_shutdown`；
- Retry恢复路径：第一次 `agent_end(willRetry=true)`、Session Retry事件、恢复 Run、最终 `agent_end(willRetry=false)`和单次 `agent_settled`；
- Public SDK与 Extension在 Retry事件和 `willRetry`字段上的差异；
- 被 Retry替代的失败消息不会保留在最终 `session.messages`，必须从事件流持久化；
- Follow-up队列路径：Public `queue_update`由非空变为空，同一 Agent Run内追加第二个 Turn，最终单次 `agent_settled`；
- Public SDK与 Extension在 Queue事件上的差异，Extension不能重建 Follow-up排队/清空时序；
- 初始 `session.prompt()`会等到 Follow-up完成、队列排空并进入 idle后才返回；
- Prompt、Agent Run和 Turn不能一一对应，队列为空也不能替代最终稳定边界；
- 流式取消路径：部分 Assistant以 `aborted`保留，取消后仍有 `agent_end`与单次 `agent_settled`；
- Retry Backoff取消路径：`willRetry=true`是当时计划，不保证后续 Run，`abortRetry()`产生终止 Retry事件；
- Retry exhaustion路径：`agent_end.willRetry=[true,true,false]`，最终保留最后一次失败 Assistant，Prompt Promise正常返回；
- Public SDK与 Extension在取消、Retry终止和 `willRetry`上的来源差异；
- 并行 Tool声明、执行与完成关联：三个调用在首个完成前全部开始，完成顺序为 `beta → gamma → alpha`；
- 并行 Tool消息边界：Tool Result消息、Turn结果数组和最终 Session顺序为 `alpha → beta → gamma`，不能从完成事件推导；
- Manual Compaction边界：Public只有 `compaction_start/end`，`entry_appended=0`，Extension Summary不触发额外 Provider调用；
- Compaction数据层级：当前模型上下文、完整 Session Entry树和未来 Observation Ledger必须分开；
- Session Replacement边界：Shutdown、Invalidate、Rebind、Extension Start、Public Listener Attach与 `withSession()`顺序已冻结；
- Session Identity边界：同一 Session File恢复后仍是新的内存 Session Object，旧 Public Listener不会自动迁移；
- 宿主 Session创建和 Shutdown边界；
- Runtime Fixture、隔离 Probe、Harness、架构边界与基础测试由 CI持续检查。

尚未冻结：

- RPC真实 Prompt、Worker退出、重启和错误边界；
- 正式 `NormalizedRuntimeEvent`与 SQLite Observation Ledger Schema。

## 当前下一步

按真实 Runtime风险排序：

1. 录制 RPC真实 Prompt、Worker退出、重启和错误边界；
2. 比较 SDK与 RPC对同一任务的事件差异；
3. 根据全部真实 Fixture修订 `NormalizedRuntimeEvent`；
4. 冻结 Observation Ledger Schema并进入 SQLite实现。

## 已知风险

- 当前 GitHub方案无法从服务端事前阻止 direct-main写入；
- 具有 `contents: write`的主体仍可能先产生 Commit，再被检测系统发现；
- 仓库内 Workflow不能抵御同一 direct Commit同时篡改检测逻辑的最坏情况；
- Branch Cleanup的 `deleteRef`没有原子 compare-and-delete，最终复核与删除之间仍有极短、可恢复竞态窗口；
- 同一最终 HEAD存在多次成功 CI时，sender可能产生重复但幂等的 provenance dispatch；Issue #15跟踪去重；
- Main Provenance Dispatch可能遭遇 GitHub API瞬时故障；当前失败可见且支持安全重跑，但发送端尚未内建网络重试；
- 独立 AI审查仍使用同一仓库身份下的 cold-read评论协议，尚未连接独立 Reviewer Bot；
- Pi Runtime获取与执行目前位于同一联网容器；后续可拆为联网获取与断网执行；
- 在真实用户记忆、生产凭证、多人写入、生产发布或第二次 direct-main Incident出现时，必须重新评估当前风险接受。

## 产品能力状态

- Pi source-and-runtime baseline已验证到正常 Tool、自动重试恢复、Follow-up队列、流式取消、Retry Backoff取消、Retry exhaustion、并行 Tool ordering、Compaction与 Session Replacement路径；
- 真实 Observation持久化、记忆、Context、Attention和桌面端尚未进入实现阶段；
- M0继续以 Runtime边界证据为先，未完成 RPC真实任务与 Worker边界 Fixture前不提前冻结 Ledger。
