# docs/harness/AGENTS.md

适用范围：`docs/harness/**` 和与 Harness 直接关联的治理文件。

## 定位

- Harness 是治理代码，不是建议性文档。
- 本目录只描述 AI 如何持续开发、验证、审查、合并和交接；产品与架构事实仍放在各自目录。
- `harness.config.json` 是机器可读配置，本文档体系解释其语义。

## 修改规则

- 任何 Harness 语义变化至少按 `R2` 处理。
- 修改自动合并、安全门禁、独立审查或发布权限按 `R3` 处理。
- 当前治理任务仍受任务开始时的旧规则约束，不能依赖本次新规则获得通过。
- 修改文档时同步机器检查；修改机器检查时同步文档和回滚说明。
- 不复制根 `AGENTS.md` 的完整规则，只补充 Harness 局部语义。

## 验证

至少运行：

```bash
npm run check:agents
npm run check:harness
npm run check
```

涉及 PR 合同或自动合并时，还要用代表性 PR metadata 和文件列表执行 `scripts/check-pr-contract.mjs` 的正反样例。

## 独立审查

R2/R3 Harness 变更必须由新的 AI 上下文审查当前 HEAD。审查者应只读取 PR、相关事实源和验证结果，不继承作者的未公开推理；批准记录必须包含当前 HEAD SHA。
