# Pi Compaction 与 Session Replacement 生命周期

状态：**runtime-verified**

关联：Issue #28、Draft PR #29。

## 目的

验证固定 Pi `v0.84.1` 发布 Artifact 在两个高风险状态转换中的真实行为：

1. Manual Compaction 如何同时影响当前模型上下文、Session Entry 树和 Public / Extension 事件；
2. `AgentSessionRuntime` 从原 Session 新建 Session、再恢复原 Session 时，旧对象失效、Extension 生命周期、Public Listener 与 Rebind 的真实顺序。

这两个边界直接决定 Observation Ledger 是否能够在压缩或替换后继续回放历史，而不把派生摘要误当作原始证据，也不把不同 Session 的事件静默写入同一条不可区分的流。

## 固定运行边界

```text
Pi Release Tag                 v0.84.1
Package                        @earendil-works/pi-coding-agent@0.84.1
Node                           22.23.1
npm                            10.9.8
Provider Credential            0
External Provider Prompt       0
File / Shell / Network effect  none
```

所有 Session Object、Session File 和 Entry ID 在进入 Fixture 前转换为稳定 Alias：

```text
session-object-N
session-file-N
compaction-entry-N
```

原始 Session ID、绝对 JSONL 路径和动态 Entry ID 均未持久化。

# 一、Manual Compaction

## 固定场景

在内存 Faux Provider 中完成两个 Seed Turn：

```text
user       Remember the first fixed compaction fact.
assistant  First compaction response recorded.
user       Remember the second fixed compaction fact.
assistant  Second compaction response recorded.
```

Compaction 设置：

```text
keepRecentTokens = 1
reason           = manual
```

Inline Extension 在 `session_before_compact` 中返回确定性结果：

```text
Verified extension summary.
- First fixed compaction fact was recorded.
- Second fixed compaction fact remains the recent turn.
```

为证明 Extension Summary 阻止了模型摘要调用，Faux Provider 预留第三个响应。真实结果：

```text
callsBeforeCompact    2
callsAfterCompact     2
pendingBeforeCompact  1
pendingAfterCompact   1
```

因此 Manual Compaction 没有发生第三次 Provider 调用。

## Public 与 Extension 事件

Public `AgentSession.subscribe()` 的完整 Compaction 事件类型为：

```text
compaction_start → compaction_end
```

计数：

```text
Public compaction_start = 1
Public compaction_end   = 1
Public entry_appended   = 0
```

捕获脚本已显式订阅 `entry_appended`，但该固定 `session.compact()` 路径没有发出 Public `entry_appended`。Compaction Entry 的存在必须从 Session Manager / Entry 树确认，不能依赖 Public `entry_appended`。

Extension 顺序：

```text
session_before_compact(reason=manual, willRetry=false)
  → session_compact(reason=manual, fromExtension=true)
  → host-owned session_shutdown(reason=exit)
```

`session_before_compact` 可见压缩前的六个 Branch Entry，并指明：

```text
firstKeptEntry = compaction-entry-6
signalAborted  = false
```

## 当前模型上下文与 Session Entry 树分离

Compaction 前：

```text
session.messages roles
user → assistant → user → assistant

Session entries
model_change → thinking_level_change → message × 4
```

Compaction 后：

```text
session.messages roles
compactionSummary → assistant

Session entries
model_change → thinking_level_change → message × 4 → compaction
```

关键事实：

- `session.messages` 被重建为 `compactionSummary → assistant`，只代表下一次模型调用的当前上下文；
- 原始四条消息 Entry 仍完整保留在 Session Entry 树；
- 新增 `compaction-entry-7` 指向 `compaction-entry-6`，保存 Summary、Usage、`tokensBefore=505` 和 Extension Details；
- `firstKeptEntry=compaction-entry-6` 在该固定场景中对应最后一条 Assistant，而不是最近一整轮 User/Assistant；
- `session.compact()` 返回时 `isIdle=true`、`isCompacting=false`；
- Compaction 前后 `getSessionStats().totalMessages` 都是 `4`，统计历史没有被当前上下文数组长度替代；
- Compaction Usage 被计入 Session Stats，Cost 从 `0` 变为 `0.23`。

因此：

> `session.messages`、Session Entry 树和 Observation Ledger 是三个不同层级。压缩后的模型上下文不能覆盖原始 Observation，Compaction Summary 必须标记为派生数据。

# 二、Session Replacement

## 固定流程

```text
Original Session
  → original Prompt
  → runtime.newSession()
New Session
  → new Prompt
  → runtime.switchSession(originalFile)
Resumed Original Session
  → resumed Prompt
  → runtime.dispose()
```

稳定身份变化：

```text
Session Object
session-object-1 → session-object-2 → session-object-3

Session File
session-file-1 → session-file-2 → session-file-1
```

恢复原 Session File 时仍创建新的 `AgentSession` 对象：`session-object-3`。因此 Session File Identity 与内存 Session Object Identity 不能合并。

## New Session 生命周期

真实顺序：

```text
extension session_before_switch(reason=new)
  → extension session_shutdown(reason=new, target=session-file-2)
  → before-session-invalidate(session-object-1, session-file-1)
  → rebind-session:start(session-object-2, session-file-2)
  → extension session_start(reason=new, previous=session-file-1)
  → rebind-session:extensions-bound
  → public-listener:attach(session-object-2)
  → rebind-session:end
  → with-session:new
```

`withSession()` 发生在 Extension 绑定和 Public Listener Rebind 完成之后。

新 Session 在首个 Prompt 前：

```text
messages = []
isIdle   = true
```

它使用独立 `session-file-2`，不会继承 Original Session 的消息。

## Resume 生命周期

真实顺序：

```text
extension session_before_switch(reason=resume, target=session-file-1)
  → extension session_shutdown(reason=resume, target=session-file-1)
  → before-session-invalidate(session-object-2, session-file-2)
  → rebind-session:start(session-object-3, session-file-1)
  → extension session_start(reason=resume, previous=session-file-2)
  → rebind-session:extensions-bound
  → public-listener:attach(session-object-3)
  → rebind-session:end
  → with-session:resume
```

Resume Prompt 前，`session-file-1` 中原始消息被恢复：

```text
user(original) → assistant(original)
```

Resume Prompt 后：

```text
user(original)
  → assistant(original)
  → user(resumed)
  → assistant(resumed)
```

New Session 的独立消息不进入恢复后的 Original Session。

## 旧 Public Listener 不迁移

在 Original Session 上注册的 Legacy Public Listener 计数：

```text
原 Prompt 后     7
New Prompt 后    7
Resume Prompt 后 7
```

Legacy Listener 只收到 `session-object-1` 的事件，没有收到 `session-object-2` 或 `session-object-3` 的事件：

```text
legacySubscriptionMigrated       false
publicSubscriptionRequiresRebind true
```

显式 Rebind Listener 分别绑定三次，累计收到三轮 Agent 生命周期，共 `21` 个事件。

因此：

> `AgentSessionRuntime` 替换 Session 后，旧 `session.subscribe()` 不会自动迁移。Adapter 必须在 `setRebindSession()` 中重新绑定 Public Listener，并把新 Session Object 与 Session File Alias 写入显式 Replacement 事件。

## Extension Generation 与最终 Dispose

Extension Generation：

```text
generation 1  startup / original
generation 2  new
generation 3  resume
```

Extension 生命周期总计：

```text
session_start         3
session_before_switch 2
session_shutdown      3
input                 3
agent_end             3
agent_settled         3
```

最终 `runtime.dispose()` 边界：

```text
extension session_shutdown(reason=quit, generation=3)
  → before-session-invalidate(session-object-3, session-file-1)
  → AgentSessionRuntime.dispose completes
```

`runtime.dispose()`、Extension Shutdown、Public `agent_settled` 和 Session Replacement 是不同边界，不能压缩成单一 `closed` 状态。

# 三、对 Observation Ledger 的约束

后续正式协议至少需要分别表达：

- 原始 Observation 与派生 Compaction Summary；
- Compaction 前 Branch Entry、`firstKeptEntry`、Summary、Usage 和新 Compaction Entry；
- 当前模型上下文与完整 Session Entry 树；
- Public Compaction 事件与 Extension Compaction 事件的来源差异；
- Public `entry_appended` 未出现的负证据；
- Session Object Identity、Session File Identity 与 Replacement Generation；
- `session_before_switch`、旧 Shutdown、Invalidate、Rebind、`withSession()` 与新 `session_start`；
- Legacy Listener 未迁移和显式 Public Listener Rebind；
- New Session 空上下文、Resume 原上下文与后续新 Turn；
- 最终 Runtime Dispose 和宿主 Shutdown 边界。

当前仍不冻结正式 `NormalizedRuntimeEvent`；下一步还需要 RPC 真实 Prompt、Worker 退出、重启和错误边界。

# 四、Fixture 与指纹

```text
packages/pi-adapter/fixtures/pi-lifecycle-compaction-session-replacement.json
```

Fixture 文件 SHA-256：

```text
b5d4f92399531ad7eedfebfe2b6f7fa80fe0dfdface6b0a886bd4cbef29d3b03
```

外层契约指纹：

```text
9ebe87b12f0670214fa1244239d21d7a517b2332da2f3f85b3372b8b6895ab75
```

内层 Capture 指纹：

```text
f4e3d675207416c961585ee645c5fc43c395320ed7a736da71bae741577b1fee
```

普通 `npm run check` 验证 committed Fixture；独立 Runtime Workflow 还会重新运行发布 Artifact，并与 committed Fixture 完整对象比较。

# 五、隔离边界

- Workflow 仅 `contents: read`；
- checkout 不持久化凭证；
- 不使用 `pull_request_target` 或 `${ secrets.* }`；
- 固定 npm Artifact integrity 与 shasum；
- npm install scripts 禁用；
- digest-pinned Node 容器；
- 只读根文件系统；
- 非 root、`cap-drop=ALL`、`no-new-privileges`；
- 不挂载宿主私有 checkout；
- curated Probe Bundle 只读；
- Session JSONL 仅存在于容器临时目录，不输出原始路径或 ID；
- 失败 Artifact 仍上传，但 Job 保持失败；
- 不保存 Credential、环境转储、用户数据或模型原始思维链。
