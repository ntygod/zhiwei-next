# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: active
updated: 2026-08-11
-->

## 当前定位

知微处于 **M0：能观察**。AI-primary 自主开发已经恢复，运行模式为：

```text
best-effort-private-free
```

仓库保持 Private + GitHub Free。所有者已经接受当前方案缺少服务端 pre-receive 默认分支硬保护的残余风险；正常写入仍必须使用非默认分支和 Pull Request。

## 最近完成

- 新仓库初始化、产品蓝图、UI 方向和模块化骨架；
- 渐进式 `AGENTS.md` 与 AI-primary Harness；
- Pi `v0.84.1` Release Tag 源码基线；
- npm Artifact 的 Tarball digest、manifest、SDK 动态导入和无凭证 RPC 空 Session 验证；
- Issue #9 完整记录两次 direct-main 误写和两次紧急恢复；
- PR #10 合并 push-path Main Provenance、R3 Incident 停机、幂等 Draft 恢复 PR 和机器 Incident Fixture；
- PR #11 合并 token-driven autonomous merge 的 `repository_dispatch` 发送端与接收端；
- PR #12 固化 `best-effort-private-free` 风险接受，并完成第一条 live provenance proof；
- PR #13 固化 proof、解除 `developmentPause`、恢复 M0，并再次完成自身 provenance 闭环；
- Issue #9 已以 `completed` 关闭；事故、风险接受和两条 proof 均永久保留。

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

接收端对 PR #13 输出：

```text
Authorized main update 10c963ef8bee978543dccf73047d3bd2d18baae5
from merged PR #13 via autonomous-merge.
```

机器记录：

```text
docs/harness/provenance-proofs/2026-08-11-pr-12.json
docs/harness/provenance-proofs/2026-08-11-pr-13.json
```

## 当前治理能力

- 正常 GitHub Connector 文件写入必须先创建并显式指定非默认分支；
- 普通变更通过 PR、CI、风险合同和 squash merge 进入 `main`；
- `R2/R3` 要求绑定当前 HEAD 的 cold-read AI 审查；
- 外部 direct push 由 Main Provenance 的 `push` 路径审计；
- `GITHUB_TOKEN` 自动合并由 `Main Provenance Dispatch → repository_dispatch → Main Provenance` 路径审计；
- 未验证 main 更新会创建 R3 Incident 并阻断普通自动合并；
- 只有可信 push 事件可生成 Draft 恢复 PR，不可信 dispatch 不能提供恢复 tree；
- 当前模式是 post-push 检测与恢复提案，不是服务端硬保护；
- `developmentPause.active=false`，Issue #9 已关闭。

## 当前下一步

M0 恢复到 Pi Runtime 工作流，优先级如下：

1. 建立 Pi SDK / Extension 的真实生命周期 Capture Harness；
2. 录制正常 Prompt、Tool Start/Update/End 和 `agent_settled` Fixture；
3. 验证取消、自动重试、Follow-up 和并行 Tool 的事件关联；
4. 验证 Compaction 与 Session Replacement；
5. 根据真实 Fixture 修订 `NormalizedRuntimeEvent`；
6. 冻结 Observation Ledger Schema。

## 已知风险

- 当前 GitHub 方案无法从服务端事前阻止 direct-main 写入；
- 具有 `contents: write` 的主体仍可能先产生 Commit，再被检测系统发现；
- 仓库内 Workflow 不能抵御同一 direct Commit 同时篡改检测逻辑的最坏情况；
- 同一最终 HEAD 存在多次成功 CI 时，sender 可能产生重复但幂等的 provenance dispatch；已记录为后续 Harness 效率任务；
- 独立 AI 审查仍使用同一仓库身份下的 cold-read 评论协议，尚未连接独立 Reviewer Bot；
- 在真实用户记忆、生产凭证、多人写入、生产发布或第二次 direct-main Incident 出现时，必须重新评估当前风险接受。

## 产品能力状态

- Pi source-and-runtime baseline 已验证；
- SDK root exports 和 RPC 空 Session 可运行；
- Runtime Fixture、Harness、架构边界和基础测试由 CI 检查；
- SQLite Observation Ledger、记忆、Context、Attention 和桌面端尚未进入实现阶段。
