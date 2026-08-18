# Pi RPC Worker 生命周期边界

## 状态

Issue #32 / PR #64 在固定 `@earendil-works/pi-coding-agent@0.84.1` 发布 Artifact 上，以真实 `pi --mode rpc` 子进程、严格字节 LF-only JSONL 客户端和零真实凭证 Faux Provider 冻结 Worker Prompt、协议错误、退出、重启、Session 恢复和执行失败边界。

当前机器事实源：

```text
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest-v2.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provider-error-replacement.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalizer.mjs
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture.mjs
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provenance.mjs
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle.md
```

历史 `rpc-worker-lifecycle-manifest.json`、base loader、legacy Checker blob和内容寻址Part只保留 schema v1来源连续性，不再表示当前协议。

## 五类不能互相替代的边界

RPC Adapter和未来 Worker Supervisor必须分别持久化：

1. **Command Response**：带Request ID，表达命令接受或Preflight拒绝；
2. **Runtime Event**：表达Agent、Turn、Message、Tool和稳定边界；
3. **State / Messages Snapshot**：命令时点快照，不替代中间事件；
4. **Host Action**：发送Command、stdin EOF和Signal Request；
5. **Process Boundary**：spawn、Extension Shutdown、exit和close。

`prompt response(success=true)`只表示Prompt通过预检并被接受，不能替代`agent_start`、`agent_end`、`agent_settled`、最终State/Messages或进程关闭。

## 两个序列域

当前v2合同冻结：

```text
workerTranscript       worker-output-and-process-boundaries
clientActions          host-local-actions
crossDomainTotalOrder  false
```

`workerTranscript`只保存Worker JSONL输出和Process Boundary；Host send、stdin end和signal保存在独立连续的`clientActions`。跨进程调度不存在可证明的全序，因此Adapter不能把两个序列号拼成单一因果链。

可以保存显式相关键，例如Command Request ID、Session alias和Worker instance，但不能把Host“先调用”机械等同为Worker“先观察”。

## 正常 Prompt 与稳定状态

首个持久化Prompt的稳定边界为：

```text
Prompt success Response
→ agent_start
→ turn_start
→ user Message
→ assistant streaming Message
→ turn_end
→ agent_end(willRetry=false)
→ agent_settled
```

状态变化：

```text
before       isStreaming=false, messageCount=0
accepted     isStreaming=true,  messageCount=1
after settle isStreaming=false, messageCount=2
```

Ledger不能把Prompt Response写成任务完成，也不能只保留最终`get_state`而丢失接受后仍在运行的Observation。

## 严格 JSONL 与协议错误

stdout使用 **strict byte reader**：未解析数据保持为`Buffer`，只按字节`0x0a`切分，每条记录使用fatal UTF-8解码并验证字节往返。Reader拒绝空LF record、CRLF、非法UTF-8和非LF终止尾片；JSON字符串中的`U+2028` / `U+2029`不是记录边界。

因此：

- malformed JSON产生一次`command=parse, success=false` Response；
- unknown command产生一次与原Request ID关联的失败Response；
- 两类错误后同一个Worker仍能执行有效`get_state`；
- Runtime Event不携带Command Request ID，不能与Response合并为一种记录；
- framing漂移不能被String decoder、空行过滤或CR剥离隐藏。

确定性负向测试覆盖空record、CRLF、跨chunk多字节UTF-8、非法UTF-8和未终止record。

## EOF、Signal、Exit与Close

### stdin EOF

```text
Host stdin end
→ Extension session_shutdown(reason=quit)
→ process exit(code=0, signal=null)
→ process close(code=0, signal=null)
```

Extension shutdown证据在exit和close前已经持久化。EOF不等于直接杀进程，Worker必须以完整LF终止记录关闭。

### idle SIGTERM

```text
Host signal(SIGTERM), accepted=true
→ Extension session_shutdown(reason=quit)
→ process exit(code=143, signal=null)
→ process close(code=143, signal=null)
```

发布实现把SIGTERM处理为退出码143，而不是Node的`signal=SIGTERM`字段。Adapter保存实际观测值，不能按Host请求反推Process结果。

SIGKILL、OOM、Host崩溃和Windows信号差异未由当前Fixture覆盖。

## Worker重启与Session恢复

第一个Worker持久化Session后，第二个真实Worker用该Session File启动：

- `get_state`恢复相同Session ID/File稳定别名；
- `get_messages`恢复`user → assistant`；
- 新Prompt使`messageCount=2 → 3 → 4`；
- 最终消息为`user → assistant → user → assistant`；
- 新Worker的Event与Process Boundary属于新Worker Instance，但仍关联同一Runtime Session。

未来协议必须同时表达`workerInstanceId`和`runtimeSessionId`，不能合并进程身份与Session身份。

## Preflight拒绝与已接受后的 Provider Error

### Preflight拒绝

没有可用Model/API Key时：

- Prompt只有一次`success=false` Response；
- 不出现`agent_start`；
- Messages保持空；
- Worker仍可读取State并通过EOF正常关闭。

这是Command级拒绝，没有Agent Run可标记失败。

### 已接受后的Provider Error

Faux Provider固定返回`stopReason=error`：

```text
Prompt success Response
→ agent_start
→ Assistant message_end(stopReason=error)
→ agent_end(willRetry=false)
→ agent_settled
```

Assistant保留`errorMessage=ZHIWEI_RPC_FIXED_PROVIDER_ERROR`，`get_last_assistant_text`为空，且不会补造第二个相关Prompt Response。

接受后立即请求的`get_state`可能观察两种**complete State object**：

```text
running   完整final State，仅 isStreaming=true、messageCount=1
settled   与完整final State完全相等
```

Capture要求实际Response、`stateDuring`和ordering summary互相一致。Running变体必须位于Prompt acceptance之后且Worker-output `agent_settled`之前；Settled变体允许在`agent_settled`前后送达，但完整内容必须与最终稳定State一致。Provider、model/API、Session ID/File、thinking、compacting、steering/follow-up mode、auto-compaction和pending count都在排除竞态Snapshot之前被精确验证。

只有通过完整对象和顺序验证后，normalizer才删除竞态Response及其Worker sequence；Host请求仍保留在`clientActions`。Provider/Session/pending count漂移以及`agent_settled`后的running State都有负向mutation测试，不能归一化成committed Fixture。

## v2 Artifact、Fixture与 live provenance

PR #66 Draft中的两次受控recapture attempt均完成Worker capture、Fresh validation、committed Fixture validation和Artifact upload；正式完整对象相等后，recapture-only guard让compare步骤显式失败，因此Workflow/Job整体保持failure。两个不可变Artifact各有一个72,731字节`result.json`且逐字节一致：

```text
source run attempt           2
source artifact              9308041130
source artifact digest       sha256:9f7c3c1d0083d4f2c13467ba23f61301992e1b32a2b7f170f38aed6b2786c005
comparison run attempt       1
comparison artifact          9308008867
comparison artifact digest   sha256:3ffa43228261c2de228dba070e9855203cff5dfce2c1925e22732ea1980edddc
artifact JSON sha256         87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa
canonical JSON bytes         36265
canonical JSON sha256        1b2fd8aabbc3d76f0c9538db9f4c9cdd47a717ee9610d3cd564bb9d36531638a
outer fingerprint            b4715e2b896258fddec81e2f25f4c28056d24a8562547f46d6305127ebe0053c
capture fingerprint          511441fd6e09e7138cd23f92b7076e1c2c3978785303c1d6ff392f27f4e69ab0
```

v2 loader先验证历史Base，再验证可读Provider Error replacement的哈希、精确键、负向mutation和完整对象重建。CI执行Fresh Checker、Committed Checker和Fresh/Committed完整对象相等比较，不能只比较选定字段或指纹字符串。

Ready PR的 **Worker v2 live provenance** 额外验证：current PR/HEAD、source HEAD ancestry、Workflow identity、attempt、Worker Job及每个capture/validate/upload步骤、Artifact ID/name/GitHub digest、ZIP digest、唯一`result.json`、字节/哈希，以及两个Artifact归一化后的完整对象与committed v2完全相等。该检查与旧SDK/RPC provenance在同一Ready gate中，且等待当前Fresh Worker Job成功。

## Capture源码信任边界

- curated仓库bundle以只读挂载进入容器；
- immutable base源码以Git blob SHA固定；
- hardened launcher只在tmpfs创建精确、fail-closed副本；
- 复制源码设为`0400`，目录设为`0500`后才执行；
- 子进程关闭后再次验证源码SHA未变化；
- 只在清理时恢复目录权限并递归删除；
- 可写Artifact输出目录不作为可执行源码目录；
- 容器rootfs只读、非root、`cap-drop=ALL`、`no-new-privileges`。

## 隐私边界

Fixture不保存原始Session ID/File、Provider Response ID、PID、Extension nonce、凭证、Host环境转储、绝对Host路径或模型原始思维链。Provider调用只使用发布包内Faux Provider，外部Provider Prompt数为零；只有Capture与脱敏Checker同时成功的Fresh Artifact才上传。

## 对后续工作的约束

`NormalizedRuntimeEvent v1`至少要表达：

- RPC Request / Response和相关ID；
- Agent / Turn / Message Runtime Event；
- State / Messages Snapshot；
- Worker Instance、Runtime Session与Session File别名关系；
- Host Action、Extension Shutdown、Exit和Close；
- Preflight拒绝与已接受后的执行失败；
- `sourceSurface`、序列域、稳定边界和负证据。

SQLite Observation Ledger不得用最终Messages或Process结果覆盖上述原始Observation。
