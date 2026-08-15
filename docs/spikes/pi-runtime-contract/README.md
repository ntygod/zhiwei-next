# Pi Runtime 契约 Spike

关联 Issue：#5、#7、#16、#20、#22、#24、#26、#28、#45、#32；后续依赖：#49 → #56。

## 当前状态

固定基线：

```text
Repository  earendil-works/pi
Release     v0.84.1
Commit      53fa77ccd8a279eb87e92294ef3687b03ff80112
Package     @earendil-works/pi-coding-agent
Version     0.84.1
Node        22.23.1
npm         10.9.8
```

证据演化：

```text
PR #6   source-verified / runtime-unverified
PR #8   source-and-runtime-verified
PR #17  source-and-runtime-verified-normal-tool
PR #21  source-and-runtime-verified-retry-success
PR #23  source-and-runtime-verified-follow-up-queue
PR #25  source-and-runtime-verified-cancel-retry-exhaustion
PR #27  source-and-runtime-verified-parallel-tool-ordering
阶段 8  source-and-runtime-verified-compaction-session-replacement
PR #60  source-and-runtime-verified-sdk-rpc-parity
PR #64  source-and-runtime-verified-rpc-worker-lifecycle（候选交付，尚未合并）
当前    SDK/RPC来源已重绑到PR #64的成功Capture；等待新HEAD门禁与独立R3复审
```

历史标签只说明当时的证据强度，不代表当前能力回退。PR #64合并前，Issue #32的Runtime事实已由真实Artifact、重复Capture、committed Fixture、负向mutation和Ready live provenance合同固定，但用户结果仍处于候选交付状态。

## 机器事实源

### 发布 Artifact 与 SDK / Extension

```text
packages/pi-adapter/fixtures/pi-upstream-baseline.json
packages/pi-adapter/fixtures/sdk-event-surface.json
packages/pi-adapter/fixtures/rpc-contract.jsonl
packages/pi-adapter/fixtures/pi-artifact-runtime.json
packages/pi-adapter/fixtures/pi-lifecycle-normal-tool.json
packages/pi-adapter/fixtures/pi-lifecycle-retry-success.json
packages/pi-adapter/fixtures/pi-lifecycle-follow-up-queue.json
packages/pi-adapter/fixtures/pi-lifecycle-cancel-retry-exhaustion.json
packages/pi-adapter/fixtures/pi-lifecycle-parallel-tool-ordering.json
packages/pi-adapter/fixtures/pi-lifecycle-compaction-session-replacement.json
```

### SDK / RPC 同任务

```text
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-00-443405699ddd4616c78c6aff8be6c368917cbcb1295fedb862eec98e41e82225.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-01-1c6d75c4a7e2ed1958aa729037fc7c4e9d785c3739d28d92a11cf3bf20db3a64.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-02-b1212b1afa8989ef3a8da5e528b70fd160f5ed8382ad3171874f920390e7081f.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-03-b6da21595679dc47deed3bb2330294d164387f502c5ce75d515bd658114e6060.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-04-e8a50d04ce2b2252e6c2fba4db603f7977ed2855826e4bb008ef33a20a37a12e.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-05-30bc6c8157c81bbfc5da609f13431fffac9d445a082ea4e0af46c30d13b1d9e5.b64
scripts/pi-sdk-rpc-parity-fixture.mjs
scripts/check-pi-sdk-rpc-parity-result.mjs
scripts/check-pi-sdk-rpc-client-messages-result.mjs
scripts/check-pi-sdk-rpc-parity-provenance.mjs
```

### RPC Worker schema v2 当前合同

```text
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest-v2.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provider-error-replacement.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalizer.mjs
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-jsonl-reader.mjs
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture.mjs
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provenance.mjs
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle.md
scripts/probes/pi-sdk-rpc-parity-faux-extension.mjs
```

### RPC Worker schema v1 历史来源

```text
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest.json
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-base-fixture.mjs
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-part-00-bfcc1561e9cc08585e2675ecce0a2ccea0b2a14900a63a242f9884ab3286300f.b64
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-legacy-checker.mjs
packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-legacy-checker-base.mjs
```

schema v1保留不可变来源和旧合同连续性，但不再表示当前Host/Worker序列模型。Fresh Capture必须先通过脱敏Checker，再与schema v2 committed Fixture做完整对象比较；Source-derived Fixture不能替代发布Artifact动态行为证据，指纹也不能替代完整对象相等。

## 已验证场景索引

| 场景 | 关键结论 | 详细事实源 |
|---|---|---|
| 正常单 Tool | `user → assistant → toolResult → assistant`；`agent_end < agent_settled < shutdown` | [`normal-tool-lifecycle.md`](normal-tool-lifecycle.md) |
| Retry恢复 | Public `willRetry=[true,false]`；被替代失败Message仍来自事件流 | [`retry-success-lifecycle.md`](retry-success-lifecycle.md) |
| Follow-up | 一个Agent Run包含两个Turn；Queue清空不等于Prompt完成 | [`follow-up-queue-lifecycle.md`](follow-up-queue-lifecycle.md) |
| Cancel / abortRetry / exhaustion | 部分Assistant保留；`willRetry=true`不保证后续Run；Promise返回不等于成功 | [`cancel-retry-exhaustion-lifecycle.md`](cancel-retry-exhaustion-lifecycle.md) |
| 并行 Tool | 声明`alpha→beta→gamma`，完成`beta→gamma→alpha`，消息恢复声明顺序 | [`parallel-tool-ordering-lifecycle.md`](parallel-tool-ordering-lifecycle.md) |
| Compaction / Replacement | Summary是派生Context；Session File、Object和Listener Rebind分离 | [`compaction-session-replacement-lifecycle.md`](compaction-session-replacement-lifecycle.md) |
| SDK / RPC同任务 | 核心语义投影一致，但Command、Event、Snapshot、Shutdown与Process来源保留 | [`sdk-rpc-parity-lifecycle.md`](sdk-rpc-parity-lifecycle.md) |
| RPC Worker生命周期 | 严格字节LF framing、Prompt接受/完成、EOF、SIGTERM、Restart/Resume、竞态State和错误边界分离 | [`../../architecture/pi-rpc-worker-lifecycle.md`](../../architecture/pi-rpc-worker-lifecycle.md) |

## SDK / RPC 同任务成功路径

发布Artifact根导出`runRpcMode`和`RpcClient`。当前冻结的是公开Client的必需方法子集，不是全部运行时可枚举方法：

```text
abort, collectEvents, getAvailableModels, getLastAssistantText,
getMessages, getState, getStderr, prompt, setModel,
setThinkingLevel, start, stop, waitForIdle
```

SDK Public与RPC Runtime的核心投影均为：

```text
agent_start → turn_start → user message → assistant message
→ turn_end → agent_end(willRetry=false) → agent_settled
```

最终均为`user → assistant`，Assistant SHA-256：

```text
5604485dabc1a8b5d71db37611b23b7ddcc761238cd3621a309934d0fdf9c1f9
```

### Prompt接受不是完成

```text
prompt success Response       index 4
agent_start                   index 5
running get_state Response   index 11
agent_settled                index 35
Runtime Events after Response 29
```

状态是`isStreaming=false → true → false`、`messageCount=0 → 1 → 2`。RPC Prompt Response与公开`RpcClient.prompt()`返回都只表达接受。

### 两类关闭面

```text
raw JSONL:
  host stdin EOF
  → extension shutdown(quit)
  → exit(0)
  → close(0)

published RpcClient.stop():
  host stop()
  → observed kill(SIGTERM), accepted=true
  → extension shutdown(quit), evidence durable
  → exit(code=143, signal=null)
  → close(code=143, signal=null)
```

发布源码仍包含等待超时后的`SIGKILL` fallback；固定成功Capture只证明该次路径未触发fallback。stdin EOF、Host`stop()`、实际Signal请求、Extension Shutdown、Exit和Close不能合并。

### 当前 verified Fixture

Manifest的SDK / RPC parity `source`继续只允许`candidate`与`verified`两态。当前状态必须保持`verified`，Ready live provenance继续绑定真实Workflow、PR、HEAD ancestry、Artifact ZIP和唯一`result.json`内容。

以下数字是当前 `verified` Manifest记录的内容身份与来源状态：

```text
parts                        6
compressedBytes              9861
compressedSha256             44d95e16d8078413c1afe94dd3c7a19bbcdbfad06d82a51a491d0ce8e4b3fbbb
jsonBytes                    122178
jsonSha256                   a3f47e34c2bd78b16793c7aeacfdf4020c788e475dda252779603bc9e470034d
outer contract fingerprint   c99bcfb2872736e085750690965dd11dce1bc873b14b905b53a1e57defa3dcbf
capture contract fingerprint 70ce5607549b2d8342d7abba1312b2231c1a069a038dd39a9dbf23dd65ccb9c7
source state                 verified
capture head                 32287c7d33482ca58bd65b46438f3cc8552a3df3
capture workflow             31781721009
capture artifact             9211959728
capture artifact digest      sha256:01c7a87fe73ac05c5ea295ddddd51809b294a502072c61e97819d77589565cc7
external Provider prompts    0
```

该来源Run属于PR #64，Artifact内唯一`result.json`与committed Fixture逐字节相同；来源HEAD将在本次重绑提交后成为当前HEAD的严格祖先。Ready live provenance仍必须在新exact HEAD上实际运行并成功。

## RPC Worker schema v2 当前合同

Issue #32使用真实`pi --mode rpc`子进程冻结Command Response、Runtime Event、State / Messages、Host Action和Process Boundary。

### 严格字节 LF Reader

- stdout保持为Buffer，按字节`0x0a`分割；
- 每条record使用fatal UTF-8与字节往返验证；
- 空LF record、CRLF、非法UTF-8和非LF终止尾片均失败；
- 多字节字符可跨任意stream chunk；
- JSON字符串内`U+2028` / `U+2029`不会被拆成record；
- malformed JSON和unknown command后同一个Worker仍可执行`get_state`。

### Host与Worker序列分离

当前合同只声明各域内顺序：

```text
workerTranscript       worker-output-and-process-boundaries
clientActions          host-local-actions
crossDomainTotalOrder  false
```

当前文档不再列出schema v1 mixed transcript的`sequence 11/13/19/25`作为运行时全序。Prompt Response、Agent Event和State Response在`workerTranscript`内保持真实顺序；Host send/EOF/signal在`clientActions`内保持顺序。两个域之间只通过显式Request ID、Session alias和Worker identity关联。

稳定Prompt链为：

```text
Prompt success Response
→ agent_start
→ turn_start
→ user/assistant Message
→ turn_end
→ agent_end(willRetry=false)
→ agent_settled
```

State仍为`false/0 → true/1 → false/2`，Prompt Response只表示接受。

### EOF、Restart与Signal

```text
stdin EOF
→ extension session_shutdown(quit)
→ exit(0)
→ close(0)
```

第二个真实Worker恢复相同Session ID/File稳定别名和先前`user → assistant`消息，再追加一轮得到`user → assistant → user → assistant`。

```text
Host signal(SIGTERM), accepted=true
→ extension session_shutdown(quit)
→ exit(143, signal=null)
→ close(143, signal=null)
```

Worker Instance与Runtime Session分别关联；Host Signal Request不能替代真实Process结果。

### Preflight与Provider Error完整State验证

- 无可用Model/API Key：一次`prompt success=false`，无`agent_start`，Worker仍可查询并关闭；
- 已接受Provider Error：一次`prompt success=true`，随后Assistant error Message、`agent_end(willRetry=false)`和`agent_settled`；
- 不补造第二个相关Prompt Response。

竞态`get_state`必须是两个完整对象之一：running对象与final State除`isStreaming=true/messageCount=1`外完全相同，且Response位于Prompt acceptance之后、`agent_settled`之前；settled对象与final State完整相等，可在`agent_settled`前后送达。Provider、Model/API、Session identity、pending count、thinking、compacting和queue mode漂移都会失败。只有完整验证后才排除竞态Response，Host request仍留在`clientActions`。

### 当前v2身份与公开来源

```text
source head                  19f3e93a2bdf4f6b66e4abef00509e9549b22f6b
source workflow              31701880114
source run attempt           2
source artifact              9181642601
source artifact digest       sha256:d7d81bc279c7533777c130fb2b294460fa8a8fff5a2326bf6b2a4f0efd373b09
comparison run attempt       1
comparison artifact          9181575920
comparison artifact digest   sha256:b7c415e360338f562d3384d22f4c786d845bb78dddaf7b8b10447def94f4b73f
artifact result bytes        74587
artifact result sha256       8c9ee4fd4a1428e4977d2b81af2f1b10ac203f7086c418dc48b1bf31cc347d62
canonical JSON bytes         36265
canonical JSON sha256        1b2fd8aabbc3d76f0c9538db9f4c9cdd47a717ee9610d3cd564bb9d36531638a
outer contract fingerprint   b4715e2b896258fddec81e2f25f4c28056d24a8562547f46d6305127ebe0053c
capture contract fingerprint 511441fd6e09e7138cd23f92b7076e1c2c3978785303c1d6ff392f27f4e69ab0
external Provider prompts    0
```

两个历史attempt的capture、Fresh validation、base validation和upload步骤成功，但旧 **historical compare step failed**，所以Workflow/Worker Job整体为failure。当前v2在新HEAD执行完整normalizer、负向mutation、Fresh/committed完整对象相等；Ready `rpc-worker-lifecycle-provenance.mjs`再实时验证attempt、Worker Job步骤、Artifact ID/name/digest、ZIP、唯一`result.json`和source HEAD ancestry。

## RPC Worker schema v1 历史来源

以下身份只属于拆域前的历史Base，不能用于推导当前跨域顺序：

```text
base manifest                rpc-worker-lifecycle-manifest.json
source capture head          c0d782ce074e770d39876600feef3554d0471756
source workflow              31677138404
source artifact              9172023070
comparison artifact          9171976965
artifact result bytes        74588
artifact result sha256       a3bffda1548cd0619b28d89f389edf8ca7a0cb797ffb3f035195d4d03bc65946
base outer fingerprint       cea0a302391a2e072a7a1767b0ed0115458e49e228c3ee57607a8e58f8c114ba
base capture fingerprint     a30add6e0834c3cdc52ea198997d3ccd7bc3bebfaced456e47891bfafdf17631
```

历史Base仍经过legacy Checker校验，但不再向Issue #49暴露mixed-domain sequence为当前合同。

## 既有 Fixture 连续性锚点

以下短语与指纹由历史committed Checker机械读取，记录的是已经验证的事实，不是新的重复合同。

### Source baseline

```text
source-verified
runtime-unverified
toolCallId
agent_settled
LF-only
```

### Retry success

`source-and-runtime-verified-retry-success`对应`pi-lifecycle-retry-success.json`与`retry-success-lifecycle.md`。Public证据包含`agent_end.willRetry`；Extension auto_retry_start / end缺失仍是负证据。

```text
outer fingerprint   e87f7365eefbb4d7de7a4570a6c99df7a1fdf26f58aa2a40fab9149cb6deff02
capture fingerprint ed1c450ce6e26be60c29aa6d9a29f13d339cb975999e1a3b4c0a43a5f9b4ac85
```

### Follow-up queue

`source-and-runtime-verified-follow-up-queue`对应`pi-lifecycle-follow-up-queue.json`与`follow-up-queue-lifecycle.md`。一个公共 Agent Run内追加第二个 Turn；队列清空不等于 Prompt结束；Extension不接收 `queue_update`；`session.prompt()`覆盖排入的 Follow-up。

```text
outer fingerprint   00c3f7916a129869b768f7e7147a55a8c783b33e5a55e0e79c13eb45a1d692e8
capture fingerprint 5b2e266feb27155b7ded59c33aa12e6cd060ce89201dc21a8cd35f49a8748386
```

### Cancel / retry exhaustion

`source-and-runtime-verified-cancel-retry-exhaustion`对应`pi-lifecycle-cancel-retry-exhaustion.json`与`cancel-retry-exhaustion-lifecycle.md`。部分 Assistant必须保留；存在willRetry=true 但没有后续 Run；Retry exhaustion最终保留最终一次失败的 Assistant。

```text
outer fingerprint   b866798d18569c78d5c712254c3ecdecd7a3e02c0ef11458e6b97b0863b1f6e0
capture fingerprint b544631413935d2b3f55f9f9f8bcf15a06944bba682cf48471902e4726f79609
```

### Parallel Tool ordering

`source-and-runtime-verified-parallel-tool-ordering`对应`pi-lifecycle-parallel-tool-ordering.json`与`parallel-tool-ordering-lifecycle.md`。完成顺序与消息顺序分离。

```text
outer fingerprint   fd372a8e73f4545bd7a34c6ac3e82cfc2d044dca473ae374627b847864389b02
capture fingerprint 164f0e95e7f617c7aa69d1a1b34a5ae7935673c1ee852fa452541d15c1551376
```

### Compaction / Session Replacement

`source-and-runtime-verified-compaction-session-replacement`对应`pi-lifecycle-compaction-session-replacement.json`与`compaction-session-replacement-lifecycle.md`。Public `entry_appended`没有出现；旧 Public Listener不会自动迁移。

```text
outer fingerprint   9ebe87b12f0670214fa1244239d21d7a517b2332da2f3f85b3372b8b6895ab75
capture fingerprint f4e3d675207416c961585ee645c5fc43c395320ed7a736da71bae741577b1fee
```

## 隔离与验证

所有动态Probe固定Artifact identity，禁用install scripts，使用只读curated bundle/rootfs、非root、`cap-drop=ALL`、`no-new-privileges`，不传仓库Secret、真实Provider Credential、用户数据或完整Host环境。结果不保存原始Session ID/File、PID、Provider Response ID、Extension nonce、绝对路径、原始stderr或模型思维链。

```bash
npm run check
npm run check:pi-sdk-rpc-parity
npm run check:pi-rpc-worker-lifecycle
npm run probe:pi:sdk-rpc-parity
npm run probe:pi:rpc-worker-lifecycle
```

只有Capture和脱敏Checker成功后才上传Artifact。SDK / RPC parity使用版本化Packer与live provenance；RPC Worker v2同时使用严格Reader、完整State normalizer、完整对象比较、Artifact live provenance和路径门禁。

## 边界与下一步

本轮不覆盖RPC Tool、Steering、Follow-up、Compaction / Replacement命令、网络RPC、多人并发客户端、SIGKILL、OOM、Host崩溃或Windows信号差异。这些行为不能从当前Fixture外推。

Issue #32合并后，M0依赖顺序为：

1. Issue #49：定义并验证`NormalizedRuntimeEvent v1`；
2. Issue #56：实现append-only SQLite Observation Ledger；
3. 后续Daemon / Worker Supervisor：消费已冻结协议实现真实健康状态、崩溃检测和重连。
