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

本记录来自固定发布 Artifact 的真实动态 Capture。它比较进程内 `AgentSession` SDK、原始 JSONL RPC Worker 与发布包 `RpcClient` 执行同一个无工具任务时的接受、运行中、稳定和关闭边界。

Committed Fixture：

```text
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-00.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-01.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-02.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-03.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-04.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-05.b64
```

`gzip + base64 parts` Loader 校验分片、压缩体、解压 JSON、双层指纹，并运行主 Checker 与 `RpcClient get_messages` Checker。Fresh Capture 与 committed Fixture 比较完整对象。

## 固定场景

```text
Prompt:
Compare SDK and RPC lifecycle boundaries using the same deterministic response.

Provider:
zhiwei-sdk-rpc-faux / faux-1

Tools:
none

Final Assistant:
length 1194
sha256 5604485dabc1a8b5d71db37611b23b7ddcc761238cd3621a309934d0fdf9c1f9

External Provider prompts:
0
```

SDK、原始 RPC 与 `RpcClient` 使用相同 Prompt、Model、Faux Provider、响应正文和流式节奏。自动 Extension、Skill、Prompt Template、Theme 和 Context File 发现全部关闭。

## 发布 Artifact Surface

发布包根入口动态导出：

```text
runRpcMode: function
RpcClient: function
```

知微冻结的公开 `RpcClient` 方法：

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

运行时原型仍会枚举 TypeScript 私有实现方法 `send`，但它不属于公开支持合同。

发布包同时确认：根入口重新导出 modes；RPC entry 强制进入 RPC mode；Client 使用共享的严格 JSONL helper；RPC mode 暴露 Prompt Response、`agent_settled`、`get_state` 和 `get_messages`；JSONL Reader 只按 `\n` framing，不使用 `node:readline`。

关键发布文件只保存路径、大小和 SHA-256，不保存源码正文。

## SDK 路径

Prompt 前：

```text
isStreaming=false
isIdle=true
messageCount=0
pendingMessageCount=0
```

`preflightResult(true)` 只表达预检成功。第一次 Public `message_update` 时：

```text
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

SDK Public 投影：

```text
agent_start
turn_start
message_start(user)
message_end(user)
message_start(assistant)
message_end(assistant, stop)
turn_end(assistant, stop)
agent_end(willRetry=false)
agent_settled
```

SDK Extension 额外观察 `input`、`before_agent_start`。宿主显式发送 `session_shutdown(reason=exit)`，随后调用 `session.dispose()`；两者是不同 Host Boundary。

## 原始 JSONL RPC 路径

发送命令：

```text
get_available_models
set_model
set_thinking_level
get_state              # before
prompt
get_state              # during
get_state              # after settled
get_messages
get_last_assistant_text
```

每个 Response 恰好关联一个 Command ID；Runtime Event 没有 Command ID。

### Prompt 接受不是完成

```text
prompt success Response       index 4
agent_start                   index 5
running get_state Response   index 11
agent_settled                index 35
Runtime Events after Response 29
```

`response(command=prompt, success=true)` 是接受 / Preflight Boundary，不是完成。

### State

```text
before  isStreaming=false  messageCount=0
during  isStreaming=true   messageCount=1
after   isStreaming=false  messageCount=2  pendingMessageCount=0
```

运行中查询由 Prompt Response 触发，不用固定墙钟延时定义业务边界。

### Runtime 与最终消息

RPC 核心投影与 SDK Public 相同。最终：

```text
messages=user → assistant
last Assistant length=1194
last Assistant sha256=5604485dabc1a8b5d71db37611b23b7ddcc761238cd3621a309934d0fdf9c1f9
```

RPC `message_update` 只保留增量，没有累计 `partial`。

### stdin EOF

最终查询完成后宿主关闭 stdin：

```text
Extension session_shutdown(reason=quit)
exit  code=0 signal=null
close code=0 signal=null
```

Extension Evidence 在 exit / close 时已持久化；exit 先于 close；stdout 没有未终止 JSONL；stderr 为空。

## 发布 `RpcClient` 的 Messages 边界

### Prompt 前

```text
getState():
  isStreaming=false
  messageCount=0
  pendingMessageCount=0
  sessionIdPresent=true
  sessionFilePresent=false

getMessages():
  []
```

### `prompt()` 返回时

```text
promptReturned=true
isStreaming=true
messageCount=1
pendingMessageCount=0
```

公开 Client Promise 返回同样只是接受边界。

### `agent_settled` 后

```text
getState():
  isStreaming=false
  messageCount=2
  pendingMessageCount=0

getMessages():
  user → assistant

getLastAssistantText():
  length=1194
  sha256=5604485dabc1a8b5d71db37611b23b7ddcc761238cd3621a309934d0fdf9c1f9
```

Runtime trace 从 `agent_start` 到 `agent_settled`，只有一次 Run，`agent_end.willRetry=false`。

### `RpcClient.stop()`

```text
mechanism=RpcClient.stop
transport=SIGTERM
Extension session_shutdown(reason=quit)
stderrPresent=false
```

`RpcClient.stop(SIGTERM)` 与原始 JSONL 的 stdin EOF 是不同关闭表面，不能互相替代或外推为异常退出、Restart、Resume。

## 可以共享与必须分离

可以规范化：Agent Run、Turn、User/Assistant Message、`agent_end(willRetry=false)`、`agent_settled`、最终角色与正文。

必须分别记录：

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

未来协议必须保留 `sourceSurface`、`sourceEventType`、`sourceSequence`、适用的 RPC ID / Command、稳定边界语义与 observed / host-synthesized provenance。

## Fixture 身份与最终 provenance

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

最终合同的 Fresh Capture：

```text
capture head     d4d9a6f175fb0c5575743e3cad562d4e967c46e2
workflow run     31614817292
artifact id      9148765803
artifact digest  sha256:eab20f5bd3efc5244f23f09aa56bb4c5a9bd468d19081a373017e59a62894eb4
```

Manifest 是 provenance 的机器事实源。

## 安全与脱敏

固定 npm integrity/shasum、Node 和容器 digest；禁用 install scripts；curated bundle 与 rootfs 只读；非 root、`cap-drop=ALL`、`no-new-privileges`；不传仓库 Secret、不挂载宿主私有 checkout；不保存原始 Session ID/File、PID、绝对路径、环境转储、Credential、原始 stderr 或思维链；外部 Provider Prompt 数为 `0`。

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

## 未覆盖

不覆盖 Tool/Bash、Steering/Follow-up、Cancel/Retry、Compaction/Replacement、Worker Restart/Resume、非法 JSON、未知命令、Preflight拒绝或 Provider Error。Issue #32 单独验证 Worker 异常退出、重启、恢复和错误边界。
