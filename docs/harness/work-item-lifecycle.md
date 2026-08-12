# Work Item 生命周期

Issue #57 是本规则的引入记录。

本文件是知微自主开发中 **Issue、Branch、Pull Request 与临时自动化工作区** 的单一治理事实源。它解决四个问题：

1. 所有者可以随时把想法写进 Issue，而不会被 AI 改写、误关或污染；
2. 一个用户结果只存在一个 canonical execution Issue、一个 active branch 和一个 primary PR；
3. Review、Finalize、Integrate 不再制造辅助分支和“退休 PR”；
4. 工作完成、放弃或被取代后，分支和 PR 会在同一工作周期内收敛。

## 1. 对象类型

### `owner-input`

由仓库所有者直接写下的产品想法、体验问题、方向判断或验收反馈。

例如 Issue #44《后台任务进度获取》。这类 Issue：

- 原始正文属于人类事实源，AI 不得重写为技术任务模板；
- 默认保持开放，不因为当前里程碑尚未排期而关闭；
- AI 通过评论补充理解、边界、关联设计与排期状态；
- 真正进入实现时，可以创建更小的 `execution` Issue 并从双方互相链接；
- 只有已经交付对应用户结果、所有者明确取消、或确认为重复项时才关闭；
- 不接收无关的 CI 日志、Runtime 诊断、审查记录或分支清理通知。

### `execution`

一个可独立验收的实现、Spike、修复或纵向切片。它必须包含结果、范围、非目标、验收、风险和回滚。

### `governance`

对 Harness、CI、自动合并、权限、分支、Issue/PR 流程或默认分支治理的修改。至少为 `R2`，涉及 Workflow、写权限或自动删除时为 `R3`。

### `incident`

安全、数据完整性、默认分支来源、凭证、发布或不可逆副作用事故。它可以触发 `developmentPause`，优先级高于所有普通工作。

### `research`

尚未承诺实现的开放探索。研究一旦形成可交付目标，应创建或转换为 `execution` Issue，而不是无限扩张原 Issue。

## 2. GitHub 对象类型验证

GitHub Issue 和 Pull Request 共用数字编号空间。数字 `#44` 本身不说明对象类型。

在执行以下动作前，AI 或 Workflow 必须通过正确 API 读取对象并验证：

- 发布 Issue 评论；
- 发布 PR 诊断、审查或完成记录；
- 关闭 Issue 或 PR；
- 把某个编号写入 `work-item`、`owner-input` 或 `supersedes-pr`；
- 依据对象编号选择 branch、artifact、workflow run 或 HEAD。

最低验证字段：

```text
object type: issue | pull_request
number
title
state
repository
related work-item
for PR: head ref + full head SHA + base
```

禁止：

- 仅凭数字编号推断对象类型；
- 把成功 Workflow 的 PR 编号误当成同号 Issue；
- 把 owner-input Issue 当成 Runtime 诊断日志；
- 在未确认标题与关联任务时自动评论；
- 使用真实仓库创建 no-op Issue、PR 或 Branch 来测试 Connector 能力。

Issue #44 收到无关 SDK/RPC 诊断、Issue #58 被误创建为 `__noop__`，均作为本规则的反例保留在历史中。

## 3. 创建 Issue 前的去重

创建任何 `execution`、`research` 或 `governance` Issue 前：

1. 搜索开放和最近关闭的 Issue；
2. 使用用户结果、模块、里程碑和关键边界词，而不是只搜索标题；
3. 检查当前 `project-state.md` 和开放 PR；
4. 判断现有 Issue 能否承载该结果；
5. 只有没有 canonical work item 时才新建。

一个用户结果只能有一个 canonical execution Issue。

发现重复时：

```text
在重复项评论 canonical Issue
→ 迁移仍有价值的要求
→ 添加 duplicate label
→ 以 duplicate 关闭
```

不得通过创建“新版 Issue”逃避整理旧 Issue。

## 4. Owner Input 的 Triage

AI 读取 owner-input 后应在同一轮完成：

- 用一句话复述用户可感知结果；
- 区分“产品要求”和“当前实现猜测”；
- 标明它属于当前里程碑、未来里程碑或跨里程碑父需求；
- 关联已有产品/架构/执行 Issue；
- 没有 execution Issue 时保持输入开放，不为了显得忙碌立即拆出大量任务；
- 人类后续评论作为最高优先级增量，不覆盖原文。

AI 不得把 owner-input 的正文替换为自己的模板。需要结构化字段时，写在评论、关联 execution Issue 或机器投影中。

## 5. Canonical Work Item

每个 active execution Issue 必须声明：

```text
canonical: yes
owner-input: #N | none
blocked-by: #N,... | none
active-branch: <ref> | none
primary-pr: #N | none
```

这些字段可以先以结构化评论维护，后续再投影到 Project。任一时刻：

- 一个 execution Issue 最多一个 active branch；
- 一个 execution Issue 最多一个开放 primary PR；
- 一个 branch 最多服务一个 execution Issue；
- 一个 primary PR 必须只服务一个 work item；
- 宽泛 owner-input 可以关联多个 execution Issue，但不是它们的临时日志容器。

## 6. 分支命名与创建

分支必须从创建时最新、已验证的默认分支 HEAD 建立，名称包含 canonical Issue 编号：

```text
feat/49-normalized-runtime-event-v1
fix/63-rpc-eof-loss
spike/45-sdk-rpc-parity
chore/57-work-item-lifecycle
docs/71-memory-explanation
recovery/9-main-provenance
```

允许前缀：

```text
feat/
fix/
spike/
chore/
docs/
recovery/
```

`ai/` 与 `automation/` 不再用于普通开发。

创建前必须：

1. 确认 canonical Issue；
2. 确认没有其他 active branch 或 primary PR；
3. 读取默认分支当前 HEAD；
4. 记录 branch → work item 映射；
5. 创建后所有写工具显式指定该非默认分支。

第一个实质性提交后，应在同一工作周期创建 Draft PR。长期存在、没有 PR 的工作分支视为治理漂移。

禁止通过创建真实分支测试工具能力；应使用只读 API、文档契约或已有测试仓库。

## 7. Primary PR

Primary PR 是 work item 唯一可合并的交付面。

Review、修复、Fixture 固化、文档同步、集成和最终化都在同一个 primary branch / PR 上完成。禁止为以下目的创建额外 PR：

- source export；
- integrator；
- finalizer；
- reviewer；
- “retire branch”；
- 仅触发 Branch Cleanup；
- Connector capability/no-op 测试。

PR 机器合同必须包含：

```text
work-item: #57
pr-role: primary | recovery
owner-input: #44 | none
supersedes-pr: #33 | none
```

并继续包含风险、自动合并、独立审查、治理变化、项目状态和回滚字段。

规则：

- `work-item` 必须是已验证的 Issue，而不是 PR；
- `owner-input` 必须是已验证的 owner-input Issue 或 `none`；
- `pr-role: primary` 时，head branch 必须包含 work item 编号；
- `pr-role: recovery` 只用于事故恢复，并必须遵守对应 Incident 规则；
- `Addresses / Closes / Fixes #N` 必须与 `work-item` 一致；
- `supersedes-pr` 只在替换真实 PR 时填写，并在旧 PR 留下回链。

## 8. Draft PR 生命周期

Draft PR 不是长期仓库。状态只能是：

```text
active
blocked
superseded
abandoned
ready
```

- `active`：本工作周期正在推进；
- `blocked`：有明确外部阻塞，Issue 和 PR 都记录下一触发条件；
- `superseded`：新的 canonical PR 已建立，旧 PR 在同一周期评论并关闭；
- `abandoned`：证据不足或方向取消，明确哪些内容未交付后关闭；
- `ready`：当前 HEAD 完成验证与必要独立审查。

不得让 Draft PR 在工作已经转移后继续开放。关闭未完成 PR 时必须明确：

- 没有进入 `main`；
- 哪些验证未完成；
- 是否存在 replacement Issue / PR；
- 不声称用户结果已交付。

## 9. WIP 上限

正常模式最多同时存在：

- 一个产品/实现 primary PR；
- 一个必要的 governance 或 incident recovery PR。

研究性 Runtime Probe 与其 primary PR 视为同一个 WIP，不允许再开并行 finalizer/reviewer PR。

开始下一项工作前必须执行 Repository Reconciliation：

```text
开放 Incident
→ 开放 owner-input 中的人类新评论
→ 开放 primary PR
→ 开放 Draft PR 是否已转移
→ branch 是否都有 canonical Issue / PR
→ 重复 Issue
→ project-state 下一步
```

若仓库已超过 WIP 上限，先收敛，不继续创建新任务。

## 10. 辅助工作区

默认禁止 helper branch。

确实无法在 primary branch 完成一次性动作时，优先使用：

1. 当前 primary PR 的受限 Workflow Artifact；
2. 本地临时目录；
3. 当前 branch 上一次性、同提交删除的临时文件。

只有满足全部条件才允许临时 helper branch：

- 名称为 `helper/<work-item>/<purpose>/<expires-epoch>`；
- parent work item 和 primary PR 已存在；
- 创建记录含完整 HEAD、用途和到期时间；
- 没有独立可合并产物；
- 不创建 PR；
- 同一 Workflow 在使用结束后删除；
- 删除失败使 Workflow 失败并登记到 primary PR；
- 被删完整 SHA 写入日志，可恢复。

不得使用 `automation/*` 创建无到期分支，也不得创建“retire branch” PR来回收 helper branch。

## 11. Branch Cleanup 与 Repository Hygiene

Branch Cleanup 继续删除：

- 同仓库；
- 关联关闭 PR；
- 当前 HEAD 与关闭 PR `head.sha` 完全一致；
- 无开放 PR；
- 非默认、非 protected；
- 删除前重新验证状态。

Repository Hygiene 额外审计：

- 一个 work item 多个开放 primary PR；
- `automation/*`、`ai/*` 或无 Issue 编号分支；
- 打开状态的 retirement PR；
- 已 supersede 但仍开放的 Draft；
- 真实仓库 no-op / capability-test 对象；
- owner-input 收到无关机器人诊断；
- branch 没有任何 PR 且未登记 helper lease。

对历史孤立 helper branch，只有满足明确 allowlist、无开放 PR、非默认/非 protected、HEAD 可由日志或已关闭 PR恢复时才允许自动删除。来源不明的普通分支继续 fail closed：登记候选，不猜测删除。

## 12. Issue / PR 评论路由

写入评论前必须选择正确目的地：

| 内容 | 目的地 |
|---|---|
| 用户需求理解、产品边界、排期 | owner-input Issue |
| 实现进度、阻塞、验收 | execution Issue |
| CI、Artifact、HEAD、Review | primary PR |
| 合并后的完成记录 | execution Issue |
| 安全事故、恢复和残余风险 | incident Issue |
| 分支回收日志 | primary PR 或治理日志 |

自动化评论必须包含可校验的 work item、PR、HEAD 或 Workflow Run；不能只写 `#N`。

## 13. 关闭规则

### Owner input

仅在用户结果已交付、所有者取消或重复时关闭。

### Execution

仅在以下其一成立时关闭：

- 对应 primary PR 已合并且验收完成；
- 被 canonical Issue 取代并以 duplicate 关闭；
- 明确不再计划并说明原因与保留证据。

### PR

- 合并：交付完成；
- 关闭未合并：必须记录未交付、replacement 和 branch 回收状态；
- 不允许 PR 只为了关闭自身或删除分支存在。

## 14. 人类输入优先级

所有者在任意 Issue / PR 留下的新想法、修正或验收结论后，AI 下一轮开始时必须先读取并分类：

```text
方向改变
验收失败
新增约束
未来想法
普通问题
```

方向改变、验收失败和新增约束优先于当前自动队列。未来想法保留为 owner-input，不强迫立即中断安全、数据完整性或当前原子提交。

## 15. 迁移原则

引入本规则时：

- 关闭只用于退休分支的 PR；
- 关闭已转移且未完成的陈旧 Draft；
- 把重复 SDK/RPC Issue 收敛到 #45；
- 保留 #32 为后续 Worker 边界；
- 保留 #44 为 owner-input；
- 将 #49 标为等待 Runtime 证据；
- 回收 `automation/*` 与已关闭 PR 分支；
- 完成治理后，再从最新 `main` 为 #45 创建 `spike/45-sdk-rpc-parity`。

迁移只整理引用和活跃状态，不删除 Issue、PR、Commit 或审计历史。
