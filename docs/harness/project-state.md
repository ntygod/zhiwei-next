# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: paused-live-provenance-proof
updated: 2026-08-11
-->

## 当前定位

知微仍处于 **M0：能观察**。普通产品开发暂时保持暂停，但阻塞已经从“等待 GitHub 服务端 Ruleset”收缩为“完成一次真实的 token-driven merge provenance 闭环证明”。

项目所有者已选择保持仓库私有、不升级 GitHub 方案，并接受 GitHub Free 私有仓库缺少 pre-receive 默认分支硬保护的残余风险。当前正式运行模式为：

```text
best-effort-private-free
```

## 最近完成

- 新仓库初始化、产品蓝图、UI 方向和模块化骨架；
- 渐进式 `AGENTS.md` 与 AI-primary Harness；
- Pi `v0.84.1` Release Tag 源码基线；
- npm Artifact 的 Tarball digest、manifest、SDK 动态导入和无凭证 RPC 空 Session 验证；
- Issue #9 完整记录两次 direct-main 误写和两次紧急恢复，当前 tree 已恢复且无敏感数据、产品代码、数据库或发布影响；
- PR #10 合并 main push provenance、R3 Incident 停机、幂等 Draft 恢复 PR 和机器 Incident Fixture；
- PR #11 合并 token-driven autonomous merge 的 `repository_dispatch` 发送端与接收端；
- 所有者在 Issue #9 明确接受 `best-effort-private-free` 残余风险；
- 风险接受记录已固化到 `docs/harness/risk-acceptance/2026-08-11-private-free.json`。

## 当前治理能力

- 正常 GitHub Connector 文件写入必须先创建并显式指定非默认分支；
- 普通变更通过 PR、CI、风险合同和 squash merge 进入 `main`；
- `R2/R3` 要求绑定当前 HEAD 的 cold-read AI 审查；
- 外部 direct push 由 Main Provenance 的 `push` 路径审计；
- `GITHUB_TOKEN` 自动合并由 `Main Provenance Dispatch → repository_dispatch → Main Provenance` 路径审计；
- 未验证 main 更新会创建 R3 Incident 并阻断普通自动合并；
- 只有可信 push 事件可生成 Draft 恢复 PR，不可信 dispatch 不能提供恢复 tree；
- 当前模式是 post-push 检测与恢复提案，不是服务端硬保护。

## 当前开发停机

`developmentPause` 仍为 active，但原因已变更为：

```text
best-effort-live-proof-pending
```

当前治理 PR 合并后必须真实观察以下三条 Workflow：

1. `Autonomous Merge` 成功合并当前 PR；
2. `Main Provenance Dispatch` 成功为该合并创建 `repository_dispatch`；
3. `Main Provenance` 成功重新核对 merged PR、base SHA 和 squash parent，并将更新判定为 authorized。

在三条证据齐全前，不解除暂停，也不关闭 Issue #9。

## 下一步

完成 live provenance proof 后，新建一个最小 R3治理 PR：

1. 记录三条 Workflow run ID、合并 Commit 和验证结论；
2. 将 Incident Fixture 标记为 mitigated；
3. 将 `developmentPause.active` 设为 `false`；
4. 将本状态恢复为 `active`；
5. 合并并确认自身 provenance 链；
6. 关闭 Issue #9；
7. 恢复 M0 的 Pi SDK / Extension 真实生命周期 Fixture 开发。

## 已知风险

- 当前 GitHub 方案无法从服务端事前阻止 direct-main 写入；
- 具有 `contents: write` 的主体仍可能先产生 Commit，再被检测系统发现；
- 仓库内 Workflow 不能抵御同一 direct Commit 同时篡改检测逻辑的最坏情况；
- 独立 AI 审查仍使用同一仓库身份下的 cold-read 评论协议，尚未连接独立 Reviewer Bot；
- 以上残余风险已由所有者接受，但在真实用户记忆、生产凭证、多人写入或发布流程出现时必须重新评估。

## 产品能力状态

- Pi source-and-runtime baseline 已验证；
- SDK root exports 和 RPC 空 Session 可运行；
- Runtime Fixture、Harness、架构边界和基础测试由 CI 检查；
- SQLite Observation Ledger、记忆、Context、Attention 和桌面端尚未进入实现阶段。
