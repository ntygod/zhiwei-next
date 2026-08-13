# 自主开发循环

## 1. 定向与 Repository Reconciliation

每个新任务先读取：

1. 根 `AGENTS.md`；
2. `project-state.md`；
3. 当前里程碑；
4. 目标目录最近的局部 `AGENTS.md`；
5. 与任务直接相关的 ADR 和架构文档；
6. 开放的安全 Incident；
7. `work-item-lifecycle.md`；
8. 任务触及默认分支或 Harness 时读取当前风险接受记录。

然后执行 Repository Reconciliation：

```text
开放 Incident
→ 所有者在 owner-input / PR 中的新评论
→ 当前开放 primary PR
→ 已转移但仍开放的 Draft PR
→ 每个 branch 是否有 canonical Issue / PR
→ 重复 Issue 和 retirement PR
→ project-state 下一步
```

仓库已超过 WIP 上限时先收敛，不继续创建新任务。不要把整个仓库全部装入上下文。

如果存在带 `zhiwei-main-incident` 开放标记的 Issue，或可信 `harness.config.json` 中 `developmentPause.active=true`，立即进入安全停机：不选择普通产品任务，只处理明确允许的 Incident Recovery / 治理证明。

## 2. 选择工作

工作来源按优先级排序：

1. 开放的安全 Incident、可信安全停机、数据完整性问题或人类验收失败；
2. 人类明确指令，以及 owner-input 中的新方向、约束和验收反馈；
3. 主分支 CI 或已发布能力回归；
4. 当前里程碑的阻塞项；
5. 当前里程碑中最小、最高价值的用户可感知纵向切片；
6. 降低后续风险的测试、Spike 或 Harness 维护；
7. 纯清理和美化。

所有者直接创建的产品想法 Issue 作为 `owner-input` 保持原文和开放状态。AI 通过评论完成 triage；真正实施时关联一个可验收的 execution Issue，不把运行日志写进 owner-input。

创建 execution Issue 前搜索开放和最近关闭的 Issue。一个用户结果只有一个 canonical work item；重复项回链、标记 duplicate 并关闭。没有合适 Issue 时才能创建，不为保持忙碌生成低价值任务。

## 3. 建立任务合同

Issue 或工作记录至少包含：

- 结果：用户或下一层系统将获得什么；
- 范围：允许修改哪些边界；
- 非目标：本次明确不做什么；
- 验收：可观察、可重复的完成条件；
- 风险：R0–R3；
- 回滚：失败时如何恢复；
- 依赖：是否缺凭证、外部服务、平台权限或前置 PR；
- 残余风险：是否引用已有风险接受，是否触发重新评估；
- canonical 状态：owner-input、active branch、primary PR 和 blocked-by。

GitHub Issue 与 PR 共用编号。发布评论、关闭对象或写 metadata 前，必须读取并验证对象类型、标题、仓库和关联 work item；PR 还要验证 head ref、完整 HEAD 与 base。

## 4. 创建分支与写入前置检查

任何 GitHub Connector 文件写入前：

1. 确认 canonical execution / governance / incident Issue；
2. 确认该 Issue 没有其他 active branch 或 primary PR；
3. 读取默认分支名和当前 HEAD；
4. 创建包含 work-item 编号的分支，例如 `spike/45-sdk-rpc-parity`；
5. 确认目标分支名不等于默认分支；
6. 在后续所有写工具调用中显式使用该分支；
7. 第一次写入后确认工作分支 HEAD 前进而默认分支 HEAD 未变化；
8. 第一个实质性提交后，在同一工作周期创建 Draft primary PR。

允许普通前缀：

```text
feat/ fix/ docs/ chore/ spike/
```

`recovery/` 只用于 Incident Recovery。普通开发禁止 `ai/`、`automation/`、无租约 `helper/` 和没有 work-item 编号的分支。

分支只承载一个可验证目标，不混入无关问题。若任务需要改变长期架构，先提交 ADR，再继续实现。

严禁：

```text
branch: main
branch: <default branch>
省略 branch 并依赖工具默认值
在真实仓库创建 no-op Issue / PR / Branch 测试 Connector
```

Public + GitHub Free仓库已有 active的默认分支 Ruleset；无 bypass状态来自 2026-08-13 owner/admin live readback并已版本化，普通 `GITHUB_TOKEN`持续审计不覆盖该管理员字段。这一写入前置检查仍是强制操作合同，不能把服务端拒绝当作日常流程控制。

## 5. 一个 primary PR 完成实现

每个 execution Issue 最多一个 active branch 和一个 primary PR。实现、Runtime Capture、Fixture 固化、文档同步、Review 修复、Finalize 和 Integrate 都在该分支/PR 完成。

禁止额外创建：

```text
source-export PR
integrator PR
finalizer PR
reviewer PR
retirement PR
仅触发 Branch Cleanup 的 PR
```

确实需要一次性工作区时，优先使用 primary PR 的受限 Artifact、本地临时目录，或在同一分支同一次工作流内创建并删除的临时文件。helper branch 必须遵守 `helper/<work-item>/<purpose>/<expires-epoch>` 租约并由同一 Workflow 删除；不得通过 PR退休。

## 6. 实现纵向切片

- 从真实输入走到可验证输出，避免先铺满接口和空实现。
- 领域规则写在领域层；I/O 和 Runtime 细节留在边界。
- 先写不变量或失败用例，再修改行为。
- 任何新增 fallback 都要有明确可观察状态，不能静默降级。
- 时间、ID、模型、随机性和外部系统可替换，便于确定性测试。

## 7. 验证

最低门禁：

```bash
npm run check
```

根据局部规则增加：

- Contract Fixture；
- 真实 SQLite 测试；
- 恢复/回滚演练；
- 用户场景测试；
- 可访问性和错误状态；
- 安全滥用场景；
- 默认分支 Commit/Tree provenance；
- token-driven merge 的 dispatch sender/receiver 结果。

在 pull_request CI 的 **pre-merge** 阶段，还必须通过只读 GitHub API核对：

```text
work-item      → 开放 Issue，不能是 PR
owner-input    → 仓库所有者创建的 Issue，或 none
supersedes-pr  → 真实 PR，或 none
```

静态格式检查不能替代这项实时对象验证；Repository Hygiene 合并后再次查询只作为审计和收敛，不允许先合并再发现类型错误。

未能执行的验证必须写入 PR，不能用“应该没问题”代替。

## 8. 自审与 Draft PR

作者 AI 在 Draft PR 中检查：

- diff 是否只包含任务范围；
- 是否修改了错误的事实源；
- 所有写入是否只发生在非默认分支；
- `work-item` 是否是 Issue、branch 是否包含编号、是否只有一个 primary PR；
- `owner-input` 是否指向所有者创建的需求 Issue；
- 是否误用同号 Issue / PR 或把诊断投递到产品输入；
- 是否存在 helper、retirement、no-op 或 capability-test 对象；
- 是否漏掉失败、取消、空状态和恢复路径；
- 是否有更小、更直接的实现；
- 是否需要 ADR、迁移、风险接受或项目状态更新；
- PR metadata 的风险等级是否不低于机器推断；
- 是否把最佳努力控制错误描述成硬保护。

R0/R1 完成自审后即可把 PR 标为 Ready，前提是没有安全停机。

Draft PR 状态只能是 active、blocked、superseded、abandoned 或 ready。工作转移后必须在同一周期说明未交付内容、replacement 和分支状态并关闭，不能长期遗留。

## 9. 独立 AI 审查

R2/R3 在 PR 仍为 Draft 时使用新的 AI 上下文：

1. 从 primary PR 和当前 HEAD 开始，不读取作者的隐藏推理；
2. 检查目标、架构、数据、安全、测试、回滚和残余风险；
3. 对当前 HEAD 给出批准或阻塞意见；
4. 批准时在 PR 留下：

```text
<!-- zhiwei-independent-review
head: <full-head-sha>
verdict: approved
reviewer: fresh-context-ai
-->
```

5. 将 PR metadata 的 `independent-review` 更新为 `complete`；
6. 最后才把 PR 标为 Ready，让 `ready_for_review` 触发绑定最终 HEAD 和最终合同的新 CI。

HEAD 变化后旧批准自动失效。审查直接留在 primary PR，不创建 review branch 或 review PR。

## 10. 合并

可自主合并的条件：

- PR 非 Draft；
- CI 成功且绑定当前 HEAD；
- PR 合同完整；
- pre-merge GitHub API 已验证 `work-item`、`owner-input`、`supersedes-pr` 对象类型；
- 风险声明不低于机器推断；
- R2/R3 的 metadata 为 `independent-review: complete`；
- R2/R3 有匹配当前 HEAD 的可信独立批准；
- 回滚要求已满足；
- 不存在明确阻塞评论或人类暂停指令；
- 没有开放 Main Incident / 可信停机，或该 PR 是合法 Recovery。

满足后仅通过 Pull Request squash merge 完成。禁止使用 Contents API、Git Ref API 或直接 push 把普通变更写进默认分支。

## 11. Main Provenance

默认分支更新使用两条审计路径：

### 外部 push

- `push` Workflow 查询新 Commit 是否关联到已合并、目标为默认分支的 PR；
- 未验证时创建或更新 R3 Incident；
- 若 main 仍指向该提交且 tree 发生变化，创建 Draft 恢复 PR；
- 若 main 已移动，拒绝基于过期状态恢复。

### Token-driven autonomous merge

- 成功 PR CI 同时触发 Autonomous Merge 和 Main Provenance Dispatch；
- Dispatch sender等待 PR 合并，核对 CI HEAD、base和 squash parent；
- receiver重新查询真实 merged PR、base和 Git parent；
- 任一无法证明合同，登记 Main Incident并停机；
- dispatch payload永远不是自动恢复 tree 的可信来源。

两条路径都不会直接 reset 或 force-push默认分支。它们是 post-merge / 异常 push的检测与恢复提案层，与服务端 Ruleset互补。

## 12. 收尾和连续性

合并后：

- 检查合并 Commit 与关联 primary PR；
- 对治理/高风险 PR 检查 Main Provenance Dispatch 和 receiver；
- Repository Hygiene 审计 WIP、canonical work item、孤立 helper 和对象类型；
- Branch Cleanup 回收关闭 PR 的工作分支；
- 关闭或更新 execution Issue；owner-input 只有用户结果真正交付后才关闭；
- 记录遗留风险和后续项；
- 仅在里程碑、阻塞、当前能力或下一步候选变化时更新 `project-state.md`；
- 没有安全停机时选择下一项工作，不需要等待人工确认。

## 阻塞处理

- 缺外部凭证：记录阻塞，完成不依赖凭证的部分并切换任务。
- 平台能力因当前方案不可用但所有者已接受风险：记录机器可读风险接受和补偿控制，不无限停机。
- 残余风险触发重新评估条件：创建 R3 治理 Issue并暂停相关能力扩张。
- 上游故障：保留复现和证据，避免无界重试。
- 设计冲突：优先 ADR 和独立审查，不等待人工。
- 人类明确暂停：停止相关自动推进，保持分支和状态可恢复。
