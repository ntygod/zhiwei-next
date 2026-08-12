# Pi 并行 Tool 完成顺序与消息顺序

状态：**runtime-verified**

关联：Issue #26、PR #27。

## 目的

验证固定 Pi `v0.84.1` 发布 Artifact 在同一条 Assistant 消息声明多个并行 Tool Call 时，以下顺序是否相同：

- Assistant 中的 Tool Call 声明顺序；
- Tool `execute()` 开始与完成顺序；
- Public SDK `tool_execution_start/update/end` 顺序；
- Extension `tool_call/tool_result` 顺序；
- Tool Result `message_start/end` 顺序；
- `turn_end.toolResults` 与最终 `session.messages` 顺序。

该 Fixture 特意把真实完成顺序设计成与声明顺序不同，用于证明 Adapter 不能从某一个事件表面推断全部并发语义。

## 固定场景

Faux Assistant 在一个 `toolUse` 消息中依次声明：

```text
alpha → beta → gamma
```

每个调用都使用同一个无外部副作用的内存 Tool：

```text
ordered_echo
```

固定关联键：

```text
alpha  zhiwei-parallel-tool-alpha
beta   zhiwei-parallel-tool-beta
gamma  zhiwei-parallel-tool-gamma
```

三个 `execute()` 必须全部开始后，内存 Barrier 才开始释放；释放由真实 Public `tool_execution_end` 驱动，固定完成顺序为：

```text
beta → gamma → alpha
```

`5000ms` 只作为死锁失败保护，不参与成功路径排序。场景不读取文件、不执行 Shell、不访问网络，也不产生外部写副作用。

## 真实顺序矩阵

| 观察表面 | 实际顺序 |
|---|---|
| Assistant Tool Call declaration | `alpha → beta → gamma` |
| Tool `execute()` start | `alpha → beta → gamma` |
| Public `tool_execution_start` | `alpha → beta → gamma` |
| Public `tool_execution_update` | `alpha → beta → gamma` |
| Extension `tool_call` | `alpha → beta → gamma` |
| Tool `execute()` end | `beta → gamma → alpha` |
| Public `tool_execution_end` | `beta → gamma → alpha` |
| Extension `tool_result` | `beta → gamma → alpha` |
| Public Tool Result messages | `alpha → beta → gamma` |
| Extension Tool Result messages | `alpha → beta → gamma` |
| Public `turn_end.toolResults` | `alpha → beta → gamma` |
| Extension `turn_end.toolResults` | `alpha → beta → gamma` |
| 最终 `session.messages` Tool Result | `alpha → beta → gamma` |

核心结论：

> 并行 Tool 的真实完成顺序与 Tool Result 消息顺序分离。完成事件按实际完成先后到达，但 Pi 在三个调用全部结束后，按原始 Assistant 声明顺序生成 Tool Result 消息、`turn_end.toolResults` 和最终 Session 消息。

因此 `tool_execution_end` / Extension `tool_result` 只能表达完成顺序，不能被当成 Assistant 声明顺序或持久化消息顺序。

## 完整高层生命周期

公共 Session：

```text
agent_start
Turn 1
  user message
  assistant message(toolUse: alpha, beta, gamma)
  tool_execution_start(alpha)
  tool_execution_start(beta)
  tool_execution_start(gamma)
  tool_execution_update(alpha)
  tool_execution_update(beta)
  tool_execution_update(gamma)
  tool_execution_end(beta)
  tool_execution_end(gamma)
  tool_execution_end(alpha)
  toolResult message(alpha)
  toolResult message(beta)
  toolResult message(gamma)
  turn_end(toolResults=alpha,beta,gamma)
Turn 2
  assistant final response
  turn_end(stop)
agent_end(willRetry=false)
agent_settled
```

Inline Extension：

```text
input
before_agent_start
agent_start
Turn 1 messages
  tool_call(alpha)
  tool_call(beta)
  tool_call(gamma)
  tool_result(beta)
  tool_result(gamma)
  tool_result(alpha)
  toolResult message(alpha)
  toolResult message(beta)
  toolResult message(gamma)
  turn_end(toolResults=alpha,beta,gamma)
Turn 2 final response
agent_end
agent_settled
host-owned session_shutdown(reason=exit)
```

## 计数与稳定边界

```text
Public events                 40
Extension events              40
Public Tool start/update/end  3 / 3 / 3
Extension tool_call/result    3 / 3
Public turns                  2
Public agent_start/end        1 / 1
Public agent_settled          1
Extension session_shutdown    1
Provider calls                2
External Provider prompts     0
```

三个 `execute()` 都在第一个完成事件前开始，证明成功路径确实进入并行执行，而不是依次执行。最终 `session.prompt()` 返回时 Session 已 idle、Pending Message 为零；`agent_end < agent_settled < session_shutdown` 继续成立。

## Tool Call 关联约束

所有表面都保留同一组真实 `toolCallId`：

```text
zhiwei-parallel-tool-alpha
zhiwei-parallel-tool-beta
zhiwei-parallel-tool-gamma
```

但同一组 ID 在不同表面具有不同顺序。因此知微必须：

- 用 `toolCallId` 关联声明、执行、完成、Extension 事件和消息；
- 分别保存 `declarationOrder`、`completionOrder` 与 `messageOrder`；
- 不根据数组位置或事件先后自行编造关联键；
- 不用最终 `session.messages` 重建真实完成顺序；
- 不用 `tool_execution_end` 顺序重建 Assistant 原始声明顺序。

## Fixture 与指纹

```text
packages/pi-adapter/fixtures/pi-lifecycle-parallel-tool-ordering.json
```

Fixture 文件 SHA-256：

```text
0e490594e62886c707274359edd47675b00eba582408fe5fc68ac557f5c1bed2
```

外层契约指纹：

```text
fd372a8e73f4545bd7a34c6ac3e82cfc2d044dca473ae374627b847864389b02
```

内层 Capture 指纹：

```text
164f0e95e7f617c7aa69d1a1b34a5ae7935673c1ee852fa452541d15c1551376
```

普通 `npm run check` 验证 committed Fixture、精确事件类型、计数、顺序矩阵、消息状态、文档事实源与双层指纹。独立 Runtime Workflow 会重新执行隔离 Capture，并要求 fresh 结果与 committed Fixture 完整对象一致。

## 隔离边界

动态执行沿用 R3 Runtime Probe 边界：

- Workflow 权限仅 `contents: read`；
- checkout 不持久化凭证；
- 不使用 `pull_request_target` 或仓库 Secrets；
- 精确 npm Artifact integrity 与 shasum；
- npm install scripts 禁用；
- digest-pinned Node 容器；
- 只读根文件系统、非 root、`cap-drop=ALL`、`no-new-privileges`；
- 不挂载宿主私有 checkout，只挂载只读 curated Probe Bundle；
- 失败结果仍上传，但 Job 保持失败；
- 不保存绝对 Runner 路径、原始 Session ID、凭证、环境转储或模型原始思维链。

## 对 Observation Ledger 的直接约束

后续 `NormalizedRuntimeEvent` 和 Ledger 至少需要表达：

- Tool Batch 与 Assistant 声明顺序；
- 每个 Tool 的真实开始、更新和完成顺序；
- Public SDK 与 Extension 的事件来源；
- Tool Result 消息与 `turn_end.toolResults` 的规范顺序；
- 同一 `toolCallId` 在不同表面中的关联；
- 完成顺序与消息顺序是不同事实，不能相互覆盖；
- 所有 Tool 完成后才进入 Tool Result 消息阶段；
- 最终稳定边界仍是单次 `agent_settled`，宿主 shutdown 独立记录。

当前仍不冻结正式协议；下一步继续验证 Compaction 与 Session Replacement，然后比较 SDK 与 RPC 的真实任务边界。
