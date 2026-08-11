# Pi 集成边界

## 决策

Pi 是知微默认 Agent Runtime，但不是产品本体。优先使用 SDK、Extension 和 RPC，不维护深度 Fork。

## 当前 M0 基线

| 项目 | 当前值 |
|---|---|
| 权威上游 | `earendil-works/pi` |
| Release Tag | `v0.84.1` |
| Tag Commit | `53fa77ccd8a279eb87e92294ef3687b03ff80112` |
| Coding Agent 包 | `@earendil-works/pi-coding-agent@0.84.1` |
| Node 要求 | `>=22.19.0` |
| Registry Artifact | integrity 与 shasum 已核对 |
| SDK 动态导入 | 已验证 |
| RPC 空会话启动 | 已验证，无凭证、无 Prompt |
| SDK 正常单 Tool 会话 | 已验证，无外部 Provider、无副作用 |
| Extension 正常单 Tool 生命周期 | 已验证，包含 Tool、settled 与 shutdown 边界 |
| 验证状态 | source-and-runtime-verified-normal-tool |

完整来源、失败恢复记录和隔离模型见 [`docs/spikes/pi-runtime-contract/`](../spikes/pi-runtime-contract/README.md)。机器结果：

```text
packages/pi-adapter/fixtures/pi-artifact-runtime.json
packages/pi-adapter/fixtures/pi-lifecycle-normal-tool.json
```

当前固定的是 **M0 契约基线**，不是生产依赖承诺。仓库仍未将 Pi 加入正式依赖，也未冻结 `NormalizedRuntimeEvent`。

## 三个不同的集成表面

Pi 至少暴露三类不能混为一谈的表面：

| 表面 | 用途 | 当前确认程度 |
|---|---|---|
| `AgentSession` SDK | Node/TypeScript 进程内嵌入、Session 控制和公开事件订阅 | 发布 Artifact、空 Session 和正常单 Tool Prompt 已动态验证 |
| Extension lifecycle | Context、工具策略、Compaction、Session 切换与 Shutdown Hook | 正常单 Tool 路径已动态验证；Retry、取消、Compaction 等待后续 Fixture |
| RPC JSONL | 子进程隔离、非 Node 客户端和 Worker 边界 | framing、命令类型及无凭证空 Session 启动已验证；真实任务时序待录制 |

`pi-adapter` 必须显式标记事件来自哪个表面，不能仅凭同名事件假设载荷和时序相同。

## npm Artifact 信任边界

第三方 Pi Artifact 的动态验证采用隔离 CI，而不是在普通检查 Job 或私有 checkout 中执行。

约束包括：

- 精确包版本；
- registry integrity、shasum 与实际 Tarball 字节交叉核对；
- Tarball manifest 与源码基线的公开表面比对；
- 禁用 npm install scripts；
- digest-pinned Node 容器；
- 容器只读根文件系统、非 root、零 capability、no-new-privileges；
- 不挂载宿主仓库，只挂载只读 curated probe bundle；
- 不传 GitHub Secret、真实 Provider Credential、用户数据或完整环境变量；
- 正常生命周期场景只使用 Pi 发布包自带的内存 Faux Provider；
- 自定义 `echo` Tool 不读取文件、不访问网络、不产生外部副作用；
- 只输出脱敏、可机器复验的结果。

Artifact 基线验证证明发布包的公开 manifest 与最小 SDK/RPC 运行表面符合当前基线。Normal Tool Fixture 进一步证明同一精确 Artifact 可以在零外部 Provider Prompt 下执行真实 Agent Tool Loop。它们都不是完整供应链审计，也不证明 Tarball 每个源码字节都可由 Git Tag 可重现构建得到。

## 已验证的正常单 Tool 生命周期

固定场景：

```text
interactive prompt
  → Faux assistant tool call: echo(value=lifecycle-input)
  → echo start / update / end
  → tool result
  → Faux final assistant text
  → agent_end(willRetry=false)
  → agent_settled
  → host-owned session_shutdown(reason=exit)
```

关键证据：

- Faux Provider 调用两次，剩余响应为零；
- 发送给外部 Provider 的 Prompt 数为零；
- `AgentSession` Tool Start/Update/End、Extension `tool_call` / `tool_result` 与 Tool `execute` 都使用真实 `toolCallId = zhiwei-tool-call-1`；
- Session 消息角色顺序为 `user → assistant → toolResult → assistant`；
- 正常路径只有一次 `agent_end`、一次 `agent_settled`；
- `agent_end < agent_settled < session_shutdown`；
- fresh CI Capture 与 committed Fixture 的完整契约指纹一致。

详细事件表见 [`normal-tool-lifecycle.md`](../spikes/pi-runtime-contract/normal-tool-lifecycle.md)。

## Extension 生命周期映射

| Pi Extension 生命周期 | 知微动作 | 当前证据 |
|---|---|---|
| session_start | 建立 Runtime Session 映射 | SDK `createAgentSession` 正常 Fixture 中 Inline Extension **未观察到**；不能作为唯一建链入口 |
| input | 写入用户 Observation | 已观察，为 Inline Extension 的首个事件 |
| before_agent_start | 请求 Context Capsule（M2） | 已观察 |
| context | 控制每次模型调用的认知预算（M2） | 未纳入本次 Capture，待 M2/后续 Fixture |
| tool_call | Policy 评估（M5） | 已观察，携带真实 `toolCallId` 和结构化 input |
| tool_result | 写入证据和 Outcome 线索 | 已观察，与 `tool_call` 使用同一 ID |
| agent_end | 一次底层 Agent Run 结束 | 已观察；正常路径 `willRetry=false`，仍不能当最终稳定边界 |
| agent_settled | 形成 Session 本轮稳定边界 | 已观察，位于 `agent_end` 之后 |
| session_before_compact | 固化工作状态（M2） | 待 Compaction Fixture |
| session_shutdown | 完成会话/Worker 收尾 | 已观察；由宿主通过 ExtensionRunner 明确发出 |

### `session_start` 的真实边界

本次使用：

```text
createAgentSession({
  sessionStartEvent: { type: "session_start", reason: "startup" },
  extensionFactories: [inlineExtension]
})
```

但发布 Artifact 的 Inline Extension 事件序列从 `input` 开始，没有收到 `session_start`。因此 M0 的适配结论是：

> 知微必须在 SDK Session 创建成功的宿主边界建立 Session 映射，不能只依赖 Extension `session_start`。

后续可以单独验证其他启动路径、恢复 Session 和 CLI/Extension 加载方式是否暴露 `session_start`，但不得把它假定为所有 SDK 嵌入路径的可靠首事件。

### `session_shutdown` 的真实边界

`AgentSession.dispose()` 本身负责释放订阅和资源，不替宿主表达产品级 Shutdown 语义。本 Fixture 在 Session 已 idle 后，由宿主显式调用：

```text
session.extensionRunner.emit({
  type: "session_shutdown",
  reason: "exit"
})
```

随后再 `dispose()`。因此 `session_shutdown` 是宿主生命周期合同，不应和 `agent_settled` 或进程退出合并为同一个事件。

## SDK 契约要点

固定源码与动态 Fixture已经确认：

- `AgentSession.subscribe()` 提供 Agent/Turn/Message/Tool 生命周期；
- Tool Start/Update/End 都携带真实 `toolCallId`；
- Tool Result Message 在 Tool Execution End 之后进入消息流；
- 一个 Tool Use 会结束当前 Turn，并触发新的 Turn 获取最终 Assistant 输出；
- `agent_end` 带 `willRetry`，自动重试和 Follow-up 可产生多个 `agent_end`；
- Session 最终 idle 后才发出一次 `agent_settled`；
- `AgentSessionRuntime` 替换 Session 后，旧订阅不会自动迁移，调用方必须重新订阅；
- 并行工具的完成事件顺序和 Tool Result 消息顺序可能不同；
- Message Update 是流式分块，不是持久化领域边界，不能逐条映射为 Observation。

发布 Artifact 已确认以下 root exports 可导入：

```text
createAgentSession
createAgentSessionRuntime
SessionManager
ModelRuntime
```

正常 Tool Fixture 还动态使用：

```text
DefaultResourceLoader
SettingsManager
defineTool
@earendil-works/pi-ai/providers/faux
```

因此知微不得：

- 自行编造 Tool Call 关联键；
- 把 `agent_end` 当成最终成功；
- 把 `agent_settled`、Extension Shutdown 和 Worker 进程退出合并为一个状态；
- 仅凭事件到达顺序重建 Assistant 原始并行工具顺序；
- 把每一个流式 `message_update` 直接写成长期 Observation；
- 把 Extension `session_start` 当作 SDK 嵌入场景唯一可靠的 Session 建链事件。

## RPC 契约要点

RPC 使用 stdin/stdout 严格 JSONL：

- 只以 LF (`\n`) 分隔记录；
- 输入可以是 CRLF，但 JSON 字符串内部 `U+2028` / `U+2029` 必须保留；
- 不能使用 Node `readline` 作为协议 reader；
- Command 的可选 `id` 会回传到对应 Response；
- `bash_execution_update.id` 关联原 Bash Command；
- Prompt Response 成功只代表被接受/排队，运行失败仍通过事件和消息表达。

动态验证已经证明 `pi --mode rpc --no-session` 的 CLI JavaScript 入口可由 Node 在 noexec 临时文件系统中加载，并在零 Provider Credential、零 Prompt 下完成：

```text
get_state
get_messages
```

原始 Session ID 只在运行时检查其存在性，不进入持久化 Fixture。

## Adapter 规则

1. 只有 `packages/pi-adapter` 可以导入 Pi SDK 类型。
2. 所有 Pi 事件先转成 `NormalizedRuntimeEvent`。
3. 原始 Pi Payload 是否保留由 Observation 数据策略决定，不能默认完整落盘。
4. Pi Session 是执行状态，不是长期记忆真源。
5. Pi 版本升级必须通过源码基线、Registry Artifact 检查、Adapter Contract Tests 和真实会话回放。
6. Source-derived Fixture 必须明确标记，不能伪装成 Runtime Capture。
7. Runtime Fixture 必须记录运行环境、来源、隔离方式和未验证边界。
8. 未验证行为必须作为 Open Question 保留，不能为匹配预想 Schema 而补字段。
9. SDK Session 映射由宿主 Session 创建边界负责；Extension `session_start` 只能作为附加信号。
10. `session_shutdown` 由宿主明确发出并单独记录；`dispose()` 只负责资源释放。

## M0 后续技术验证

下一步继续验证：

- 自动重试与多次 `agent_end`；
- Follow-up 队列与最终 `agent_settled`；
- 用户取消和 Abort 边界；
- 并行 Tool Call / Tool Result 的完整序列；
- Compaction 前后可回放信息；
- Session Replacement 后的重新订阅；
- RPC 真实 Prompt、Worker 退出、重启和错误边界；
- SDK 与 RPC 对同一场景的事件差异。

完成这些 Runtime Fixtures 前，不冻结正式 Observation 协议，也不开始 SQLite Ledger 实现。
