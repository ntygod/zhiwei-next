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
| 验证状态 | source-and-runtime-verified |

完整证据、失败恢复记录和隔离模型见 [`docs/spikes/pi-runtime-contract/`](../spikes/pi-runtime-contract/README.md)。机器结果见 [`pi-artifact-runtime.json`](../../packages/pi-adapter/fixtures/pi-artifact-runtime.json)。

当前固定的是 **M0 契约基线**，不是生产依赖承诺。仓库仍未将 Pi 加入正式依赖，也未冻结 `NormalizedRuntimeEvent`。

## 三个不同的集成表面

Pi 至少暴露三类不能混为一谈的表面：

| 表面 | 用途 | 当前确认程度 |
|---|---|---|
| `AgentSession` SDK | Node/TypeScript 进程内嵌入、Session 控制和公开事件订阅 | Release Tag 源码与 npm Artifact root exports 已验证；真实 Prompt 事件待录制 |
| Extension lifecycle | Context、工具策略、Compaction、Session 切换与 Shutdown Hook | 目标映射已建立；真实时序待录制 |
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
- 不传 GitHub Secret、Provider Credential、真实用户数据或完整环境变量；
- 不发送 Prompt；
- 只输出脱敏、可机器复验的结果。

该验证证明发布 Artifact 的公开 manifest 与最小 SDK/RPC 运行表面符合当前基线。它不是完整供应链审计，也不证明 Tarball 每个源码字节都可由 Git Tag 可重现构建得到。

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

该表仍是目标映射，不等于已录制的真实顺序。M0 必须通过固定版本 Runtime Fixture 后才实现生产映射。

## SDK 契约要点

固定源码已经确认：

- `AgentSession.subscribe()` 提供公开 Agent/Turn/Message/Tool 生命周期；
- Tool Start/Update/End 都携带真实 `toolCallId`；
- `agent_end` 带 `willRetry`，自动重试和 Follow-up 可产生多个 `agent_end`；
- Session 最终 idle 后才发出一次 `agent_settled`；
- `AgentSessionRuntime` 替换 Session 后，旧订阅不会自动迁移，调用方必须重新订阅；
- 并行工具的完成事件顺序和 Tool Result 消息顺序可能不同。

发布 Artifact 已确认以下 root exports 可导入：

```text
createAgentSession
createAgentSessionRuntime
SessionManager
ModelRuntime
```

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

## M0 后续技术验证

下一步继续验证：

- Extension 生命周期真实顺序；
- 正常 Prompt、失败、取消、自动重试和 Follow-up；
- 并行 Tool Call / Tool Result 的完整序列；
- Compaction 前后可回放信息；
- Session Replacement 后的重新订阅；
- RPC Worker 退出、重启和错误边界；
- SDK 与 RPC 对同一场景的事件差异。

完成这些 Runtime Fixtures 前，不冻结正式 Observation 协议，也不开始 SQLite Ledger 实现。
