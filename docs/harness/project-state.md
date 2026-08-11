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
- Issue #9 完整记录两次 direct-main 误写和两次紧急恢复，当前 tree 已恢复且无敏感数据、产品代码、数据库或发布影响；
- PR #10 合并 push-path Main Provenance、R3 Incident 停机、幂等 Draft 恢复 PR 和机器 Incident Fixture；
- PR #11 合并 token-driven autonomous merge 的 `repository_dispatch` 发送端与接收端；
- PR #12 固化 `best-effort-private-free` 风险接受，并通过真实 Workflow 完成第一条 live provenance proof；
- live proof 已记录到 `docs/harness/provenance-proofs/2026-08-11-pr-12.json`。

## 已验证的自主交付闭环

PR #12 的真实证据：

```text
final CI                 31498003965   success
Autonomous Merge         31498045898   success
Main Provenance Dispatch 31498045864   success
Main Provenance receiver 31498068302   success
merge commit             c05eba9f840c82d7b61494ae6bb06833d140d6c0
```

接收端重新读取真实 merged PR、base SHA、merge SHA、默认分支和单一 squash parent，并输出：

```text
Authorized main update c05eba9f840c82d7b61494ae6bb06833d140d6c0
from merged PR #12 via autonomous-merge.
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
- `developmentPause.active=false`。

## Issue #9 收尾

本治理 PR仍以 `main-incident-recovery: yes` 进入合并，因为 Issue #9 在 PR 合并前保持开放。合并后必须：

1. 确认本 PR 自身的 Autonomous Merge、Dispatch 和 receiver 均成功；
2. 将 Issue #9 标记为 completed；
3. 保留 Incident Fixture、风险接受和全部历史；
4. 不再维持普通开发停机。

## 下一步候选

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
- 同一最终 HEAD 存在多次成功 CI 时，当前 sender 可能产生重复但幂等的 provenance dispatch；后续可作为 Harness 效率任务去重；
- 独立 AI 审查仍使用同一仓库身份下的 cold-read 评论协议，尚未连接独立 Reviewer Bot；
- 在真实用户记忆、生产凭证、多人写入、生产发布或第二次 direct-main Incident 出现时，必须重新评估当前风险接受。

## 产品能力状态

- Pi source-and-runtime baseline 已验证；
- SDK root exports 和 RPC 空 Session 可运行；
- Runtime Fixture、Harness、架构边界和基础测试由 CI 检查；
- SQLite Observation Ledger、记忆、Context、Attention 和桌面端尚未进入实现阶段。
