# Pi RPC Worker 生命周期边界

## 状态

Issue #32 / PR #64 在固定 `@earendil-works/pi-coding-agent@0.84.1` 发布 Artifact 上，以真实 `pi --mode rpc` 子进程、严格 LF-only JSONL 客户端和零真实凭证 Faux Provider，冻结了 Worker Prompt、退出、重启、Session恢复和错误边界。

机器事实源：

```text
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture.mjs
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-part-00-bfcc1561e9cc08585e2675ecce0a2ccea0b2a14900a63a242f9884ab3286300f.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle.md
```

## 四类不能互相替代的边界

RPC Adapter和未来 Worker Supervisor必须分别持久化：

1. **Command Response**：带 Request ID，表达命令是否被接受或在预检阶段失败；
2. **Runtime Event**：无 Command ID，表达 Agent、Turn、Message和稳定边界；
3. **Session State / Messages**：命令时点快照，不替代中间事件；
4. **Process Boundary**：stdin EOF、宿主 Signal请求、Extension Shutdown、`exit`和`close`。

`prompt response(success=true)`只表示 Prompt通过预检并被接受。它不能替代 `agent_start`、`agent_end`、`agent_settled`、最终 State/Messages或进程关闭。

## 正常 Prompt 与运行中状态

首个持久化 Prompt的固定顺序：

```text
prompt Response              sequence 11
agent_start                  sequence 13
turn_start                   sequence 14
user message start/end       sequence 15 / 16
assistant message start      sequence 17
running State Response       sequence 19
assistant message end        sequence 22
turn_end                     sequence 23
agent_end                    sequence 24
agent_settled                sequence 25
```

状态变化：

```text
before       isStreaming=false, messageCount=0
accepted     isStreaming=true,  messageCount=1
after settle isStreaming=false, messageCount=2
```

因此 Ledger不能把 Prompt Response写成“任务完成”，也不能只保留最终 `get_state`而丢失接受后仍在运行的中间状态。

## JSONL与协议错误

- framing只按 `LF`切分；JSON字符串中的 `U+2028`和`U+2029`不是记录边界；
- malformed JSON产生一次 `command=parse, success=false` Response；
- unknown command产生一次与原Request ID关联的失败Response；
- 两类错误后同一个Worker仍能执行有效的`get_state`；
- Runtime Event不携带Command Request ID，不能与Response混为一种记录。

未知或非法输入必须作为可审计协议事实保存，但不能让客户端Reader失去后续记录同步。

## EOF、Signal、Exit与Close

### stdin EOF

```text
host stdin end
→ Extension session_shutdown(reason=quit)
→ process exit(code=0, signal=null)
→ process close(code=0, signal=null)
```

Extension shutdown证据在`exit`和`close`被观察前已经持久化。EOF不等于直接杀进程，也不允许忽略stdout尾部；Worker必须以完整LF终止记录关闭。

### idle SIGTERM

```text
host kill(SIGTERM), accepted=true
→ Extension session_shutdown(reason=quit)
→ process exit(code=143, signal=null)
→ process close(code=143, signal=null)
```

发布实现把SIGTERM处理为退出码143而不是Node的`signal=SIGTERM`字段。Adapter必须保存实际观测值，不能按宿主请求反推Process结果。

SIGKILL、OOM、宿主崩溃和Windows信号差异仍未由本Fixture覆盖，不能从上述两条成功关闭路径外推。

## Worker重启与Session恢复

第一个Worker持久化Session后，第二个真实RPC Worker用该Session File启动：

- 初始`get_state`恢复相同的Session ID/File稳定别名；
- 初始`get_messages`恢复`user → assistant`；
- 新Prompt接受后`messageCount=2 → 3`，稳定后为`4`；
- 最终消息为`user → assistant → user → assistant`；
- 第二个Worker的Runtime Event与Process Boundary属于新的Worker实例，但仍关联同一Runtime Session。

未来协议需要同时拥有`workerInstanceId`和`runtimeSessionId`，不能把进程身份与Session身份合并。

## Preflight拒绝与已接受后的Provider Error

### Preflight拒绝

没有可用Model/API Key时：

- Prompt只有一次`success=false` Response；
- 不出现`agent_start`；
- Messages保持空；
- Worker仍可读取State并通过EOF正常关闭。

这是Command级拒绝，没有Agent Run可供标记失败。

### 已接受后的Provider Error

Faux Provider固定返回`stopReason=error`后：

- 原Prompt先返回一次`success=true`接受Response；
- 随后产生Assistant error Message；
- `agent_end(willRetry=false)`后出现`agent_settled`；
- Assistant保留`errorMessage=ZHIWEI_RPC_FIXED_PROVIDER_ERROR`；
- `get_last_assistant_text`为空；
- 不补造第二个相关Prompt Response。

这是执行阶段失败。Command Response、Assistant Message、Agent结尾和最终稳定边界必须共同保留。

## Fixture与重复性

两次成功Workflow attempt的Artifact各只有一个`result.json`，74,588字节且逐字节一致：

```text
artifact JSON sha256         a3bffda1548cd0619b28d89f389edf8ca7a0cb797ffb3f035195d4d03bc65946
outer fingerprint            cea0a302391a2e072a7a1767b0ed0115458e49e228c3ee57607a8e58f8c114ba
capture fingerprint          a30add6e0834c3cdc52ea198997d3ccd7bc3bebfaced456e47891bfafdf17631
```

Committed Fixture使用确定性gzip/base64和Manifest锁定完整对象。CI执行Fresh Checker、Committed Checker以及Fresh/Committed完整对象相等比较；不能只比较选定字段或指纹字符串。

## 隐私与信任边界

- 不向Worker传宿主Secret或真实Provider Credential；
- Provider调用只使用发布包内Faux Provider，外部Provider Prompt数为零；
- 不保存原始Session ID/File、Provider Response ID、PID、Extension nonce、绝对宿主路径、环境转储或模型原始思维链；
- curated source bundle和容器rootfs只读，非root，`cap-drop=ALL`，`no-new-privileges`；
- 合格Fresh Artifact只在Capture和脱敏Checker成功后上传。

## 对后续工作的约束

`NormalizedRuntimeEvent v1`至少要能表达：

- RPC Request / Response与相关ID；
- Agent / Turn / Message Runtime Event；
- State / Messages Snapshot；
- Worker Instance、Runtime Session与Session File别名关系；
- stdin EOF、Signal Request、Extension Shutdown、Exit和Close；
- Preflight拒绝与已接受后的执行失败；
- 来源Surface、观测顺序、稳定性和负证据。

SQLite Observation Ledger不得用最终Messages或进程退出状态覆盖上述原始Observation。
