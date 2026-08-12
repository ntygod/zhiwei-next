# 工作分支生命周期

## 定位

工作分支是一次可验证任务的临时工作区，不是长期归档介质。长期审计与恢复依据来自 PR、完整 Commit SHA、Issue、Fixture、ADR、Incident、Provenance Proof 和 Actions 证据。

一个 execution Issue 最多有一个 active branch 和一个 primary PR。Review、Finalize、Integrate 在该分支上完成；不再创建 reviewer、integrator、finalizer 或 retirement PR。

完整 Issue / Branch / PR 关系见 `work-item-lifecycle.md`。

## 分支创建

普通分支名必须包含 canonical work-item 编号：

```text
feat/49-normalized-runtime-event-v1
fix/63-rpc-eof-loss
spike/45-sdk-rpc-parity
chore/57-work-item-lifecycle
docs/71-memory-explanation
```

普通前缀为 `feat/`、`fix/`、`docs/`、`chore/`、`spike/`；`recovery/` 只用于 Incident Recovery。禁止普通开发使用 `ai/`、`automation/`、无租约 `helper/` 或没有 Issue 编号的分支。

第一个实质性提交后，在同一工作周期创建 Draft primary PR。禁止长期保留没有 PR 的隐式草稿分支。

## Branch Cleanup 自动入口

`.github/workflows/branch-cleanup.yml` 在以下情况运行：

1. `Autonomous Merge` 成功完成后；
2. 每周定时兜底；
3. 显式 `workflow_dispatch` 手工复验。

Workflow 不 checkout 或执行 PR 分支代码。它只以 `persist-credentials: false` checkout该次 Workflow自身绑定的受信任 `${{ github.sha }}`，加载 `scripts/branch-cleanup-policy.mjs`，并通过固定 Commit SHA的 `actions/github-script` 调用 GitHub API。

策略模块同时由 `scripts/check-branch-cleanup.mjs` 在普通 `npm run check` 中执行。候选选择在 PR 合并前验证，真实 Ref 删除只发生在默认分支可信 Workflow 中。

## 关闭 PR 分支的删除候选

一个分支只有同时满足以下条件才会删除：

- 位于当前仓库，而不是 Fork；
- GitHub 当前仍能列出该分支；
- 至少有一个状态为 `closed` 的 PR 使用过该分支；
- 当前分支 HEAD 与该关闭 PR 记录的 `head.sha` 完全一致；
- 当前没有任何 `open` PR 继续使用同名分支；
- 分支不是仓库默认分支；
- 分支未标记为 protected。

`closed` 覆盖已合并、明确放弃或被取代的 PR。关闭 PR 表示工作区不再活跃；需要继续时从最新 main 创建符合 work-item 规则的新分支，而不是依赖遗留 Ref。

HEAD 精确匹配防止误删：若分支在 PR 关闭后继续增加 Commit 或被同名复用，它不再等于关闭 PR 的 `head.sha`，自动化必须保留。

## Repository Hygiene

`.github/workflows/repository-hygiene.yml` 补充处理 Branch Cleanup 无法安全推断的仓库级漂移：

- 一个 work item 多个开放 primary PR；
- retirement PR、no-op PR 或 capability-test PR；
- `automation/*`、`ai/*`、无租约 `helper/*` 孤立分支；
- 普通分支缺少 work-item 编号；
- work-item、owner-input、supersedes-pr 的 GitHub 对象类型错误；
- 已登记的 legacy helper branch 精确 HEAD 清理；
- 明确登记的 substantive pre-governance snapshot 保留。

一次性迁移记录位于：

```text
docs/harness/reconciliation/2026-08-12-work-item-cleanup.json
```

Repository Hygiene 只自动删除该记录明确 allowlist、当前 HEAD 与 `expectedHead` 完全一致、没有开放 PR、非默认且非 protected 的 legacy helper branch。来源不明的普通分支继续 fail closed：报告但不猜测删除。

## Helper Lease

默认禁止 helper branch。确实无法在 primary branch、本地临时目录或受限 Artifact 内完成一次性动作时，临时分支必须命名为：

```text
helper/<work-item>/<purpose>/<expires-epoch>
```

并满足：

- parent work item 和 primary PR 已存在；
- 创建记录包含用途、完整起始 SHA 和到期时间；
- 没有独立可合并产物；
- 不创建 PR，尤其禁止 retirement PR；
- 同一 Workflow 使用结束后立即删除；
- 删除失败使 Workflow 失败并记录到 primary PR；
- 被删完整 HEAD 写入日志，可从该 SHA恢复。

不得使用“retire branch” PR 触发 Branch Cleanup，也不得创建辅助 PR来关闭辅助分支。

## 必须保留

以下分支不会被 Branch Cleanup 猜测删除：

- `main` 或未来实际默认分支；
- 任一开放 PR 使用的同仓库分支；
- Fork 分支；
- protected 分支；
- 没有关闭 PR历史且不在 reconciliation allowlist 的分支；
- HEAD 已超过、偏离或复用关闭 PR记录的分支；
- reconciliation 中以 `preserve-snapshot` 且 HEAD 精确匹配的分支。

没有 PR历史不再意味着可以通过创建一个 retirement PR来清理。应先验证来源；仅 legacy allowlist 或合规 helper lease 能由 Repository Hygiene 删除。

## 安全与幂等

- Branch Cleanup权限仅为 `contents: write` 和 `pull-requests: read`；Repository Hygiene另需 `issues: read`；
- 不使用 `pull_request_target`；
- 不读取 `${{ secrets.* }}`；
- 不 checkout 或执行 PR 分支代码；
- 可信 checkout 固定到 `${{ github.sha }}`，且不持久化 Git凭证；
- 初次选择前重新读取分支、开放 PR和必要的关闭 PR；
- 删除候选绑定分支名与真实完整 SHA；
- 删除前再次读取默认分支、protection、当前 HEAD和同名开放 PR；
- 任一状态变化都会保留分支并使异常可见；
- `404` 表示其他运行已删除，安全跳过；
- 其他删除失败让 Job失败；
- 并发组不取消正在执行的清理；
- 不使用 force-push 或改写历史。

GitHub Ref删除 API没有原子 compare-and-delete。最终复核与 `deleteRef` 之间仍有极短竞态窗口；通过单所有者模型、即时复核、串行执行、完整 SHA日志和可恢复性降低风险，不描述为零风险。

## 策略场景

至少覆盖：

- 关闭 PR分支可删除；
- 开放 PR、默认、protected、Fork分支保留；
- 关闭后继续推进或复用的分支保留；
- 无 PR普通分支保留；
- 已不存在分支幂等跳过；
- exact-head legacy helper可删除；
- helper HEAD移动、获得开放 PR或变为 protected时拒绝删除；
- preserved snapshot HEAD移动时 fail closed；
- 多 primary PR、retirement PR和对象类型错误被报告。

## 回滚与恢复

删除工作分支不会删除 PR、Issue、默认分支 Commit、合并 Commit或机器 Fixture。

如策略错误：

1. 立即通过新的 R3治理 PR禁用对应 Workflow；
2. 从日志、PR `head_sha` 或 reconciliation 的完整 SHA重新创建分支；
3. 核对恢复分支 tree 后再继续；
4. 若错误触及开放工作或默认分支安全边界，创建 R3 Incident并暂停相关自动化。

不得通过 force-push 或改写共享历史恢复分支。
