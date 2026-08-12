# Pi Runtime 契约 Spike

关联工作：Issue #5、Issue #7、Issue #16、Issue #20、Issue #22、Issue #24、Issue #26、Issue #28、Issue #45；后续依赖为 Issue #32、Issue #49 和 Issue #56。

## 状态

```text
source-and-runtime-verified-sdk-rpc-parity
```

### 历史状态演化

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
当前    source-and-runtime-verified-sdk-rpc-parity
```

早期状态作为证据链保留，不代表当前能力回退。`source-verified`、`runtime-unverified` 等历史术语继续存在，是为了区分当时的证据强度，而不是重新声明当前状态。

## 已验证范围

当前已经用固定 Pi 发布 Artifact、隔离 Probe、committed Fixture 和精确 Checker 验证：

- Pi Release Tag、npm Registry Artifact、SDK Root Exports、RPC CLI 与严格 LF-only JSONL；
- 无凭证 RPC 空 Session；
- SDK + Extension 正常单 Tool 生命周期、真实 `toolCallId` 和 `agent_settled`；
- 自动 Retry 恢复成功，以及 Public SDK 与 Extension 的事件差异；
- Follow-up 队列、一个公共 Agent Run 内的两个 Turn 与最终单次稳定边界；
- 流式取消、`abortRetry()`、Retry exhaustion 与失败消息保留；
- 并行 Tool 的声明顺序、完成顺序与 Tool Result 消息顺序分离；
- Manual Compaction、原始 Entry、派生 Summary 与当前模型上下文分层；
- Session Replacement、Listener Rebind、Session File Identity 与内存 Session Object Identity；
- 同一无 Tool Prompt 在进程内 SDK 与真实 JSONL RPC Worker 上的成功路径对照；
- RPC Prompt 接受 Response、运行中 State、`agent_settled`、最终 Messages、stdin EOF、Extension Shutdown、Process Exit 与 Process Close 的独立边界。

尚未验证：RPC Worker Restart、Session Resume、非法 JSON、未知命令、Provider Error、异常退出和重启后的关联恢复。这些属于 canonical Issue #32，不能从当前成功路径外推。

## 固定上游基线

```text
Authority       earendil-works/pi
Release Tag     v0.84.1
Tag Commit      53fa77ccd8a279eb87e92294ef3687b03ff80112
Package         @earendil-works/pi-coding-agent
Version         0.84.1
Node engine     >=22.19.0
License         MIT
Node            22.23.1
npm             10.9.8
Container       node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3
```

固定 Release Tag 的原因：包版本字段不会随未发布 Commit 自动变化；Tag、Registry Artifact 与 Runtime Fixture 必须指向同一版本身份。

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

scripts/check-pi-spike.mjs
scripts/check-pi-artifact-result.mjs
scripts/check-pi-lifecycle-result.mjs
scripts/check-pi-retry-lifecycle-result.mjs
scripts/check-pi-follow-up-lifecycle-result.mjs
scripts/check-pi-cancel-retry-exhaustion-result.mjs
scripts/check-pi-parallel-tool-ordering-result.mjs
scripts/check-pi-compaction-session-replacement-result.mjs
scripts/check-pi-sdk-rpc-parity-result.mjs
scripts/pi-sdk-rpc-parity-fixture.mjs
```

其中 source-derived Fixture 只证明发布源码表面；Runtime Fixture 由真实发布 Artifact 动态产生。Fresh Capture 必须与 committed Fixture 做完整对象比较，不能只比较摘要或挑选字段。

## 一、源码与 Artifact 契约

### SDK 事件表面

`AgentSession.subscribe()` 的关键公共事件包括：

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

`agent_end` 是一次底层 Agent Run 的结束；`agent_settled` 是 Retry、Follow-up、取消或耗尽路径处理完成后的稳定边界。两者不能混用。

### RPC JSONL

RPC 使用严格 LF-only JSONL：

- 每条记录以 `\n` 结束；
- 输入允许 CRLF；
- JSON 字符串中的 `U+2028/U+2029`不是记录边界；
- 不使用 Node `readline` 解析协议；
- Command 的 `id` 只关联对应 Response；
- Runtime Event 不继承 Command ID；
- Prompt Response 成功只表示请求通过预检并被接受，不表示最终任务成功。

### npm Artifact 空会话

```text
integrity
sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==

shasum
e098cada629fdeeb9df6e77c6d480d43e1b2c553

contract fingerprint
8862439aa1c3744ec1465ec7336aca7494fa24b859568266e42203d15d84c6d3
```

空会话验证 `get_state`、`get_messages`、请求/响应 ID、零 Credential 和零 Prompt；动态 Session ID 只记录存在性，不保存原值。

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

所有 Tool 表面使用同一真实 `toolCallId`：`zhiwei-tool-call-1`。关键顺序为：

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

Inline Extension 在固定 SDK 嵌入路径中从 `input` 开始，没有收到 `session_start`。因此 Session 映射必须建立在 `createAgentSession()` 成功返回的宿主边界，不能只依赖 Extension 事件。

## 三、自动 Retry 恢复成功

详细文档：[`retry-success-lifecycle.md`](retry-success-lifecycle.md)。

阶段标识：`source-and-runtime-verified-retry-success`。Fixture：`pi-lifecycle-retry-success.json`。

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

`agent_end.willRetry=[true,false]`。Extension没有收到 Retry 专有事件；`Extension auto_retry_start = 0`，也没有 `auto_retry_end`，Extension `agent_end` 不包含 Public Session 的 `willRetry` 增强字段。

第一次失败 Assistant 不在最终 `session.messages`，但仍存在于事件流；Observation Ledger 不能只从最终消息重建 Retry 历史。

```text
outer fingerprint   e87f7365eefbb4d7de7a4570a6c99df7a1fdf26f58aa2a40fab9149cb6deff02
capture fingerprint ed1c450ce6e26be60c29aa6d9a29f13d339cb975999e1a3b4c0a43a5f9b4ac85
```

## 四、Follow-up 队列

详细文档：[`follow-up-queue-lifecycle.md`](follow-up-queue-lifecycle.md)。

阶段标识：`source-and-runtime-verified-follow-up-queue`。Fixture：`pi-lifecycle-follow-up-queue.json`。

固定场景证明：

- Follow-up 在一个公共 Agent Run内追加第二个 Turn；
- 队列先非空、再在 Follow-up 消息交付前清空；
- 队列清空不等于 Prompt结束；
- Extension不接收 `queue_update`；
- `session.prompt()`覆盖排入的 Follow-up，直到队列排空、Session idle 和最终 `agent_settled` 后才返回；
- 最终消息为 `user → assistant → user → assistant`。

```text
outer fingerprint 00c3f7916a129869b768f7e7147a55a8c783b33e5a55e0e79c13eb45a1d692e8
```

## 五、取消、abortRetry 与 Retry exhaustion

详细文档：[`cancel-retry-exhaustion-lifecycle.md`](cancel-retry-exhaustion-lifecycle.md)。

阶段标识：`source-and-runtime-verified-cancel-retry-exhaustion`。Fixture：`pi-lifecycle-cancel-retry-exhaustion.json`。

已冻结三个事实：

1. 流式取消后，部分 Assistant 以 `stopReason=aborted` 保留；
2. Backoff 取消路径存在 `willRetry=true 但没有后续 Run`；
3. Retry exhaustion 的公共 `agent_end.willRetry` 为 `[true, true, false]`，最终一次失败的 Assistant 保留在 Session 中。

`session.prompt()` Promise 的正常 resolve 不能等同任务成功。Extension仍不提供 `auto_retry_start/end`，也不能自行补造 Session 级 Retry 字段。

```text
outer fingerprint b866798d18569c78d5c712254c3ecdecd7a3e02c0ef11458e6b97b0863b1f6e0
```

## 六、并行 Tool ordering

详细文档：[`parallel-tool-ordering-lifecycle.md`](parallel-tool-ordering-lifecycle.md)。

阶段标识：`source-and-runtime-verified-parallel-tool-ordering`。Fixture：`pi-lifecycle-parallel-tool-ordering.json`。

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

该场景证明 **完成顺序与消息顺序分离**。Adapter 不能仅凭 `tool_execution_end` 或 Extension `tool_result` 重建原始 Tool Call 顺序；所有表面必须通过真实 `toolCallId` 关联。

```text
fixture sha256      0e490594e62886c707274359edd47675b00eba582408fe5fc68ac557f5c1bed2
outer fingerprint  fd372a8e73f4545bd7a34c6ac3e82cfc2d044dca473ae374627b847864389b02
capture fingerprint 164f0e95e7f617c7aa69d1a1b34a5ae7935673c1ee852fa452541d15c1551376
```

## 七、Compaction 与 Session Replacement

详细文档：[`compaction-session-replacement-lifecycle.md`](compaction-session-replacement-lifecycle.md)。

阶段标识：`source-and-runtime-verified-compaction-session-replacement`。Fixture：`packages/pi-adapter/fixtures/pi-lifecycle-compaction-session-replacement.json`。

### Manual Compaction

```text
compaction_start → compaction_end
Public entry_appended   = 0
模型上下文 before  user → assistant → user → assistant
模型上下文 after   compactionSummary → assistant
```

捕获脚本显式订阅了 `entry_appended`，但 Public `entry_appended`没有出现。原始四条 Message Entry 仍在 Entry 树中，Compaction Summary 是派生上下文，不是原始 Observation。

### Session Replacement

```text
Session Object  session-object-1 → session-object-2 → session-object-3
Session File    session-file-1 → session-file-2 → session-file-1
```

旧 Public Listener不会自动迁移。Adapter 必须显式记录 Session File Identity、内存 Session Object Identity、Replacement Generation，以及 Shutdown、Invalidate、Rebind、Listener Attach 与 `withSession()` 边界。

```text
fixture sha256      b5d4f92399531ad7eedfebfe2b6f7fa80fe0dfdface6b0a886bd4cbef29d3b03
outer fingerprint  9ebe87b12f0670214fa1244239d21d7a517b2332da2f3f85b3372b8b6895ab75
capture fingerprint f4e3d675207416c961585ee645c5fc43c395320ed7a736da71bae741577b1fee
```

## 八、SDK / RPC 同任务成功路径对照

详细文档：[`sdk-rpc-parity-lifecycle.md`](sdk-rpc-parity-lifecycle.md)。

阶段标识：`source-and-runtime-verified-sdk-rpc-parity`。Canonical work item：Issue #45；Primary PR：#60。

同一固定场景：

```text
Prompt     Compare SDK and RPC lifecycle boundaries using the same deterministic response.
Tools      none
Provider   zhiwei-sdk-rpc-faux
Model      faux-1
External Provider prompts 0
```

发布 Artifact 根入口动态导出 `runRpcMode` 与 `RpcClient`，关键 RPC 文件只保存路径、大小和 SHA-256，不保存源码正文。

### 核心一致性

SDK Public 与 RPC Runtime Event 的语义投影一致：

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

最终两边均为：

```text
messages          user → assistant
Assistant length  1194
Assistant sha256  5604485dabc1a8b5d71db37611b23b7ddcc761238cd3621a309934d0fdf9c1f9
```

### Prompt 接受不是完成

真实 RPC Wire：

```text
prompt success Response       index 4
agent_start                   index 5
running get_state Response   index 11
agent_settled                index 35
Runtime Events after Response 29
```

状态快照：

```text
before  isStreaming=false  messageCount=0
during  isStreaming=true   messageCount=1
after   isStreaming=false  messageCount=2  pendingMessageCount=0
```

因此 `response(command=prompt, success=true)` 只是 Prompt 接受边界。它先于 `agent_start`、运行中 State 和 `agent_settled`，不能作为最终任务状态。

### 来源必须保持分离

即使核心投影一致，以下来源仍不可折叠：

```text
SDK preflightResult
SDK Public Event
SDK Extension Event
RPC Command
RPC Response ID
RPC Runtime Event
RPC State Snapshot
RPC get_messages
RPC get_last_assistant_text
host stdin EOF
RPC Extension session_shutdown
Process exit
Process close
```

RPC Command Response 使用请求 ID；Runtime Event 无 Command ID。RPC `message_update` 只保存 delta，不持久化累计 `partial` 快照。

### EOF 与关闭边界

宿主在 `agent_settled` 和最终查询后关闭 stdin：

```text
Extension session_shutdown(reason=quit)
Process exit(code=0, signal=null)
Process close(code=0, signal=null)
```

已验证 exit 先于 close、stdout 没有未终止 JSONL、stderr 为空、Extension evidence 在 close 前持久化。这里只证明正常 EOF 成功路径，不证明异常退出、Restart 或 Resume。

Committed Fixture：

```text
manifest             packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json
compressed bytes     7200
JSON bytes           51475
compressed sha256    abaadbd56d89721e78ca4088e943dc4666431e6d4a7ed6a2009ceadb95e8b101
JSON sha256          c28f938094f33e646a5292bfee1a1cdd9b33641e3910f950e5e4fa8af8850d66
outer fingerprint    6af9788dc9a2cf2326cbc6dbd9914d90b5ffb50687761fb652404631367f8e92
capture fingerprint  d8b42a078a8655e840fc8ef5029ac0997f3f33f00168f84cb7a3cfcc92b1a0ac
```

## 隔离与信任模型

所有 Artifact / Lifecycle Probe 均遵守：

- Workflow 权限仅 `contents: read`；
- checkout 不持久化凭证；
- 不使用 `pull_request_target`；
- 不引用仓库 Secret；
- npm install scripts 禁用；
- digest-pinned Node 容器；
- 只读根文件系统、非 root、`cap-drop=ALL`、`no-new-privileges`；
- 不挂载宿主私有 checkout，只挂载 curated read-only Probe Bundle；
- 失败证据仍上传，但 Job 保持失败；
- 不保存原始 Session ID、Session File、PID、绝对路径、Token、Cookie、环境转储、用户数据、原始 stderr 或模型思维链。

## 失败与恢复记录

失败保持可见，不通过放宽断言、补造事件或隐藏来源差异解决。

- Artifact：先拒绝宿主 checkout / hosted-toolcache 泄漏，再解决 noexec CLI 入口，最后在强化隔离下通过；
- Normal Tool：ESM-only 加载方式修正；Inline Extension 缺少 `session_start` 被固化为负证据；
- Retry：真实 Artifact 揭示 Public / Extension 差异，未用源码测试替代动态结果；
- Follow-up：真实结果证明一个公共 Run 内有两个 Turn，且 Extension 没有 Queue 事件；
- Cancel / exhaustion：首次取消触发过早导致空部分文本，修正为第一个真实文本 delta，而非降低断言；
- Parallel Tool：真实完成顺序与消息顺序不同，未把两者强行统一；
- Compaction / Replacement：保留原始 Entry、派生 Summary、旧 Listener 不迁移与稳定 Alias；
- SDK / RPC parity：首轮 Stage A 正则只识别 `success(command.id, "prompt")`，发布 Artifact 实际为 `success(id, "prompt")`；修正动态结构识别后重新执行完整 Capture，未删除门禁。

## CI 入口

静态与 committed 检查：

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
```

动态 Probe：

```bash
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

## 对 Adapter 与 Observation 的约束

现在可以据此：

- 把 Prompt、Agent Run、Turn、Message、Tool、Retry、Queue、Compaction、Session 与 Process 建模为不同层级；
- 保存被 Retry 替代或取消、但未进入最终 `session.messages` 的证据；
- 分别保存 Tool 声明顺序、真实完成顺序和规范消息顺序；
- 把原始 Entry、派生 Summary 与当前模型上下文分别建模；
- 在每次 Session Replacement 后显式 Rebind Public Listener；
- 将 RPC Prompt Response 视为接受，把 `agent_settled`、最终 State / Messages 和 Worker Close 分别记录；
- 为每条 Observation 保留 `sourceSurface` 与原始关联字段，而不是假设 SDK、Extension 和 RPC 无损等价。

下一项 Runtime 证据是 Issue #32：RPC Worker Restart、Resume、非法输入、未知命令、Provider Error 和异常退出边界。之后 Issue #49 才能冻结 `NormalizedRuntimeEvent v1`，Issue #56 才能实现 SQLite Observation Ledger。RPC真实 Prompt 已验证，但 Worker 错误/重启边界尚未冻结，因此当前仍不能直接实现正式 Ledger。