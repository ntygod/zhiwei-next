# packages/context-compiler/AGENTS.md

适用范围：`packages/context-compiler/**`。Context Compiler 是只读派生层，不是记忆存储或学习引擎。

## 不变量

- 先按 Scope 做硬过滤，再做相关性、优先级或预算排序。
- 只有当前可消费的 active Claim 可以进入胶囊；`superseded`、`expired`、`forgotten` 永不注入。
- `private` 数据默认不得发送给远程模型。
- 同一 Claim 在同一胶囊中只出现一次。
- 每条注入项保留来源标识和选择理由，支持“为什么使用这条记忆”。
- 胶囊创建后在当前 Turn 内不可变；中途产生的新记忆只能影响下一次编译。
- 编译过程确定、可预算、无隐藏模型调用，不修改 Claim 或存储。

## 边界

- 只依赖 `domain`；不依赖 Pi、存储实现或应用层。
- 检索和持久化在调用方完成，本包接收已取得的候选集合。
- Token/字符预算由调用方显式传入；不要读取具体 Provider 的全局配置。

## 当前范围

Context 注入不属于 M0。当前代码只用于锁定零泄漏和不可变胶囊等长期不变量，不扩展为完整检索编排器。

## 测试

重点覆盖跨 Workspace 零泄漏、状态过滤、去重、确定性排序、预算边界、来源解释和输入不可变。