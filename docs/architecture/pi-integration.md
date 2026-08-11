# Pi 集成边界

## 决策

Pi 是知微默认 Agent Runtime，但不是产品本体。优先使用 SDK、Extension 和 RPC，不维护深度 Fork。

## 当前 M0 Spike 基线

| 项目 | 当前值 |
|---|---|
| 权威上游 | `earendil-works/pi` |
| 固定 Commit | `b647d187932c76d4003728010daeed9c1b496a6a` |
| Coding Agent 包 | `@earendil-works/pi-coding-agent@0.84.1` |
| Node 要求 | `>=22.19.0` |
| 验证状态 | source-verified / runtime-unverified |

详细证据、Blob SHA、事件 Fixture 和动态复验命令见 [`docs/spikes/pi-runtime-contract/`](../spikes/pi-runtime-contract/README.md)。

当前固定的是 **Spike 证据基线**，不是生产依赖承诺。在 SDK/RPC 动态探针和 Extension 真实事件序列完成前，不修改正式 `NormalizedRuntimeEvent`。

## 三个不同的集成表面

Pi 当前至少暴露三类不能混为一谈的表面：

| 表面 | 用途 | 当前确认程度 |
|---|---|---|
| `AgentSession` SDK | Node/TypeScript 进程内嵌入、Session 控制和公开事件订阅 | 固定源码已确认；发布包动态导入待复验 |
| Extension lifecycle | Context、工具策略、Compaction、Session 切换与 Shutdown Hook | 现有设计映射；真实顺序仍需动态 Spike |
| RPC JSONL | 子进程隔离、非 Node 客户端和 Worker 边界 | 类型与 framing 已确认；真实启动待复验 |

知微必须在 `pi-adapter` 内显式标记事件来自哪个表面，不能仅凭同名事件假设载荷和时序相同。

## Extension 生命周期映射

| Pi Extension 生命周期 | 知微动作 |
|---|---|
| session_start | 建立 Runtime Session 映射 |
| input | 写入用户 Observation |
| before_agent_start | 请求 Context Capsule（M2） |
| context | 控制每次模型调用的认知预算（M2） |
| tool_call | Policy 评估（M5） |
| tool_result | 写入证据和 Outcome 线索 |
| agent_settled | 形成 Session 本轮稳定边界 |
| session_before_compact | 固化工作状态（M2） |
| session_shutdown | 完成会话/Worker 收尾 |

该表是目标映射，不等于已录制的真实时序。M0 动态 Spike 必须用固定版本 Fixture 验证后才能写生产映射。

## SDK 契约要点

固定源码已经确认：

- `AgentSession.subscribe()` 提供公开 Agent/Turn/Message/Tool 生命周期；
- Tool Start/Update/End 都携带真实 `toolCallId`；
- `agent_end` 带 `willRetry`，自动重试和 Follow-up 可产生多个 `agent_end`；
- Session 最终 idle 后才发出一次 `agent_settled`；
- `AgentSessionRuntime` 替换 Session 后，旧订阅不会自动迁移，调用方必须重新订阅；
- 并行工具的完成事件顺序和 Tool Result 消息顺序可能不同。

因此知微不得：

- 自行编造 Tool Call 关联键；
- 把 `agent_end` 当成最终成功；
- 把 `agent_settled`、Extension Shutdown 和 Worker 进程退出合并为一个状态；
- 仅凭事件到达顺序重建 Assistant 原始工具调用顺序。

## RPC 契约要点

RPC 使用 stdin/stdout 严格 JSONL：

- 只以 LF (`\n`) 分隔记录；
- 输入可以是 CRLF，但 JSON 字符串内部 `U+2028` / `U+2029` 必须保留；
- 不能使用 Node `readline` 作为协议 reader；
- Command 的可选 `id` 会回传到对应 Response；
- `bash_execution_update.id` 关联原 Bash Command；
- Prompt Response 成功只代表被接受/排队，运行失败仍通过事件和消息表达。

## Adapter 规则

1. 只有 `packages/pi-adapter` 可以导入 Pi SDK 类型。
2. 所有 Pi 事件先转成 `NormalizedRuntimeEvent`。
3. 原始 Pi Payload 是否保留由 Observation 数据策略决定，不能默认完整落盘。
4. Pi Session 是执行状态，不是长期记忆真源。
5. Pi 版本升级必须通过 Adapter Contract Tests 和真实会话回放。
6. Source-derived Fixture 必须明确标记，不能伪装成 Runtime Capture。
7. 未验证的上游行为必须以 Open Question 保留，不能为了适配预想 Schema 而补字段。

## M0 后续技术验证

下一步继续验证：

- 发布包在 Node `>=22.19.0` 下的 SDK 动态导入；
- RPC 在无 Provider Credential 下的 `get_state` / `get_messages`；
- Extension 事件顺序；
- 正常完成、取消、异常和自动重试；
- 并行 Tool Call / Result 的完整序列；
- Compaction 前后可回放信息；
- RPC Worker 退出、重启和错误边界。

验证完成前，仓库不把具体 Pi 包加入生产依赖，也不冻结正式 Observation 协议。
