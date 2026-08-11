# Pi 取消、abortRetry 与 Retry exhaustion 生命周期

状态：**runtime-verified**

关联：Issue #24、PR #25。

## 目的

验证固定 Pi `v0.84.1` 发布 Artifact在三种容易被错误折叠为“失败结束”的边界下，公共 `AgentSession`事件、Extension事件、最终消息和 Prompt返回值的真实行为：

1. Assistant正在流式输出时调用 `session.abort()`；
2. 自动重试已经进入 Backoff后调用 `session.abortRetry()`；
3. Retry达到 `maxRetries`并最终耗尽。

该 Fixture直接约束 M0 Observation Ledger：被取消的部分 Assistant、已经声明 `willRetry=true`但后来没有后续 Run、以及最终 Retry exhaustion都必须保留为不同事实。

## 固定运行边界

三个子场景共同使用：

- Pi `v0.84.1`；
- `@earendil-works/pi-coding-agent@0.84.1`；
- Node `22.23.1`、npm `10.9.8`；
- 零 Provider Credential；
- 外部 Provider Prompt数为 `0`；
- Faux Provider只在隔离容器内返回固定消息；
- 没有 Tool、文件、Shell或外部写副作用；
- Public SDK与 Inline Extension Listener都在运行前显式注册；
- 每个子场景在最终 idle后由宿主显式发出 `session_shutdown(reason=exit)`。

长流式响应不保存原文，只保存长度与 SHA-256。Fixture明确标记 `fullActiveResponseIncluded=false`。

## 一、流式输出期间主动取消

### 场景

```text
response length       10240
stream rate           128 tokens/s
chunk size            32
trigger               第一个真正含文本的 public message_update
trigger text length   128
host action           session.abort()
```

Public事件先出现一个没有文本摘要的流式起始 Update，随后出现文本长度为 `128`的 Update。Harness只在第二个事件上触发取消，避免把“流已经创建”误当成“部分文本已经产生”。

### 真实顺序

```text
agent_start
turn_start
user message_start / message_end
assistant message_start(pending)
assistant message_update(empty streaming boundary)
assistant message_update(partial text = 128)
  → session.abort()
assistant message_end(stopReason=aborted, error=Request was aborted)
turn_end(stopReason=aborted, error=Request was aborted)
agent_end(willRetry=false)
agent_settled
```

Extension观察到对应 Message、Turn、Agent和 Settled事件，随后是宿主 `session_shutdown`；Extension `agent_end`仍不携带 Public Session层的 `willRetry`。

### 最终消息

`session.messages`保留：

```text
user
  → assistant(stopReason=aborted, errorMessage=Request was aborted, textLength=128)
```

部分 Assistant文本的 SHA-256与触发取消的 `message_update`完全一致：

```text
2b17e35a5f170b2a63aa9a1ce3ce8ca82c338b034c6dc1ebc7c2fe5326eadade
```

因此：

> 用户取消不是“没有 Assistant结果”。只要 Runtime已经产生部分文本，该消息会以 `stopReason=aborted`和 `Request was aborted`保留，随后仍有 `agent_end(willRetry=false)`与最终单次 `agent_settled`。

`session.abort()`和原始 `session.prompt()`都正常 resolve。Prompt返回时 Session已经 idle，且没有进入 Retry。

## 二、Retry Backoff期间调用 abortRetry()

### 场景

```text
retry.enabled     true
maxRetries        3
baseDelayMs       10000
response 1        stopReason=error / overloaded_error
response 2        仅作为“不得被调用”的证明响应
trigger           public auto_retry_start(attempt=1)
host action       session.abortRetry()
```

### 真实顺序

```text
失败 Run
  → assistant message_end(error=overloaded_error)
  → turn_end(error=overloaded_error)
  → agent_end(willRetry=true)
  → auto_retry_start(attempt=1, maxAttempts=3, delayMs=10000)
  → session.abortRetry()
  → auto_retry_end(attempt=1, success=false, finalError=Retry cancelled)
  → agent_settled
```

没有第二个 `agent_start`，Faux Provider调用次数保持为 `1`，证明预留的第二条响应未被消费。

最重要的边界是：

```text
agent_end(willRetry=true)
  但没有后续 Agent Run
```

`willRetry=true`只表达该次 `agent_end`发生时 Runtime已经计划重试；宿主随后可以取消 Backoff。它不是“后续 Run一定存在”的历史保证。

### 最终消息与返回值

最终 `session.messages`只保留用户消息：

```text
user
```

失败 Assistant尝试仍存在于 Runtime事件流，但不在最终 Session消息列表；`finalAssistant=null`。`abortRetry()`同步返回，原始 `session.prompt()`仍正常 resolve，Session最终 `isIdle=true`、`isRetrying=false`。

因此：

> Observation Ledger必须同时保存失败 Run、`agent_end(willRetry=true)`、Backoff开始、宿主取消和 `auto_retry_end(finalError=Retry cancelled)`；不能因为最终没有 Assistant消息就丢弃整个失败尝试，也不能因为 `willRetry=true`补造一个未发生的 Run。

## 三、Retry exhaustion

### 场景

```text
retry.enabled     true
maxRetries        2
baseDelayMs       1
provider results  overloaded_error × 3
proof response    第四条响应保留未使用
```

`maxRetries=2`表示初始调用加两次重试，共三次 Provider调用。

### 真实高层顺序

```text
Run 1 error
  → agent_end(willRetry=true)
  → auto_retry_start(attempt=1, delayMs=1)
Run 2 error
  → agent_end(willRetry=true)
  → auto_retry_start(attempt=2, delayMs=2)
Run 3 error
  → agent_end(willRetry=false)
  → auto_retry_end(attempt=2, success=false, finalError=overloaded_error)
  → agent_settled
```

公共 `agent_end.willRetry`序列精确为：

```json
[true, true, false]
```

关键计数：

```text
provider calls          3
public agent_start      3
public agent_end        3
public auto_retry_start 2
public auto_retry_end   1
public agent_settled    1
```

Pi没有为每次失败都发出一个 `auto_retry_end`。在该固定场景中，两次 `auto_retry_start`之后只有一个终止 `auto_retry_end`，位于第三次 `agent_end(willRetry=false)`之后、`agent_settled`之前。

### 最终消息与 Prompt语义

最终 `session.messages`为：

```text
user
  → assistant(stopReason=error, errorMessage=overloaded_error, textLength=0)
```

前两次被 Retry替代的失败 Assistant不在最终消息列表；最后一次失败的 Assistant被保留。原始 `session.prompt()`仍正常 resolve，不通过 Promise rejection表达 Retry exhaustion。最终错误必须从 Assistant消息与 Runtime事件读取。

因此：

> Prompt Promise正常 resolve不等于任务成功。Retry exhaustion要由最后一次失败消息、`agent_end(willRetry=false)`、终止 `auto_retry_end(success=false)`和最终 `agent_settled`共同表达。

## Public SDK与 Extension差异

三个子场景再次确认：

- Public `agent_end`提供 `willRetry`；Extension同名事件不提供该字段；
- Public Session提供 `auto_retry_start/end`；Extension仍不提供 `auto_retry_start/end`；
- Extension可以看到每个失败 Run的 Message、Turn和 Agent事件；
- Extension不能仅凭自己的事件区分“计划重试后被取消”与 Session层 Retry状态；
- 每个子场景最终都有一个 Extension `agent_settled`，随后才是宿主 `session_shutdown`。

Adapter不得把两个表面无损合并，也不得为 Extension补造不存在的 `willRetry`或 Retry事件。

## 三种终止语义不能合并

| 场景 | 最终 Assistant | Public `agent_end.willRetry` | Retry终止 | Prompt Promise |
|---|---|---|---|---|
| Active stream abort | 部分文本，`aborted` | `[false]` | 无 Retry | resolve |
| Retry backoff abort | 最终列表中无 Assistant | `[true]` | `Retry cancelled` | resolve |
| Retry exhaustion | 最后一次空文本错误 Assistant | `[true,true,false]` | `overloaded_error` | resolve |

这三个路径都最终 idle、非 retrying并发出单次 `agent_settled`，但它们的证据、消息保留和因果不同。统一成一个布尔 `failed`会破坏可解释性和回放能力。

## Fixture与指纹

机器事实源：

```text
packages/pi-adapter/fixtures/pi-lifecycle-cancel-retry-exhaustion.json
scripts/probes/pi-cancel-retry-exhaustion-capture.mjs
scripts/check-pi-cancel-retry-exhaustion-result.mjs
```

外层契约指纹：

```text
b866798d18569c78d5c712254c3ecdecd7a3e02c0ef11458e6b97b0863b1f6e0
```

内层 Capture指纹：

```text
b544631413935d2b3f55f9f9f8bcf15a06944bba682cf48471902e4726f79609
```

普通 `npm run check`验证 committed Fixture、精确序列、字段、文档事实源和固定指纹。相关路径变化、手工请求及 weekly schedule还会重新执行隔离 Capture，并将 fresh结果与 committed Fixture做完整对象比较。

## 隔离边界

动态执行沿用现有 R3 Runtime Probe边界：

- GitHub Job只有 `contents: read`；
- checkout不持久化凭证；
- 不使用 `pull_request_target`或 `${{ secrets.* }}`；
- 固定 npm Artifact integrity与 shasum；
- npm install scripts禁用；
- digest-pinned Node容器；
- 只读根文件系统；
- 非 root、`cap-drop=ALL`、`no-new-privileges`；
- 不挂载宿主私有 checkout；
- curated Probe Bundle只读；
- 失败结果仍上传，Job保持失败；
- 不保存绝对路径、原始 Session ID、Credential、环境转储、完整长响应或模型原始思维链。

## 对 M0协议的直接约束

后续 `NormalizedRuntimeEvent`和 Observation Ledger至少必须表达：

- 用户发起的 `session.abort()`动作及其触发事件；
- 部分 Assistant消息的 `aborted`状态、错误和文本摘要；
- `agent_end.willRetry`是当时计划，不是后续 Run存在性的保证；
- `abortRetry()`动作、被取消的 attempt和 `Retry cancelled`；
- Retry attempt、max attempts、Backoff delay和最终 exhaustion；
- 最后一次错误 Assistant与被 Retry替代的历史失败尝试；
- Prompt Promise返回、最终 `agent_settled`和宿主 `session_shutdown`三个独立边界；
- Public SDK与 Extension来源差异。

当前仍不冻结正式协议。下一步继续验证并行 Tool完成顺序、Compaction、Session Replacement和 RPC真实 Prompt。
