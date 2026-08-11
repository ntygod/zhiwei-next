# 贡献指南

知微当前处于架构孵化期。贡献的首要目标是减少不确定性，而不是增加功能面。

## 开发流程

1. 从 `main` 创建短生命周期分支。
2. 在 Issue 或 PR 中写清用户场景、范围和明确不做的内容。
3. 先补充领域不变量或端到端验收，再实现代码。
4. 运行 `npm run check`。
5. 提交 Draft PR，说明风险、已知限制和后续工作。

## 提交信息

采用 Conventional Commits：

```text
feat(domain): add observation identity types
fix(context): prevent cross-workspace claim leakage
docs(adr): record Pi runtime boundary
```

## 设计约束

- 不以“旧知微曾经有这个功能”为实现理由。
- 不在 M0 引入记忆自动提取、Embedding、主动提醒或桌面端。
- 不为了未来可能的扩展提前引入微服务、事件总线或插件市场。
- 新依赖必须说明为何不能使用平台能力或小型本地实现。

## 安全问题

请不要在公开 Issue 中粘贴密钥、真实记忆数据或私有工作区内容。安全问题处理方式见 `SECURITY.md`。
