# Pi Runtime 契约 Spike

关联工作：Issue #5、Issue #7、Issue #16。

## 状态

```text
source-and-runtime-verified-normal-tool
```

已经验证：

- Pi Release Tag 源码契约；
- npm Registry Artifact 的 Tarball、manifest、SDK Root Exports；
- 无凭证 RPC 空 Session；
- 无外部 Provider Prompt 的 SDK + Extension 正常单 Tool 生命周期；
- Tool correlation、`agent_end`、`agent_settled` 和宿主 `session_shutdown` 的真实顺序。

尚未验证 Retry、Follow-up、取消、并行 Tool、Compaction、Session Replacement 和 RPC 真实 Prompt。

## 固定上游基线

```text
Authority       earendil-works/pi
Release Tag     v0.84.1
Tag Commit      53fa77ccd8a279eb87e92294ef3687b03ff80112
Package         @earendil-works/pi-coding-agent
Version         0.84.1
Node engine     >=22.19.0
License         MIT
```

为什么固定 Release Tag：

- 包版本字段不会随 Release 后的未发布 Commit 自动变化；
- Tag 比浮动 `main` 更能证明固定发布语义；
- npm Artifact、源码基线和 Runtime Fixture 需要指向同一版本身份。

## 机器事实源

```text
packages/pi-adapter/fixtures/pi-upstream-baseline.json
packages/pi-adapter/fixtures/sdk-event-surface.json
packages/pi-adapter/fixtures/rpc-contract.jsonl
packages/pi-adapter/fixtures/pi-artifact-runtime.json
packages/pi-adapter/fixtures/pi-lifecycle-normal-tool.json
scripts/check-pi-spike.mjs
scripts/check-pi-artifact-result.mjs
scripts/check-pi-lifecycle-result.mjs
```

其中：

- `sdk-event-surface.json`、`rpc-contract.jsonl` 是 source-derived Fixture；
- `pi-artifact-runtime.json` 是 Registry Artifact 空会话动态结果；
- `pi-lifecycle-normal-tool.json` 是真实 SDK + Extension Prompt/Tool 生命周期动态结果。

## 一、源码契约

### SDK 事件表面

`AgentSession.subscribe()` 暴露：

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
agent_settled
```

真实 Tool 关联字段：

```text
toolCallId
```

`tool_execution_start`、`tool_execution_update` 和 `tool_execution_end` 都携带该字段。

### `agent_end` 与 `agent_settled`

两者不能混用：

- `agent_end`：一次底层 Agent Run 结束；
- `willRetry=true` 时，随后可能自动重试；
- queued Follow-up 也可能产生后续 Run；
- `agent_settled`：Retry 和 Follow-up 均处理完、Session 真正 idle 后只发一次。

### Session Replacement

`AgentSessionRuntime` 替换 Session 后，旧订阅不会自动迁移。Worker 或 Adapter 必须把重新订阅作为显式状态转换。

### RPC JSONL

RPC 采用严格 LF-only JSONL：

- 每条记录以 `\n` 结束；
- 输入允许 CRLF；
- JSON 字符串中的 `U+2028/U+2029` 不是记录边界；
- 不应使用 Node `readline` 解析协议；
- Command 可选 `id` 回传到对应 Response；
- Bash Update 使用 Bash Command 的 `id`；
- Prompt Response 成功只表示请求已接受/排队，不表示最终任务成功。

## 二、npm Artifact 空会话验证

验证 Artifact：

```text
integrity
sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==

shasum
e098cada629fdeeb9df6e77c6d480d43e1b2c553
```

发布包 manifest 与固定源码基线的公开表面一致：

- package name/version；
- Node engine；
- MIT license；
- root exports；
- RPC CLI bin。

SDK Root Exports 动态导入：

```text
AgentSession
createAgentSession
SessionManager
ModelRuntime
```

RPC 动态启动：

```text
pi --mode rpc --no-session
get_state
get_messages
```

结果：

- 两个请求响应 ID 正确关联；
- 初始 Message 数为零；
- Session ID 在运行时存在但未保存原值；
- Provider Credential 数为零；
- Prompt 数为零。

契约指纹：

```text
8862439aa1c3744ec1465ec7336aca7494fa24b859568266e42203d15d84c6d3
```

## 三、SDK + Extension 正常单 Tool 验证

详细文档：[`normal-tool-lifecycle.md`](normal-tool-lifecycle.md)。

固定场景：

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

Faux Provider：

```text
provider                       zhiwei-faux
api                            zhiwei-faux-api
callCount                      2
pendingResponses               0
promptsSentToExternalProvider  0
```

Tool：

```text
name        echo
toolCallId  zhiwei-tool-call-1
input       lifecycle-input
sideEffect  none
```

所有 Tool 表面使用相同真实 `toolCallId`：

- SDK Tool Start；
- SDK Tool Update；
- SDK Tool End；
- Extension `tool_call`；
- Extension `tool_result`；
- Tool `execute()`。

关键顺序：

```text
agent_end < agent_settled < session_shutdown
```

消息角色：

```text
user → assistant → toolResult → assistant
```

外层契约指纹：

```text
75b0c9fe4d146df046d9657653673be4e7ed21069cae2319a809dcc2da1313e7
```

内层 Capture 指纹：

```text
77d726e9e571f0c61eb8e79b63dbdd11f22498576889851c3650fecf597974d6
```

### `session_start` 的负证据

虽然 `createAgentSession()` 明确传入：

```text
sessionStartEvent = session_start / startup
```

Inline Extension 的首事件仍是：

```text
input
```

`session_start` 计数为零。

因此当前 Adapter 结论是：

> SDK 嵌入路径必须在 `createAgentSession()` 成功返回的宿主边界建立 Session 映射，不能只依赖 Extension `session_start`。

### `session_shutdown` 的宿主语义

正常路径 idle 后，Harness 显式调用：

```text
session.extensionRunner.emit({
  type: session_shutdown,
  reason: exit
})
```

然后释放订阅并 `dispose()`。这证明：

- `agent_settled` 是 Agent 稳定边界；
- `session_shutdown` 是宿主生命周期边界；
- `dispose()` 是资源释放；
- 三者不能折叠成一个状态。

## 隔离与信任模型

Artifact 和 Lifecycle Job 都运行在独立 GitHub Actions Job：

- 权限仅 `contents: read`；
- checkout 不持久化凭证；
- 不使用 `pull_request_target`；
- 不引用 `${{ secrets.* }}`；
- npm install scripts 禁用；
- digest-pinned Node 容器；
- 只读根文件系统；
- 非 root；
- `cap-drop=ALL`；
- `no-new-privileges`；
- 不挂载宿主私有 checkout；
- 只挂载 curated read-only Probe Bundle；
- 失败结果也上传，但 Job 保持失败；
- 结果不包含原始 Session ID、绝对 Runner 路径、Token、Cookie、环境转储、用户数据或模型原始思维链。

## 失败与恢复记录

失败不是从历史中删除，而是作为契约证据保留。

### Artifact 验证阶段

1. Host Probe 业务检查通过，但包仍能看到宿主 checkout，结果残留 hosted-toolcache 路径；结果被拒绝。
2. Docker noexec 临时文件系统拒绝直接执行 `.bin/pi`；没有放宽沙箱，改由只读根中的 Node 加载已核对 CLI 入口。
3. 强化隔离后通过；fresh 结果与 committed Artifact Fixture 一致。

### Lifecycle Capture 阶段

1. 首次使用 `createRequire().resolve()` 加载 ESM-only 包，触发 `ERR_PACKAGE_PATH_NOT_EXPORTED`；改为读取已安装精确 manifest，并通过 file URL 动态导入发布包 ESM 入口。
2. 首次完整 Capture 成功，但 checker 假定 Inline Extension 必须收到 `session_start`；真实事件从 `input` 开始。没有补造事件，而是把该负证据固化为 Adapter 约束。
3. committed Fixture 建立后，fresh Capture 与完整契约指纹再次一致。

## CI 入口

静态/Committed 检查：

```bash
npm run check:pi-spike
npm run check:pi-artifact
npm run check:pi-lifecycle
```

动态 Probe：

```bash
npm run probe:pi:sdk
npm run probe:pi:rpc
npm run probe:pi:artifact
npm run probe:pi:lifecycle
```

Lifecycle 动态 Job 仅在相关路径、手工请求或 weekly schedule 时运行；普通功能 PR 不依赖 npm 网络。

## 当前可以据此继续什么

现在可以基于真实证据：

- 为 Normal Tool Path 定义 Tool correlation；
- 把 `agent_settled` 作为正常单 Run 的稳定边界；
- 把 Session 创建映射放在宿主 SDK 边界；
- 把 `session_shutdown` 作为宿主显式事件；
- 为 Retry、Follow-up、取消、并行 Tool、Compaction 和 Session Replacement 建立下一批独立 Fixtures；
- 在这些场景完成后修订 `NormalizedRuntimeEvent`。

当前仍不能直接实现 SQLite Observation Ledger，因为异常、并发、压缩和替换边界尚未冻结。
