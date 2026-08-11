# 自主开发循环

## 1. 定向

每个新任务先读取：

1. 根 `AGENTS.md`；
2. `project-state.md`；
3. 当前里程碑；
4. 目标目录最近的局部 `AGENTS.md`；
5. 与任务直接相关的 ADR 和架构文档；
6. 开放的安全 Incident。

不要把整个仓库全部装入上下文。

如果存在带 `zhiwei-main-incident` 开放标记的 Issue，立即进入安全停机：不选择普通产品任务，只处理 Incident Recovery 或等待必须由所有者完成的平台配置。

## 2. 选择工作

工作来源按优先级排序：

1. 开放的安全 Incident、数据完整性问题或人类验收失败；
2. 人类明确指令；
3. 主分支 CI 或已发布能力回归；
4. 当前里程碑的阻塞项；
5. 当前里程碑中最小、最高价值的用户可感知纵向切片；
6. 降低后续风险的测试、Spike 或 Harness 维护；
7. 纯清理和美化。

没有合适 Issue 时，AI 可以根据里程碑创建一个。不要为了保持忙碌而生成低价值任务。

## 3. 建立任务合同

Issue 或工作记录至少包含：

- 结果：用户或下一层系统将获得什么；
- 范围：允许修改哪些边界；
- 非目标：本次明确不做什么；
- 验收：可观察、可重复的完成条件；
- 风险：R0–R3；
- 回滚：失败时如何恢复；
- 依赖：是否缺凭证、外部服务、平台权限或前置 PR。

## 4. 创建分支与写入前置检查

任何 GitHub Connector 文件写入前：

1. 读取默认分支名和当前 HEAD；
2. 创建 `feat/`、`fix/`、`docs/`、`chore/`、`spike/`、`ai/` 或 `recovery/` 分支；
3. 确认目标分支名不等于默认分支；
4. 在后续所有写工具调用中显式使用该分支；
5. 第一次写入后确认工作分支 HEAD 前进而默认分支 HEAD 未变化。

分支只承载一个可验证目标，不混入无关问题。若任务需要改变长期架构，先提交 ADR，再继续实现。

严禁：

```text
branch: main
branch: <default branch>
省略 branch 并依赖工具默认值
```

## 5. 实现纵向切片

- 从真实输入走到可验证输出，避免先铺满接口和空实现。
- 领域规则写在领域层；I/O 和 Runtime 细节留在边界。
- 先写不变量或失败用例，再修改行为。
- 任何新增 fallback 都要有明确可观察状态，不能静默降级。
- 时间、ID、模型、随机性和外部系统可替换，便于确定性测试。

## 6. 验证

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
- 默认分支 Commit/Tree provenance。

未能执行的验证必须写入 PR，不能用“应该没问题”代替。

## 7. 自审与 Draft PR

作者 AI 在 Draft PR 中检查：

- diff 是否只包含任务范围；
- 是否修改了错误的事实源；
- 所有写入是否只发生在非默认分支；
- 是否漏掉失败、取消、空状态和恢复路径；
- 是否新增无证据认知、跨 Workspace 泄漏或外部副作用；
- 是否有更小、更直接的实现；
- 是否需要 ADR、迁移或项目状态更新；
- PR metadata 的风险等级是否不低于机器推断；
- Main Incident Recovery 是否引用所有开放事故。

R0/R1 完成自审后即可把 PR 标为 Ready，前提是没有安全停机。

## 8. 独立 AI 审查

R2/R3 在 PR 仍为 Draft 时使用新的 AI 上下文：

1. 从 PR 和当前 HEAD 开始，不读取作者的隐藏推理；
2. 检查目标、架构、数据、安全、测试和回滚；
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

HEAD 变化后旧批准自动失效，必须重新审查。

## 9. 合并

可自主合并的条件：

- PR 非 Draft；
- CI 成功且绑定当前 HEAD；
- PR 合同完整；
- 风险声明不低于机器推断；
- R2/R3 的 metadata 为 `independent-review: complete`；
- R2/R3 有匹配当前 HEAD 的可信独立批准；
- 回滚要求已满足；
- 不存在明确阻塞评论或人类暂停指令；
- 没有开放 Main Incident，或该 PR 明确是引用全部事故的 `main-incident-recovery: yes` R3 恢复 PR。

满足后仅通过 Pull Request squash merge 完成。禁止使用 Contents API、Git Ref API 或直接 push 把普通变更写进默认分支。

## 10. Main Provenance

默认分支更新后，Main Provenance workflow：

- 查询新 Commit 是否关联到已经合并、目标为默认分支的 PR；
- 未关联时创建或更新 R3 Incident；
- 若 main 仍指向该提交且 tree 发生变化，创建 Draft 恢复 PR；
- 若 main 已移动，拒绝基于过期状态自动恢复；
- 永远不直接 reset 或 force-push 默认分支。

该 workflow 是检测与恢复提案层，不替代 GitHub 服务端 Ruleset。

## 11. 收尾和连续性

合并后：

- 关闭或更新 Issue；
- 记录遗留风险和后续项；
- 仅在里程碑、阻塞、当前能力或下一步候选变化时更新 `project-state.md`；
- 若发现 Harness 缺口，创建治理 Issue；
- 没有安全停机时选择下一项工作，不需要等待人工确认。

## 阻塞处理

- 缺外部凭证：记录阻塞，完成不依赖凭证的部分并切换任务。
- 缺仓库 administration / Ruleset 权限：记录明确所有者步骤，并保持相关安全停机。
- 上游故障：保留复现和证据，避免无界重试。
- 设计冲突：优先 ADR 和独立审查，不等待人工。
- 人类明确暂停：停止相关自动推进，保持分支和状态可恢复。
