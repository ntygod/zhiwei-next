# AGENTS.md

本文件约束所有在此仓库工作的开发者与代码 Agent。

## 北极星

知微是本地优先的个人认知 Agent。产品优先级依次为：

1. 记得对；
2. 改得掉；
3. 说得清；
4. 不过界；
5. 最后才是功能数量。

## 开始工作前

1. 阅读 `README.md`。
2. 阅读相关 `docs/adr/` 和里程碑文档。
3. 明确修改属于哪个里程碑；不得借当前任务顺手实现未来模块。
4. 对涉及记忆、作用域、权限或主动性的改动，先写用户可感知的验收场景。

## 架构边界

- `packages/domain` 不依赖仓库内其他包。
- `packages/cognition-core` 只依赖 `domain`。
- `packages/context-compiler` 可依赖 `domain`，不得依赖 Runtime Adapter。
- `packages/memory-store` 实现领域端口，但不得认识 Pi 事件。
- `packages/pi-adapter` 是唯一允许接触 Pi SDK 类型的包。
- `apps/*` 负责组合，不承载核心业务规则。
- 派生索引不是事实真源；结构化数据与 Observation Ledger 才是真源。

`scripts/check-architecture.mjs` 会检查部分硬边界。不能通过关闭检查来解决违规。

## 代码原则

- 使用可擦除的 TypeScript 类型；Bootstrap 阶段避免 enum、namespace、装饰器和参数属性。
- 领域状态使用明确的字符串联合类型。
- 输入在边界校验，核心函数保持确定性。
- 时间由调用方传入，不在领域函数内部直接读取系统时间。
- 不生成没有证据的 MemoryClaim。
- 不静默选择冲突事实。
- 不把 Agent 自述“成功”作为真实 Outcome。
- 不展示或持久化模型原始思维链；只保存行动、依据、结果和必要摘要。

## 测试

优先测试不变量，而不是实现细节：

- 用户纠正后旧 Claim 不再 active；
- Workspace 之间零泄漏；
- 没有证据不能接受候选；
- 失败 Outcome 不得晋升为成功 Procedure；
- Attention 默认不能触发外部副作用。

提交前运行：

```bash
npm run check
```

## Git 工作方式

- 一项可验证目标对应一个分支和一个 PR。
- 提交信息使用 Conventional Commits。
- 不提交密钥、真实个人记忆、模型输出转储或本地数据库。
- 架构决策变化必须新增或 supersede ADR，不能只改代码。
- 旧知微代码只能作为参考，复制前必须说明保留它的理由并重新测试。
