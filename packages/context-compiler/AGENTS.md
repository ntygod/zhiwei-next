# packages/context-compiler/AGENTS.md

适用范围：`packages/context-compiler/**`。Context Compiler 是只读派生层，不是记忆存储或学习引擎。

## 不变量

- 先按 Scope、隐私、生命周期、有效时间与依赖版本做资格过滤，再做相关性、优先级或预算排序。
- 胶囊的事实区只接受当前可消费的 active Claim；`superseded`、`expired`、`forgotten` 永不注入。WorkingState、Episode、Procedure、Hypothesis 等材料按各自资格和任务门进入明确标识的区域，争议与假设不能伪装成确定事实。
- 旧 `private` 与新 `local-only` 数据不得进入任何模型请求，包括本地模型、摘要器、embedding 和评估模型；其他内容仍须明确外发授权。
- 同一 Claim 在同一胶囊中只出现一次。
- 每条注入项保留来源标识和选择理由，支持“为什么使用这条记忆”。
- 胶囊创建后在当前 Turn 内不可变；中途产生的新记忆只能影响下一次编译。
- 编译过程确定、可预算、无隐藏模型调用，不修改 Claim 或存储。

## 边界

- 只依赖 `domain`；不依赖 Pi、存储实现或应用层。
- 检索和持久化在调用方完成，本包接收已取得的候选集合。
- Token/字符预算由调用方显式传入；不要读取具体 Provider 的全局配置。

## 当前范围

当前代码仍是零泄漏/不可变胶囊哨兵；P0 不启用 Context 注入。P1-06 按[认知合同](../../docs/architecture/cognitive-loop.md)与[任务卡](../../docs/planning/implementation-plan.md)交付正式编译/注入；Procedure 的正式消费等待 P2 的适用性与晋升门。检索编排、模型调用和持久化仍由调用方负责，本包不变为 Agent Loop。

胶囊不可变不代表永远可以发送或消费：调用边界必须在发送、结果接收/物化/发布时重验 epoch 与依赖；失效的胶囊作废重编，不原位修改或继续使用。

## 测试

重点覆盖跨 Workspace 零泄漏、状态过滤、去重、确定性排序、预算边界、来源解释和输入不可变。
