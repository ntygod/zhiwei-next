# 自主开发授权政策

## 授权结论

知微采用 **AI-primary** 开发模式。项目所有者不承担日常任务拆分、代码审查或合并操作，只会偶尔查看 PR 历史并进行产品验收。

AI 获得对仓库工作的长期授权，包括：

- 选择、创建和关闭工作项；
- 修改代码、文档、测试、依赖、迁移、工作流和配置；
- 修改 `AGENTS.md`、Harness 与项目规划；
- 创建非默认分支、提交、推送、创建和更新 PR；
- 修复 CI、执行重构、维护发布流程；
- 在门禁满足后通过 Pull Request 自主合并；
- 创建版本、发布说明和回滚修复。

该授权不覆盖平台禁止的行为，也不允许捏造凭证、伪造验证、隐藏失败或绕过默认分支流程。

## 当前运行模式

仓库运行于：

```text
public-free-ruleset
```

所有者已将仓库转为 Public并要求继续开发。GitHub Free公开仓库已启用 active的默认分支 Ruleset，2026-08-13 owner/admin读回记录无 bypass；Public源码暴露、管理员配置漂移、Required Check身份和 GitHub可用性风险已重新接受。机器记录见：

```text
docs/harness/risk-acceptance/2026-08-13-public-free.json
docs/harness/rulesets/2026-08-13-main-public-free.json
```

此前 Private + Free风险记录保留为历史。Required context `check`是早注册、无`needs`的只读observer，只接受当前run attempt内唯一`CI required evidence`成功。内部evidence以workflow filename endpoint、`run.path`、机器`display_title`、repo/ref/SHA和时间戳识别三套standalone run；不依赖会等于自定义显示标题的Actions `run.name`。所有必需success ID须共同quiet 60秒，latest变化即重置。observer不复用先前attempt；仅重跑失败Job不足，必须重跑全部Job。

## 默认工作方式

- 任何仓库内容写入前必须读取默认分支 HEAD 并创建非默认分支。
- 正常改动必须通过独立分支和 PR。
- PR 是审计单元；Issue 是工作意图和验收单元；合并提交是交付单元。
- 默认 squash merge，确保主分支历史以可理解的能力变化组织。
- AI 不需要等待人工 Review。人类没有回应时继续推进，除非存在机器标记的安全停机。
- 人类评论一旦出现，视为最高优先级的方向、验收或风险接受输入。

## AI 可以自行决定

- 可逆实现细节；
- 当前里程碑内的任务顺序；
- 小型依赖和工具；
- 测试结构；
- 文档组织；
- 局部重构；
- Issue 的拆分、合并和关闭；
- 在证据充分时更新项目状态。

## 需要提高门禁，但不需要人工逐次批准

以下变化由 AI 自主完成，但必须提高到 R2/R3、补 ADR/恢复方案，并通过独立 AI 审查：

- 架构和进程职责；
- Runtime 协议和稳定关联键；
- 领域状态、作用域、删除和生命周期语义；
- 数据库迁移和数据恢复；
- 安全、隐私、远程数据发送和凭证访问；
- 外部副作用、自主执行和权限默认值；
- CI、自动合并、默认分支 provenance、发布和 Harness 自身。

## 不能用自主权做什么

- 不能向 `main` 或其他默认/受保护分支直接写入来绕过 PR；
- 不能把默认分支名或空 branch 参数传给仓库内容写工具；
- 不能修改规则后在同一任务中依赖新规则降低门禁；
- 不能删除失败测试、放宽断言或跳过检查来制造绿色；
- 不能把能力缺失、数据损坏或协议漂移隐藏为 fallback；
- 不能提交真实个人数据、密钥、数据库、原始模型思维链或敏感转储；
- 不能把“AI 自称成功”当作真实 Outcome；
- 不能在开放 Main Incident 或可信 `developmentPause` 期间继续普通产品开发；
- 不能修改、删除或绕过 Ruleset来使当前 PR通过；服务端配置漂移必须按 R3处理。
- 不能因为仓库 Public而提交真实记忆、凭证、私有仓库内容、数据库或其他敏感数据。

## Main Incident

若 Main Provenance 无法证明默认分支更新来自满足合同的已合并 PR：

1. 创建或更新带 `zhiwei-main-incident` 标记的 R3 Issue；
2. 普通自动合并立即停机；
3. 只有可信真实 push 事件能提供自动恢复 tree；
4. 若当前 main 仍指向该 push 且 tree 发生变化，只创建 Draft 恢复 PR，不直接重置分支；
5. Autonomous Merge在确认squash commit和单一parent后立即发送`repository_dispatch`；post-merge确认或发送失败按`after`登记 Incident，完成后 reconciler只用精确来源CI attempt复验所有已确认同源merge并按相同`after`幂等补发，覆盖失败、取消或响应丢失；API无法确定merge状态也必须持久登记Incident，且不从 payload构造恢复提交；
6. 恢复 PR 必须是 R3、引用全部要求事故并完成当前 HEAD 独立审查；
7. 只有技术缓解、live provenance proof 和明确风险处置完成后才可解除停机。

## 残余风险重新评估

以下任一事件发生时，AI 必须暂停相关扩张并创建 R3治理 Issue：

- 真实用户记忆、生产凭证或生产数据进入系统；
- 多于一名人类协作者获得写权限；
- 引入生产发布、签名或部署 Workflow；
- 仓库可见性、Owner、默认分支或 GitHub方案变化；
- active Ruleset被禁用、删除、绕过或实质修改；
- Ruleset或 Repository安全设置发生可能影响管理员字段的变化，而 owner/admin读回证据未刷新；
- 提议为持续监控引入 PAT或其他长期管理员凭证；
- 再次发生 direct-main Incident。

此时应重新评估当前 Ruleset、GitHub方案或迁移到具有 Team/Enterprise能力的组织。

## 人类介入

项目所有者可以随时：

- 暂停某条路线或全部自动推进；
- 修改产品方向；
- 要求回滚；
- 验收失败并重开 Issue；
- 指定优先级或非目标；
- 接受、收紧或撤销某项明确记录的残余风险。

AI 收到这些输入后必须更新 Issue、PR、风险接受记录和 `project-state.md`，让后续上下文立即继承。

## 紧急恢复

默认恢复路径始终是：

1. 创建最小修复分支和 Draft PR；
2. 只做恢复所需修改；
3. 运行可行门禁；
4. R2/R3 完成独立审查；
5. 通过正常或 Incident Recovery 自动合并；
6. 补根因、长期修复和缺失测试。

只有未经授权的 direct-main 写入正在暴露敏感数据、破坏构建或产生持续外部风险，且 PR 路径无法及时消除暴露时，才允许最小 direct-main 删除/禁用动作。该动作不是常规授权：必须立即自报、创建 R3 Incident、验证恢复 tree、保留历史并进入安全停机。
