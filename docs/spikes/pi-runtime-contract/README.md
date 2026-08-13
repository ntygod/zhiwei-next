# Pi Runtime 契约 Spike

关联 Issue：#5、#7、#16、#20、#22、#24、#26、#28、#45；后续依赖：#32 → #49 → #56。

## 状态演化

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

历史标签 `source-verified`、`runtime-unverified` 只说明当时的证据强度，不代表当前能力回退。

## 固定基线

```text
Repository  earendil-works/pi
Release     v0.84.1
Commit      53fa77ccd8a279eb87e92294ef3687b03ff80112
Package     @earendil-works/pi-coding-agent
Version     0.84.1
Node        22.23.1
npm         10.9.8
```

RPC 使用严格 **LF-only** JSONL；字符串里的 `U+2028/U+2029`不是记录边界。Tool 生命周期使用真实 `toolCallId`；`agent_end`与最终稳定事件 `agent_settled`不能合并。

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
```

Fresh Capture 必须与 committed Fixture 完整对象比较；Source-derived Fixture 不能代替发布 Artifact 的动态行为证据。

## 正常 Tool

详细文档：[`normal-tool-lifecycle.md`](normal-tool-lifecycle.md)。

```text
Prompt → Tool Start / Update / End → Tool Result
→ Final Assistant → agent_end(willRetry=false)
→ agent_settled → session_shutdown(reason=exit)
```

最终消息：`user → assistant → toolResult → assistant`。

```text
outer   75b0c9fe4d146df046d9657653673be4e7ed21069cae2319a809dcc2da1313e7
capture 77d726e9e571f0c61eb8e79b63dbdd11f22498576889851c3650fecf597974d6
```

固定 SDK Inline Extension 从 `input`开始，没有收到 `session_start`；Session 映射必须建立在 `createAgentSession()`成功返回的宿主边界。

## Retry 恢复成功

阶段：`source-and-runtime-verified-retry-success`。

```text
Fixture  pi-lifecycle-retry-success.json
Document retry-success-lifecycle.md
```

公共 `agent_end.willRetry=[true,false]`；失败 Run 后出现 `auto_retry_start`，恢复后出现 `auto_retry_end(success=true)`，最终 `agent_settled`一次。**Extension auto_retry_start** 与 `auto_retry_end`均不存在，第一次失败 Assistant 只能从事件流恢复。

```text
outer   e87f7365eefbb4d7de7a4570a6c99df7a1fdf26f58aa2a40fab9149cb6deff02
capture ed1c450ce6e26be60c29aa6d9a29f13d339cb975999e1a3b4c0a43a5f9b4ac85
```

## Follow-up 队列

阶段：`source-and-runtime-verified-follow-up-queue`。

```text
Fixture  pi-lifecycle-follow-up-queue.json
Document follow-up-queue-lifecycle.md
```

- Follow-up 在**一个公共 Agent Run内追加第二个 Turn**；
- **队列清空不等于 Prompt结束**；
- **Extension不接收 `queue_update`**；
- **`session.prompt()`覆盖排入的 Follow-up**，直到队列排空、Session idle 和最终 `agent_settled`；
- 最终消息：`user → assistant → user → assistant`。

```text
outer   00c3f7916a129869b768f7e7147a55a8c783b33e5a55e0e79c13eb45a1d692e8
capture 5b2e266feb27155b7ded59c33aa12e6cd060ce89201dc21a8cd35f49a8748386
```

## Cancel、abortRetry 与 exhaustion

阶段：`source-and-runtime-verified-cancel-retry-exhaustion`。

```text
Fixture  pi-lifecycle-cancel-retry-exhaustion.json
Document cancel-retry-exhaustion-lifecycle.md
```

- 流式取消后保留**部分 Assistant**，`stopReason=aborted`；
- Backoff 取消可能出现 **willRetry=true 但没有后续 Run**；
- exhaustion 的 `willRetry=[true,true,false]`，保留**最终一次失败的 Assistant**；
- Prompt Promise 正常 resolve 不等于任务成功。

```text
outer   b866798d18569c78d5c712254c3ecdecd7a3e02c0ef11458e6b97b0863b1f6e0
capture b544631413935d2b3f55f9f9f8bcf15a06944bba682cf48471902e4726f79609
```

## 并行 Tool ordering

阶段：`source-and-runtime-verified-parallel-tool-ordering`。

```text
Fixture  pi-lifecycle-parallel-tool-ordering.json
Document parallel-tool-ordering-lifecycle.md
```

```text
声明顺序  alpha → beta → gamma
完成顺序  beta → gamma → alpha
消息顺序  alpha → beta → gamma
```

该场景证明**完成顺序与消息顺序分离**，所有表面只能通过真实 `toolCallId`关联。

```text
outer   fd372a8e73f4545bd7a34c6ac3e82cfc2d044dca473ae374627b847864389b02
capture 164f0e95e7f617c7aa69d1a1b34a5ae7935673c1ee852fa452541d15c1551376
```

## Compaction 与 Session Replacement

阶段：`source-and-runtime-verified-compaction-session-replacement`。

```text
Fixture  packages/pi-adapter/fixtures/pi-lifecycle-compaction-session-replacement.json
Document compaction-session-replacement-lifecycle.md
```

```text
compaction_start → compaction_end
Public `entry_appended`没有出现
context before  user → assistant → user → assistant
context after   compactionSummary → assistant
```

原始 Entry 仍完整保留；Summary 是派生上下文。Session Object 为 `session-object-1 → session-object-2 → session-object-3`；**旧 Public Listener不会自动迁移**。

```text
outer   9ebe87b12f0670214fa1244239d21d7a517b2332da2f3f85b3372b8b6895ab75
capture f4e3d675207416c961585ee645c5fc43c395320ed7a736da71bae741577b1fee
```

## SDK / RPC 同任务成功路径

阶段：`source-and-runtime-verified-sdk-rpc-parity`。包含新 `stop()` instrumentation的固定容器 Evidence已经由成功 Run与 Artifact完整绑定，Manifest恢复为 `verified`。详细文档：[`sdk-rpc-parity-lifecycle.md`](sdk-rpc-parity-lifecycle.md)。

发布 Artifact 根导出 `runRpcMode`和 `RpcClient`。本场景冻结的是公开 Client 的必需方法子集，而不是全部公开 Surface：

```text
abort, collectEvents, getAvailableModels, getLastAssistantText,
getMessages, getState, getStderr, prompt, setModel,
setThinkingLevel, start, stop, waitForIdle
```

TypeScript 私有实现方法 `send`不属于支持合同；发布 `.d.ts` 中的 `process`也声明为 `private`。Probe 只用发布 JavaScript 对应字段观测 `stop()` 的实现层 ChildProcess 边界，不把它提升为公开 API 或生产 Adapter 依赖。

SDK Public 与原始 RPC Runtime 的核心投影一致：

```text
agent_start → turn_start → user message → assistant message
→ turn_end → agent_end(willRetry=false) → agent_settled
```

最终均为 `user → assistant`，Assistant 长度 `1194`，SHA-256：

```text
5604485dabc1a8b5d71db37611b23b7ddcc761238cd3621a309934d0fdf9c1f9
```

### Prompt 接受不是完成

```text
prompt success Response       index 4
agent_start                   index 5
running get_state Response   index 11
agent_settled                index 35
Runtime Events after Response 29
```

状态：`isStreaming=false → true → false`，`messageCount=0 → 1 → 2`。Prompt success Response 和 `RpcClient.prompt()`返回都只是接受边界。

### 发布 RpcClient 的 Messages

```text
before prompt:
  getMessages()=[]
  isStreaming=false, messageCount=0

after prompt acceptance:
  isStreaming=true, messageCount=1

after agent_settled:
  getMessages()=user → assistant
  isStreaming=false, messageCount=2
```

### 关闭面

```text
raw JSONL: host stdin EOF → extension shutdown(quit) → exit=0 → close=0
RpcClient:  stop()
  → observed kill(SIGTERM), accepted=true
  → extension shutdown(quit), evidence durable
  → exit(code=143, signal=null)
  → close(code=143, signal=null)
```

固定容器 verified Capture中，`requestedSignals`只有一次被接受的 `SIGTERM`，没有 `SIGKILL`，所以对应成功路径没有触发 fallback；发布源码仍明确包含等待超时后的 `SIGKILL` fallback。Artifact与隔离诊断结果逐字节一致。stdin EOF与 `RpcClient.stop()`的实现层 SIGTERM请求必须分开记录，也不能外推 Worker Restart、Resume或异常退出语义。

### 来源边界

必须保留 SDK Preflight、SDK Public、SDK Extension、RPC Command/Response ID、RPC Runtime Event、State Snapshot、`get_messages`、Host stdin EOF、Host `RpcClient.stop()`调用、实际 ChildProcess Signal请求、Extension Shutdown、Exit 和 Close。RPC `message_update`只保存 delta，不含累计 `partial`。

### Fixture 身份与来源状态

Manifest `source` 只允许两态：`candidate` 保留完整 `head`，但 `workflowRun`、`artifactId`、`artifactDigest`必须全部为 `null`，只允许 Draft PR恢复；`verified`要求三项全部有效，是 Ready 与 Merge Gate。部分填写会失败，`candidate`也不能被当成最终 provenance。

Workflow 使用 fresh-first recovery：固定容器先生成 Fresh Capture并通过两个脱敏 Checker，再校验 committed Fixture和完整对象；合格 Fresh Artifact的上传不受随后旧 Fixture漂移失败影响，未通过 Fresh Checker的失败 JSON则不会上传。PR运行显式 checkout事件中的 `pull_request.head.sha`并核对实际 Git HEAD，不把默认 synthetic merge ref当作来源。Draft中收敛 candidate后，必须引用真实 Workflow Run / Artifact升为 verified；非 Draft PR、`push main`、手动运行与定时运行都强制 `--require-verified-source`。Ready触发的非 Draft运行还执行 live provenance检查，要求来源 HEAD是当前 PR HEAD的真实祖先，并下载对应 Artifact ZIP，把 ZIP Digest、其中唯一 `result.json`的 SHA与 committed Fixture完整字节同时绑定。

`jsonSha256`绑定解压后的规范 JSON字节，`compressedSha256`绑定仓库中的 gzip字节，`artifactDigest`绑定 GitHub Actions `upload-artifact`生成的 ZIP Archive；三者作用域不同，不能互相替代。最终合并还要求 Fresh / committed完整相等、两个结果 Checker、live Run / Artifact provenance、当前 HEAD CI和 R3独立 AI审查全部通过。

以下数字是当前 `verified` Manifest记录的内容身份与来源状态：

```text
parts                        6
compressedBytes              9861
compressedSha256             44d95e16d8078413c1afe94dd3c7a19bbcdbfad06d82a51a491d0ce8e4b3fbbb
jsonBytes                    122178
jsonSha256                   a3f47e34c2bd78b16793c7aeacfdf4020c788e475dda252779603bc9e470034d
outer contract fingerprint   c99bcfb2872736e085750690965dd11dce1bc873b14b905b53a1e57defa3dcbf
capture contract fingerprint 70ce5607549b2d8342d7abba1312b2231c1a069a038dd39a9dbf23dd65ccb9c7
source state                 verified
capture head                 fe4aeb840fa3efed7d881679a78955af470896d9
capture workflow             31666316897
capture artifact             9168052320
capture artifact digest      sha256:7ba326de0b6e3d616d6bd0d1e1650d3609f31fc6f591df1004ff1d2ae6d5821e
external Provider prompts    0
```

固定容器 Run `31666316897`整体成功；Artifact `9168052320`的 ZIP Digest与上面的 `artifactDigest`一致，其中唯一 `result.json`的 SHA-256为 `a3f47e34…`，并与 committed Fixture逐字节相同。该 Run来自当前 PR #63，供 Ready live provenance做PR关联与ancestry核验；Manifest 是 provenance 的机器事实源。

## 隔离与验证

所有动态 Probe：固定 Artifact integrity/shasum、禁用 install scripts、只读 curated bundle/rootfs、非 root、`cap-drop=ALL`、`no-new-privileges`、零仓库 Secret、零真实 Provider Prompt；不保存原始 Session ID/File、PID、绝对路径、环境转储、原始 stderr 或思维链。

```bash
npm run check
npm run check:pi-sdk-rpc-parity
npm run probe:pi:sdk-rpc-parity
```

Draft recovery只允许把固定容器上传的脱敏 `result.json`交给 `scripts/pi-sdk-rpc-parity-fixture.mjs --pack ... --source-head <capture-head>`。Packer将输入与解压输出统一限制为 8 MiB，使用锚定仓库位置的两个结果 Checker，并确定性生成带完整内容 SHA-256的不可变 candidate分片。它在 Fixture父目录持有排他锁，持有并反复核验父目录与 Fixture目录身份，先写入、同步并完整回读临时 Manifest，最后只原子切换 `manifest.json`；失败不会原地混写活动 Fixture，目录替换、符号链接或非普通文件也会 fail closed。旧分片不会在切换时删除，以保证已经读取旧 Manifest的并发 Reader仍能完成；显式 GC需要独立的 Reader lease或版本保留协议。崩溃或目录身份异常遗留的锁只能在确认没有 Packer运行并检查 Fixture树后人工移除。Workflow / Artifact provenance仍必须来自后续真实成功 Run，不能由本地命令补造。

Issue #32 将单独验证异常 EOF/退出、Restart、Session Resume、非法 JSON、未知命令、Preflight 拒绝与 Provider Error。完成 #32 前不冻结正式 `NormalizedRuntimeEvent v1`，也不开始 SQLite Observation Ledger。
