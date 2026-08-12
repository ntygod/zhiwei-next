# Pi SDK / RPC 同任务生命周期对照

## 状态

```text
status: verified
work-item: #45
primary PR: #60
Pi package: @earendil-works/pi-coding-agent@0.84.1
release tag: v0.84.1
release commit: 53fa77ccd8a279eb87e92294ef3687b03ff80112
Node: 22.23.1
scenario: sdk-rpc-parity
```

本记录来自固定发布 Artifact 的真实动态 Capture，不是根据上游源码推测。它回答：知微分别通过进程内 `AgentSession` SDK、原始 JSONL RPC Worker 和发布包 `RpcClient` 执行同一个无工具任务时，哪些语义可以共享，哪些边界必须保留来源。

完整、脱敏的 committed Fixture：

```text
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-00.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-01.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-02.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-03.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-04.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-05.b64
```

Fixture 使用确定性的 `gzip + base64 parts`。`scripts/pi-sdk-rpc-parity-fixture.mjs` 会验证每个分片、压缩体和解压 JSON 的长度与 SHA-256，恢复完整对象后依次运行主 Checker 与 `RpcClient get_messages` Checker。Fresh Capture 与 committed Fixture 做完整对象比较，不是只比较摘要。

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

SDK、原始 RPC 和 `RpcClient` 使用相同 Prompt、Model、Faux Provider、响应文本、流式速率和 Token Chunk 大小。RPC 场景显式加载 Faux Provider Extension；自动 Extension、Skill、Prompt Template、Theme 和 Context File 发现全部关闭。

## Stage A：发布 Artifact RPC Surface

发布包根入口动态导出：

```text
runRpcMode: function
RpcClient: function
```

冻结为知微依赖的 `RpcClient` 公开方法：

```text
abort
getAvailableModels
getLastAssistantText
getMessages
getState
prompt
setModel
setThinkingLevel
start
stop
waitForIdle
```

动态原型枚举仍会观察发布实现中的其他方法，但知微不把 TypeScript 私有实现方法 `send` 冻结为公开依赖。公开合同只能基于发布类型和调用表面，不能因为 JavaScript 运行时可枚举就扩大支持范围。

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

这些哈希是发布 Artifact 漂移门禁，不用源码提交替代发布包行为证据。

## SDK 路径

Prompt 前：

```text
isStreaming=false
isIdle=true
messageCount=0
pendingMessageCount=0
```

SDK `preflightResult(true)` 发生时 Session 仍为 idle、消息数仍为 `0`。它表达预检成功，不是运行完成。

第一次 Public `message_update`：

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

SDK Public 语义投影：

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

SDK Extension 额外观察 `input`、`before_agent_start`，并由宿主显式发送：

```text
session_shutdown(reason=exit)
```

随后宿主调用 `session.dispose()`。Extension Shutdown Observation 与资源释放是两个 Host Boundary。

## 原始 JSONL RPC 路径

宿主发送九个命令：

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

每个 Command 有唯一 ID；每个 Response 恰好关联一个已发送 ID。Runtime Event 没有 Command ID，不能和 Response 混成同一种 Observation。

### Prompt 接受不是完成

真实 Wire index：

```text
prompt success Response       4
agent_start                   5
running get_state Response   11
agent_settled                35
```

Prompt success Response 后、`agent_settled` 前仍有 **29 条 Runtime Event**。因此：

> `response(command=prompt, success=true)` 是命令接受 / Preflight Boundary，不是 Agent Run 完成，也不是最终稳定边界。

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

运行中查询由 Prompt Response 触发，不用固定墙钟延时定义业务边界。受控 Faux 流速只提供可重复观测窗口。

### Runtime Event 与最终消息

RPC 语义事件投影与 SDK Public 相同：

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

RPC JSONL `message_update` 只保留增量事件，没有累计 `partial` 快照。SDK / Extension 内部事件可能携带 `partial`；长期存储必须按来源表面决定。

### stdin EOF 与 Worker Shutdown

宿主只在 `agent_settled` 和最终查询完成后关闭 stdin：

```text
Extension session_shutdown(reason=quit)
exit  code=0 signal=null
close code=0 signal=null
```

并验证：

- Extension Shutdown Evidence 在 `exit` 和 `close` 时均已存在；
- `exit` 先于 `close`；
- stdout 没有未终止 JSONL；
- stderr 为空；
- 外部 Provider Prompt 为 `0`。

EOF、Extension Shutdown、Process Exit 和 Process Close 必须分别建模。

## 发布 `RpcClient` 的 Messages 边界

第二个 RPC 子场景不直接操作 stdin/stdout，而是调用发布包根导出的 `RpcClient`，补齐 Issue #45 对 `get_state` / `get_messages` 前后状态的要求。

### Prompt 前

```text
getState():
  isStreaming=false
  isCompacting=false
  messageCount=0
  pendingMessageCount=0
  sessionIdPresent=true
  sessionFilePresent=false

getMessages():
  []
```

### `prompt()` 返回时

`RpcClient.prompt()` 在底层 Prompt success Response 到达时返回。紧接着调用 `getState()`：

```text
promptReturned=true
isStreaming=true
messageCount=1
pendingMessageCount=0
```

这再次证明公开 Client 的 Promise 返回也是接受边界，不是完成。

### `agent_settled` 后

```text
getState():
  isStreaming=false
  isCompacting=false
  messageCount=2
  pendingMessageCount=0

getMessages():
  user → assistant

getLastAssistantText():
  length=1194
  sha256=5604485dabc1a8b5d71db37611b23b7ddcc761238cd3621a309934d0fdf9c1f9
```

`RpcClient` 收到的 Runtime trace 从 `agent_start` 开始，以 `agent_settled` 结束，共 `30` 条记录；其中只有一次 Agent Run，`agent_end.willRetry=false`，所有 `message_update` 均不含累计 `partial`。

### `RpcClient.stop()`

```text
mechanism=RpcClient.stop
transport=SIGTERM
Extension session_shutdown(reason=quit)
stderrPresent=false
external Provider prompts=0
```

这个关闭面与原始 JSONL 场景的 stdin EOF 不同。知微必须分别保留：

- 原始 Worker 的 host stdin EOF；
- `RpcClient.stop()` 发起的 SIGTERM；
- 两种路径各自观察到的 Extension Shutdown 与进程边界。

不能把 `RpcClient.stop()` 的成功外推为 EOF、异常退出、Restart 或 Resume 语义。

## 一致语义与必须保留的差异

### 可以规范化

当前无工具单 Prompt 场景中一致：

- Agent Run 开始；
- Turn 开始；
- User / Assistant Message 开始和完成；
- Turn 完成；
- `agent_end(willRetry=false)`；
- 最终 `agent_settled`；
- 最终 Message roles 与 Assistant 正文。

### 不能抹平

必须继续分别记录：

```text
SDK preflightResult
SDK Public Event
SDK Extension Event
RPC Command / Response ID
RPC Runtime Event
RPC State Snapshot
RPC get_messages / get_last_assistant_text
host stdin EOF
RpcClient.stop(SIGTERM)
RPC Extension session_shutdown
Process exit / close
```

后续 `NormalizedRuntimeEvent` 必须保留：

```text
sourceSurface = sdk | extension | rpc | host
sourceEventType
sourceSequence
rpcRequestId / rpcCommand（适用时）
runtimeSessionId alias
observed | host-synthesized provenance
stable-boundary semantics
```

不得因为核心事件投影一致，就删除特定表面的确认、状态和进程边界。

## Committed Fixture 身份

```text
format                       gzip+base64-parts
parts                        6
partLength                   2400
base64Length                 12980
compressedBytes              9734
compressedSha256             08bc2aee20f7009e54867f46bfb4e12caec6a5a5013baf2e119e931d51e7fac4
jsonBytes                    120957
jsonSha256                   0470186fb4af6348805cd1f96a6b538e1e8eb8c02c58dca5747d135693927a0e
outer contract fingerprint   7ea076b4ce562ed7c2cab17fbaa13c95e5922f5698e46145697047ed98486ba0
capture contract fingerprint 8c271d0cc1acb3eab5f10559b2a0c18370e076420a7155445d81bace11c624fc
```

来源：

```text
capture head     7679820d152046facc380ffbb00f14875d3e699f
workflow run     31611776749
artifact id      9147519162
artifact digest  sha256:e9e9e3762e31239b494cfe8fc3a948386f0e65ef8d34ad78b8066a03491694a9
```

## 安全与脱敏

Probe 满足：

- 固定 npm integrity / shasum、Node `22.23.1` 和容器 digest；
- curated source bundle 与 container rootfs 只读；
- 非 root、`cap-drop=ALL`、`no-new-privileges`；
- 不传仓库 Secret，不挂载宿主私有 checkout；
- 不保存绝对路径、原始 Session ID / File、PID、环境转储、Credential、原始 stderr 或模型原始思维链；
- 外部 Provider Prompt 数为 `0`。

## 验证入口

```bash
npm run check:pi-sdk-rpc-parity
npm run check
npm run probe:pi:sdk-rpc-parity
```

关键机器文件：

```text
.github/workflows/pi-sdk-rpc-parity.yml
scripts/probes/pi-sdk-rpc-parity-contract.mjs
scripts/probes/pi-sdk-rpc-parity-faux-extension.mjs
scripts/probes/pi-sdk-rpc-parity-capture.mjs
scripts/probes/pi-sdk-rpc-parity-composite-capture.mjs
scripts/check-pi-sdk-rpc-parity-result.mjs
scripts/check-pi-sdk-rpc-client-messages-result.mjs
scripts/pi-sdk-rpc-parity-fixture.mjs
```

## 明确未覆盖

本 Fixture 不覆盖：

- Tool / Bash；
- Steering / Follow-up；
- Cancel / Retry；
- Compaction / Session Replacement；
- Worker Restart / Session Resume；
- 非法 JSON、未知命令、Preflight 拒绝和 Provider Error。

RPC Worker EOF 以外的重启、恢复与错误边界由 canonical Issue #32 单独验证；不能从当前成功路径外推。
