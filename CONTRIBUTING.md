# 贡献指南

知微采用 **AI-primary** 开发模式：AI 负责日常规划、实现、审查和合并，人类主要通过产品指令、偶尔验收和 PR 历史进行治理。

## 开始前

1. 阅读根 `AGENTS.md` 和目标路径最近的局部规则。
2. 阅读 `docs/harness/project-state.md`、当前里程碑和相关 ADR。
3. 从 GitHub Issue 领取一个可独立验收的目标；没有合适 Issue 时可以先创建。
4. 声明结果、范围、非目标、风险等级和验证方式。

## 开发流程

1. 从 `main` 创建短生命周期分支。
2. 实现最小的端到端纵向切片。
3. 添加不变量、场景或 Contract Fixture。
4. 运行 `npm run check`。
5. 自审完整 diff，创建 Draft PR。
6. 填写 PR 中的 `zhiwei-harness` metadata。
7. 完成后将 PR 标为 Ready。
8. R2/R3 使用新的独立 AI 上下文审查当前 HEAD，并留下批准记录。
9. 满足门禁后由 AI 或自动工作流 squash merge。
10. 更新 Issue、状态和后续项，然后继续下一项工作。

不要求人工 Review。没有人类回复时继续推进；人类明确评论或验收结果优先于自动队列。

## 风险与合并

- `R0/R1`：CI + 作者自审即可自主合并。
- `R2/R3`：需要回滚/恢复说明和当前 HEAD 的独立 AI 审查。
- 治理、CI、自动合并、安全和发布变化按至少 R2，必要时 R3。
- 正常工作不得直接写 `main`，不得重写共享历史。

完整规则见：

- `docs/harness/autonomy-policy.md`
- `docs/harness/development-loop.md`
- `docs/harness/risk-model.md`

## 提交信息

采用 Conventional Commits：

```text
feat(domain): add observation identity types
fix(context): prevent cross-workspace claim leakage
docs(harness): refine autonomous merge contract
```

避免 `misc`、`update`、`changes` 等无信息提交。

## 设计约束

- 不以“旧知微曾经有这个功能”为实现理由。
- 不借当前任务实现未来里程碑。
- 不为了未来假设提前引入微服务、插件市场或复杂抽象。
- 新依赖必须说明为何平台能力或小型本地实现不足。
- 架构决策变化必须新增或 supersede ADR。
- AGENTS/Harness 修改不能为同一任务提供自我豁免。

## 验证

最低要求：

```bash
npm run check
```

若环境阻止验证，在 PR 中写明未运行项、原因、风险和替代证据。

## 安全问题

不要在 Issue、PR、测试 Fixture 或日志中放入密钥、真实个人记忆、私有工作区内容、模型原始思维链或本地数据库。安全问题处理方式见 `SECURITY.md`。
