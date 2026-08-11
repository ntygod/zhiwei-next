# Pi 自动重试成功生命周期

状态：**runtime-verified**

关联：Issue #20、PR #21。

## 目的

验证固定 Pi `v0.84.1` 发布 Artifact在第一次 Provider结果为可重试错误、第二次恢复成功时，公共 `AgentSession`事件与 Extension生命周期的真实差异。

该 Fixture回答四个 M0问题：

1. 第一次 `agent_end`是否代表整个任务结束；
2. `auto_retry_start` / `auto_retry_end`发生在什么位置；
3. Extension是否收到 Session层的 Retry专有事件与 `willRetry`增强；
4. `session.prompt()`何时返回，最终 Session是否真正稳定。

## 固定场景

```text
retry.enabled     true
maxRetries        3
baseDelayMs       1

Faux response 1   stopReason=error
                  errorMessage=overloaded_error

Faux response 2   Retry recovered.
```

运行边界：

- Pi `v0.84.1`；
- `@earendil-works/pi-coding-agent@0.84.1`；
- Node `22.23.1`；
- 零 Provider Credential；
- `allowModelNetwork=false`；
- 外部 Provider Prompt数为 `0`；
- 没有 Tool、文件、Shell、网络或外部写副作用。

## 公共 AgentSession事件

真实顺序：

```text
agent_start
turn_start
user message_start / message_end
assistant(error) message_start / message_update* / message_end
turn_end(error)
agent_end(willRetry=true)
auto_retry_start(attempt=1, maxAttempts=3, delayMs=1)
agent_start
turn_start
assistant(recovered) message_start / message_update* / message_end
auto_retry_end(attempt=1, success=true)
turn_end(stop)
agent_end(willRetry=false)
agent_settled
```

关键结论：

```text
第一次 agent_end
    < auto_retry_start
    < 恢复 Run
    < auto_retry_end
    < 最终 turn_end
    < agent_end(willRetry=false)
    < agent_settled
```

因此：

> `agent_end`只结束一次底层 Agent Run。只有 `willRetry=false`且随后到达最终单次 `agent_settled`，才形成本次 Prompt的稳定边界。

计数：

```text
Session events        23
auto_retry_start       1
auto_retry_end         1
agent_end               2
agent_settled           1
provider calls          2
external prompts        0
```

## Extension表面

Extension真实收到：

```text
input
before_agent_start
两组 agent_start / turn / message / agent_end
一个 agent_settled
宿主 session_shutdown
```

Extension没有收到：

```text
auto_retry_start
auto_retry_end
agent_end.willRetry
```

两次 Extension `agent_end`都不携带 `willRetry`；脱敏摘要中表现为：

```json
[null, null]
```

这不是数据缺失修复项，而是两个集成表面的真实差异：

- `AgentSession.subscribe()`提供 Session层 Retry语义；
- Extension观察底层 Agent生命周期，但没有 Session自动重试增强；
- 知微 Adapter必须显式标注事件来源，不能把 Extension `agent_end`当作公共 `AgentSessionEvent.agent_end`的完整替代。

## 最终消息与失败证据

重试完成后，`session.messages`角色为：

```text
user → assistant
```

第一次失败 Assistant消息没有保留为最终 Session消息，但它完整存在于运行事件流中：

```text
message_end(stopReason=error, messageError=overloaded_error)
turn_end(stopReason=error)
agent_end(willRetry=true)
```

因此 Observation设计不能只依赖最终 `session.messages`重建所有失败尝试；Runtime事件账本必须保存被重试替代的 Run证据。

## Prompt返回语义

`await session.prompt(...)`返回时：

```text
session.isIdle       true
session.isRetrying   false
finalText            Retry recovered.
```

随后才由宿主显式发出：

```text
session_shutdown(reason=exit)
```

Retry结束、Session稳定、宿主关闭继续是三个不同边界。

## Fixture与指纹

```text
packages/pi-adapter/fixtures/pi-lifecycle-retry-success.json
```

外层契约指纹：

```text
e87f7365eefbb4d7de7a4570a6c99df7a1fdf26f58aa2a40fab9149cb6deff02
```

内层 Capture指纹：

```text
ed1c450ce6e26be60c29aa6d9a29f13d339cb975999e1a3b4c0a43a5f9b4ac85
```

普通 `npm run check`验证 committed Fixture；相关路径变更、手工请求和 weekly schedule还会重新执行隔离 Capture，并与 committed Fixture完整比较。

## 隔离边界

动态执行复用 Normal Tool Fixture的 R3边界：

- GitHub Job仅 `contents: read`；
- checkout不持久化凭证；
- 不使用 `pull_request_target`或 `${{ secrets.* }}`；
- 精确 npm Artifact digest；
- npm install scripts禁用；
- digest-pinned Node容器；
- 只读根文件系统；
- 非 root、`cap-drop=ALL`、`no-new-privileges`；
- 不挂载宿主私有 checkout；
- curated Probe Bundle只读；
- 失败结果上传但 Job保持失败；
- 不保存绝对 Runner路径、原始 Session ID、Credential、环境转储或模型原始思维链。

## 对 M0协议的影响

后续 `NormalizedRuntimeEvent`至少必须表达：

- 事件来源：SDK Public / Extension / RPC；
- 一次 Prompt内的多个 Agent Run；
- `agent_end.willRetry`只来自具备该字段的表面；
- Retry attempt、max attempts、delay、error与最终 success；
- 最终 `agent_settled`和宿主 shutdown；
- 被 Retry替代但仍需审计的失败消息/Run。

当前仍不冻结正式协议；还需要 Follow-up、取消、并行 Tool、Compaction和 Session Replacement Fixture。
