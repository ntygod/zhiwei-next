# Pi 集成边界

## 决策

Pi 是知微默认 Agent Runtime，但不是产品本体、长期记忆真源或领域协议。知微优先使用发布包提供的 SDK、Extension 与 RPC，不维护深度 Fork；所有上游语义先经过 `packages/pi-adapter` 防腐层，再进入 Runtime 中立协议。

当前固定的是 **M0 契约基线**，不是生产依赖承诺。正式 `NormalizedRuntimeEvent v1` 由 `docs/architecture/normalized-runtime-event-v1.md` 与 ADR 0005 定义；Issue #49 / PR #66 合并前，Issue #56 不得消费 Draft branch，合并后只消费当时最新 `main` 上的协议。

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
scripts/check-pi-sdk-rpc-parity-provenance.mjs
```

当前 RPC Worker v2：

```text
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest-v2.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provider-error-replacement.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalizer.mjs
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture.mjs
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provenance.mjs
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle.md
```

历史 `rpc-worker-lifecycle-manifest.json`、base loader、legacy Checker blob 和内容寻址 Part 只保留 schema v1 Base 来源，不再表示当前协议。

## 四个来源表面

| 表面 | 必须保留 |
|---|---|
| `AgentSession` SDK | Prompt、Agent/Turn/Message/Tool、Retry、Queue、State |
| Extension lifecycle | Extension 来源、Session start/shutdown 与缺失的 Public 增强语义 |
| RPC JSONL | Command/Response、Runtime Event、Snapshot、framing |
| Host / Process | send、EOF、Signal Request、spawn、invalidation、rebind、exit、close |

`pi-adapter` 必须显式保存 `sourceSurface`。同名事件可以投影为相同语义，但不能因此删除来源、Request ID、Snapshot、Host Action 或 Process Boundary。Extension Shutdown 不能改写成 Host/Process 事件；Host Session Invalidation 与 Listener Rebind 也不能伪装成 Extension 原生 callback。

## 共同生命周期模型

```text
Prompt request / preflight
Command acceptance or rejection
Agent Run
Turn
Message and Tool lifecycle
Retry / Queue / Cancellation
Stable boundary: agent_settled
Session shutdown / invalidation / replacement / rebind
Worker exit / close
```

一个 Prompt 可包含多个 Agent Run；一个 Agent Run 也可能包含多个 Turn。`agent_end(willRetry=true)` 只表达当时计划，Prompt Promise 或 RPC Prompt Response 返回不表示任务成功。

## SDK 与 Extension 连续性锚点

### Retry success

`source-and-runtime-verified-retry-success`：**Public SDK与 Extension差异**必须保留。Extension 没有收到 Public Session 的 `auto_retry_start/end`，但事件流仍保存被 Retry 替代的失败 Assistant。一个 Prompt 可包含多个 Agent Run。

### Follow-up queue

`source-and-runtime-verified-follow-up-queue`：一个 Prompt 可包含多个 Agent Run，一个 Agent Run 也可能包含多个 Turn。Host 应显式注册 `queue_update` Listener；队列为空不等于 Prompt 完成，不能把 Follow-up 固定映射成新 Agent Run。

### Cancel / abortRetry / exhaustion

`source-and-runtime-verified-cancel-retry-exhaustion`：被取消的部分 Assistant 仍是 Observation；willRetry=true 不保证后续 Agent Run。Retry exhaustion 结束时，Prompt Promise 仍正常 resolve，而 Extension 仍不提供 `auto_retry_start/end`。

### Parallel Tool ordering

`source-and-runtime-verified-parallel-tool-ordering`：声明顺序为 `alpha → beta → gamma`，真实完成顺序为 `beta → gamma → alpha`，Tool Result 消息顺序恢复为 `alpha → beta → gamma`。不能仅凭 `tool_execution_end` 推断最终持久化顺序。

### Compaction / Session Replacement

`source-and-runtime-verified-compaction-session-replacement`：Compaction Summary 是派生上下文，不覆盖原始 Entry；Session File Identity 与内存 Session Object Identity 分开。旧 Public Listener 不会自动迁移；固定手动 Compaction 的 Public `entry_appended` 没有出现。

真实 Replacement 证据是 Extension `session_shutdown/session_start` 与 Host orchestration phases，而不是 Extension 原生 `session_replaced`。正式协议因此分开保存 old shutdown、Host invalidation、new start、可选 source-linked Host replacement aggregate 与 Host listener rebind。

## SDK / RPC 同任务

`source-and-runtime-verified-sdk-rpc-parity` 固定无工具 Prompt 的核心投影：

```text
agent_start
→ turn_start
→ message_start/end(user)
→ message_start/end(assistant)
→ turn_end
→ agent_end(willRetry=false)
→ agent_settled
```

SDK preflight、Public/Extension Event、RPC Command ID、State/Messages Snapshot、Host 关闭动作、Extension Shutdown、Exit 与 Close 仍分别保存。

真实 RPC 证明 Prompt success Response 先于 `agent_start` 和 `agent_settled`，State 为：

```text
before  isStreaming=false  messageCount=0
during  isStreaming=true   messageCount=1
after   isStreaming=false  messageCount=2
```

RPC `message_update` 只保存 delta、不含累计 `partial`，不能跨 Surface 机械统一。

## RPC Worker v2

Issue #32 在真实 `pi --mode rpc` 子进程上冻结 Command Response、Runtime Event、State/Messages Snapshot、Host Action 和 Process Boundary。

### 严格字节协议

RPC stdout 由 **strict byte LF reader** 处理：先在 Buffer 中按 `0x0a` 切分，再做 fatal UTF-8 解码和字节往返校验。空 record、CRLF、非法 UTF-8、跨 chunk 损坏和未 LF 终止尾片都 fail closed；JSON 字符串中的 `U+2028` / `U+2029` 仍属于同一 record。

- malformed JSON 产生一次 `command=parse, success=false` Response；
- unknown command 产生一次与 Request ID 关联的失败 Response；
- 两类错误后同一 Worker 仍能执行有效 `get_state`。

### 两个序列域

```text
workerTranscript       worker-output-and-process-boundaries
clientActions          host-local-actions
crossDomainTotalOrder  false
```

Worker 输出/Process 与 Host send/EOF/signal 各自连续，但不能拼成跨进程全序。协议保存显式关联键，不编造因果顺序。

### EOF、Signal 与 Session 恢复

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

第二个真实 Worker 恢复相同 Runtime Session 稳定别名和先前 Messages，但使用新的 Worker Instance。

### Preflight 与 Provider Error

Preflight 拒绝只有一次 `success=false` Response，不出现 `agent_start`。已接受 Provider Error 稳定链为：

```text
Prompt success Response
→ agent_start
→ Assistant message_end(stopReason=error)
→ agent_end(willRetry=false)
→ agent_settled
```

接受后的 `get_state` 可能观察 running 或 settled，但 Capture 先验证实际 Response、`stateDuring` 和 ordering summary 一致，并验证两个 **complete running/settled State object**：running 必须与 final State 除 `isStreaming=true/messageCount=1` 外完全相同且位于 `agent_settled` 前；settled 必须与完整 final State 相等。Provider、Model/API、Session identity、pending count、thinking、compacting 和 queue mode 都不能漂移。只有完整验证通过后才排除竞态 Response；Host 请求仍保留在 `clientActions`。

Provider/Session/pending count 和 late-running mutation 均必须被拒绝。执行失败不补造第二个相关 Prompt Response。

### 当前 Fixture 与 live provenance

```text
manifest                     rpc-worker-lifecycle-manifest-v2.json
format                       gzip-plus-readable-case-replacement
source run attempt           2
source artifact              9181642601
source artifact digest       sha256:d7d81bc279c7533777c130fb2b294460fa8a8fff5a2326bf6b2a4f0efd373b09
comparison run attempt       1
comparison artifact          9181575920
comparison artifact digest   sha256:b7c415e360338f562d3384d22f4c786d845bb78dddaf7b8b10447def94f4b73f
artifact result bytes        74587
artifact result sha256       8c9ee4fd4a1428e4977d2b81af2f1b10ac203f7086c418dc48b1bf31cc347d62
canonical JSON bytes         36265
canonical JSON sha256        1b2fd8aabbc3d76f0c9538db9f4c9cdd47a717ee9610d3cd564bb9d36531638a
outer fingerprint            b4715e2b896258fddec81e2f25f4c28056d24a8562547f46d6305127ebe0053c
capture fingerprint          511441fd6e09e7138cd23f92b7076e1c2c3978785303c1d6ff392f27f4e69ab0
```

两个历史 attempt 的 capture、Fresh validation 和 upload 步骤成功，但当时 **historical compare step failed**，所以旧 Workflow/Worker Job 整体为 failure。当前 committed v2 loader 继续保留并验证这段历史；PR #64 的最终 exact HEAD 已实际通过 Fresh Capture、committed-object comparison、Ready live provenance、required `check`、squash merge 与 Main Provenance，不得把旧失败 attempt 改写为成功。

## `NormalizedRuntimeEvent v1` 映射边界

正式协议只保存字段级 Runtime-neutral projection：

- Message lifecycle 的正文投影只允许 `{ text }`；
- State Snapshot 只允许 streaming、message/pending count、compacting/idle 与 queue counts；
- Messages Snapshot item 只允许 role、content kinds、stop/error 与 text；
- Tool input/result 可以保存 Tool contract JSON，但不是 Raw Runtime event envelope；
- Unknown Event 只保存 source type、top-level keys 与 canonical payload SHA-256；
- 已知 stable vocabulary 固定 `compatibility=required`，Message update 固定 `ephemeral + update + ignorable`；
- Tool/Compaction/Session 必备关系先由单事件 parser 校验，再由 Trace validator 校验历史 link、Run/Turn/Instance 一致性。

Contract Fixture 绑定 Issue #32 merge commit 和六组 accepted Runtime fingerprint，构造 60 个事件；固定 canonical hash：

```text
8147f73a7bb74d4518f46c5f7f4cfccc7bd2760728f81bdd115f31f6e82a5b44
```

## npm Artifact 信任边界

第三方 Pi Artifact 只在隔离 CI 中动态执行：

- 精确版本、registry integrity 与 shasum；
- install scripts 禁用；
- digest-pinned Node 容器；
- curated source bundle 与容器 rootfs 只读；
- 非 root、`cap-drop=ALL`、`no-new-privileges`；
- 不挂载 Host checkout；
- 不传 GitHub Secret、真实 Provider Credential、用户数据或完整环境；
- Runtime 只使用发布包内 Faux Provider，外部 Provider Prompt 数为零；
- Capture 和脱敏 Checker 成功后才上传公开 Artifact；
- Fresh Capture、Committed Fixture、结果 Checker、完整对象比较和 live provenance 共同门禁。

Capture launcher 以 Git blob SHA 固定历史源码，在 tmpfs 创建只读 hardened 副本，并在执行后重新验证 source hash。

## Adapter 规则

1. 只有 `packages/pi-adapter` 可以导入 Pi SDK 类型。
2. Pi Session 是执行状态，不是长期记忆真源。
3. Prompt、Agent Run、Turn、Message、Tool、RPC Request、Worker Instance 与 Runtime Session 分开建模。
4. SDK、Extension、RPC 与 Host 保留 `sourceSurface` 和各自序列域。
5. Prompt success 只规范化为接受，不替代 `agent_settled` 或最终结果。
6. Adapter 对 Message、State 与 Messages Snapshot 做字段级投影；不能把任意 Pi JSON 先 snapshot 后原样写入协议。
7. Compaction Summary、最终 Messages 和 Process 结果都不能覆盖原始 Observation。
8. Session Shutdown、Invalidation、Replacement Aggregate 与 Listener Rebind 保持不同来源和 provenance。
9. 缺失 correlation 保持缺失；不得生成随机 Run/Turn/Message/Tool ID。
10. 未知事件保留可诊断 hash 信息并安全失败。

## 后续顺序

Issue #49 / PR #66 完成 `NormalizedRuntimeEvent v1` 的 exact-HEAD 独立 R2 cold review、Ready gate 与受保护 squash merge；Issue #56 随后只从当时最新 `main` 创建合规分支，实现 append-only SQLite Observation Ledger。Daemon / Worker Supervisor 只能消费已合并协议与 Ledger。
