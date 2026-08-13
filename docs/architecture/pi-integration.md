# Pi 集成边界

## 决策

Pi 是知微默认 Agent Runtime，但不是产品本体、长期记忆真源或领域协议。知微优先使用发布包提供的 SDK、Extension 与 RPC，不维护深度 Fork；所有上游语义都先经过 `packages/pi-adapter` 防腐层，再进入 Runtime 中立协议。

当前固定的是 **M0 契约基线**，不是生产依赖承诺。仓库尚未把 Pi 加入正式产品依赖，也尚未冻结 `NormalizedRuntimeEvent v1`。

## 当前 M0 基线

| 项目 | 当前值 |
|---|---|
| 权威上游 | `earendil-works/pi` |
| Release Tag | `v0.84.1` |
| Tag Commit | `53fa77ccd8a279eb87e92294ef3687b03ff80112` |
| Coding Agent 包 | `@earendil-works/pi-coding-agent@0.84.1` |
| 固定 Node | `22.23.1` |
| Registry Artifact | integrity 与 shasum 已核对，install scripts 禁用 |
| SDK 动态导入 | 已验证 |
| RPC 空会话 | 已验证，无凭证、无 Prompt |
| SDK / RPC 同任务 | 已验证 Prompt 接受、运行中 State、最终 Messages、settled 与关闭边界 |
| SDK / Extension 生命周期 | 已验证 Tool、Retry、Follow-up、取消、Retry exhaustion、并行 Tool、Compaction 与 Session Replacement |
| RPC Worker 生命周期 | 已验证严格 LF framing、Prompt 接受与完成、EOF、SIGTERM、Restart / Resume、非法 JSON、未知命令、Preflight 拒绝与已接受后的 Provider Error |
| 当前验证状态 | `source-and-runtime-verified-rpc-worker-lifecycle` |

## 证据索引

### 发布 Artifact 与 SDK / Extension

```text
packages/pi-adapter/fixtures/pi-upstream-baseline.json
packages/pi-adapter/fixtures/pi-artifact-runtime.json
packages/pi-adapter/fixtures/pi-lifecycle-normal-tool.json
packages/pi-adapter/fixtures/pi-lifecycle-retry-success.json
packages/pi-adapter/fixtures/pi-lifecycle-follow-up-queue.json
packages/pi-adapter/fixtures/pi-lifecycle-cancel-retry-exhaustion.json
packages/pi-adapter/fixtures/pi-lifecycle-parallel-tool-ordering.json
packages/pi-adapter/fixtures/pi-lifecycle-compaction-session-replacement.json
```

### SDK / RPC 同任务成功路径

```text
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json
scripts/pi-sdk-rpc-parity-fixture.mjs
scripts/check-pi-sdk-rpc-parity-result.mjs
scripts/check-pi-sdk-rpc-client-messages-result.mjs
```

详细结论：[`../spikes/pi-runtime-contract/sdk-rpc-parity-lifecycle.md`](../spikes/pi-runtime-contract/sdk-rpc-parity-lifecycle.md)。

### RPC Worker 生命周期

```text
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture.mjs
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-part-00-bfcc1561e9cc08585e2675ecce0a2ccea0b2a14900a63a242f9884ab3286300f.b64
scripts/check-pi-sdk-rpc-client-messages-result.mjs --rpc-worker-lifecycle
```

精确事件、状态和进程边界：[`pi-rpc-worker-lifecycle.md`](pi-rpc-worker-lifecycle.md)。

全部 Runtime Spike 的导航与历史连续性见 [`../spikes/pi-runtime-contract/README.md`](../spikes/pi-runtime-contract/README.md)。

## 三个不同的集成表面

Pi 至少暴露三个不能混为一谈的表面：

| 表面 | 用途 | 当前已验证 |
|---|---|---|
| `AgentSession` SDK | Node / TypeScript 进程内嵌入、Session 控制和公开事件订阅 | 空 Session、正常 Tool、Retry、Follow-up、取消、exhaustion、并行 Tool、Compaction、Session Replacement、SDK / RPC 同任务 |
| Extension lifecycle | Context、工具策略、Compaction、Session 切换和 Shutdown Hook | 正常 Tool、Retry、Follow-up、取消、exhaustion、并行 Tool、Compaction、Replacement 与 RPC Worker shutdown；缺少部分 Public Session 增强语义 |
| RPC JSONL | 子进程隔离、非 Node 客户端和 Worker Supervisor 边界 | Command / Response、Runtime Event、State / Messages、EOF、Signal、Restart / Resume 与协议 / Provider 错误 |

`pi-adapter` 必须显式保存 `sourceSurface`。即使 SDK Public 与 RPC Runtime 可以投影为相同的 Agent / Turn / Message 序列，也不能因此删除来源、Request ID、Snapshot 或进程边界。

## 共同生命周期模型

M0 证据要求至少区分：

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

这些边界不是一一对应：

- 一个 Prompt 可以包含多个 Agent Run，例如自动 Retry；
- 一个 Agent Run 可以包含多个 Turn，例如 Follow-up；
- `agent_end(willRetry=true)` 只表达当时计划，不能证明后续 Run 一定发生；
- `session.prompt()` Promise 或 RPC Prompt Response 返回，不表示任务成功；
- `agent_settled`、最终 State / Messages、Extension Shutdown、Process Exit 与 Close 分别记录。

## SDK 与 Extension 已验证约束

### Tool、Retry 与 Queue

- Tool Call、执行开始 / 更新 / 完成和 Tool Result Message 都使用真实 `toolCallId`；
- 并行 Tool 的声明顺序、真实完成顺序和 Result Message 顺序是三个不同事实；
- Public Session 暴露 `willRetry`、`auto_retry_start/end` 与 `queue_update`，Extension 没有等价的完整增强语义；
- Queue 清空不等于 Prompt 完成；
- 被 Retry 替代的失败 Message 可能不在最终 `session.messages`，但仍必须从事件流持久化；
- 用户取消保留已经产生的部分 Assistant，并以 `stopReason=aborted`结束；
- Retry exhaustion 的 Prompt Promise 仍可能正常返回，成败必须读取 Runtime 事件和最终 Message。

### Compaction 与 Session Replacement

- Compaction Summary 是派生 Context，不覆盖原始 Session Entry 或 Observation；
- Public `compaction_start/end`、Extension Compaction 事件和持久 Entry 树分别观察；
- Session File Identity、内存 Session Object Identity 与 Replacement Generation 分开；
- 恢复同一个 Session File 仍会创建新的内存 Session Object；
- 旧 Public Listener 不会自动迁移，Replacement 后必须显式 Rebind；
- SDK Session 映射由宿主 `createAgentSession()`成功边界建立，不能只依赖 Extension `session_start`；
- `session_shutdown`由宿主或 Worker 明确发出，`dispose()`只负责资源释放。

## 已冻结场景连续性锚点

这些短语既是文档事实，也是 committed Checker 的机械连续性入口；不得因项目状态压缩而删除。

### Retry success

`source-and-runtime-verified-retry-success`：**Public SDK与 Extension差异**必须保留。Extension没有收到 Public Session 的 `auto_retry_start/end`，但事件流仍保存被 Retry替代的失败 Assistant。一个 Prompt可包含多个 Agent Run。

### Follow-up queue

`source-and-runtime-verified-follow-up-queue`：一个 Prompt可包含多个 Agent Run，一个 Agent Run也可能包含多个 Turn。宿主应显式注册 `queue_update` Listener；队列为空不等于 Prompt完成，不能把 Follow-up固定映射成新 Agent Run。

### Cancel / abortRetry / exhaustion

`source-and-runtime-verified-cancel-retry-exhaustion`：被取消的部分 Assistant仍是 Observation；willRetry=true 不保证后续 Agent Run。Retry exhaustion结束时，Prompt Promise仍正常 resolve，而Extension仍不提供 `auto_retry_start/end`。

### Parallel Tool ordering

`source-and-runtime-verified-parallel-tool-ordering`：声明顺序为 `alpha → beta → gamma`，真实完成顺序为 `beta → gamma → alpha`，Tool Result消息顺序恢复声明顺序。不能仅凭 `tool_execution_end`推断最终消息持久化顺序。

### Compaction / Session Replacement

`source-and-runtime-verified-compaction-session-replacement`：Compaction Summary是派生上下文；Session File Identity与内存 Session Object Identity分开。旧 Public Listener不会自动迁移，Public `entry_appended`没有出现在固定手动Compaction的公开事件流中。

## SDK / RPC 同任务成功路径

固定无工具 Prompt 中，SDK Public 与 RPC Runtime 的核心投影一致：

```text
agent_start
→ turn_start
→ message_start/end(user)
→ message_start/end(assistant)
→ turn_end
→ agent_end(willRetry=false)
→ agent_settled
```

但必须继续保存：

- SDK `preflightResult`、Public Event 与 Extension Event；
- RPC Command、唯一 Request ID 和 Response；
- `get_state`、`get_messages` 与 `get_last_assistant_text` Snapshot；
- Host stdin EOF 或公开 `RpcClient.stop()`调用；
- 实际 ChildProcess Signal 请求；
- Extension Shutdown、Exit 与 Close。

真实 RPC 顺序证明：Prompt success Response 先于 `agent_start`、运行中 `get_state`和 `agent_settled`，其后仍有 Runtime Event。状态为：

```text
before  isStreaming=false  messageCount=0
during  isStreaming=true   messageCount=1
after   isStreaming=false  messageCount=2
```

RPC `message_update`只保存 delta、不含累计 `partial`；SDK / Extension 内部事件可能携带 `partial`，不能跨 Surface 机械统一。

## RPC Worker 生命周期

Issue #32 在真实 `pi --mode rpc` 子进程上冻结了四类独立事实：

1. **Command Response**：带 Request ID，表达接受或 Preflight 拒绝；
2. **Runtime Event**：表达 Agent、Turn、Message、错误和 `agent_settled`；
3. **State / Messages Snapshot**：命令时点快照，不替代中间事件；
4. **Process Boundary**：stdin EOF、Signal 请求、Extension Shutdown、Exit 与 Close。

### JSONL 与协议错误

- 只按 LF (`\n`)分隔记录；JSON 字符串中的 `U+2028` / `U+2029`不是换行；
- malformed JSON 产生一次 `command=parse, success=false` Response；
- unknown command 产生一次与 Request ID 关联的失败 Response；
- 两类错误后同一 Worker 仍能执行有效 `get_state`；
- Runtime Event 不携带 Command ID，不能与 Response 合并为一种记录。

### Prompt 接受与完成

首个持久化 Prompt 的固定边界为：

```text
prompt Response         11
agent_start             13
running State Response  19
agent_end               24
agent_settled           25
```

State 从 `false / 0`变为 `true / 1`，最终回到 `false / 2`。因此 `response(command=prompt, success=true)`只能规范化为接受边界。

### EOF、Signal 与进程结果

```text
stdin EOF
→ Extension session_shutdown(reason=quit)
→ exit(code=0, signal=null)
→ close(code=0, signal=null)
```

```text
Host kill(SIGTERM), accepted=true
→ Extension session_shutdown(reason=quit)
→ exit(code=143, signal=null)
→ close(code=143, signal=null)
```

Adapter 保存真实 Process 结果，不能根据 Host 请求反推 `signal`字段。SIGKILL、OOM、宿主崩溃和 Windows 信号差异仍未覆盖。

### Restart / Resume

- 第二个真实 Worker 恢复相同 Runtime Session 的 ID / File稳定别名；
- 启动后先恢复 `user → assistant`，再追加第二轮并得到 `user → assistant → user → assistant`；
- 新 Worker Instance 与原 Runtime Session 分开关联；
- 未来协议必须同时具备 `workerInstanceId`和 `runtimeSessionId`。

### Preflight 拒绝与执行失败

- 没有可用 Model / API Key：Prompt 只返回一次 `success=false`，不出现 `agent_start`，Worker 仍可查询并正常关闭；
- 已接受后的 Faux Provider Error：先返回一次 `success=true`，随后产生 Assistant error Message、`agent_end(willRetry=false)`与 `agent_settled`；
- 执行失败不补造第二个相关 Prompt Response；
- Command 级拒绝与 Agent 执行失败必须使用不同事件语义。

## npm Artifact 信任边界

第三方 Pi Artifact 只在隔离 CI 中动态执行：

- 精确版本、registry integrity 与 shasum；
- install scripts 禁用；
- digest-pinned Node 容器；
- curated source bundle 与容器 rootfs 只读；
- 非 root、`cap-drop=ALL`、`no-new-privileges`；
- 不挂载宿主 checkout；
- 不传 GitHub Secret、真实 Provider Credential、用户数据或完整环境；
- Runtime 只使用发布包内 Faux Provider，外部 Provider Prompt 数为零；
- Capture 和脱敏 Checker 成功后才上传公开 Artifact；
- Fresh Capture、Committed Fixture、结果 Checker 与完整对象比较共同门禁。

这些证据证明当前发布 Artifact 的目标表面符合基线，不等于完整供应链审计，也不证明 Tarball 可由 Git Tag 字节级重现。

## Adapter 规则

1. 只有 `packages/pi-adapter`可以导入 Pi SDK 类型。
2. Pi Session 是执行状态，不是长期记忆真源。
3. 所有边界输入显式携带 Workspace、Runtime Session、时间、ID 与来源序列。
4. SDK、Extension、RPC 与 Host 事件保留 `sourceSurface`，不能按同名事件无损合并。
5. Prompt、Agent Run、Turn、Message、Tool、RPC Request、Worker Instance 与 Runtime Session 分开建模。
6. RPC Prompt success Response只表示接受，不替代 `agent_settled`、最终 Snapshot 或关闭边界。
7. Command Response、Runtime Event、State / Messages、EOF、Signal、Shutdown、Exit 与 Close分别持久化。
8. Command 级 Preflight 拒绝与已接受后的执行失败分别表达。
9. `willRetry=true`记录当时计划，不保证后续 Run；`abortRetry()`可以终止计划。
10. Queue 入队、Queue 清空、后续 Turn 与最终 Settled 分别记录。
11. 被 Retry 替代、取消或错误结束的 Message 仍是 Observation，不能因未进入最终 Messages 而删除。
12. Tool 声明顺序、完成顺序和 Result Message 顺序分别保存，并以真实 `toolCallId`关联。
13. Compaction Summary 标记为派生 Context，不覆盖原始 Observation。
14. Session File、Session Object 与 Replacement Generation 分开；Replacement 后显式 Rebind Listener。
15. 原始 Pi Payload 是否持久化由数据策略决定，不能默认完整落盘。
16. 动态 Session ID / File、PID、Provider Response ID、Extension nonce、凭证、环境转储和模型原始思维链不得进入 Fixture。
17. 未知事件保留可诊断来源并 fail closed，不能为匹配预想 Schema 补造字段。
18. Pi 升级必须重跑源码基线、Registry Artifact、Contract Fixture、完整对象比较与真实会话回放。

## 当前过渡状态与后续顺序

Issue #32 已提供正式协议所需的最后一组 M0 Runtime 证据，但本 PR 合并前仍处于候选交付状态。完成最终 HEAD CI、独立 R3 冷审和合并后，依赖顺序为：

1. Issue #49：冻结 `NormalizedRuntimeEvent v1`，消费全部 Runtime Fixture；
2. Issue #56：实现 append-only SQLite Observation Ledger；
3. 后续 Daemon / Worker Supervisor：基于已冻结协议实现健康状态、崩溃检测和重连。

本 Fixture 明确不覆盖 Tool over RPC、Steering、Follow-up、Compaction / Replacement RPC 命令、网络 RPC、多人并发客户端、SIGKILL、OOM、宿主崩溃或 Windows 信号差异。这些边界不能从当前证据外推。
