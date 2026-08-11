# Pi Follow-up 队列生命周期

状态：**runtime-verified**

关联：Issue #22、PR #23。

## 目的

验证固定 Pi `v0.84.1` 发布 Artifact在首个 Assistant响应尚未结束时排入一条 Follow-up后，公共 `AgentSession`事件、Extension生命周期、队列可见性和最终稳定边界的真实行为。

该 Fixture回答五个 M0问题：

1. Follow-up是在同一个 Agent Run内追加 Turn，还是创建新的 Run；
2. 公共队列何时显示非空、何时清空；
3. Extension是否收到 `queue_update`；
4. `agent_end`和 `agent_settled`各出现几次；
5. `session.prompt()`是否等到 Follow-up处理完、队列清空且 Session idle后才返回。

## 固定场景

```text
Initial prompt
  Produce the first response before processing the queued follow-up.

在第一个 Assistant message_start时调用
  session.followUp("Process the queued follow-up now.")

Faux response 1
  First response complete.

Faux response 2
  Follow-up response complete.

followUpMode
  one-at-a-time
```

运行边界：

- Pi `v0.84.1`；
- `@earendil-works/pi-coding-agent@0.84.1`；
- Node `22.23.1`、npm `10.9.8`；
- 零 Provider Credential；
- 外部 Provider Prompt数为 `0`；
- 没有 Tool、Retry、文件、Shell或外部写副作用。

## 公共 AgentSession事件

真实高层顺序：

```text
agent_start
Turn 1
  user message
  assistant message_start
  queue_update(followUp=[queued message])
  assistant message_end("First response complete.")
  turn_end
Turn 2
  turn_start
  queue_update(followUp=[])
  queued user message
  assistant message_end("Follow-up response complete.")
  turn_end
agent_end(willRetry=false)
agent_settled
```

关键结论：

```text
一个 public agent_start
两个 Turn
一个 public agent_end
一个 public agent_settled
```

因此在该固定场景中，Follow-up没有创建第二个公共 Agent Run，而是在同一个 Run内追加第二个 Turn。Adapter不能把 “Follow-up” 固定建模成 “新 Run”；应以真实 `agent_start` / `agent_end`和 Turn事件决定边界。

## 队列语义

公共 `AgentSession.subscribe()`暴露两个 `queue_update`：

```json
[
  {
    "sequence": 6,
    "steering": [],
    "followUp": ["Process the queued follow-up now."]
  },
  {
    "sequence": 13,
    "steering": [],
    "followUp": []
  }
]
```

顺序为：

```text
assistant message_start
  < queue filled
  < first assistant message_end
  < second turn_start
  < queue cleared
  < queued user message_start
```

队列在 Follow-up用户消息进入事件流之前清空。`queue_update(followUp=[])`表示该消息已经从待处理队列移出，不表示整个 Prompt已经完成；后面仍有 Follow-up Assistant响应、`turn_end`、`agent_end`和 `agent_settled`。

## Extension表面差异

Inline Extension观察到：

```text
input
before_agent_start
agent_start
两个 Turn的 Message生命周期
agent_end
agent_settled
宿主 session_shutdown
```

Extension没有观察到：

```text
queue_update
```

计数：

```text
Public queue_update       2
Extension queue_update    0
```

捕获脚本已在 Inline Extension 中显式注册 `queue_update` Listener；注册成功但运行期间没有收到该事件，因此零计数是 Runtime 负证据，而不是未订阅造成的结果。

因此：

> Follow-up队列状态是公共 Session表面的语义，不能依赖 Extension事件重建。知微 Adapter必须保留事件来源，并从 Public SDK或等价 Session接口读取队列变化。

## 最终消息与 Prompt返回语义

`session.messages`最终完整保留两轮对话：

```text
user(initial)
  → assistant(first response)
  → user(follow-up)
  → assistant(follow-up response)
```

`await session.prompt(...)`返回时：

```text
finalText                         Follow-up response complete.
session.isIdle                    true
pendingMessageCount               0
pendingFollowUps                  []
provider callCount                2
provider pendingResponses         0
```

这证明：

- 初始 `prompt()` Promise覆盖排入的 Follow-up；
- Promise不会在第一条 Assistant响应后提前返回；
- Promise返回时公共 Follow-up队列已排空且 Session已经 idle；
- 最终稳定边界仍是单次 `agent_settled`；
- 宿主 `session_shutdown`继续发生在 settled之后，是独立生命周期边界。

## Fixture与指纹

```text
packages/pi-adapter/fixtures/pi-lifecycle-follow-up-queue.json
```

外层契约指纹：

```text
00c3f7916a129869b768f7e7147a55a8c783b33e5a55e0e79c13eb45a1d692e8
```

内层 Capture指纹：

```text
5b2e266feb27155b7ded59c33aa12e6cd060ce89201dc21a8cd35f49a8748386
```

普通 `npm run check`验证 committed Fixture；相关路径变更、手工请求和 weekly schedule还会重新执行隔离 Capture，并与 committed Fixture完整比较。

## 隔离边界

动态执行复用既有 R3 Runtime Probe边界：

- GitHub Job仅 `contents: read`；
- checkout不持久化凭证；
- 不使用 `pull_request_target`或 `${{ secrets.* }}`；
- 精确 npm Artifact integrity与 shasum；
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

- 事件来源：Public SDK / Extension / RPC；
- Prompt、Agent Run和 Turn是不同层级；
- Follow-up排队与清空状态；
- 队列清空不等于 Prompt完成；
- 一个 Agent Run内可能存在多个 Turn；
- 初始 Prompt与排入 Follow-up共享最终稳定边界；
- 最终单次 `agent_settled`和宿主 shutdown；
- Extension缺少 `queue_update`时不得补造 Session队列事件。

当前仍不冻结正式协议；还需要取消、Retry exhaustion、并行 Tool、Compaction、Session Replacement和 RPC真实 Prompt Fixture。
