# Pi SDK / RPC 同任务生命周期对照

## 状态

```text
status: verified
work-item: #45
Pi package: @earendil-works/pi-coding-agent@0.84.1
release tag: v0.84.1
release commit: 53fa77ccd8a279eb87e92294ef3687b03ff80112
Node: 22.23.1
scenario: sdk-rpc-parity
```

本记录来自固定发布 Artifact 的真实动态 Capture，不是依据上游源码推测。它回答：当知微分别采用进程内 `AgentSession` SDK 和隔离 JSONL RPC Worker 执行同一个无工具任务时，哪些生命周期语义一致，哪些边界必须继续保留来源差异。

完整、脱敏的 committed Fixture 位于：

```text
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-00.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-01.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-02.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-03.b64
```

Fixture 使用确定性 `gzip + base64 parts` 保存，原因是事件流包含大量重复的流式更新。`scripts/pi-sdk-rpc-parity-fixture.mjs` 在检查时验证每一部分、压缩体和解压 JSON 的长度与 SHA-256，再恢复完整 JSON 对象；Fresh Capture 与恢复后的 committed Fixture 做完整对象比较，不是只比较摘要。

## 固定场景

```text
Prompt:
Compare SDK and RPC lifecycle boundaries using the same deterministic response.

Provider:
zhiwei-sdk-rpc-faux / faux-1

Tools:
none

Final Assistant text:
length 1194
sha256 5604485dabc1a8b5d71db37611b23b7ddcc761238cd3621a309934d0fdf9c1f9

External Provider prompts:
0
```

SDK 和 RPC 使用相同 Prompt、相同 Model、相同 Faux Provider、相同响应文本、相同流式速率和相同 Token Chunk 大小。RPC Worker 使用显式 Extension 注册 Faux Provider；自动 Extension、Skill、Prompt Template、Theme 和 Context File 发现全部关闭。

## Stage A：发布 Artifact RPC Surface

发布包根入口动态导出：

```text
runRpcMode: function
RpcClient: function
```

`RpcClient` 的 required methods 均存在：

```text
abort
getAvailableModels
getLastAssistantText
getMessages
getState
prompt
send
setModel
setThinkingLevel
start
stop
waitForIdle
```

发布包同时确认：

- 根 `dist/index.js` 重新导出 modes；
- `dist/rpc-entry.js` 强制进入 RPC mode；
- modes index 导出 `runRpcMode` 与 `RpcClient`；
- `RpcClient` 使用共享的严格 JSONL serializer / LF reader；
- RPC mode 对 Prompt 发送独立 success Response；
- RPC mode 暴露 `agent_settled`、`get_state` 和 `get_messages`；
- JSONL reader 只按 `\n` framing，不使用 `node:readline`。

关键发布文件只保存路径、大小和 SHA-256，不保存源码正文：

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `dist/index.js` | 4514 | `de74c5324f2b38317eb3f9ae36ef47b41e130a4501637a0e5fce555a3e1c065b` |
| `dist/rpc-entry.js` | 415 | `a515a6930662a74b4840fb220c3527545c169a84b17bdbae21d4a8ee6b8da30b` |
| `dist/modes/index.js` | 290 | `42bd65ff8aee4f60dfcfcfb9db66772219281585cdbef845df747c8846618a87` |
| `dist/modes/rpc/jsonl.js` | 1562 | `049a9f8ca4242c79f1911ed977949e8d8906b4561f424c2729687f426fabaacf` |
| `dist/modes/rpc/rpc-client.js` | 16524 | `b194a8a98f7eb1f129145a7df17f2e5e6074bcf7ed840faa6c5fa3cbc5193021` |
| `dist/modes/rpc/rpc-mode.js` | 27954 | `b8056af06447a3b89b680519bae1ce1d9063a266d827c3ca92f2dcd57c5ffd2b` |
| `dist/modes/rpc/rpc-types.js` | 211 | `bda239004694b7a087b3d9984e417d1cb4decf0da4483f1604881385240ff374` |

这些哈希是发布 Artifact 漂移门禁，不把上游源码提交当作发布包行为的替代证据。

## SDK 路径

Prompt 前：

```text
isStreaming=false
isIdle=true
messageCount=0
pendingMessageCount=0
```

SDK `preflightResult(true)` 发生时，Session 仍为 idle，消息数仍为 `0`。它表达预检成功，不是运行完成。

第一次 Public `message_update` 时：

```text
public event sequence=6
isStreaming=true
isIdle=false
messageCount=1
pendingMessageCount=0
```

Prompt resolve 后：

```text
isStreaming=false
isIdle=true
messageCount=2
pendingMessageCount=0
messages=user → assistant
```

SDK Public 的语义投影为：

```text
agent_start
turn_start
message_start(user)
message_end(user)
message_start(assistant, pending)
message_end(assistant, stop)
turn_end(assistant, stop)
agent_end(willRetry=false)
agent_settled
```

SDK Extension 额外观察到 `input`、`before_agent_start`，并由宿主显式发送：

```text
session_shutdown(reason=exit)
```

随后宿主调用 `session.dispose()`。这两个动作是不同的 Host Boundary：`dispose()` 本身不能替代 Extension Shutdown Observation。

## RPC 路径

宿主按以下顺序发送九个命令：

```text
1. get_available_models
2. set_model
3. set_thinking_level
4. get_state              # before
5. prompt
6. get_state              # during
7. get_state              # after settled
8. get_messages
9. get_last_assistant_text
```

每个 Command 都有唯一 ID；每个 Response 恰好关联一个已发送 ID。Runtime Event 没有 Command ID，因此不得和 Response 混成同一种 Observation。

### Prompt 接受不是完成

真实 RPC wire index：

```text
prompt success Response       4
agent_start                   5
running get_state Response   11
agent_settled                35
```

因此：

```text
prompt Response < agent_start
prompt Response < running State
running State < agent_settled
prompt Response < agent_settled
```

Prompt success Response 后、`agent_settled` 前仍有 **29 条 Runtime Event**。这直接证明：

> `response(command=prompt, success=true)` 是命令接受 / Preflight Boundary，不是 Agent Run 完成，也不是可持久化的最终稳定边界。

### State Snapshot

```text
before:
  isStreaming=false
  messageCount=0
  pendingMessageCount=0

during:
  isStreaming=true
  messageCount=1
  pendingMessageCount=0

after:
  isStreaming=false
  messageCount=2
  pendingMessageCount=0
```

`get_state` 的运行中观测由 Prompt Response 触发，不使用固定墙钟延时定义业务边界。受控 Faux 流速只保证观测窗口存在。

### Runtime Event 与最终消息

RPC 的语义事件投影与 SDK Public 完全相同：

```text
agent_start
turn_start
message_start(user)
message_end(user)
message_start(assistant, pending)
message_end(assistant, stop)
turn_end(assistant, stop)
agent_end(willRetry=false)
agent_settled
```

最终：

```text
messages=user → assistant
last assistant text length=1194
last assistant text sha256=5604485dabc1a8b5d71db37611b23b7ddcc761238cd3621a309934d0fdf9c1f9
```

RPC JSONL `message_update` 只保留增量事件，没有累计 `partial` 快照。SDK / Extension 内部事件仍可能携带 `partial`；是否保存累计快照必须按来源表面判断，不能用一个全局假设覆盖全部 Surface。

### EOF 与 Worker Shutdown

宿主只在 `agent_settled` 和最终查询完成后关闭 stdin。真实进程边界：

```text
Extension session_shutdown(reason=quit)
exit  code=0 signal=null
close code=0 signal=null
```

并且：

- Extension 脱敏 Shutdown Evidence 在 `exit` 和 `close` 时都已存在；
- `exit` 先于 `close`；
- stdout 没有未终止的尾部 JSONL；
- stderr 为空；
- Worker 没有真实 Provider 请求。

因此 EOF、Extension Shutdown、Process Exit 和 Process Close 必须分别建模，不能只保存“子进程结束”。

## 一致语义与必须保留的差异

### 可以规范化

以下语义在当前无工具单 Prompt 场景中一致：

- Agent Run 开始；
- Turn 开始；
- User Message 开始 / 完成；
- Assistant Message 开始 / 完成；
- Turn 完成；
- `agent_end(willRetry=false)`；
- 最终 `agent_settled`；
- 最终 Message roles 与 Assistant 正文。

### 不能抹平

以下 Observation 只属于特定 Surface 或层级：

- SDK `preflightResult`；
- SDK Public Event；
- SDK Extension `input` / `before_agent_start` / `session_shutdown(exit)`；
- RPC Command 与 Response ID；
- RPC Prompt Acceptance Response；
- RPC `get_state` / `get_messages` Snapshot；
- RPC stdin EOF；
- RPC Extension `session_shutdown(quit)`；
- RPC Process `exit` / `close`。

后续 `NormalizedRuntimeEvent` 必须保留：

```text
sourceSurface = sdk | extension | rpc | host
sourceEventType
sourceSequence
rpcRequestId / rpcCommand（适用时）
runtimeSessionId
observed | host-synthesized provenance
stable-boundary semantics
```

不得仅因为 SDK 和 RPC 的核心事件投影一致，就把 RPC Response、State Snapshot、EOF 或 Process Boundary 删除。

## 安全与脱敏

Probe 满足：

- 固定 npm integrity / shasum；
- 固定 Node `22.23.1`；
- digest-pinned 容器；
- curated source bundle 只读；
- container rootfs 只读；
- 非 root；
- `cap-drop=ALL`；
- `no-new-privileges`；
- 不传仓库 Secret；
- 不挂载宿主私有 checkout；
- 不保存绝对路径、原始 Session ID / File、PID、环境转储、Credential、原始 stderr 或模型原始思维链；
- 外部 Provider Prompt 数为 `0`。

## 验证入口

```bash
npm run check:pi-sdk-rpc-parity
npm run check
```

专用 Workflow：

```text
.github/workflows/pi-sdk-rpc-parity.yml
```

关键机器文件：

```text
scripts/probes/pi-sdk-rpc-parity-contract.mjs
scripts/probes/pi-sdk-rpc-parity-faux-extension.mjs
scripts/probes/pi-sdk-rpc-parity-capture.mjs
scripts/check-pi-sdk-rpc-parity-result.mjs
scripts/pi-sdk-rpc-parity-fixture.mjs
```

## 明确未覆盖

本 Fixture 不覆盖：

- Tool / Bash；
- Steering / Follow-up；
- Cancel / Retry；
- Compaction / Session Replacement；
- Worker Restart / Session Resume；
- 非法 JSON、未知命令和 Provider Error。

RPC Worker EOF、重启与错误边界由后续 canonical Issue #32 单独验证；不能从当前成功路径外推。
