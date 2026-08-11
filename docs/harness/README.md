# ZhiWei Autonomous Development Harness

本目录定义知微作为“AI 主开发者项目”的工作 Harness。它把产品蓝图、里程碑、代码、验证和 GitHub 历史连接成一条可持续、可审计的自主开发循环。

## 目标

新的 AI 上下文在没有人工交接时也应能回答：

1. 项目最终要成为什么；
2. 当前处于哪个里程碑；
3. 下一项最值得做的工作是什么；
4. 哪些边界不能破坏；
5. 如何证明改动正确；
6. 什么条件下可以自主合并；
7. 上一次任务留下了哪些风险和阻塞；
8. 默认分支的每次更新是否来自经过验证的 Pull Request。

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
| 默认分支保护与事故 | `main-protection.md`、`incidents/`、Main Provenance workflow |
| 已实现现实 | 代码、测试、CI 和合并后的 PR |
| 待办队列 | GitHub Issues 与当前里程碑 |

## 自主循环

```text
读取规则、项目状态和开放 Incident
        ↓
没有安全停机时，选择当前里程碑最高价值 Issue
        ↓
读取 main HEAD并创建非默认分支
        ↓
声明目标、非目标、风险和验证
        ↓
在独立分支实现最小纵向切片
        ↓
运行局部检查与 npm run check
        ↓
自审 diff；R2/R3 由独立 AI 上下文复审当前 HEAD
        ↓
创建或更新 PR，记录证据和回滚
        ↓
满足门禁后自主 squash merge
        ↓
Main Provenance 验证合并提交关联的 PR
        ↓
更新 Issue、项目状态和下一步候选
```

详细步骤见 `development-loop.md`。

## 权限模型

项目所有者授予 AI 长期开发权限，不要求人工逐次批准。AI 可以修改仓库内容和治理规则，也可以管理 Issue、PR、CI、依赖、迁移和发布。

权限不包含绕过默认分支保护：

- 所有正常仓库内容写入必须先创建非默认分支；
- 全部重要工作通过 PR 留痕；
- 风险必须真实分类；
- 自动化门禁不能被当前改动绕过；
- R2/R3 需要新的独立 AI 上下文审查当前 HEAD；
- 安全、隐私、默认分支和破坏性变化必须有恢复证据；
- 人类明确介入时立即服从和更新项目状态。

完整政策见 `autonomy-policy.md`。

## Main 分支保护

仓库采用三层防护：

1. **GitHub 服务端 Ruleset / Branch Protection**：真正阻止 direct push；配置见 `main-protection.md`。
2. **Main Provenance workflow**：检查每次 main push 是否关联已合并 PR；未授权时创建 R3 Incident，并在 tree 仍处于该提交时创建 Draft 恢复 PR。
3. **Incident-aware autonomous merge**：开放 Main Incident 存在时，普通 PR 自动合并停机；只有引用全部事故的 R3 恢复 PR可以继续。

仓库内 Workflow 是检测与恢复提案层，不能替代服务端 pre-receive 规则。当前服务端保护状态以 `harness.config.json` 和 `project-state.md` 为准。

## 机器门禁

`npm run check` 至少包含：

- 架构边界检查；
- `AGENTS.md` 层级与引用检查；
- main provenance 事故与恢复链检查；
- Harness 配置和必需文件检查；
- Pi source/runtime 契约检查；
- 自动化测试。

PR 还会执行 `scripts/check-pr-contract.mjs`，核对风险、治理变更、独立审查和 Main Incident Recovery 声明。CI 成功后，默认分支上的 `autonomous-merge.yml` 只会合并满足当前安全状态的非 Draft PR。

## 连续性

`project-state.md` 是轻量快照，而不是第二套项目管理系统。它只记录：

- 当前里程碑；
- 最近完成的能力；
- 当前安全停机或阻塞；
- 下一批候选工作；
- 后续 Agent 必须注意的风险。

具体任务仍以 GitHub Issue、PR、Fixture 和 CI 为准。

## Harness 本身也是代码

Harness 会随项目演进。AI 应主动发现规则漂移、失效命令、重复规则和缺失门禁，并通过治理 PR 修复。治理规则不享有永久正确性，但修改它们必须遵守 `self-maintenance.md`，不能为了让同一任务通过而临时降低标准。
