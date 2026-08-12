# Pi Runtime 契约 Spike

关联工作：Issue #5、Issue #7、Issue #16、Issue #20、Issue #22、Issue #24、Issue #26、Issue #28、Issue #45；后续依赖为 Issue #32、Issue #49 和 Issue #56。

## 当前状态

```text
source-and-runtime-verified-sdk-rpc-parity
```

历史证据强度继续保留：

```text
PR #6   source-verified / runtime-unverified
PR #8   source-and-runtime-verified
PR #17  source-and-runtime-verified-normal-tool
PR #21  source-and-runtime-verified-retry-success
PR #23  source-and-runtime-verified-follow-up-queue
PR #25  source-and-runtime-verified-cancel-retry-exhaustion
PR #27  source-and-runtime-verified-parallel-tool-ordering
阶段 8  source-and-runtime-verified-compaction-session-replacement
PR #60  source-and-runtime-verified-sdk-rpc-parity
```

`source-verified` 与 `runtime-unverified` 是历史阶段标签，不代表当前能力回退。

## 固定上游与执行环境

```text
Authority       earendil-works/pi
Release Tag     v0.84.1
Tag Commit      53fa77ccd8a279eb87e92294ef3687b03ff80112
Package         @earendil-works/pi-coding-agent
Version         0.84.1
Node engine     >=22.19.0
Node            22.23.1
npm             10.9.8
License         MIT
Container       node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3
```

发布 Tag、Registry Artifact 与 Runtime Fixture 必须指向同一版本身份。发布包使用严格 **LF-only** JSONL；JSON 字符串里的 `U+2028/U+2029`不是记录边界。

## 机器事实源

```text
packages/pi-adapter/fixtures/pi-upstream-baseline.json
packages/pi-adapter/fixtures/sdk-event-surface.json
packages/pi-adapter/fixtures/rpc-contract.jsonl
packages/pi-adapter/fixtures/pi-artifact-runtime.json
packages/pi-adapter/fixtures/pi-lifecycle-normal-tool.json
packages/pi-adapter/fixtures/pi-lifecycle-retry-success.json
packages/pi-adapter/fixtures/pi-lifecycle-follow-up-queue.json
packages/pi-adapter/fixtures/pi-lifecycle-cancel-retry-exhaustion.json
packages/pi-adapter/fixtures/pi-lifecycle-parallel-tool-ordering.json
packages/pi-adapter/fixtures/pi-lifecycle-compaction-session-replacement.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-00.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-01.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-02.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-03.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-04.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-05.b64

scripts/check-pi-spike.mjs
scripts/check-pi-artifact-result.mjs
scripts/check-pi-lifecycle-result.mjs
scripts/check-pi-retry-lifecycle-result.mjs
scripts/check-pi-follow-up-lifecycle-result.mjs
scripts/check-pi-cancel-retry-exhaustion-result.mjs
scripts/check-pi-parallel-tool-ordering-result.mjs
scripts/check-pi-compaction-session-replacement-result.mjs
scripts/check-pi-sdk-rpc-parity-result.mjs
scripts/check-pi-sdk-rpc-client-messages-result.mjs
scripts/pi-sdk-rpc-parity-fixture.mjs
```

Source-derived Fixture 只证明公开源码表面；Runtime Fixture 必须由固定发布 Artifact 动态产生。Fresh Capture 与 committed Fixture 比较完整对象，不能只比较摘要或挑选字段。

## 一、SDK 与 RPC 基础表面

### SDK 公共事件

`AgentSession.subscribe()` 的关键事件包括：

```text
agent_start
agent_end
turn_start
turn_end
message_start
message_update
message_end
tool_execution_start
tool_execution_update
tool_execution_end
auto_retry_start
auto_retry_end
queue_update
agent_settled
```

Tool 生命周期通过真实 `toolCallId` 关联。`agent_end` 表示一次底层 Agent Run 结束；`agent_settled` 表示 Retry、Follow-up、取消或耗尽处理完成后的最终稳定边界。

### npm Artifact 空会话

```text
integrity
sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==

shasum
e098cada629fdeeb9df6e77c6d480d43e1b2c553

contract fingerprint
8862439aa1c3744ec1465ec7336aca7494fa24b859568266e42203d15d84c6d3
```

空会话动态验证 `get_state`、`get_messages`、请求/响应 ID、零 Credential 和零 Prompt。动态 Session ID 只保存存在性，不保存原值。

## 二、正常 Tool 生命周期

详细文档：[`normal-tool-lifecycle.md`](normal-tool-lifecycle.md)。

```text
interactive Prompt
  → Faux Assistant Tool Call
  → echo Tool Start / Update / End
  → Tool Result Message
  → Faux Final Assistant Text
  → agent_end(willRetry=false)
  → agent_settled
  → host-owned session_shutdown(reason=exit)
```

所有 Tool 表面使用同一 `toolCallId=zhiwei-tool-call-1`。关键顺序：

```text
agent_end < agent_settled < session_shutdown
```

最终消息：

```text
user → assistant → toolResult → assistant
```

```text
outer fingerprint   75b0c9fe4d146df046d9657653673be4e7ed21069cae2319a809dcc2da1313e7
capture fingerprint 77d726e9e571f0c61eb8e79b63dbdd11f22498576889851c3650fecf597974d6
```

固定 SDK 嵌入路径中 Inline Extension 从 `input` 开始，没有收到 `session_start`。Session 映射必须建立在 `createAgentSession()` 成功返回的宿主边界。

## 三、自动 Retry 恢复成功

阶段：`source-and-runtime-verified-retry-success`。

```text
Fixture  pi-lifecycle-retry-success.json
Document retry-success-lifecycle.md
```

真实公共顺序：

```text
失败 Run
  → agent_end(willRetry=true)
  → auto_retry_start
  → 恢复 Run
  → auto_retry_end(success=true)
  → agent_end(willRetry=false)
  → agent_settled
```

公共 `agent_end.willRetry=[true,false]`。**Extension auto_retry_start** 与 `auto_retry_end` 均不存在，Extension `agent_end`也没有 Session 层 `willRetry`增强。第一次失败 Assistant 不在最终 `session.messages`，但仍存在于事件流。

```text
outer fingerprint   e87f7365eefbb4d7de7a4570a6c99df7a1fdf26f58aa2a40fab9149cb6deff02
capture fingerprint ed1c450ce6e26be60c29aa6d9a29f13d339cb975999e1a3b4c0a43a5f9b4ac85
```

## 四、Follow-up 队列

阶段：`source-and-runtime-verified-follow-up-queue`。

```text
Fixture  pi-lifecycle-follow-up-queue.json
Document follow-up-queue-lifecycle.md
```

固定事实：

- Follow-up 在**一个公共 Agent Run内追加第二个 Turn**；
- 队列先非空、随后在 Follow-up 消息交付前清空；
- **队列清空不等于 Prompt结束**；
- **Extension不接收 `queue_update`**；
- `session.prompt()`直到 Follow-up 完成、队列排空、Session idle 和最终 `agent_settled` 后才返回；
- 最终消息为 `user → assistant → user → assistant`。

```text
outer fingerprint   00c3f7916a129869b768f7e7147a55a8c783b33e5a55e0e79c13eb45a1d692e8
capture fingerprint 5b2e266feb27155b7ded59c33aa12e6cd060ce89201dc21a8cd35f49a8748386
```

## 五、取消、abortRetry 与 Retry exhaustion

阶段：`source-and-runtime-verified-cancel-retry-exhaustion`。

```text
Fixture  pi-lifecycle-cancel-retry-exhaustion.json
Document cancel-retry-exhaustion-lifecycle.md
```

已冻结：

1. 流式取消后，**部分 Assistant** 以 `stopReason=aborted`保留；
2. Backoff 取消路径存在 **willRetry=true 但没有后续 Run**；
3. Retry exhaustion 的 `agent_end.willRetry=[true,true,false]`，并保留**最终一次失败的 Assistant**。

Prompt Promise 正常 resolve 不能等同任务成功。Extension 仍不提供 `auto_retry_start/end`。

```text
outer fingerprint   b866798d18569c78d5c712254c3ecdecd7a3e02c0ef11458e6b97b0863b1f6e0
capture fingerprint b544631413935d2b3f55f9f9f8bcf15a06944bba682cf48471902e4726f79609
```

## 六、并行 Tool ordering

阶段：`source-and-runtime-verified-parallel-tool-ordering`。

```text
Fixture  pi-lifecycle-parallel-tool-ordering.json
Document parallel-tool-ordering-lifecycle.md
```

Assistant 声明顺序：

```text
alpha → beta → gamma
```

真实完成顺序：

```text
beta → gamma → alpha
```

Tool Result 消息、`turn_end.toolResults` 与最终 Session 消息恢复为：

```text
alpha → beta → gamma
```

该场景证明 **完成顺序与消息顺序分离**。任一表面都不能覆盖其他顺序，所有关联必须使用真实 `toolCallId`。

```text
fixture sha256       0e490594e62886c707274359edd47675b00eba582408fe5fc68ac557f5c1bed2
outer fingerprint   fd372a8e73f4545bd7a34c6ac3e82cfc2d044dca473ae374627b847864389b02
capture fingerprint 164f0e95e7f617c7aa69d1a1b34a5ae7935673c1ee852fa452541d15c1551376
```

## 七、Compaction 与 Session Replacement

阶段：`source-and-runtime-verified-compaction-session-replacement`。

```text
Fixture  packages/pi-adapter/fixtures/pi-lifecycle-compaction-session-replacement.json
Document compaction-session-replacement-lifecycle.md
```

### Manual Compaction

```text
compaction_start → compaction_end
Public `entry_appended`没有出现
模型上下文 before  user → assistant → user → assistant
模型上下文 after   compactionSummary → assistant
```

原始 Message Entry 仍在 Entry 树中；Compaction Summary 是派生上下文，不是原始 Observation。

### Session Replacement

```text
Session Object  session-object-1 → session-object-2 → session-object-3
Session File    session-file-1 → session-file-2 → session-file-1
```

**旧 Public Listener不会自动迁移**。Adapter 必须分别记录 Session File Identity、内存 Session Object Identity、Replacement Generation、Shutdown、Invalidate、Rebind 与 Listener Attach。

```text
fixture sha256       b5d4f92399531ad7eedfebfe2b6f7fa80fe0dfdface6b0a886bd4cbef29d3b03
outer fingerprint   9ebe87b12f0670214fa1244239d21d7a517b2332da2f3f85b3372b8b6895ab75
capture fingerprint f4e3d675207416c961585ee645c5fc43c395320ed7a736da71bae741577b1fee
```

## 八、SDK / RPC 同任务成功路径

阶段：`source-and-runtime-verified-sdk-rpc-parity`。Canonical work item：Issue #45；Primary PR：#60。详细文档：[`sdk-rpc-parity-lifecycle.md`](sdk-rpc-parity-lifecycle.md)。

### 发布 Surface

发布 Artifact 根入口动态导出：

```text
runRpcMode
RpcClient
```

知微冻结的公开 `RpcClient`方法：

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

JavaScript 原型枚举中的 TypeScript 私有方法 `send` 不是公开支持合同。

### 核心语义投影

进程内 SDK 与原始 RPC Runtime Event 均投影为：

```text
agent_start
turn_start
message_start(user)
message_end(user)
message_start(assistant)
message_end(assistant)
turn_end
agent_end(willRetry=false)
agent_settled
```

最终：

```text
messages          user → assistant
Assistant length  1194
Assistant sha256  5604485dabc1a8b5d71db37611b23b7ddcc761238cd3621a309934d0fdf9c1f9
```

### Prompt 接受与完成分离

真实原始 RPC Wire：

```text
prompt success Response       index 4
agent_start                   index 5
running get_state Response   index 11
agent_settled                index 35
Runtime Events after Response 29
```

状态：

```text
before  isStreaming=false  messageCount=0
during  isStreaming=true   messageCount=1
after   isStreaming=false  messageCount=2  pendingMessageCount=0
```

`response(command=prompt, success=true)`只是接受 / Preflight Boundary，不是最终结果。

### 发布 `RpcClient` 的 Prompt 前后 Messages

Prompt 前：

```text
getState()     isStreaming=false  messageCount=0
getMessages()  []
```

`RpcClient.prompt()`返回后立即查询：

```text
isStreaming=true
messageCount=1
```

`agent_settled` 后：

```text
getState()               isStreaming=false  messageCount=2
getMessages()            user → assistant
getLastAssistantText()   length=1194, sha256=5604485d...
```

公开 Client 的 Promise 返回同样只是接受边界。

### 两种关闭面

原始 JSONL宿主路径：

```text
host stdin EOF
→ Extension session_shutdown(reason=quit)
→ Process exit(code=0)
→ Process close(code=0)
```

发布 Client 路径：

```text
RpcClient.stop()
→ SIGTERM
→ Extension session_shutdown(reason=quit)
```

stdin EOF 与 `RpcClient.stop(SIGTERM)`不能合并，也不能外推为 Restart、Resume 或异常退出语义。

### 来源必须保留

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

RPC `message_update`只保存 delta，不含累计 `partial`。统一事件协议必须保留 `sourceSurface` 与原始关联字段。

### 最终 committed Fixture

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
external Provider prompts 0
```

## 隔离与脱敏

所有动态 Probe：

- Workflow 权限仅 `contents: read`；
- checkout 不持久化凭证，不使用 `pull_request_target`，不引用仓库 Secret；
- npm install scripts 禁用；
- digest-pinned 容器、只读根文件系统、非 root、`cap-drop=ALL`、`no-new-privileges`；
- 只挂载 curated read-only Probe Bundle，不挂载宿主私有 checkout；
- 不保存原始 Session ID / File、PID、绝对路径、Token、Cookie、环境转储、用户数据、原始 stderr 或模型思维链；
- 失败证据继续上传，但 Job 保持失败。

## CI 入口

```bash
npm run check:pi-spike
npm run check:pi-artifact
npm run check:pi-lifecycle
npm run check:pi-retry-lifecycle
npm run check:pi-follow-up-lifecycle
npm run check:pi-cancel-retry-exhaustion
npm run check:pi-parallel-tool-ordering
npm run check:pi-compaction-session-replacement
npm run check:pi-sdk-rpc-parity
npm run check

npm run probe:pi:sdk
npm run probe:pi:rpc
npm run probe:pi:artifact
npm run probe:pi:lifecycle
npm run probe:pi:retry-lifecycle
npm run probe:pi:follow-up-lifecycle
npm run probe:pi:cancel-retry-exhaustion
npm run probe:pi:parallel-tool-ordering
npm run probe:pi:compaction-session-replacement
npm run probe:pi:sdk-rpc-parity
```

专用 Workflow：

```text
.github/workflows/pi-parallel-tool-ordering.yml
.github/workflows/pi-compaction-session-replacement.yml
.github/workflows/pi-sdk-rpc-parity.yml
```

## Adapter 与 Observation 约束

知微现在可以：

- 分别建模 Prompt、Agent Run、Turn、Message、Tool、Retry、Queue、Compaction、Session 与 Process；
- 保存被 Retry 替代或取消、但未进入最终 `session.messages` 的证据；
- 分别保存 Tool 声明顺序、真实完成顺序和消息顺序；
- 分别保存原始 Entry、派生 Summary 与当前模型上下文；
- 在 Session Replacement 后显式 Rebind Public Listener；
- 把 RPC Prompt Response 与 `RpcClient.prompt()`返回规范化为接受边界；
- 分别记录 `agent_settled`、最终 State / Messages、stdin EOF、SIGTERM、Extension Shutdown、Exit 与 Close。

下一项 Runtime 证据是 Issue #32：RPC Worker异常退出、重启、Session恢复、非法 JSON、未知命令、Preflight拒绝与已接受后的 Provider Error。完成 #32 前不冻结正式 `NormalizedRuntimeEvent v1`，也不开始 SQLite Observation Ledger 实现。
