# Pi 正常单 Tool 生命周期 Runtime Fixture

## 结论

固定的 Pi `v0.84.1` npm Artifact 已在隔离 CI 中完成真实的：

```text
Prompt → Tool Call → Tool Update → Tool Result → Final Answer
```

整个场景使用发布包自带的内存 Faux Provider，不需要 Provider Credential，不向外部模型发送 Prompt，不读取宿主仓库，也不产生文件、网络或 Shell 副作用。

机器 Fixture：

```text
packages/pi-adapter/fixtures/pi-lifecycle-normal-tool.json
```

外层契约指纹：

```text
75b0c9fe4d146df046d9657653673be4e7ed21069cae2319a809dcc2da1313e7
```

内层 Capture 指纹：

```text
77d726e9e571f0c61eb8e79b63dbdd11f22498576889851c3650fecf597974d6
```

## 固定环境

```text
Pi repository   earendil-works/pi
Release Tag     v0.84.1
Tag Commit      53fa77ccd8a279eb87e92294ef3687b03ff80112
Package         @earendil-works/pi-coding-agent@0.84.1
Node            22.23.1
npm             10.9.8
Platform        linux-x64
```

Tarball 重新核对：

```text
integrity
sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==

shasum
e098cada629fdeeb9df6e77c6d480d43e1b2c553
```

## 隔离边界

动态执行位于 digest-pinned Node 容器中：

- 只读根文件系统；
- 非 root UID/GID；
- `cap-drop=ALL`；
- `no-new-privileges`；
- 不挂载宿主私有 checkout；
- 只挂载 curated read-only Probe Bundle；
- 不注入仓库 Secret；
- npm install scripts 禁用；
- 只输出脱敏 JSON；
- 只有 Capture与脱敏 Checker都成功时才上传 Artifact；失败 JSON不作为公开 Evidence保存，Job保持失败并使用日志诊断。

## 场景

Prompt：

```text
Use the echo tool exactly once with value lifecycle-input, then finish.
```

固定 Faux 响应：

1. Assistant 发出：

   ```text
   tool = echo
   toolCallId = zhiwei-tool-call-1
   input = { value: lifecycle-input }
   stopReason = toolUse
   ```

2. Tool 在内存中发出一次 Update，然后返回：

   ```text
   echo result: lifecycle-input
   ```

3. Assistant 输出：

   ```text
   Lifecycle capture complete.
   ```

Faux Provider 运行事实：

```text
callCount = 2
pendingResponses = 0
promptsSentToExternalProvider = 0
```

## AgentSession 公开事件顺序

共 24 个事件：

```text
1   agent_start
2   turn_start
3   message_start     user
4   message_end       user
5   message_start     assistant
6-8 message_update    assistant toolCall stream
9   message_end       assistant stopReason=toolUse
10  tool_execution_start
11  tool_execution_update
12  tool_execution_end isError=false
13  message_start     toolResult
14  message_end       toolResult
15  turn_end          assistant stopReason=toolUse
16  turn_start
17  message_start     assistant
18-20 message_update  assistant text stream
21  message_end       assistant stopReason=stop
22  turn_end          assistant stopReason=stop
23  agent_end         willRetry=false
24  agent_settled
```

### 语义观察

- Tool Result Message 在 `tool_execution_end` 之后进入消息流。
- Tool Use 会结束第一轮 Turn；最终 Answer 位于第二轮 Turn。
- `message_update` 是流式分块，不是领域持久化边界。
- 正常路径只有一个 `agent_end`，且 `willRetry=false`。
- `agent_settled` 是公开 Session 事件的最终稳定边界。
- `session_shutdown` 不属于 `AgentSession.subscribe()` 的事件表面。

## Extension 事件顺序

共 26 个事件：

```text
1   input             source=interactive
2   before_agent_start
3   agent_start
4   turn_start
5   message_start     user
6   message_end       user
7   message_start     assistant
8-10 message_update   assistant toolCall stream
11  message_end       assistant stopReason=toolUse
12  tool_call         echo / zhiwei-tool-call-1
13  tool_result       echo / zhiwei-tool-call-1 / isError=false
14  message_start     toolResult
15  message_end       toolResult
16  turn_end          assistant stopReason=toolUse
17  turn_start
18  message_start     assistant
19-21 message_update  assistant text stream
22  message_end       assistant stopReason=stop
23  turn_end          assistant stopReason=stop
24  agent_end
25  agent_settled
26  session_shutdown  reason=exit
```

## Tool 关联结论

以下所有表面都使用同一个真实 ID：

```text
zhiwei-tool-call-1
```

覆盖：

- `AgentSession.tool_execution_start`；
- `AgentSession.tool_execution_update`；
- `AgentSession.tool_execution_end`；
- Extension `tool_call`；
- Extension `tool_result`；
- 自定义 Tool `execute(toolCallId, ...)`。

因此 `toolCallId` 可以作为 M0 Normal Tool Path 的稳定关联键，不需要知微自行合成。

## `session_start` 的重要负证据

创建 Session 时明确传入了：

```text
sessionStartEvent = {
  type: session_start,
  reason: startup
}
```

但 Inline Extension 捕获到的第一个事件是 `input`，`session_start` 计数为零。

这不是被补齐或隐藏的字段，而是固定发布 Artifact 的真实观察。当前适配结论：

> SDK 嵌入时，知微应在 `createAgentSession()` 成功返回的宿主边界建立 Session 映射；Extension `session_start` 不能作为唯一可靠入口。

后续需要分别验证：

- 恢复已有 Session；
- CLI 加载的 Extension；
- `AgentSessionRuntime` 创建或替换 Session；
- 其他 `sessionStartEvent.reason`。

## `session_shutdown` 的宿主边界

正常 Prompt 完成且 Session idle 后，Capture Harness 显式执行：

```text
session.extensionRunner.emit({
  type: session_shutdown,
  reason: exit
})
```

然后才释放订阅并 `dispose()`。

因此当前结论是：

- `agent_settled` 表示 Agent 工作真正稳定；
- `session_shutdown` 表示宿主决定结束 Session/Worker；
- `dispose()` 负责资源释放；
- 三者不能折叠成一个状态。

验证顺序：

```text
agent_end < agent_settled < session_shutdown
```

## 数据与隐私

Fixture 不包含：

- 绝对 Runner 路径；
- 原始 Pi Session ID；
- Token、Cookie 或 API Key；
- 完整环境变量；
- 用户数据；
- 模型原始思维链。

Fixture 保存的是行动、事件类型、公开关联键、结果摘要和必要的生命周期顺序。

## 本 Fixture 没有证明什么

当前没有验证：

- 自动重试；
- Follow-up 队列；
- 用户取消和 Abort；
- 并行 Tool；
- Tool 失败；
- Compaction；
- Session Replacement；
- RPC 真实 Prompt；
- Worker 崩溃与重启。

这些场景必须形成独立 Fixture，不能由正常单 Tool 路径推断。
