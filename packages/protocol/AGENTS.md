# packages/protocol/AGENTS.md

适用范围：`packages/protocol/**`。本包定义 Runtime 中立、可版本化、可持久化的协议，不实现业务判断。

## 边界

- 只允许依赖 `domain`。
- 不导入 Pi SDK、Daemon、Store、模型或 UI 类型。
- 导出的结构不能要求消费者理解 Pi 的类、回调对象或内部枚举。
- 协议负责表达事实；成功判定、记忆提取和主动决策属于其他层。

## 事件设计

每个可持久化事件必须能够表达：

- 稳定事件 ID 和协议版本；
- Runtime、Session 和发生时间；
- 原始事件类型；
- Actor、Observation kind 和结构化 payload；
- 在需要时的 Turn、Tool Call、causation 和 correlation 关系。

缺失的关联信息必须被显式表达或在 Spike 中记录，不能用随机 ID 伪造“已关联”。

## 兼容性

- 修改必填字段、事件含义、顺序、幂等或因果语义前，先做版本决策。
- 新增可选字段也要验证旧 Fixture 和新 Fixture 都能处理。
- 不在未升级版本号的情况下复用同一字段表达新的含义。
- Contract Fixture 是协议事实的一部分；真实 Runtime 行为变化时同时更新结论和测试。

## 验证

优先使用序列化往返、旧版本 Fixture、重复事件、乱序/缺失关联和未知事件测试。协议错误必须显式失败或进入可诊断的 unknown 状态，不静默丢字段。