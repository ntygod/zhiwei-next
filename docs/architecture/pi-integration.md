# Pi 集成边界

## 决策

Pi 是知微默认 Agent Runtime，但不是产品本体。优先使用 SDK、Extension 和 RPC，不维护深度 Fork。

## 生命周期映射

| Pi 生命周期 | 知微动作 |
|---|---|
| session_start | 建立 Runtime Session 映射 |
| input | 写入用户 Observation |
| before_agent_start | 请求 Context Capsule（M2） |
| context | 控制每次模型调用的认知预算（M2） |
| tool_call | Policy 评估（M5） |
| tool_result | 写入证据和 Outcome 线索 |
| agent_settled | 形成任务结果和候选（M3） |
| session_before_compact | 固化工作状态（M2） |
| session_shutdown | 完成会话收尾 |

## Adapter 规则

1. 只有 `packages/pi-adapter` 可以导入 Pi SDK 类型。
2. 所有 Pi 事件先转成 `NormalizedRuntimeEvent`。
3. 原始 Pi Payload 是否保留由 Observation 数据策略决定，不能默认完整落盘。
4. Pi Session 是执行状态，不是长期记忆真源。
5. Pi 版本升级必须通过 Adapter Contract Tests 和真实会话回放。

## M0 技术验证

M0 首先验证：

- Pi 包名、版本和 SDK 稳定面；
- Extension 事件顺序；
- Agent Settled 与 Session Shutdown 语义；
- Tool Call / Result 的关联键；
- Compaction 前后的可回放信息；
- RPC Worker 退出、重启和错误边界。

验证完成前，仓库不绑定具体 Pi 依赖版本。
