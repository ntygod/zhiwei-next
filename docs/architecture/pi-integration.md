# Pi 集成边界

## 决策

Pi 是知微默认 Agent Runtime，但不是产品本体、长期记忆真源或领域协议。知微优先使用发布包提供的 SDK、Extension 与 RPC，不维护深度 Fork；所有上游语义先经过 `packages/pi-adapter` 防腐层，再进入 Runtime 中立协议。

当前固定的是 **M0 契约基线**，不是生产依赖承诺。仓库尚未冻结 `NormalizedRuntimeEvent v1`。

## 当前基线与证据

```text
upstream  earendil-works/pi
release   v0.84.1
commit    53fa77ccd8a279eb87e92294ef3687b03ff80112
package   @earendil-works/pi-coding-agent@0.84.1
node      22.23.1
status    source-and-runtime-verified-rpc-worker-lifecycle
```

既有 SDK / Extension Fixture：

```text
packages/pi-adapter/fixtures/pi-lifecycle-normal-tool.json
packages/pi-adapter/fixtures/pi-lifecycle-retry-success.json
packages/pi-adapter/fixtures/pi-lifecycle-follow-up-queue.json
packages/pi-adapter/fixtures/pi-lifecycle-cancel-retry-exhaustion.json
packages/pi-adapter/fixtures/pi-lifecycle-parallel-tool-ordering.json
packages/pi-adapter/fixtures/pi-lifecycle-compaction-session-replacement.json
```

SDK / RPC 同任务 Fixture：

```text
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json
scripts/pi-sdk-rpc-parity-fixture.mjs
scripts/check-pi-sdk-rpc-parity-result.mjs
scripts/check-pi-sdk-rpc-client-messages-result.mjs
```

当前 RPC Worker v2：

```text
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest-v2.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provider-error-replacement.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture.mjs
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle.md
```

历史 `rpc-worker-lifecycle-manifest.json` 与内容寻址 Part 只保留 schema v1 Base 来源，不再表示当前协议。

## 四个来源表面

| 表面 | 必须保留 |
|---|---|
| `AgentSession` SDK | Prompt、Agent/Turn/Message/Tool、Retry、Queue、State |
| Extension lifecycle | Extension来源与缺失的Public增强语义 |
| RPC JSONL | Command/Response、Runtime Event、Snapshot、framing |
| Host / Process | send、EOF、Signal Request、spawn、shutdown、exit、close |

`pi-adapter` 必须显式保存 `sourceSurface`。同名事件可以投影为相同语义，但不能因此删除来源、Request ID、Snapshot、Host Action 或 Process Boundary。

## 共同生命周期模型

```text
Prompt request / preflight
Command acceptance or rejection
Agent Run
Turn
Message and Tool lifecycle
Retry / Queue / Cancellation
Stable boundary: agent_settled
Session shutdown
Worker exit / close
```

一个 Prompt可包含多个 Agent Run；一个 Agent Run也可能包含多个 Turn。`agent_end(willRetry=true)`只表达当时计划，Prompt Promise或RPC Prompt Response返回不表示任务成功。

## SDK 与 Extension 连续性锚点

### Retry success

`source-and-runtime-verified-retry-success`：**Public SDK与 Extension差异**必须保留。Extension没有收到 Public Session的`auto_retry_start/end`，但事件流仍保存被 Retry替代的失败Assistant；一个 Prompt可包含多个 Agent Run。

### Follow-up queue

`source-and-runtime-verified-follow-up-queue`：一个 Prompt可包含多个 Agent Run，一个 Agent Run也可能包含多个 Turn。Host应显式注册 `queue_update` Listener；队列为空不等于 Prompt完成，不能把 Follow-up固定映射成新 Agent Run。

### Cancel / abortRetry / exhaustion

`source-and-runtime-verified-cancel-retry-exhaustion`：被取消的部分 Assistant仍是Observation；willRetry=true 不保证后续 Agent Run。Retry exhaustion结束时Prompt Promise仍正常 resolve，而Extension仍不提供 `auto_retry_start/end`。

### Parallel Tool ordering

`source-and-runtime-verified-parallel-tool-ordering`：声明顺序为`alpha → beta → gamma`，真实完成顺序为`beta → gamma → alpha`，Tool Result消息顺序恢复为`alpha → beta → gamma`。不能仅凭 `tool_execution_end`推断最终持久化顺序。

### Compaction / Session Replacement

`source-and-runtime-verified-compaction-session-replacement`：Compaction Summary是派生上下文，不覆盖原始Entry；Session File Identity与内存 Session Object Identity分开。旧 Public Listener不会自动迁移；固定手动Compaction的Public `entry_appended`没有出现。

## SDK / RPC 同任务

`source-and-runtime-verified-sdk-rpc-parity`固定无工具Prompt的核心投影：

```text
agent_start
→ turn_start
→ message_start/end(user)
→ message_start/end(assistant)
→ turn_end
→ agent_end(willRetry=false)
→ agent_settled
```

SDK preflight、Public/Extension Event、RPC Command ID、State/Messages Snapshot、Host关闭动作、Extension Shutdown、Exit与Close仍分别保存。

真实RPC证明Prompt success Response先于`agent_start`和`agent_settled`，State为：

```text
before  isStreaming=false  messageCount=0
during  isStreaming=true   messageCount=1
after   isStreaming=false  messageCount=2
```

RPC `message_update`只保存delta、不含累计`partial`，不能跨Surface机械统一。

## RPC Worker v2

Issue #32在真实 `pi --mode rpc`子进程上冻结Command Response、Runtime Event、State/Messages Snapshot、Host Action和Process Boundary。

### 协议与恢复

- 只按LF分隔记录，JSON字符串中的`U+2028` / `U+2029`不是换行；
- malformed JSON产生一次`command=parse, success=false` Response；
- unknown command产生一次与Request ID关联的失败Response；
- 两类错误后同一Worker仍能执行有效`get_state`。

### 两个序列域

```text
workerTranscript       worker-output-and-process-boundaries
clientActions          host-local-actions
crossDomainTotalOrder  false
```

Worker输出/Process与Host send/EOF/signal各自连续，但不能拼成跨进程全序。协议保存显式关联键，不编造因果顺序。

### EOF、Signal与Session恢复

```text
stdin EOF
→ Extension session_shutdown(reason=quit)
→ exit(code=0, signal=null)
→ close(code=0, signal=null)
```

```text
Host signal(SIGTERM), accepted=true
→ Extension session_shutdown(reason=quit)
→ exit(code=143, signal=null)
→ close(code=143, signal=null)
```

第二个真实Worker恢复相同Runtime Session稳定别名和先前Messages，但使用新的Worker Instance。

### Preflight与Provider Error

Preflight拒绝只有一次`success=false` Response，不出现`agent_start`。已接受Provider Error稳定链为：

```text
Prompt success Response
→ agent_start
→ Assistant message_end(stopReason=error)
→ agent_end(willRetry=false)
→ agent_settled
```

接受后的`get_state`可能观察running(`true/1`)或settled(`false/2`)。Capture验证只允许这两个相位，再从冻结Fixture排除竞态Response；Host请求仍保留在`clientActions`。执行失败不补造第二个相关Prompt Response。

### 当前 Fixture

```text
manifest                     rpc-worker-lifecycle-manifest-v2.json
format                       gzip-plus-readable-case-replacement
artifact result bytes        74587
artifact result sha256       8c9ee4fd4a1428e4977d2b81af2f1b10ac203f7086c418dc48b1bf31cc347d62
canonical JSON bytes         36265
canonical JSON sha256        1b2fd8aabbc3d76f0c9538db9f4c9cdd47a717ee9610d3cd564bb9d36531638a
outer fingerprint            b4715e2b896258fddec81e2f25f4c28056d24a8562547f46d6305127ebe0053c
capture fingerprint          511441fd6e09e7138cd23f92b7076e1c2c3978785303c1d6ff392f27f4e69ab0
```

v2 loader先执行历史Base legacy校验，再应用可读Provider Error replacement，验证精确键、哈希、双层指纹和完整对象。Fresh Capture必须与Committed对象完全相等。

## Adapter 规则

1. 只有`packages/pi-adapter`可以导入Pi SDK类型。
2. Pi Session是执行状态，不是长期记忆真源。
3. Prompt、Agent Run、Turn、Message、Tool、RPC Request、Worker Instance与Runtime Session分开建模。
4. SDK、Extension、RPC与Host保留`sourceSurface`和各自序列域。
5. Prompt success只规范化为接受，不替代`agent_settled`或最终结果。
6. Compaction Summary、最终Messages和Process结果都不能覆盖原始Observation。
7. 未知事件保留可诊断信息并安全失败。

## 后续顺序

Issue #49必须消费全部已冻结Fixture定义`NormalizedRuntimeEvent v1`；Issue #56随后实现append-only SQLite Observation Ledger。正式协议必须表达来源Surface、相关ID、序列域、稳定边界、Snapshot、Host/Process边界和负证据。
