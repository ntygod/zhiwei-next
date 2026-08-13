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
instrumentation provenance refresh: fixed-container and Artifact verified
```

本记录比较固定 npm发布 Artifact上的进程内 `AgentSession` SDK、原始 JSONL RPC Worker与发布包 `RpcClient`执行同一个无工具任务时的接受、运行中、稳定和关闭边界。固定容器 Run `31666316897`已经成功完成 Fresh Capture、两个 Checker、committed Fixture校验和完整对象比较；其 Artifact `9168052320`与 committed Fixture逐字节绑定，当前 Manifest因此处于 `verified`状态。

Committed Fixture：

```text
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-<index>-<sha256>.b64
```

`gzip + base64 parts` Loader 校验 Manifest引用的内容寻址分片、压缩体、解压 JSON、双层指纹，并运行主 Checker 与 `RpcClient get_messages` Checker。Fresh Capture 与 committed Fixture 比较完整对象。旧的非活动分片暂时保留，以免已经读取旧 Manifest的并发 Reader失去引用。

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

知微为本场景冻结的公开 `RpcClient` **必需方法子集**如下；它不是发布类全部公开 Surface 的枚举：

```text
abort
collectEvents
getAvailableModels
getLastAssistantText
getMessages
getState
getStderr
prompt
setModel
setThinkingLevel
start
stop
waitForIdle
```

运行时原型仍会枚举 TypeScript 私有实现方法 `send`，但它不属于公开支持合同。发布 `.d.ts` 同样把 `process` 声明为 `private`；Capture 只把发布 JavaScript 中对应的 ChildProcess 字段用作实现层观测点，不把它提升为公开 API，也不要求生产 Adapter 依赖该字段。

发布包同时确认：根入口重新导出 modes；RPC entry 强制进入 RPC mode；Client 使用共享的严格 JSONL helper；RPC mode 暴露 Prompt Response、`agent_settled`、`get_state` 和 `get_messages`；JSONL Reader 只按 `\n` framing，不使用 `node:readline`。源码还明确显示 `stop()` 先请求 `SIGTERM`，并在等待超时后保留 `SIGKILL` fallback；这两个源码信号与运行时是否真的触发 fallback 必须分别记录。

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
instrumentationSurface=published-js-private-process-field
published d.ts process visibility=private
requestedSignals=[{ signal="SIGTERM", accepted=true }]
Extension session_shutdown(reason=quit)
processBoundaries[0]={ sequence=1, type=exit, code=143, signal=null, extensionShutdownRunIdentityMatched=true }
processBoundaries[1]={ sequence=2, type=close, code=143, signal=null, extensionShutdownRunIdentityMatched=true }
Extension evidence runIdentityMatched=true (per-run nonce removed from committed output)
SIGKILL requests=0
stderrPresent=false
```

这里的 `accepted=true` 是发布 ChildProcess `kill()` 的真实返回值，不是文档自报的 Transport 字符串。Probe在启动前删除旧 Evidence，生成每次运行的随机 nonce，经环境变量只传给本次 Worker；Extension把 nonce写入临时 Evidence，Process Boundary和最终读取都必须精确匹配本次 nonce。提交的脱敏结果只保留固定 `runIdentityMatched=true`，不会保存随机值。该绑定与 `session_shutdown(reason=quit)` 已落盘、`exit → close` 的完整 Process Boundary、两处 `code=143 / signal=null` 以及请求列表中没有 `SIGKILL` 共同构成重复诊断 Capture中的成功关闭证据。发布源码中仍存在 `SIGKILL` fallback；这些诊断运行证明对应成功路径没有触发 fallback，不代表错误路径已经验证，也不能在 recovery run完成前冒充新的 committed / fixed-container Fixture证据。

`collectEvents()`的内部超时器由 Probe明确 `unref()`，避免 Prompt失败后仅为等待超时而拖住失败进程；与之配套，等待 `agent_settled`必须显式和真实 ChildProcess `exit/error`竞争。这样 Worker提前终止会进入正常异常路径、执行监听器/Timer清理并持久化 `status=failed`，不会因未完成的顶层 `await`不维持 Node事件循环而静默提前退出。

`RpcClient.stop()` 的实现层 SIGTERM 请求与原始 JSONL 的 Host stdin EOF 是不同关闭表面：前者以 `exit(143) → close(143)` 收尾，后者以 `exit(0) → close(0)` 收尾。两者不能互相替代，也不能外推为异常退出、Restart 或 Resume。

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
host call RpcClient.stop()
observed ChildProcess SIGTERM request / acceptance
RPC Extension session_shutdown
Process exit / close
```

未来协议必须保留 `sourceSurface`、`sourceEventType`、`sourceSequence`、适用的 RPC ID / Command、稳定边界语义与 observed / host-synthesized provenance。

## Fixture 身份与 provenance 生命周期

Manifest 的 `source` 必须精确包含 `head`、`workflowRun`、`artifactId`、`artifactDigest`四个键，额外键也会被拒绝；它只有两种合法状态：

| 状态 | `head` | `workflowRun` / `artifactId` / `artifactDigest` | 允许范围 |
|---|---|---|---|
| `candidate` | 生成候选 JSON 的完整 40 位 Commit SHA | 三项必须全部为 `null` | 仅 Draft PR 的恢复与收敛阶段 |
| `verified` | 被引用 Workflow Run 的 Capture HEAD | 三项必须全部为有效值 | Ready、所有非 Draft运行与 Merge Gate |

不允许部分填写 provenance。`candidate` 只表示“候选 Fixture 的内容和来源 Commit 已明确，但 GitHub Artifact 身份尚未固定”，不是最终验证结论，也不能进入 Ready 或合并。

Workflow 采用 **fresh-first recovery**：先在 digest-pinned 容器中产生并通过两个 Fresh Checker，再读取、校验并与 committed Fixture 比较完整对象；只有 Capture和Fresh校验都成功时才上传脱敏 Artifact，但其上传仍使用 `always()`语义，不受随后旧 Fixture或完整对象比较失败影响。因此 committed漂移不会阻止本次运行留下可下载的合格 Fresh Evidence，而未通过脱敏 Checker的失败 JSON不会被当作 Evidence上传。`pull_request` 运行显式 checkout 事件中的 `pull_request.head.sha`，并立即用 `git rev-parse HEAD` 精确核对；不使用 Actions 默认的 synthetic merge ref 冒充 Capture 来源。恢复时在 Draft PR 中用该 Evidence 重建 JSON、分片和 Manifest，先以 `candidate` 收敛内容，再把真实 Run / Artifact 身份补齐为 `verified`。

三个摘要不能混用：

- `jsonSha256`：Manifest 分片解压后那份规范 JSON 字节的 SHA-256；
- `compressedSha256`：提交到仓库的 gzip 字节 SHA-256；
- `artifactDigest`：GitHub Actions `upload-artifact` 生成的 ZIP Archive SHA-256，用于把 Workflow Run / Artifact 与下载来源绑定；它不是内层 `result.json` 的 `jsonSha256`。

Ready 前必须完成最终 HEAD 的 R3 独立 AI 审查，并把 Manifest 升级为 `verified`。`ready_for_review` 会重新触发固定容器 Capture；非 Draft PR、`push main`、手动运行与定时运行都强制 `--require-verified-source`。非 Draft PR还运行 live provenance Checker，核对 Workflow、事件类型、成功结论、Run HEAD、PR关联、Artifact所属 Run、按 `run_attempt`派生的 Artifact名称、未过期状态与 ZIP Digest，并要求 `source.head`是当前 PR HEAD的真实 Git祖先；Checker还下载对应 ZIP，严格要求其中唯一条目为 `result.json`，把下载 ZIP摘要、`result.json`字节摘要与 committed Fixture完整字节同时绑定。无法用真实 Compare或内容绑定证明时 fail closed，不使用 synthetic merge parent fallback。只有 Fresh Capture 与 committed Fixture完整相等、两个结果 Checker、Manifest / Artifact live provenance、当前 HEAD CI与独立审查全部通过，PR才满足合并条件。

下面是当前 `verified` Manifest已记录的内容身份：

```text
format                       gzip+base64-parts
parts                        6
partLength                   2400
base64Length                 13148
compressedBytes              9861
compressedSha256             44d95e16d8078413c1afe94dd3c7a19bbcdbfad06d82a51a491d0ce8e4b3fbbb
jsonBytes                    122178
jsonSha256                   a3f47e34c2bd78b16793c7aeacfdf4020c788e475dda252779603bc9e470034d
outer contract fingerprint   c99bcfb2872736e085750690965dd11dce1bc873b14b905b53a1e57defa3dcbf
capture contract fingerprint 70ce5607549b2d8342d7abba1312b2231c1a069a038dd39a9dbf23dd65ccb9c7
```

当前 Manifest来源状态：

```text
state            verified
capture head     fe4aeb840fa3efed7d881679a78955af470896d9
workflow run     31666316897
artifact id      9168052320
artifact digest  sha256:7ba326de0b6e3d616d6bd0d1e1650d3609f31fc6f591df1004ff1d2ae6d5821e
```

Artifact ZIP内只有一个 `122178`字节的 `result.json`；ZIP摘要与上面的 `artifactDigest`一致，`result.json`摘要与 `jsonSha256`一致，并与 Loader从 committed分片还原的 JSON逐字节相同。Run `31666316897`来自当前治理 PR #63 的 Draft head，因此后续 Ready gate可以把这份成功 Evidence与当前 PR ancestry、Workflow和 Artifact实时绑定。Manifest 是 provenance 的机器事实源；叙述性文档不能覆盖其 `candidate` / `verified` 状态。

## 安全与脱敏

固定 npm integrity/shasum、Node 和容器 digest；禁用 install scripts；curated bundle 与 rootfs 只读；非 root、`cap-drop=ALL`、`no-new-privileges`；不传仓库 Secret、不挂载宿主私有 checkout；不保存原始 Session ID/File、PID、绝对路径、环境转储、Credential、原始 stderr 或思维链；外部 Provider Prompt 数为 `0`。

## 验证入口

```bash
npm run check:pi-sdk-rpc-parity
npm run check
npm run probe:pi:sdk-rpc-parity

# Draft recovery: only use the sanitized result.json from a fixed-container run.
node scripts/pi-sdk-rpc-parity-fixture.mjs \
  --manifest packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json \
  --pack /path/to/result.json \
  --source-head <capture-head>
```

`--pack`把 Fresh JSON与 Fixture解压输出统一限制为 8 MiB，并在文件打开后及有界读取时再次强制该上限；它先运行以脚本目录为锚点的两个结果 Checker，再用固定 gzip level / mtime和跨平台规范化 header重建 candidate。新分片以序号和完整内容 SHA-256命名、只用排他创建；Packer拒绝 Fixture目录、Manifest或分片上的符号链接 / 非普通文件，在 Fixture父目录持有不会随 Fixture目录重命名而移动的排他锁，并持有父目录与 Fixture目录句柄，在每个事务关键点校验路径仍指向原目录身份。分片写入与同步、临时 Manifest完整回读和 Checker复验完成后，最后只原子替换 `manifest.json`。切换前失败时旧 Manifest与旧分片保持可读；切换后也保留旧分片，避免已经读取旧 Manifest的并发 Reader失去其引用，显式 GC必须另行建立 Reader lease或版本保留协议。进程崩溃或成功切换都可能留下安全的非活动分片；目录身份异常会保留父目录锁，锁只能在确认没有 Packer运行并检查 Fixture树后人工移除。它不会伪造 Workflow Run、Artifact ID或 Artifact Digest。输入必须是规范化、带末尾换行的完整 Fresh Result，`source-head`必须对应产生该结果的 Capture Commit。

关键机器文件：

```text
.github/workflows/pi-sdk-rpc-parity.yml
scripts/probes/pi-sdk-rpc-parity-contract.mjs
scripts/probes/pi-sdk-rpc-parity-faux-extension.mjs
scripts/probes/pi-sdk-rpc-parity-capture.mjs
scripts/probes/pi-sdk-rpc-parity-composite-capture.mjs
scripts/check-pi-sdk-rpc-parity-result.mjs
scripts/check-pi-sdk-rpc-client-messages-result.mjs
scripts/check-pi-sdk-rpc-parity-provenance.mjs
scripts/pi-sdk-rpc-parity-fixture.mjs
```

## 未覆盖

不覆盖 Tool/Bash、Steering/Follow-up、Cancel/Retry、Compaction/Replacement、Worker Restart/Resume、非法 JSON、未知命令、Preflight拒绝或 Provider Error。Issue #32 单独验证 Worker 异常退出、重启、恢复和错误边界。
