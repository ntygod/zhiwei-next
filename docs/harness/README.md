# ZhiWei Autonomous Development Harness

本目录定义知微作为“AI 主开发者项目”的工作 Harness。它把产品蓝图、里程碑、代码、验证、GitHub Work Item 和审计历史连接成一条可持续的自主开发循环。

## 目标

新的 AI 上下文在没有人工交接时也应能回答：

1. 项目最终要成为什么；
2. 当前处于哪个里程碑；
3. 下一项最值得做的 canonical work item 是什么；
4. 所有者写在 Issue 中的想法如何保留和排期；
5. 哪些边界不能破坏；
6. 如何证明改动正确；
7. 什么条件下可以自主合并；
8. 上一次任务留下了哪些风险和阻塞；
9. 默认分支更新能否关联到经过验证的 PR；
10. Issue、Branch、PR 和临时工作区是否已经收敛。

## 事实源

| 问题 | 事实源 |
|---|---|
| 最终产品方向 | `docs/product/` |
| 长期技术决策 | `docs/adr/` |
| 目标架构和领域语义 | `docs/architecture/` |
| 当前范围和完成标准 | `docs/planning/` |
| 当前进展和连续性 | `docs/harness/project-state.md` |
| 可执行约束 | 根目录及局部 `AGENTS.md` |
| 自主治理机器配置 | `harness.config.json` |
| Issue、Branch 与 PR 生命周期 | `docs/harness/work-item-lifecycle.md` |
| 默认分支事故与补偿控制 | `main-protection.md`、`incidents/`、Main Provenance Workflows |
| 工作分支回收 | `branch-lifecycle.md`、Branch Cleanup、Repository Hygiene |
| 所有者接受的残余风险 | `risk-acceptance/` |
| 已实现现实 | 代码、测试、CI 和合并后的 PR |
| 待办队列 | GitHub Issues 与当前里程碑 |

## 当前运行模式

```text
public-free-ruleset
```

仓库为 Public + GitHub Free。默认分支由 active、无 bypass 的服务端 Ruleset保护：必须通过 Pull Request、GitHub Actions `check`、线性历史与 Review Thread解决；只允许 squash，禁止 force push和删除。GitHub Secret Scanning与 Push Protection已启用。机器事实源与残余风险见 `main-protection.md`。

Harness 提供：

- 非默认分支写入协议；
- owner-input 与 canonical execution Issue；
- 一个 work item 一个 active branch / primary PR；
- PR、CI、风险合同与 cold-read AI 审查；
- Public仓库 fork / Token隔离；
- 默认分支服务端 Ruleset；
- 自主 squash merge；
- 外部 push 与 token-driven merge 双路径 provenance；
- 未验证 main 更新的 R3 Incident 停机；
- Branch Cleanup 与 Repository Hygiene；
- Work Item 生命周期机器检查。

Ruleset不替代可信 Workflow、Main Provenance、Incident和恢复链路；管理员仍可修改服务端配置，Required Check漂移也会安全阻塞合并。详细边界见 `main-protection.md`。

## Work Item 生命周期

所有者可以随时创建 Issue 记录产品想法。此类 `owner-input`：

- 原始正文保持为人类事实源；
- AI 只在评论中做理解、关联和排期；
- 未排期不是关闭理由；
- 不接收无关 CI、Runtime 或分支清理日志；
- 实施时关联更小的 execution Issue。

AI 创建任务前先去重。一个用户结果只保留一个 canonical execution Issue；每个 execution Issue 最多一个 active branch 和一个开放 primary PR。

GitHub Issue 和 PR 共用编号。自动评论、关闭或 metadata 写入前必须验证对象类型、标题、work item 与当前 HEAD，不能只看 `#N`。

详细规则见 `docs/harness/work-item-lifecycle.md`。

## 自主循环

```text
读取规则、项目状态、开放 Incident 和所有者新评论
        ↓
Repository Reconciliation：收敛重复 Issue、陈旧 Draft、孤立 Branch 和超额 WIP
        ↓
选择一个 canonical work item
        ↓
从最新 main 创建包含 Issue 编号的非默认分支
        ↓
第一个实质性提交后创建唯一 Draft primary PR
        ↓
实现、验证、Fixture 固化、Review 修复都在同一 PR
        ↓
R2/R3 由独立 AI 上下文复审当前 HEAD
        ↓
满足门禁后自主 squash merge
        ↓
Main Provenance 验证来源
        ↓
Branch Cleanup + Repository Hygiene 收敛分支和 Work Item
        ↓
更新 execution Issue、owner-input 关联和项目状态
```

详细步骤见 `development-loop.md`。

## 权限模型

项目所有者授予 AI 长期开发权限，不要求逐次批准。AI 可以管理代码、文档、Issue、PR、CI、依赖、迁移和发布。

权限不包含：

- 绕过非默认分支和 PR；
- 改写 owner-input 原文；
- 创建 no-op / capability-test Issue、PR 或 Branch；
- 用 `ai/`、`automation/` 或 retirement PR 制造临时工作区；
- 降低风险、测试、审查或恢复门禁；
- 忽略人类评论、验收失败或方向变化。

完整政策见 `autonomy-policy.md`。

## Main 分支保护

仓库采用四层防护：

1. **写入前置协议**：Connector 写入显式指定非默认分支。
2. **PR门禁**：CI、Work Item合同和当前 HEAD独立审查。
3. **服务端 Ruleset**：无 bypass，要求 PR、`check`、线性历史和 squash。
4. **Main Provenance / Incident**：重新查询真实 PR和 Commit；异常时暂停普通合并。

服务端保护与事后 provenance互补，任何一层都不能因为另一层存在而删除。

## 工作分支生命周期

Branch Cleanup 负责关闭 PR 的 exact-head 工作分支：候选必须保持当前 HEAD 与关闭 PR 的 `head.sha` 完全一致，且没有开放 PR 使用；分支在关闭后继续推进或复用时会被保留。该策略由 `npm run check:branch-cleanup` 在普通 CI 中验证。

Repository Hygiene 负责：

- WIP 和多个 primary PR；
- retirement / no-op PR；
- `automation/*`、`ai/*` 和 helper lease 漂移；
- PR metadata 对象类型；
- reconciliation 中明确 allowlist 的 legacy helper；
- 明确登记的 substantive snapshot 保留。

来源不明的普通孤立分支不会被猜测删除。详细选择、幂等和恢复见 `branch-lifecycle.md`。

## 机器门禁

`npm run check` 至少包含：

- 架构边界；
- `AGENTS.md` 层级与引用；
- `check:work-items` Work Item Policy 和治理一致性；
- Main Provenance 和 dispatch；
- Branch Cleanup（`check:branch-cleanup`）；
- Harness 配置与风险接受；
- Pi source/runtime 契约；
- 自动化测试。

PR 还执行 `scripts/check-pr-contract.mjs`，从 GitHub Event Payload 读取 title、head、number，并核对：

```text
work-item
pr-role
owner-input
supersedes-pr
risk
independent-review
governance-change
project-state
rollback
```

CI 在 **pre-merge** 阶段使用只读 GitHub API 实时验证：`work-item` 必须是开放 Issue、`owner-input` 必须是仓库所有者创建的 Issue、`supersedes-pr` 必须是真实 PR。验证失败时 CI 失败，旧 Autonomous Merge 不会运行；对象类型不能等到合并后才发现。

Repository Hygiene 在可信默认分支上下文中再次查询真实 GitHub 对象，复核 work-item / owner-input / supersedes-pr，并安全回收精确登记的 legacy helper branch。它是 post-merge 审计与收敛层，不替代 pre-merge 门禁。

所有 Workflow Action 固定完整 Commit SHA。机器配置、Policy、Checker、Workflow 和文档均注册在 `harness.config.json`。

## 连续性

`project-state.md` 是轻量快照，不是第二套项目管理系统。具体任务仍以 canonical Issue、primary PR、Fixture 和 CI 为准。

## Harness 本身也是代码

AI 应主动发现规则漂移、失效命令、重复任务和缺失门禁，并通过治理 PR 修复。治理规则可演进，但不能为了让当前任务通过而临时降低标准；修改遵守 `self-maintenance.md`。
