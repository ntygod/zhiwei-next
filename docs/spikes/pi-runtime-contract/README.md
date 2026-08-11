# Pi Runtime 契约 Spike

关联工作：Issue #5、Issue #7、Issue #16、Issue #20、Issue #22。

## 状态

```text
source-and-runtime-verified-follow-up-queue
```

### 历史状态演化

```text
PR #6   source-verified / runtime-unverified
PR #8   source-and-runtime-verified
PR #17  source-and-runtime-verified-normal-tool
PR #21  source-and-runtime-verified-retry-success
当前    source-and-runtime-verified-follow-up-queue
```

早期状态作为证据链保留，不代表当前能力回退。

已经验证：

- Pi Release Tag源码契约；
- npm Registry Artifact的 Tarball、manifest、SDK Root Exports；
- 无凭证 RPC空 Session；
- 无外部 Provider Prompt的 SDK + Extension正常单 Tool生命周期；
- Tool correlation、`agent_end`、`agent_settled`和宿主 `session_shutdown`的真实顺序；
- 一次 retryable Provider错误后自动重试并恢复成功；
- 公共 `AgentSession` Retry事件与 Extension生命周期表面的差异；
- Follow-up队列填充/清空、同一 Run内的双 Turn和最终单次 `agent_settled`；
- 公共 `queue_update`与 Extension无队列事件的表面差异。

尚未验证取消、重试耗尽、并行 Tool、Compaction、Session Replacement和 RPC真实 Prompt。

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

- 包版本字段不会随 Release后的未发布 Commit自动变化；
- Tag比浮动 `main`更能证明固定发布语义；
- npm Artifact、源码基线和 Runtime Fixture需要指向同一版本身份。

## 机器事实源

```text
packages/pi-adapter/fixtures/pi-upstream-baseline.json
packages/pi-adapter/fixtures/sdk-event-surface.json
packages/pi-adapter/fixtures/rpc-contract.jsonl
packages/pi-adapter/fixtures/pi-artifact-runtime.json
packages/pi-adapter/fixtures/pi-lifecycle-normal-tool.json
packages/pi-adapter/fixtures/pi-lifecycle-retry-success.json
packages/pi-adapter/fixtures/pi-lifecycle-follow-up-queue.json
scripts/check-pi-spike.mjs
scripts/check-pi-artifact-result.mjs
scripts/check-pi-lifecycle-result.mjs
scripts/check-pi-retry-lifecycle-result.mjs
scripts/check-pi-follow-up-lifecycle-result.mjs
```

其中：

- `sdk-event-surface.json`、`rpc-contract.jsonl`是 source-derived Fixture；
- `pi-artifact-runtime.json`是 Registry Artifact空会话动态结果；
- `pi-lifecycle-normal-tool.json`是真实 SDK + Extension Prompt/Tool生命周期动态结果；
- `pi-lifecycle-retry-success.json`是真实自动重试恢复成功动态结果；
- `pi-lifecycle-follow-up-queue.json`是真实 Follow-up队列与最终稳定边界动态结果。

## 一、源码契约

### SDK事件表面

`AgentSession.subscribe()`暴露：

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

真实 Tool关联字段：

```text
toolCallId
```

`tool_execution_start`、`tool_execution_update`和 `tool_execution_end`都携带该字段。

### `agent_end`与 `agent_settled`

两者不能混用：

- `agent_end`：一次底层 Agent Run结束；
- `willRetry=true`时，随后可能自动重试；
- Follow-up在已验证场景中追加了同一 Run内的新 Turn；
- 其他输入模式不能仅凭名称推断是否创建新 Run，必须以事件为准；
- `agent_settled`：Retry和 Follow-up均处理完、Session真正 idle后只发一次。

### Session Replacement

`AgentSessionRuntime`替换 Session后，旧订阅不会自动迁移。Worker或 Adapter必须把重新订阅作为显式状态转换。

### RPC JSONL

RPC采用严格 LF-only JSONL：

- 每条记录以 `\n`结束；
- 输入允许 CRLF；
- JSON字符串中的 `U+2028/U+2029`不是记录边界；
- 不应使用 Node `readline`解析协议；
- Command可选 `id`回传到对应 Response；
- Bash Update使用 Bash Command的 `id`；
- Prompt Response成功只表示请求已接受/排队，不表示最终任务成功。

## 二、npm Artifact空会话验证

验证 Artifact：

```text
integrity
sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==

shasum
e098cada629fdeeb9df6e77c6d480d43e1b2c553
```

发布包 manifest与固定源码基线的公开表面一致：

- package name/version；
- Node engine；
- MIT license；
- root exports；
- RPC CLI bin。

SDK Root Exports动态导入：

```text
AgentSession
createAgentSession
SessionManager
ModelRuntime
```

RPC动态启动：

```text
pi --mode rpc --no-session
get_state
get_messages
```

结果：

- 两个请求响应 ID正确关联；
- 初始 Message数为零；
- Session ID在运行时存在但未保存原值；
- Provider Credential数为零；
- Prompt数为零。

契约指纹：

```text
8862439aa1c3744ec1465ec7336aca7494fa24b859568266e42203d15d84c6d3
```

## 三、SDK + Extension正常单 Tool验证

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

所有 Tool表面使用相同真实 `toolCallId`：

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

内层 Capture指纹：

```text
77d726e9e571f0c61eb8e79b63dbdd11f22498576889851c3650fecf597974d6
```

### `session_start`负证据

虽然 `createAgentSession()`明确传入：

```text
sessionStartEvent = session_start / startup
```

Inline Extension首事件仍是：

```text
input
```

`session_start`计数为零。

因此当前 Adapter结论是：

> SDK嵌入路径必须在 `createAgentSession()`成功返回的宿主边界建立 Session映射，不能只依赖 Extension `session_start`。

### `session_shutdown`宿主语义

正常路径 idle后，Harness显式调用：

```text
session.extensionRunner.emit({
  type: session_shutdown,
  reason: exit
})
```

然后释放订阅并 `dispose()`。这证明：

- `agent_settled`是 Agent稳定边界；
- `session_shutdown`是宿主生命周期边界；
- `dispose()`是资源释放；
- 三者不能折叠成一个状态。

## 四、自动重试恢复成功验证

详细文档：[`retry-success-lifecycle.md`](retry-success-lifecycle.md)。

固定场景：

```text
Faux response 1  overloaded_error
Faux response 2  Retry recovered.
retry settings   enabled=true, maxRetries=3, baseDelayMs=1
```

公共 `AgentSession`真实顺序：

```text
失败 Run
  → agent_end(willRetry=true)
  → auto_retry_start(attempt=1)
  → 恢复 Run
  → auto_retry_end(success=true)
  → turn_end(stop)
  → agent_end(willRetry=false)
  → agent_settled
```

关键计数：

```text
Session events        23
Extension events      24
provider calls         2
external prompts       0
public agent_end       2
public retry start     1
public retry end       1
public settled         1
```

Extension真实差异：

```text
Extension auto_retry_start    0
Extension auto_retry_end      0
Extension agent_end.willRetry absent
```

这意味着知微不能把 Extension `agent_end`当作公共 Session `agent_end`的完整替代。Adapter必须保留来源，并只在实际存在的表面读取 `willRetry`、Retry attempt和 success。

另一个重要结果：最终 `session.messages`只剩：

```text
user → assistant
```

第一次失败 Assistant尝试不在最终消息列表里，但完整存在于运行事件流。因此 Observation Ledger不能只从 Session最终消息重建重试历史。

外层契约指纹：

```text
e87f7365eefbb4d7de7a4570a6c99df7a1fdf26f58aa2a40fab9149cb6deff02
```

内层 Capture指纹：

```text
ed1c450ce6e26be60c29aa6d9a29f13d339cb975999e1a3b4c0a43a5f9b4ac85
```

## 五、Follow-up队列验证

详细文档：[`follow-up-queue-lifecycle.md`](follow-up-queue-lifecycle.md)。

固定场景：

```text
Initial Prompt
  → First assistant message_start
  → session.followUp(queued message)
  → queue_update(non-empty)
  → First assistant response ends
  → Second turn starts
  → queue_update(empty)
  → Follow-up user message
  → Follow-up assistant response
  → agent_end(willRetry=false)
  → agent_settled
  → host-owned session_shutdown(reason=exit)
```

关键计数：

```text
Session events          23
Extension events        24
provider calls           2
external prompts         0
public queue updates     2
public agent_start       1
public turns             2
public agent_end         1
public settled           1
Extension queue updates  0
```

真实队列边界：

```text
queue filled(sequence=6)
  < first assistant end
  < second turn_start
  < queue cleared(sequence=13)
  < follow-up user message_start(sequence=14)
```

这说明：

- 已验证 Follow-up在一个公共 Agent Run内追加第二个 Turn；
- 公共 `queue_update`先暴露非空队列，再在 Follow-up消息交付前暴露空队列；
- 队列清空不等于 Prompt结束，后续仍有完整 Follow-up响应和稳定事件；
- Extension不接收 `queue_update`，不能独立重建 Session队列状态；
- `session.prompt()`覆盖排入的 Follow-up，直到队列清空、Session idle和最终单次 `agent_settled`后才返回；
- 最终 Session消息完整保留 `user → assistant → user → assistant`。

外层契约指纹：

```text
00c3f7916a129869b768f7e7147a55a8c783b33e5a55e0e79c13eb45a1d692e8
```

内层 Capture指纹：

```text
5b2e266feb27155b7ded59c33aa12e6cd060ce89201dc21a8cd35f49a8748386
```

## 隔离与信任模型

Artifact和 Lifecycle Job都运行在独立 GitHub Actions Job：

- 权限仅 `contents: read`；
- checkout不持久化凭证；
- 不使用 `pull_request_target`；
- 不引用 `${{ secrets.* }}`；
- npm install scripts禁用；
- digest-pinned Node容器；
- 只读根文件系统；
- 非 root；
- `cap-drop=ALL`；
- `no-new-privileges`；
- 不挂载宿主私有 checkout；
- 只挂载 curated read-only Probe Bundle；
- 失败结果也上传，但 Job保持失败；
- 结果不包含原始 Session ID、绝对 Runner路径、Token、Cookie、环境转储、用户数据或模型原始思维链。

## 失败与恢复记录

失败不是从历史中删除，而是作为契约证据保留。

### Artifact验证阶段

1. Host Probe业务检查通过，但包仍能看到宿主 checkout，结果残留 hosted-toolcache路径；结果被拒绝。
2. Docker noexec临时文件系统拒绝直接执行 `.bin/pi`；没有放宽沙箱，改由只读根中的 Node加载已核对 CLI入口。
3. 强化隔离后通过；fresh结果与 committed Artifact Fixture一致。

### Normal Tool Lifecycle阶段

1. 首次使用 `createRequire().resolve()`加载 ESM-only包，触发 `ERR_PACKAGE_PATH_NOT_EXPORTED`；改为读取已安装精确 manifest，并通过 file URL动态导入发布包 ESM入口。
2. 首次完整 Capture成功，但 checker假定 Inline Extension必须收到 `session_start`；真实事件从 `input`开始。没有补造事件，而是把该负证据固化为 Adapter约束。
3. committed Fixture建立后，fresh Capture与完整契约指纹再次一致。

### Retry Lifecycle阶段

1. 首轮动态 Capture成功，证明公共 Retry事件存在，同时揭示 Extension没有 Retry专有事件或 `willRetry`增强。
2. 首轮结果没有被源码测试覆盖物替代，而是下载真实 Actions Artifact后固化。
3. Checker随后收紧到完整事件顺序、精确计数、最终消息角色、Extension负证据和双层契约指纹；fresh Capture必须与 committed Fixture完整一致。

### Follow-up Lifecycle阶段

1. 首轮动态 Capture成功，证明固定场景是一个公共 Agent Run内的两个 Turn，而不是两个公共 Run。
2. 真实 Actions Artifact显示公共队列先非空后清空，同时 Extension完全没有 `queue_update`；没有向 Extension补造事件。
3. 首轮结果下载后原样固化为 committed Fixture；Checker收紧到完整事件类型顺序、精确计数、队列序列、最终消息、Extension负证据和双层指纹。
4. committed Fixture建立后，隔离 Job必须重新捕获并做完整对象比较，任何上游行为漂移都会保持失败可见。

## CI入口

静态/Committed检查：

```bash
npm run check:pi-spike
npm run check:pi-artifact
npm run check:pi-lifecycle
npm run check:pi-retry-lifecycle
npm run check:pi-follow-up-lifecycle
```

动态 Probe：

```bash
npm run probe:pi:sdk
npm run probe:pi:rpc
npm run probe:pi:artifact
npm run probe:pi:lifecycle
npm run probe:pi:retry-lifecycle
npm run probe:pi:follow-up-lifecycle
```

Lifecycle动态 Job仅在相关路径、手工请求或 weekly schedule时运行；普通功能 PR不依赖 npm网络。

## 当前可以据此继续什么

现在可以基于真实证据：

- 为 Normal Tool Path定义 Tool correlation；
- 把 Prompt、Agent Run和 Turn作为不同层级建模；
- 把公共 `agent_end.willRetry`与 Extension `agent_end`分开；
- 保存被 Retry替代但未进入最终 `session.messages`的失败运行证据；
- 保存 Follow-up队列填充/清空事件，并避免把队列清空误判为 Prompt完成；
- 把一个 Agent Run建模为可能包含多个 Turn；
- 把最终单次 `agent_settled`作为 Retry和 Follow-up处理完成后的稳定边界；
- 把 Session创建映射放在宿主 SDK边界；
- 把 `session_shutdown`作为宿主显式事件；
- 为取消、重试耗尽、并行 Tool、Compaction和 Session Replacement建立下一批独立 Fixtures；
- 在这些场景完成后修订 `NormalizedRuntimeEvent`。

当前仍不能直接实现 SQLite Observation Ledger，因为取消、并发、压缩和替换边界尚未冻结。
