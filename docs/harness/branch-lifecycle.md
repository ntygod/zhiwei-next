# 工作分支生命周期

## 定位

工作分支是一次可验证任务的临时工作区，不是长期归档介质。

长期审计与恢复依据来自：

- Pull Request 描述、评论、Review 与合并状态；
- 完整 Commit SHA 和默认分支历史；
- Issue、Contract Fixture、ADR、Incident 与 Provenance Proof；
- GitHub Actions 日志和脱敏 Artifact。

因此，PR 已经结束后继续保留同仓库工作分支只会增加导航噪声，不增加可信审计能力。

## 自动清理入口

`.github/workflows/branch-cleanup.yml` 在以下情况运行：

1. `Autonomous Merge` 成功完成后；
2. 每周定时兜底；
3. 显式 `workflow_dispatch` 手工复验。

Workflow 不 checkout 或执行 PR 分支代码，只运行默认分支上固定 Commit SHA 的 `actions/github-script`。

## 删除候选

一个分支只有同时满足以下条件才会删除：

- 分支位于当前仓库，而不是 Fork；
- GitHub 当前仍能列出该分支；
- 至少有一个状态为 `closed` 的 PR 使用过该分支；
- 当前分支 HEAD 与该关闭 PR 记录的 `head.sha` 完全一致；
- 当前没有任何 `open` PR 继续使用同名分支；
- 分支不是仓库默认分支；
- 分支未标记为 protected。

`closed` 同时覆盖已合并 PR和明确关闭、放弃或被取代的 PR。关闭 PR表示该工作区不再活跃；需要继续工作时应重新打开原 PR或创建新的任务分支，而不是依赖遗留 Ref充当隐式草稿。

HEAD 精确匹配是额外的防误删边界：若一个旧分支名在 PR关闭后被重新使用，或分支继续增加了未进入该 PR的新 Commit，它不再等于关闭 PR的 `head.sha`，自动化必须保留它。

## 必须保留

以下分支不会被自动删除：

- `main` 或未来的实际默认分支；
- 任一开放 PR使用的同仓库分支；
- Fork 中的分支；
- protected 分支；
- 没有任何关闭 PR历史的分支；
- HEAD 已经超过、偏离或复用了关闭 PR记录的分支。

最后两条是保守边界：自动化不会猜测一个没有 PR记录的分支是否可丢弃，也不会把旧 PR历史错误套到后来复用的同名分支上。发现此类孤立分支时应先建立或关闭对应 PR，再进入正常回收路径。

## 安全与幂等

- Workflow 权限仅为 `contents: write` 和 `pull-requests: read`；
- 不使用 `pull_request_target`；
- 不读取 `${{ secrets.* }}`；
- 不 checkout、不执行仓库脚本或 PR 内容；
- 删除前重新读取所有现存分支、开放 PR和关闭 PR；
- 删除候选同时绑定分支名与关闭 PR的真实 `head.sha`；
- 策略函数先运行默认分支内置的确定性场景；任何场景失败都会在真实删除前终止；
- 已被其他运行删除的 Ref返回 `404` 时安全跳过；
- 其他删除失败会让 Job失败并在 Actions 历史中可见；
- 并发组不取消正在执行的清理，避免两个运行互相打断。

策略场景至少覆盖：

- 关闭 PR分支可删除；
- 开放 PR分支保留；
- 关闭后已推进或复用的分支保留；
- 默认和 protected 分支保留；
- Fork 与无 PR分支保留；
- 已不存在分支幂等跳过。

## 历史分支的一次性收敛

启用 Workflow 时，仓库已有的关闭 PR工作分支会在首个成功清理运行中统一回收。

当前启用前应保留：

```text
main
spike/m0-pi-lifecycle-capture  # PR #17 尚开放时
```

其余已合并或被后续 PR取代、且 HEAD 仍等于对应关闭 PR `head.sha` 的分支均符合回收条件。PR #17 结束后，它的分支也进入同一规则，不需要特殊名单。

## 回滚与恢复

删除工作分支不会删除 PR、Issue、默认分支 Commit、合并 Commit或机器 Fixture。

如策略错误：

1. 立即禁用或通过新的 R3治理 PR删除 Branch Cleanup Workflow；
2. 从 PR 的 `head_sha`、相关 Commit SHA或 GitHub 保留的 PR引用重新创建分支；
3. 核对恢复分支 tree 后再继续工作；
4. 若错误触及开放工作或默认分支安全边界，创建 R3 Incident并暂停相关自动化。

不得通过 force-push 或改写共享历史恢复分支。