# Pi Runtime 契约 Spike：Source Baseline

状态：**source-verified / runtime-unverified**

关联 Issue：[#5](https://github.com/ntygod/zhiwei-next/issues/5)

本 Spike 为 M0 建立第一份可复现的 Pi 上游契约证据。它只固定源码和公开协议表面，不把尚未实际运行的行为写成已验证事实，也不在本次引入生产依赖或修改 `NormalizedRuntimeEvent`。

## 固定基线

| 项目 | 值 |
|---|---|
| 权威仓库 | `earendil-works/pi` |
| 历史重定向来源 | `badlogic/pi-mono` |
| 上游 Commit | `b647d187932c76d4003728010daeed9c1b496a6a` |
| 正式包名 | `@earendil-works/pi-coding-agent` |
| 包版本 | `0.84.1` |
| Node 要求 | `>=22.19.0` |
| License | MIT |
| 记录日期 | 2026-08-11 |

机器可读基线见 [`pi-upstream-baseline.json`](../../../packages/pi-adapter/fixtures/pi-upstream-baseline.json)。

## 证据来源

所有来源都绑定同一个完整 Commit SHA，不引用浮动的 `main`：

| 证据 | 固定来源 |
|---|---|
| 包名、版本、exports、Node 要求 | [`packages/coding-agent/package.json`](https://github.com/earendil-works/pi/blob/b647d187932c76d4003728010daeed9c1b496a6a/packages/coding-agent/package.json) |
| SDK 使用与 `AgentSession` 表面 | [`docs/sdk.md`](https://github.com/earendil-works/pi/blob/b647d187932c76d4003728010daeed9c1b496a6a/packages/coding-agent/docs/sdk.md) |
| `AgentSessionEvent` | [`agent-session.ts`](https://github.com/earendil-works/pi/blob/b647d187932c76d4003728010daeed9c1b496a6a/packages/coding-agent/src/core/agent-session.ts) |
| 核心 `AgentEvent` 与 `toolCallId` | [`packages/agent/src/types.ts`](https://github.com/earendil-works/pi/blob/b647d187932c76d4003728010daeed9c1b496a6a/packages/agent/src/types.ts) |
| `agent_settled` 语义 | [`6363-agent-settled-event.test.ts`](https://github.com/earendil-works/pi/blob/b647d187932c76d4003728010daeed9c1b496a6a/packages/coding-agent/test/suite/regressions/6363-agent-settled-event.test.ts) |
| RPC 文档 | [`docs/rpc.md`](https://github.com/earendil-works/pi/blob/b647d187932c76d4003728010daeed9c1b496a6a/packages/coding-agent/docs/rpc.md) |
| RPC 命令与响应类型 | [`rpc-types.ts`](https://github.com/earendil-works/pi/blob/b647d187932c76d4003728010daeed9c1b496a6a/packages/coding-agent/src/modes/rpc/rpc-types.ts) |
| LF-only JSONL 实现 | [`jsonl.ts`](https://github.com/earendil-works/pi/blob/b647d187932c76d4003728010daeed9c1b496a6a/packages/coding-agent/src/modes/rpc/jsonl.ts) |
| JSONL 边界测试 | [`rpc-jsonl.test.ts`](https://github.com/earendil-works/pi/blob/b647d187932c76d4003728010daeed9c1b496a6a/packages/coding-agent/test/rpc-jsonl.test.ts) |

各文件 Blob SHA 记录在机器基线中，用于发现同一 Commit 下证据清单被误改或替换。

## 已确认：SDK 表面

上游明确建议 Node.js/TypeScript 嵌入优先直接使用 SDK，而不是默认生成子进程。当前包根导出至少包含：

```text
createAgentSession
createAgentSessionRuntime
SessionManager
ModelRuntime
```

`AgentSession` 提供：

- `sessionId` 和可选 `sessionFile`；
- `prompt()`、`steer()`、`followUp()` 和 `abort()`；
- `subscribe(listener)`；
- `compact()` 和 `abortCompaction()`；
- 当前消息、模型、流式状态和 Agent 状态；
- `dispose()`。

`AgentSessionRuntime` 负责新建、切换、Fork 和导入等“替换当前 Session”的操作。Session 被替换后，订阅绑定的仍是旧对象，调用方必须重新订阅；这意味着知微不能把一次订阅当作 Worker 整个生命周期的永久事件源。

完整 source-derived 事件清单见 [`sdk-event-surface.json`](../../../packages/pi-adapter/fixtures/sdk-event-surface.json)。

## 已确认：事件与关联

核心事件包含：

```text
agent_start / agent_end
turn_start / turn_end
message_start / message_update / message_end
tool_execution_start / tool_execution_update / tool_execution_end
```

三个工具执行事件都携带同一个字段：

```text
toolCallId
```

因此 `toolCallId` 是当前上游已经提供的真实工具生命周期关联键，不应由知微重新猜测或生成。

并行工具模式还存在一个重要顺序约束：

- `tool_execution_end` 可以按实际完成顺序发出；
- Tool Result 消息稍后按 Assistant 原始工具调用顺序追加。

所以 Observation Ledger 必须分别保存“执行完成顺序”和“消息产物顺序”，不能假设两者相同。

## 已确认：`agent_end` 不等于最终稳定

`AgentSessionEvent` 扩展了核心 `agent_end`：

```text
agent_end.messages
agent_end.willRetry
```

并另外提供无载荷事件：

```text
agent_settled
```

上游回归测试证明：

1. 自动重试期间可出现多个 `agent_end`；
2. `willRetry` 区分中间结束与不再重试的结束；
3. `agent_end` handler 新增的 Follow-up 会继续运行；
4. 全部重试和 Follow-up 完成、Session 已 idle 后，才发出一次 `agent_settled`。

因此 M0 后续映射至少要区分：

```text
低层一次 Run 结束          agent_end
Session 本轮最终稳定        agent_settled
Extension / Worker 关闭     session_shutdown / process exit
```

三者不能压缩成一个模糊的“完成”。

## 已确认：RPC 表面

RPC 模式通过：

```bash
pi --mode rpc
```

在 stdin/stdout 上使用 JSONL：

- stdin：Command；
- stdout：`type: "response"` 的响应和异步 Agent Event；
- 所有 Command 可带可选 `id`；
- 对应 Response 返回同一个 `id`；
- `bash_execution_update` 也使用原 Bash Command 的 `id`；
- `get_state` 返回 `sessionId`、流式/压缩状态、Session 文件和消息计数；
- `get_messages` 返回当前消息集合；
- `prompt` 的成功响应只表示输入被接受、排队或立即处理，后续执行失败通过事件和消息流表达，不会返回第二个同 ID Response。

机器可读示例见 [`rpc-contract.jsonl`](../../../packages/pi-adapter/fixtures/rpc-contract.jsonl)。该文件明确标记为 `source-derived-not-runtime-capture`，只能用于解析器和关联规则测试，不能当作真实会话录制。

## 已确认：LF-only JSONL

RPC framing 是严格 **LF-only**：

- 只按 `\n` 分隔记录；
- 可以接受输入中的 `\r\n`，读取时只移除行尾 `\r`；
- JSON 字符串内部的 `U+2028` 和 `U+2029` 必须保留；
- 不能使用 Node `readline`，因为它会把额外 Unicode separator 当作换行。

这条约束已进入 Fixture 和 `check:pi-spike`，未来 Worker 客户端必须使用显式 Buffer + LF parser。

## 动态探针：尚未通过

本次尝试了：

```bash
npm install --save-exact @earendil-works/pi-coding-agent@0.84.1
git clone https://github.com/earendil-works/pi.git
```

当前执行容器为 Node `22.16.0`，低于上游要求的 `22.19.0`；同时容器无法解析 GitHub 和 npm registry 域名：

```text
Could not resolve host: github.com
npm 请求超时，未生成 package-lock.json
```

所以本 PR 的动态结论保持 **runtime-unverified**。这不是上游失败，也不是包不可安装的证据，只是当前执行环境不足。

仓库提供两个无 Provider Credential 探针：

```bash
npm install --save-exact @earendil-works/pi-coding-agent@0.84.1
npm run probe:pi:sdk
npm run probe:pi:rpc
```

- `probe:pi:sdk` 检查发布包和关键根导出；
- `probe:pi:rpc` 使用 `--no-session` 启动 RPC，只调用 `get_state` 与 `get_messages`；
- 两者都不会读取或发送用户记忆，也不要求执行模型 Prompt。

最低复验环境：

```text
Node.js >= 22.19.0
可访问 npm registry
无需模型 Provider 凭证
```

## 本 Spike 的决策边界

本次可以据此继续：

- 使用 `earendil-works/pi` 作为权威上游名称；
- 使用固定 Commit 和精确包版本作为 M0 Spike 基线；
- 以 `toolCallId` 作为工具生命周期真实关联字段；
- 在协议设计中分开 `agent_end`、`agent_settled` 与 Shutdown；
- 为 RPC 实现严格 LF-only JSONL reader。

本次仍然不能据此决定：

- SDK、Extension 或 RPC 哪一个是最终主集成面；
- 正常、取消、并行工具、Compaction 的完整真实事件顺序；
- 发布包在无凭证环境中的实际启动行为；
- Raw Payload 的持久化和脱敏策略；
- 正式 `NormalizedRuntimeEvent` 字段。

这些属于后续动态 Runtime Spike，而不是本 PR 的隐藏范围。
