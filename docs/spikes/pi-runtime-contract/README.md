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
PR #64  source-and-runtime-verified-rpc-worker-lifecycle（已合并）
PR #66  NormalizedRuntimeEvent v1 与来源绑定（已合并）
历史    PR #71 更新已失效 Artifact 的公开来源身份；Runtime 内容身份不变
历史    PR #69 重新绑定其 PR 来源；Runtime 内容身份不变
历史    PR #75 重新绑定其 PR 来源；Runtime 内容身份不变
历史    PR #77 重新绑定其 PR 来源；Runtime 内容身份不变
历史    PR #79 重新绑定其 PR 来源；Runtime 内容身份不变
历史    PR #81 重新绑定其 PR 来源；Runtime 内容身份不变
历史    PR #83 重新绑定其 PR 来源；Runtime 内容身份不变
历史    PR #85 重新绑定其 PR 来源；Runtime 内容身份不变
历史    PR #87 重新绑定其 PR 来源；Runtime 内容身份不变
历史    PR #91 整合本 PR 已有采集来源；Runtime 内容身份不变
历史    PR #93 重新绑定其 PR 来源；Runtime 内容身份不变
历史    PR #95 重新绑定其 PR 来源；Runtime 内容身份不变
历史    PR #97 重新绑定其 PR 来源；Runtime 内容身份不变
历史    PR #101 重新绑定其 PR 来源；Runtime 内容身份不变
历史    PR #103 重新绑定其 PR 来源；Runtime 内容身份不变
历史    PR #105 重新绑定其 PR 来源；Runtime 内容身份不变
历史    PR #107 重新绑定其 PR 来源；Runtime 内容身份不变
历史    PR #109 重新绑定其 PR 来源；Runtime 内容身份不变
当前    PR #111 SDK 与 Worker 双 attempt 来源已续期；最终 Ready/live 门待完成
```

历史标签只说明当时的证据强度，不代表当前能力回退。PR #64、#66 已经合并，Issue #32 的 Runtime 事实和正式协议继续保留。PR #71 在 2026-10-08 的 Ready gate 发现历史 Artifact 返回 404 后，重新采集并绑定当前 PR 的来源；不改写 Runtime 内容身份，不改变任何来源校验条件。

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
capture head                 7f83f60ea274e8da5da4d0fcfeb8eaa4ce67fbf8
capture workflow             38040347283
capture artifact             11665431880
capture artifact digest      sha256:ed0436b8d7b1cb662a518c7153ac6c93eed6c7028d60c1decfc3a026f58f6c59
external Provider prompts    0
```

该 SDK 来源 Run 属于 PR #111，Artifact 内唯一 `result.json` 与 committed Fixture 逐字节相同。Worker 当前 PR 双 attempt 来源已按原 failure-shape 合同单独续期，没有把同轮正常成功 Worker 作为该来源。最终候选须核验两来源 ancestry，Ready live provenance 仍必须在新的 exact HEAD 上实际运行并成功。

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
source head                  0112810f62390a633d2690f30d4e3127b983d7a1
source workflow              38040583324
source run attempt           2
source artifact              11665910381
source artifact digest       sha256:0a8195e245136051c0c0126b39d93e045dd8f6e6ea669e2d029af41aafe221e3
comparison run attempt       1
comparison artifact          11665945278
comparison artifact digest   sha256:6cbee45a0b9f5def930d27d0789a808212a02e8ee5c62eedc87a7b3bb1d04ad8
artifact result bytes        72731
artifact result sha256       87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa
canonical JSON bytes         36265
canonical JSON sha256        1b2fd8aabbc3d76f0c9538db9f4c9cdd47a717ee9610d3cd564bb9d36531638a
outer contract fingerprint   b4715e2b896258fddec81e2f25f4c28056d24a8562547f46d6305127ebe0053c
capture contract fingerprint 511441fd6e09e7138cd23f92b7076e1c2c3978785303c1d6ff392f27f4e69ab0
external Provider prompts    0
```

PR #111 Draft中的两个受控recapture attempts均完成capture、Fresh validation、base validation和upload；在完整Fresh/committed对象相等后，受控compare步骤显式失败，因此Workflow/Worker Job保持可审计的failure形态。当前v2在新HEAD执行正式完整normalizer、负向mutation与Fresh/committed完整对象相等；Ready `rpc-worker-lifecycle-provenance.mjs`再实时验证attempt、Worker Job步骤、Artifact ID/name/digest、ZIP、唯一`result.json`和source HEAD ancestry。

PR #71 历史续期记录：2026-10-08 的有效比较使用 run `37748698280` 的 attempts **2/3**。整轮重跑后 attempt 1 的 Artifact 已不可访问；仅重跑 RPC Worker job 后，attempts 2/3 的 Artifact 同时可读，下载的 `result.json` 逐字节一致。后续重复采集需先保存上一份证据，再验证单作业重跑后的两份公开 Artifact 都可读取，不能只保留日志中的 Artifact ID。当前 Workflow 的 Artifact 保留期为 14 天；到期后重新取证，不将本次 ID 当作永久在线证据。

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

## 2026-10-08 PR #69 来源关联更新

PR69 Ready run37761748200明确拒绝继承PR71的RPC来源归属；普通Capture成功不能替代该来源门。SDK复用PR69已成功run37760933918 / artifact11542107196，122178字节JSON与committed逐字节一致，不重新打包。

RPC来源run37763595121在b3a1245b52f1d4f68343760db16da590ddf14c8f上作两次真实采集（attempt1/2）。原两次checker和完整对象相等先真实成功，随后显式PR69 recapture-only guard人为制造CLI失败，供冻结历史failure形态的来源合同取证；不能把它称为Runtime故障或正常compare不相等。单Worker job重跑后，两份Artifact11542914249/11543925497都重新下载成功。ZIP digest分别为998ad033dc225311a9dd7322e5d2d8da20fd685304570ea327c4cf8324e9a060和f52aeec7cf255430519aba96539449caad514bf488b177cd180d4a0673ce87a0；两份result.json均72731字节、SHA256 87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa，字节及完整parsed对象与committed v2一致。

最终CLI恢复原blob fba36da923a94cd2b9ba024f020089e3ef313d90；Workflow、provenance validator、normalizer、fixture内容、旧版本固定blob与所有接受谓词未改。现有公开reader使用经固定blob验证的wrapper移除旧版文档集成断言，这一已合入行为本轮未改变；不以直接调用过时base reader失败代替当前正式校验。两个来源attempt日志保留成功相等后受控失败的明确顺序。最终HEAD必须另获独立R3、fresh Ready live provenance及受保护合入回读；14天Artifact到期仍按既有流程重新取证。

## 2026-10-08 PR #75 当前来源续期

G-1a 的 project-state.md 更新命中既有 SDK/RPC probe paths；Ready run37770391567 / live job113288707409明确拒绝继承PR69的RPC来源，因为冻结合同要求当前PR关联。PR75保持Draft/no/required，SDK取本PR成功run37770080525 attempt1 / artifact11547735102（source HEAD83df4e09d05e9cd656fa5a33f8e04b7bc2a0cf99），原ZIP10441字节、result.json122178字节与committed逐字节及完整对象相同，未重新打包。

RPC run37771441848在72e67b2452f023e27e86310799a9651af88132dd上真实执行attempts1/2。两个日志均先完成两次checker与完整Fresh/committed对象相等，再由明确PR75 recapture-only guard制造CLI失败；这不是Runtime故障或正常比较不相等。单Worker job重跑后，Artifact11548036907/11547462798再次下载可读。ZIP摘要分别b8d8fdb55dcf2a8d64dc59f6c8dc7e750ddaa80e608c21acad5aa369b6ec0519、fb3b239819da047dee4298aefe08bcaeb2daf5fb062e986b3b2fddf6bede3add；两份result.json均72731字节，SHA256 87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa，逐字节相同且与完整committed v2对象深相等。source attempt2、comparison attempt1。

最终恢复CLI原blob fba36da923a94cd2b9ba024f020089e3ef313d90；Workflow、validator、normalizer、内容指纹和接受谓词无净变更。已有固定base reader/wrapper关系不变。83df的文档R2审查不覆盖新来源HEAD，最终全树须新独立R3与fresh Ready CI。Artifact仍受14天保留期限制。仅文档状态更新也要求每PR重采两attempt的维护成本已记录为后续评估项，本次不调整触发范围或质量门。

## 2026-10-08 PR #77 当前来源续期

G-1b更新project-state.md命中既有SDK/RPC路径；现行冻结合同要求来源关联当前PR，因此不把PR75来源移作PR77身份。本轮在Draft/no/required内取本PR成功SDK run37776588065 attempt1 / artifact11549719639（source HEAD1c0795929677729f035973a2c806c0840cdb67f1）。独立重新下载原ZIP10441字节，摘要ad5673d798f4dab395c4d449737961b8c88100a07dc156c1bd1c1bc0a005aa9c；唯一result.json122178字节与committed逐字节及完整对象相同，未repack。

Worker run37777086083在9d1a9477a6e75ab37e1c240af7e937189265468a上执行attempts1/2，job113310720517/113311718373。两份原始日志均先完成两checker和完整Fresh/committed对象相等，再由明确PR77 recapture-only guard制造CLI失败，不是Runtime故障或正常compare不相等。仅重跑Worker job后，两Artifact11550421552/11550710794仍重新下载可读；ZIP摘要51983f7ad8fbd26ce479ad99d7f3caa5fac4be5baa048c22c2f39a5df3f2b381 / 2db63423bd12a588919b5ece4cdecc41e7faec7e754ec2d3c43c73cc5266c035。两个唯一result.json均72731字节、SHA256 87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa，字节及完整对象相同。source attempt2、comparison attempt1。

CLI已恢复原blob fba36da923a94cd2b9ba024f020089e3ef313d90，正常完整compare重新通过。Workflow、validator、normalizer、固定base/wrapper、内容指纹与接受谓词无净变更；此前PR69/75历史来源记录保留。本次最终全树需新的独立R3与真实ReadyCI。Artifact保留14天及每PR来源续期成本仍按既有规则记录，不在本任务修改门禁。

## 2026-10-08 PR #79 当前来源续期

G-1c实质实验与project-state更新依既有当前PR来源合同重新取证，不挪用PR77身份。SDK取本PR成功run37783782584 attempt1 / artifact11553431732（source146ba51e0dd97f046174d2f3e4207a05c24421f5）。独立下载原ZIP10441字节，摘要e2b700711fef82518d83c965f5334f98ae702df8c46126d45e7f267392379068；唯一result.json122178字节与committed字节/完整对象一致，不repack。

Worker run37784271382在ed58bad330d36b37bb2bdc3a3ae045d321f49244执行attempts1/2（job113335080460/113336242643）。两原日志均先完成两checker和完整Fresh/committed对象相等，再由明确PR79 recapture-only guard制造CLI失败，不是Runtime故障或正常compare不相等。单Worker job重跑后，两Artifact11553287747/11553691472仍重新下载可读，ZIP摘要10ba0c4e0a888c36335ad9ca0fd3b3f28833fd11c0bb75210261357ae9c55b73 / 5c50686a8610d0b5da6ab72e28c5d457c88448b8e76aa40dfc01b02a44dbd609。每份唯一result.json72731字节，SHA256 87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa，bytes及完整对象相同。source attempt2、comparison attempt1。

最终CLI恢复原blob fba36da923a94cd2b9ba024f020089e3ef313d90并重跑正常compare；Workflow、validator、normalizer、fixed-base wrapper、内容指纹和接受谓词无净变化。旧PR69/75/77历史保留，Artifact仍受14天保留期限制。本PR最终全树必须新独立R3与真实Ready live gate，不能复用任何旧HEAD审查或将合成D01/D02实证当生产验收。

## 2026-10-08 PR #81 历史来源续期

有限决议/执行状态层的实质变更依既有当前PR合同重新取证，不挪PR79身份。SDK成功run37792517432 attempt1 / artifact11556798358，source7bbbd44e87c440591421cec10fa24e9d4a57f600。独立下载原ZIP10441字节，摘要d07b2d569e140b0d4298a7ec736f82fb6625cb7b6cb7c1e60f1ea4640eaf2ceb；唯一result.json122178字节，bytes和完整对象等于committed，未repack。

Worker run37792817119在e8d8e2d3925abbc16639cdcc017890dbf987fd05执行attempts1/2（job113364677194/113365958228）。两原日志先完成两checker及完整Fresh/committed对象相等，再由明确PR81 recapture-only guard制造CLI失败；非Runtime故障或正常compare不相等。单Worker重跑后，两Artifact11556629386/11557940857重新下载可读；ZIP摘要5f248c1ca4497668f1b3d57c063d337b8efb28ee7ce1d984dc1ef811ccb46558 / 01b72c4f4968160f3173bd9c8d7094d19b2babc9e1c66d204562f5ec770d1da0。每份唯一result.json72731字节、SHA256 87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa，字节和完整对象一致。source attempt2、comparison attempt1。

最终CLI恢复原blob fba36da923a94cd2b9ba024f020089e3ef313d90，正常完整compare通过。Workflow、validator、normalizer、fixed-base wrapper、内容指纹和接受谓词无净变化；旧PR来源历史保留，Artifact保留期仍14天。正式有限决策接受必须有本PR真实逐项范围/HEAD审查记录，状态提交后的新完整HEAD另需R3和fresh Ready live gate；Runtime来源核验不替代决策接受。

## 2026-10-08 PR #83 历史来源续期

以下两段保留 PR #83 当时的取证记录；其中“上方来源表”指当时版本。原 SDK source 为 `2d70ea8fe05277b9cad241b4238ed88d9744fbe1` / run `37822256937` / artifact `11569408126` / digest `sha256:bca83082df22cddba1157bbfcaded5761fe6d71bd579c166f1c40d2e514f5eea`。原 Worker source 为 `f6f738f9eccd00e40468aa7c3cee48f567bba65a` / run `37831202304`，attempt 2 artifact `11572794687` / digest `sha256:6ca1f21586cbfdc47b5bb0dbc1e79b0c9229a486d9fd580c4111efc81b4e24b8`，comparison attempt 1 artifact `11573452055` / digest `sha256:1ec0fd3ddc2071ca7f5b48d7eaa78b19c84bceb7d8159963d3dfca30bf368ed6`；这些历史身份不授权 PR #85。

G-3a按既有当前PR来源合同续期；上方SDK来源表绑定本PR成功run37822256937 attempt1，原ZIP10441字节，唯一result.json122178字节与committed逐字节及完整对象一致。Worker run37831202304的attempts1/2（job113496694677/113497342554）各留下5923字节原ZIP；两份唯一result.json均72731字节，字节和完整对象与committed v2一致，来源ID与摘要见上方当前v2表。单Worker job重跑完成后，两份Artifact各独立下载两次且字节相同，未repack。

两次Worker原日志均先通过两个Checker及完整对象相等，再由明确PR83 recapture-only guard制造CLI失败；这不是Runtime故障或正常比较不相等。CLI在bdb1880fb69ded2694d5ad2b2b01023b74327aa1已恢复原blob fba36da923a94cd2b9ba024f020089e3ef313d90，正常完整compare重新通过；本次来源续期不改变Fixture内容、normalizer或接受谓词。最终完整HEAD仍须独立R3、fresh Ready CI及实际live provenance成功，不能把Draft采证或旧PR审查当成交付。

## 2026-10-08 PR #85 当前来源续期

G-2a 按现行当前 PR 来源合同取证。SDK 复用本 PR 已成功的 run `37839141100` attempt 1 / job `113523846540`，source `676494c0afe1729c7fb0f2381e1928b4baa8b477`；未重跑旧 Capture。原 Artifact `11577131301` ZIP 为 10441 bytes，摘要与上方 manifest 来源表一致；唯一 `result.json` 为 122178 bytes，与 committed Fixture 逐字节及完整 parsed object 相等，两严格 Checker 均通过。

Worker run `37839372054` 在 `626ab3ca3ed7df0c2a068f2368ca56b3701aa5c2` 真实执行 attempts 1/2（job `113524540867` / `113539775146`）。attempt 1 原 ZIP 在单 Worker job 重跑前保存；attempt 2 完成后，两 Artifact `11577365916` / `11577764963` 再次分别 live 下载成功，各为 5923 bytes，且与各自首次下载逐字节相同。ZIP SHA-256 分别为 `3307b1b8cc14a22ce5469661f8f1c92255b8a3ebd1043aa69047694a5a5a9201` / `5d276a490ea551292ce420ea0b9d8e6bf31190a7ee466b0dad4a8220b2a204d2`；两份唯一 `result.json` 均为 72731 bytes，SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`，字节与完整对象相等，并与 committed v2 完整对象相等。未重新打包，source attempt 2、comparison attempt 1。

两份原日志均先通过 compare 内两个 Checker 及完整对象相等，再由明确三行 PR85 recapture-only guard 产生受控 CLI failure；这不是 Runtime 故障或正常 compare 不相等。CLI 在 `2b70d98c71534519bda1c373206075691f2bb8bf` 恢复原 blob `fba36da923a94cd2b9ba024f020089e3ef313d90`，正常完整 compare 重新通过。live ancestry 证明恢复 HEAD 严格继承 SDK source 与 Worker source；最终发布 HEAD 仍须重新核验 ancestry。

本次只更新来源 metadata 与对应文档；Workflow、validator、normalizer、固定 base/wrapper、内容指纹和接受谓词无净变更。SDK/Worker 原 ZIP、原 run/job/artifact JSON 与日志保留；本地未绕过不支持的 Workflow metadata API，workflow name/path/active identity 留给真实 Ready live gate 核验。Draft 采证不等于 Ready 通过，最终完整 HEAD 仍须独立 R3、fresh Ready CI 及实际 live provenance 成功。PR #83 及更早来源作为历史保留；Artifact 仍受 14 天保留期限制，Runtime 取证不接受 ADR 0012 或改变 G-1 决议。

## 2026-10-08 PR #87 当前来源续期

G-3b 按现行当前 PR 来源合同取证。SDK 使用本 PR 成功 run `37859177527` attempt 1 / job `113590571349`，source `98f105e3ee5b005ed3aa0d84ab59dc182b587897`。原 Artifact `11585880248` ZIP 为 10441 bytes，SHA-256 `365376628508aac21a4a4bd4cda4c3d76ade93e1a1ef29d337b6425ea46d9b47`；唯一 `result.json` 为 122178 bytes，与 committed Fixture 逐字节及完整 parsed object 相等，两严格 Checker 均通过。

Worker run `37859356255` 在 `ea73a598ee91f1e13ad665bad569903bef69e057` 真实执行 attempts 1/2（job `113591132734` / `113591750737`）。attempt 1 原 ZIP 在单 Worker job 重跑前保存；attempt 2 完成后，两 Artifact `11585391707` / `11585875694` 分别再次 live 下载，各为 5923 bytes，且与各自首次下载逐字节相同。ZIP SHA-256 分别为 `49df5d6d3350aa36e7099a8a0742bf0003b472729854a7333f7837dacf7b8788` / `481e3b60dc9c91be98e15bd755f52231578015c4b884dc348aedf7ba68243eb4`；两份唯一 `result.json` 均为 72731 bytes，SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`，字节及完整对象相等，并与 committed v2 完整对象相等。原 ZIP 未重新打包；source attempt 2、comparison attempt 1。

两份原日志均先通过 compare 内两个 Checker 及完整对象相等，再由明确三行 PR87 recapture-only guard 产生受控 CLI failure；这不是 Runtime 故障或正常 compare 不相等。CLI 在 `ac9616a2153a83a48489567e613b468b908066d9` 精确恢复原 blob `fba36da923a94cd2b9ba024f020089e3ef313d90`。live ancestry 证明恢复 HEAD 严格继承 SDK source 与 Worker source；恢复后的正常完整 compare 已通过，最终发布 HEAD 仍须重新核验 ancestry。

此来源补丁只更新 metadata 和对应文档；Workflow、来源 validator、normalizer、固定 base/wrapper、冻结内容、指纹与来源接受谓词无净变更。PR #87 的新 CLI 产品合同由独立实现和真实 Artifact probe 验证，不借来源续期修改上述 frozen corpus。SDK/Worker 原 ZIP、原 run/job/artifact JSON 和日志保留；本地不伪造不支持的 Workflow metadata API，workflow name/path/active identity 留给真实 Ready live gate 核验。Draft 采证不等于 Ready 通过，最终完整 HEAD 仍须独立 R3、fresh Ready CI 与实际 live provenance 成功。PR #85 及更早各节（含当时的“当前”措辞）保留为历史，其来源身份不授权 PR #87；Artifact 仍受 14 天保留期限制。本次来源补丁不改变 Phase A、D-07 及 ADR 的既有接受证据。

## 2026-10-09 PR #89 当前来源续期

G-4 按现行当前 PR 来源合同取证。SDK 使用本 PR 成功 run `37863369941` attempt 1 / job `113604174496`，source `982d9ab720078ac13ce9b087a1a602a9c3147157`。原 Artifact `11587361169` ZIP 为 10441 bytes，SHA-256 `b34bab9ce03cd3e183e8dada8223448dd4e38366ca6472db765139290b8e72c6`；唯一 `result.json` 为 122178 bytes，与 committed Fixture 逐字节及完整 parsed object 相等，两严格 Checker 均通过。

Worker run `37864444828` 在 `dc976dcbbcf0d986ba5ab32e47c6261b8a80b018` 真实执行 attempts 1/2（job `113607709864` / `113608526230`）。attempt 1 原 ZIP 在单 Worker job 重跑前保存；attempt 2 完成后，两 Artifact `11586958280` / `11588030196` 分别再次 live 下载，各为 5923 bytes，且与各自首次下载逐字节相同。ZIP SHA-256 分别为 `8f914a0348dc3c91f21ae9203125a2ed4f5bd951d3538e0e986a31387bc0103f` / `e7eb279d1bec6101934cbcad56b6d37ee18d39a5730851d4b4438caa7e91edf9`；两份唯一 `result.json` 均为 72731 bytes，SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`，字节及完整对象相等，并与 committed v2 完整对象相等。原 ZIP 未重新打包；source attempt 2、comparison attempt 1。

两份原日志均先通过 compare 内两个 Checker 及完整对象相等，再由明确三行 PR89 recapture-only guard 产生受控 CLI failure；这不是 Runtime 故障或正常 compare 不相等。CLI 在 `d18f8b6cdac6d8ec9788123036e9a400e21fa71b` 精确恢复原 blob `fba36da923a94cd2b9ba024f020089e3ef313d90`。live ancestry 证明恢复 HEAD 严格继承 SDK source 与 Worker source；恢复后的正常完整 compare 已通过，最终发布 HEAD 仍须重新核验 ancestry。

此来源补丁只更新 metadata 和对应文档；Workflow、来源 validator、normalizer、固定 base/wrapper、冻结内容、指纹与来源接受谓词无净变更。G-4 运行器的合成 Ledger 组件场景不改变上述 Runtime frozen corpus，也不表示完整 M0 产品链已运行。SDK/Worker 原 ZIP、原 run/job/artifact JSON 和日志保留；本地不伪造不支持的 Workflow metadata API，workflow name/path/active identity 留给真实 Ready live gate 核验。Draft 采证不等于 Ready 通过，最终完整 HEAD 仍须独立 R3、fresh Ready CI 与实际 live provenance 成功。PR #87 及更早各节（含当时的“当前”措辞）保留为历史，其来源身份不授权 PR #89；Artifact 仍受 14 天保留期限制。本次来源补丁不改变 Phase A、D-07 及 ADR 的既有接受证据。

## 2026-10-09 PR #91 当前来源整合

本地接手后核对并复用本 PR 已经存在、仍可访问的 Runtime 采集；没有重跑采样或改变任何接受谓词。这些证据只证明冻结 Runtime 合同，不替代接入前安全实验及记录绑定修复的独立验证。

SDK 来源为成功 run `37871492885` attempt 1，HEAD `c3e7387075b7268e1b5d2d2e1638fa51eaa3ae7c`，Artifact `11589908249`。下载原 ZIP 的 SHA-256 为 `f0c661e0eda227e91eb4216637470e00720a36d078728199afe2adeccdfe55d4`；唯一 `result.json` 为 122178 bytes，SHA-256 `a3f47e34c2bd78b16793c7aeacfdf4020c788e475dda252779603bc9e470034d`，与 committed Fixture 逐字节相同。

RPC Worker 来源为 run `37871599191`，HEAD `d04f1b09307bdc8b0bd50c8ae569d65927488250`，comparison attempt 1 / job `113630728958` 与 source attempt 2 / job `113631166416`。两个公开 Artifact `11590168639` / `11589938731` 的原 ZIP SHA-256 分别为 `70221183f833a5d314251412000f0354221099a936d628296820b6150875900e` / `f1bed7d019f85a64380e4e9b3e56be3ab502eb190341228497663fa2f19376eb`。两份唯一 `result.json` 均为 72731 bytes，SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`，字节及完整对象一致，并等于当前 committed v2 完整对象。

使用既有校验函数核验了真实 run attempt、PR 归属、必需 Job 步骤、Artifact 身份/digest/有效期、原 ZIP 及完整内容。两份日志均在完整对象比较成功后才由既有 PR91 recapture-only guard 显式失败；恢复提交 `0d89f786326b51dff36b1f06f8958f2e746565a1` 的 CLI 为原 blob `fba36da923a94cd2b9ba024f020089e3ef313d90`，本地修复未改该文件。两个 capture HEAD 均为当前工作分支祖先；最终 HEAD/Workflow 身份和 Ready live provenance 仍按既有流程实时核验。

本次仅同步来源 metadata 及当前身份说明，所有历史节保持原字节。Artifact 仍受 14 天保留期约束；本地验证不接受 D-04/D-08，不证明远端 Agent 的平台限制已解除，也不放行 G-2 或正式产品数据接入。

## 2026-10-09 PR #93 当前来源续期

#92 的 Proposed 决议登记准备更新 project-state，按现行当前 PR 来源合同续期。SDK 使用本 PR 成功 run `37897885161` attempt 1 / job `113713330318`，source `7e74796a98a8f981c00eb4cdbbdfbd2d870702b9`。原 Artifact `11601046447` ZIP 为 10441 bytes，SHA-256 `9492b4ef5378ec690d336fcec8fac804dd2fd61b14c6e4f30c1bf569e0f67a64`；唯一 `result.json` 为 122178 bytes，SHA-256 `a3f47e34c2bd78b16793c7aeacfdf4020c788e475dda252779603bc9e470034d`，与 committed Fixture 逐字节和完整对象相等，两严格 Checker 均通过。

Worker run `37898228839` 在 `5345a24ee0d8e5bf87c7a63f30413c51fbff19ba` 执行 attempts 1/2（job `113714493060` / `113715082537`）。attempt 1 原 ZIP 先保存，再仅重跑精确 Worker job；attempt 2 完成后两份 Artifact `11601431952` / `11601497190` 再次分别下载，各为 5923 bytes，重复下载与各自原 ZIP 逐字节相同。ZIP SHA-256 分别为 `421951ed01ed5606e14f8f62afc680f528a01de2fe7da00b095dc33faa153127` / `1aa117e5df2d1db0712e7f74c70aebe2f3113f8296291cfd6271aa19c98d71f3`；两份唯一 `result.json` 均为 72731 bytes，SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`，字节及完整对象相等，并与 committed v2 完整对象相等。原 ZIP 未重新打包；source attempt 2、comparison attempt 1。

两份原日志先通过 compare 内两个 Checker 及完整对象相等，再由明确三行 PR93 recapture-only guard 产生受控 CLI failure；这不是 Runtime 故障或正常 compare 不相等。CLI 在 `0131b98263f620189ba5c49deb1e18f22bd5283b` 精确恢复原 blob `fba36da923a94cd2b9ba024f020089e3ef313d90`；恢复路径的正常完整 compare 对两个原 Artifact 均通过。SDK/Worker source 均为恢复 HEAD 的严格祖先；最终发布 HEAD 仍须核实。更早的同 HEAD run `37898139461` 被 metadata 编辑触发的新 run 取消，不用于本来源记录。

本地使用既有函数检查真实 run attempt、当前 PR 归属、Job 步骤、Artifact 身份/digest/有效期和原 ZIP 内容；不伪造 Workflow metadata，真正的 Ready 事件与完整 live provenance 仍由既有门禁核验。此来源补丁只更新真实 metadata 和对应说明，Workflow、来源 validator、normalizer、固定 base/wrapper、frozen content、指纹及来源接受谓词无净变更。此前各节为历史，其批准不批准新 HEAD；Artifact 保留期仍为 14 天。

本流程没有执行 docs 安全合成实验，没有登记 D-04/D-08 实验证据或接受决议，不完成 G-2/G-5/M0-2。最终完整 HEAD 仍须新的独立 R3、正常成功 CI、fresh Ready/live 来源及受保护合入回读，Draft 采证或结构通过不能替代这些事实。

## 2026-10-09 PR #95 当前来源续期

整体设计 #94 更新 project-state/阶段配置，按原当前 PR 来源合同取证。SDK 使用 PR95 成功 run `37908593095` attempt 1，source `4efd0ab7a447f2e05588679df61e918153ff8050`，Artifact `11605682315`，原 ZIP SHA-256 `ef197dd1b65d16e181e5b23edc6e55367d0036690f348ea565766ddc0b50a3c9`；唯一 result.json 122178 bytes，SHA-256 `a3f47e34c2bd78b16793c7aeacfdf4020c788e475dda252779603bc9e470034d`，与 committed 字节及完整对象相同。

Worker run `37908788620` 在 `dd757a58a959ee97b3774a5d7f78af9b3510fa3f` 真实执行 attempts 1/2（job `113748625790` / `113749331665`）。先保存 attempt 1 原 ZIP，再仅重跑精确 Worker job；attempt 2 完成后 attempt 1 再下载仍字节相同。comparison Artifact `11605986703` / ZIP SHA-256 `251d0805c4143113cb7d869e86177cf95bd1ebbd7cebe71e382c71ed38436000`；source Artifact `11605648045` / ZIP SHA-256 `ab9ef8dd9536d88badd3589520b20628a326cae2ad078242a76d839d0ae970a6`。两个唯一 result.json 都为 72731 bytes / SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`，逐字节与完整 parsed 对象相同，且等于 committed v2。

两次原日志均先完成两个严格 Checker 与完整对象相等，再由明确三行 PR95 recapture-only guard 制造受控 CLI failure；不是 Runtime 故障或正常 compare 不相等。比较器现已精确恢复原 blob `fba36da923a94cd2b9ba024f020089e3ef313d90`，对两份原 result.json 的正常完整 compare 再次通过。原 ZIP 未重新打包；历史各节正文保留，当前来源表单独同步。

本地使用既有函数核实真实 attempts/jobs/PR95 归属、Artifact identity/digest/有效期、原 ZIP 与完整内容。Workflow、来源 validator、normalizer、base/wrapper、frozen content 与接受谓词无净变化。最终 HEAD ancestry、真实 Ready live provenance、独立 R3 和受保护合入仍由既有门核验；Draft 取证不替代这些结果，Artifact 仍有 14 天期限。本次 Runtime 来源不接受旧 D-04/D-08，也不证明新设计产品已实现。
## 2026-10-09 PR #97 当前来源续期

详细架构 #96 更新 project-state 与增量检查，按现行当前 PR 来源合同取证。SDK 使用 PR97 成功 run `37922999709` attempt 1，source `2679e561bdbf98e94c143219cbef59e3b591bf86`；Artifact `11612682909`，原 ZIP SHA-256 `718e1ff6a693a27bbd51538a13ac931e1d8de66e527fd0e329ab35623d4b6d40`。唯一 result.json 为 122178 bytes，SHA-256 `a3f47e34c2bd78b16793c7aeacfdf4020c788e475dda252779603bc9e470034d`，与 committed 字节及完整对象相同。

Worker run `37923179343` 在 `23d743684701e6f78e459082ed308f71c955427c` 真实执行 attempts 1/2（job `113795771197` / `113798221626`）。先保存 attempt 1 原 ZIP，再仅重跑该 Worker job；之后再次下载 attempt 1，字节相同。comparison Artifact `11613005928` / ZIP SHA-256 `890408201d9c566aa9edc1601af0c93fb24c85eda81c1a229e2ba8654b688572`；source Artifact `11612917336` / ZIP SHA-256 `b38041ffdd67c642a852ae5ccc8129c84fbd70bf2c32f5674a77226b53a9bc86`。两个唯一 result.json 都为 72731 bytes / SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`，字节及完整对象相同，并等于 committed v2。

原两日志均先完成两个 Checker 与完整对象相等，再由明确三行 PR97 recapture-only guard 产生受控 CLI failure；不是 Runtime 故障或正常比较不相等。比较器已恢复原 blob `fba36da923a94cd2b9ba024f020089e3ef313d90`，对两原 JSON 的正常完整 compare 再次通过。原 ZIP 没有重新打包；Workflow、来源 validator、normalizer、base/wrapper、frozen content 和接受谓词无净变化，历史各节正文保留。

本地使用既有函数核验真实 attempts/jobs/PR97 归属、Artifact identity/digest/有效期、原 ZIP 和完整内容；最终 HEAD ancestry、独立 R3、真实 Ready/live 门与受保护合入仍待实际核验。Artifact 保留期仍14天。此 Runtime 来源不接受 ADR0018，也不证明新详设的真实存储/进程/加密/产品能力；设计接受和实施验收分别记录。
## 2026-10-10 PR #101 当前来源续期

纯 Task/Outcome 规划 #100 的 Ready gate 如实拒绝历史 PR 来源，按现行协议在同一 Draft PR 续期。SDK 使用 PR101 整体成功的 run `38015299672` attempt 1 / job `114104121411`，source `0641b5cf1710cc2dbb4be6d99f1f321e863ff4b4`；Artifact `11656340371`，原 ZIP 为 10441 bytes，SHA-256 `0b45fca75d676cd664de35bc24b8c6d48c43ed5402e2d64eeacdb3060e3a439f`。唯一 result.json 为 122178 bytes，SHA-256 `a3f47e34c2bd78b16793c7aeacfdf4020c788e475dda252779603bc9e470034d`，与 committed 字节及完整对象相同。

Worker run `38016123907` 在 `7c6129acd1327f921b681ea2010077b6dd3c71be` 真实执行 attempts 1/2（job `114106656323` / `114106877999`）。先保存 attempt 1 原 ZIP，再仅重跑该 Worker job；之后再次下载 attempt 1，与保存原件逐字节相同。comparison Artifact `11656555993` / 原 ZIP SHA-256 `a81e967be5a96f7c42f1db330f956ba70d8aeeeecd74a613d9ac6175e560b56d`；source Artifact `11655952200` / 原 ZIP SHA-256 `bed4249b9c77fadf4d27fa7b946aa32bcaf8b8e38615c6706917cd4043b466d2`。两 ZIP 各 5923 bytes，唯一 result.json 均为 72731 bytes / SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`，字节及完整对象相同，并等于 committed v2。

两次原日志均先完成两个严格 Checker 与完整对象相等，再由明确三行 PR101 recapture-only guard 产生受控 CLI failure；不是 Runtime 故障或正常比较不相等。比较器精确恢复原 blob `fba36da923a94cd2b9ba024f020089e3ef313d90`，对两份原 JSON 的正常完整 compare 再次通过。原 ZIP 没有重新打包；Workflow、来源 validator、normalizer、base/wrapper、frozen content 和接受谓词无净变化，历史各节正文保留。

本次仅续期现行 Runtime 来源，不执行受限实验，也不重跑或恢复已中断的本地完整 check。最终新 HEAD 仍需独立 R3 审查、原生完整 CI 与真实 Ready/live provenance；Draft 跳过的 live gate 不算通过。

## 2026-10-10 PR #103 当前来源续期

纯 Task/Outcome 组件 #102 按现行当前 PR 来源合同在同一 Draft PR 续期。SDK 使用 PR103 整体成功的 run `38017852560` attempt 1 / job `114112026495`，source `8ca8446f848960bbf0bdaac49029b17b9d1637a6`；Artifact `11656453345`，原 ZIP 为 10441 bytes，SHA-256 `073a6427794415ff028f8545ab91ba6681ab2cad415b90b7dc09a5aa1d954aef`。唯一 result.json 为 122178 bytes，SHA-256 `a3f47e34c2bd78b16793c7aeacfdf4020c788e475dda252779603bc9e470034d`，与 committed 字节及完整对象相同。

Worker run `38018143883` 在 `7871f36fba3ca897476ce9beea18001e18ac6b02` 真实执行 attempts 1/2（job `114112943148` / `114113209948`）。先保存 attempt 1 原 ZIP，再仅重跑该 Worker job；之后再次下载 attempt 1，与保存原件逐字节相同。comparison Artifact `11656618653` / 原 ZIP SHA-256 `e658b0283c4c756090bccf53fc6d781deab4fc5cea826498f78a8f1483492424`；source Artifact `11657181065` / 原 ZIP SHA-256 `fef86e16358c345ee2f5e2610326b7c499ffe4e72baa4f4da4e906fec8d29606`。两 ZIP 各 5923 bytes，唯一 result.json 均为 72731 bytes / SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`，字节及完整对象相同，并等于 committed v2。

两次原日志均先完成两个严格 Checker 与完整对象相等，再由明确三行 PR103 recapture-only guard 产生受控 CLI failure；不是 Runtime 故障或正常比较不相等。本补丁随比较器精确恢复原 blob `fba36da923a94cd2b9ba024f020089e3ef313d90` 发布；原比较器对两份原 JSON 的正常完整 compare 已通过。原 ZIP 没有重新打包；Workflow、来源 validator、normalizer、base/wrapper、frozen content 和接受谓词无净变化，历史各节正文保留。

本次仅续期现行 Runtime 来源，不执行受限实验或旧漏洞诊断，不恢复旧取消会话。最终新 HEAD 仍需核对原 blob 与 source ancestry、独立 R3 审查、原生完整 CI 与真实 Ready/live provenance；Draft 跳过的 live gate 不算通过。本来源不证明 Task 产品执行、持久 CAS 或 P1 正式接入已经交付。

## 2026-10-10 PR #105 当前来源续期

P0-04 规划 #104 按现行当前 PR 来源合同在同一 Draft PR 续期。SDK 使用 PR105 整体成功的 run `38020190525` attempt 1 / job `114119269089`，source `322bf58985c44307a2546b047eb3368839b52358`；Artifact `11657289511`，原 ZIP 为 10441 bytes，SHA-256 `dd83752cd4a5eca520f14135f7f6e9ca514b92a0b0e0956b487f2c49c3403de3`。唯一 result.json 为 122178 bytes，SHA-256 `a3f47e34c2bd78b16793c7aeacfdf4020c788e475dda252779603bc9e470034d`，与 committed 字节及完整对象相同。

在添加受控 guard 前，同一 run 的正常 Worker job `114119269031` 已真实通过两个 Checker 和完整对象比较；原日志和 Artifact `11657484402` 保存为先决条件，不能冒充 failure-shape 来源。随后 Worker run `38020424100` 在 `a6276e631c66c3cd007fae1d5ab69182baaf4c5d` 真实执行 attempts 1/2（job `114120042582` / `114120375114`）。先保存 attempt 1 原 ZIP，再仅重跑该 Worker job；之后再次下载 attempt 1，与保存原件逐字节相同。comparison Artifact `11658146643` / 原 ZIP SHA-256 `013dc643a3a8ffa586d64581896fbc71db452efbba91b505135e461e083bf3c8`；source Artifact `11658780184` / 原 ZIP SHA-256 `82cdd31d1c527dc8002f46f881c69a2eb292e85169977b32087f914dbf06b813`。两 ZIP 各 5923 bytes，唯一 result.json 均为 72731 bytes / SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`，字节及完整对象相同，并等于 committed v2。

两次原日志均先完成两个严格 Checker 与完整对象相等，再由明确三行 PR105 recapture-only guard 产生受控 CLI failure；不是 Runtime 故障或正常比较不相等。本补丁随比较器精确恢复原 blob `fba36da923a94cd2b9ba024f020089e3ef313d90` 发布；原比较器对两份原 JSON 的正常完整 compare 已通过。原 ZIP 没有重新打包；Workflow、来源 validator、normalizer、base/wrapper、frozen content 和接受谓词无净变化，历史各节正文保留。

这仅续期既有 Runtime 来源，不实现 P0-04 算法、不执行受限实验或旧漏洞诊断、不恢复旧取消会话。最终新 HEAD 仍须独立 R3、原生完整 CI 与真实 Ready/live provenance；Draft 跳过的 live gate 不算通过。来源不证明上下文资格、真实请求快照、Z14/Z15 或任何安全门已完成。

## 2026-10-10：P0-04 纯预算实现 PR107 当前来源续期

[#106](https://github.com/ntygod/zhiwei-next/issues/106) / [PR107](https://github.com/ntygod/zhiwei-next/pull/107) 的来源为当前 PR 新采集，不复用 PR105。SDK source `1d70a667e454e1698156aa84f0869def9560f379`，成功 run `38022110861` attempt1 / job `114125132237`，Artifact `11658418106` 原 ZIP 10441 bytes，SHA-256 `26d9ca47fe61c72b4ab593f34cfd7df6613e2a95509c2c5c7c66bfacaef8dd57`。唯一 result.json 122178 bytes 与 committed 字节/完整对象一致，原严格 checker 和 ZIP validator 通过。

同一正常成功 run 的 Worker job `114125132412`、Artifact `11658972809` 已先证明两个严格检查及完整对象相等，再按现行 failure-shape 来源合同临时增加 comparison-success 后 guard。Guard source `fc4f86d0ce31466d516e2181b46546200352571d` 的 run `38022297204`：

- comparison attempt1 / job `114125694698` / Artifact `11657794299`，原 ZIP SHA-256 `92d5086678b4448baec72e920b730d6f735070c04f14c2ec267f3abbc730fde3`
- source attempt2 / job `114126034618` / Artifact `11658743590`，原 ZIP SHA-256 `a8207bb7cbcb7745d87fe35437a49cd551fb1aa2d0d572e26e98d46d177b13a5`

只在保存并验证第一份原 ZIP 后重跑精确 Worker job 一次，不重跑整个 Workflow/all-failed；第二次完成后重新 live 下载第一份 ZIP，逐字节相同。两次 capture/fresh/committed/upload 成功，原日志都先记录严格检查与完整对象相等，随后明确 guard failure；不是 Runtime 内容差异。原 run/job/artifact/paired validators 通过，两份唯一 result.json 均为72731 bytes、SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`，逐字节及完整对象均与 committed v2 相同。ZIP 未重打包。

最终候选已恢复原 comparator blob `fba36da923a94cd2b9ba024f020089e3ef313d90`；normalizer、validator、Workflow、冻结内容与fingerprint不变。两 manifest 仅续期来源；实际最终 HEAD 严格祖先关系、独立 R3、Ready/live 门与 CI 仍由真实远端回读验收，Draft 跳过不算通过。初始 PR 的 governance-change:no 与原 checker 对连续性文档路径的机械规则冲突，已按原规则改为 yes，未改 checker 或接受失败轮次为通过。

## 2026-10-10：开发与验收分离 PR109 当前来源续期

[#108](https://github.com/ntygod/zhiwei-next/issues/108) / [PR109](https://github.com/ntygod/zhiwei-next/pull/109) 使用本 PR 新来源。SDK source `2ae982c3c62764ad69fe9290c2f3e6ba70679425`，成功 [run `38037392722`](https://github.com/ntygod/zhiwei-next/actions/runs/38037392722) attempt 1 / job `114170582402`，Artifact `11663923009` 原 ZIP 10441 bytes，SHA-256 `309294280c6c37c1dd7df2321fd8700854ff510a743cdf8dbb7d017ea220d2bb`。唯一 result.json 122178 bytes，SHA-256 `a3f47e34c2bd78b16793c7aeacfdf4020c788e475dda252779603bc9e470034d`，与 committed 字节及完整对象相等；固定 Node 22.23.1 下原 ZIP validator、两个严格 Checker 和完整比较通过。未重打包 ZIP 或修改内容身份。

同一 run 的正常 Worker job `114170582445` / Artifact `11663743054` 也通过 capture、Fresh/committed 检查及完整对象比较。其原 ZIP 5923 bytes，SHA-256 `7f0db9f0544f37792289a31e11fa0076b72d9d16cfa3b1ad417d3427988761f3`；唯一 result.json 72731 bytes，SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`，与 committed v2 完整对象相等。该正常 success 不能满足原 Worker 双失败 attempt 来源合同；此记录没有接受它为 Worker 来源，后续按原合同单独采集。

用户明确授权后，在同一 Draft PR source `9b8b894421beb5992bdedc485eda0c41a73afabe` 仅于正式完整比较成功后加入临时 recapture-only guard；[run `38038329152`](https://github.com/ntygod/zhiwei-next/actions/runs/38038329152) 实际完成：

- comparison attempt 1 / job `114173359201` / Artifact `11665221021`，原 ZIP SHA-256 `5998ee1de1dbb7b21499e28667c9a965bd4b622d7380d388f8373a014bee7734`
- source attempt 2 / job `114173672972` / Artifact `11663834466`，原 ZIP SHA-256 `36ade40b557e2d909615ac6ff9bc785e15ce960bc008f7690ef483370db624e8`

先保存并验证 attempt 1 原 ZIP 后，只重跑精确 Worker job 一次，没有重跑整个 Workflow 或 all-failed。第二次完成后重新 live 下载第一份 ZIP，与保存原件逐字节相同。两份原 ZIP 均为 5923 bytes，唯一 result.json 均为 72731 bytes，SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`；字节及完整对象相同，并等于 committed v2。原 run/job/artifact/paired validators 全部通过；两次日志都先记录两个严格检查与完整对象相等，再明确 guard failure。没有把受控 failure 记作成功，没有重新打包 ZIP。

本候选精确恢复原 comparator blob `fba36da923a94cd2b9ba024f020089e3ef313d90`；恢复路径的正常完整 compare 已在固定 Node 22.23.1 隔离副本上对两份原 JSON 通过。两 manifest 仅续期来源，Workflow、validator、normalizer、冻结内容及接受谓词不变。PR 保持 Draft；最终 HEAD ancestry、独立 R3、真实 Ready/live 门和原生 CI 尚待实际结果，Draft 跳过不算通过。本记录不声称产品验收完成。

## 2026-10-10：P1-01 正式认知与作用域合同 PR111 当前来源续期

[#110](https://github.com/ntygod/zhiwei-next/issues/110) / [PR111](https://github.com/ntygod/zhiwei-next/pull/111) 使用本 PR 新来源。SDK source `7f83f60ea274e8da5da4d0fcfeb8eaa4ce67fbf8`，成功 [run `38040347283`](https://github.com/ntygod/zhiwei-next/actions/runs/38040347283) attempt 1 / job `114179167655`，Artifact `11665431880` 原 ZIP 10441 bytes，SHA-256 `ed0436b8d7b1cb662a518c7153ac6c93eed6c7028d60c1decfc3a026f58f6c59`。唯一 result.json 122178 bytes，SHA-256 `a3f47e34c2bd78b16793c7aeacfdf4020c788e475dda252779603bc9e470034d`，与 committed 字节及完整对象相等；固定 Node 22.23.1 下原 ZIP validator、两个严格 Checker 和完整比较通过。未重打包 ZIP 或修改内容身份。

同一正常成功 Run 的 Worker job `114179167416` / Artifact `11665224411` 已先证明两个严格检查及完整对象相等。该正常 success 被原 run/job validators 明确拒绝为 failure-shape 来源，未写入 Worker manifest。随后在同一 Draft PR source `0112810f62390a633d2690f30d4e3127b983d7a1`，仅于正式完整比较成功后加入明确 PR111 recapture-only guard；[run `38040583324`](https://github.com/ntygod/zhiwei-next/actions/runs/38040583324) 实际完成：

- comparison attempt 1 / job `114179854914` / Artifact `11665945278`，原 ZIP SHA-256 `6cbee45a0b9f5def930d27d0789a808212a02e8ee5c62eedc87a7b3bb1d04ad8`
- source attempt 2 / job `114180063218` / Artifact `11665910381`，原 ZIP SHA-256 `0a8195e245136051c0c0126b39d93e045dd8f6e6ea669e2d029af41aafe221e3`

先保存并验证 attempt 1 原 ZIP 后，只重跑精确 Worker job 一次，没有重跑整个 Workflow 或 all-failed。第二次完成后重新 live 下载第一份 ZIP，与保存原件逐字节相同。两份原 ZIP 均为 5923 bytes，唯一 result.json 均为 72731 bytes，SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`；字节及完整对象相同，并等于 committed v2。原 run/job/artifact/paired validators 全部通过；两次日志都先记录两个严格检查与完整对象相等，再明确 guard failure。没有把受控 failure 记作成功，没有重新打包 ZIP。

本候选精确恢复原 comparator blob `fba36da923a94cd2b9ba024f020089e3ef313d90`；恢复路径的正常完整 compare 已在固定 Node 22.23.1 隔离副本上对两份原 JSON 通过。两 manifest 仅续期来源，Workflow、validator、normalizer、冻结内容及接受谓词不变。canonical Workflow 的 name/path/active 身份已由公开 API 原对象读回；SDK 与 Worker 两来源均须在最终发布 HEAD 验证 ancestry。PR 保持 Draft；最终独立 R3、真实 Ready/live 门和原生 CI 尚待实际结果，Draft 跳过不算通过。本记录不声称产品验收完成，不复用 PR109 Artifact 或其特定授权，不执行受限旧安全实验。
