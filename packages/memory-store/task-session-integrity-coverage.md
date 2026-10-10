# P1-04 持久字段完整性与测试覆盖清单

## 范围与判定方法

本清单描述同一变更中的 `0003_task_session_v1.sql`、Task/Session Store、Execution Store 与相关正式parser，覆盖 **18张表、170个SQL列**，并列出其受控正文的主要逐字段合同。这里的“已校验”指源码存在明确检查，不等于测试已经通过或产品已启用。

本次仅进行静态源码与测试源码核对，没有执行测试、动态诊断或外部操作。表中测试编号表示已有用例的覆盖映射；**最终提交上的执行结果全部待验证**。不得沿用较早提交的通过数字，也不得把合成开发验证写成真实模型、真实数据或生产恢复验收。

四类事实必须分开：

1. 写入可达状态：只依据当前正式writer，不把未来功能、DTO枚举全集或通用领域类型当作当前持久化权限。
2. 正向关系：当前行必须指向真实、同作用域且版本精确的事实。
3. 反向关系：需要它的真源行也必须有对应投影/receipt/事件，防止只检查“存在的行”而忽略缺失或多余行。
4. 正文不可用：保留的标量、唯一性、时间、引用、历史和图关系继续检查；已删除的请求文本、criterion解释、WorkingState内容、动态证据列表和模型上下文不重建。

所有正式读取在同一个已验证SQLite snapshot内完成。所有写事务在写入前后检查既有完整行。Schema manifest、STRICT、CHECK、主键/唯一性、外键和最终foreign_key_check是下表的共同前提；不将这些结构检查冒称逐字段语义证明。

### 源码简称

- T：`packages/memory-store/src/task-store-v1.ts`
- E：`packages/memory-store/src/task-execution-store-v1.ts`
- C：`packages/memory-store/src/cognitive-store-v2.ts`
- P：`parseProductEventV1`，位于 `packages/protocol/src/session-api-v1.ts`
- C检查：合法ContentRef、真实content_object、精确scope、生命周期元数据；正文可用时还验文件摘要、canonical managed wrapper及实际入边集合。
- MC检查：T.#body在读取字节或因字节不可用返回之前，无条件要求真实content_object、`content_version=1`、`purpose=cognition`、状态不是staged、合法且不超前的recovery fence；随后host校验精确scope及允许生命周期。Session、Task、user/internal/runtime input、receipt均走此入口；WorkingState通过与Task精确共享ref继承此检查。
- EC检查：执行类受控正文同样要求 `content_version=1`、`purpose=cognition`、available/revoked/purged、精确scope，并进一步匹配本角色创建时间与自身recovery epoch。MC/EC均不因正文revoked/purged而跳过上述元数据检查。依赖源可以是通用认知内容，不能把所有source_version强制为1。

## 本次静态核对的源码字节

以下为文件SHA-256，不是git提交号；最终提交与测试运行仍需对齐这些文件或明确记录后续变化。

| 相对文件 | SHA-256 |
|---|---|
| packages/memory-store/src/task-store-v1.ts | b7c671ff420aece4984162155ef22749cd9283afacfd54ca824e308983b4e747 |
| packages/memory-store/src/task-execution-store-v1.ts | faa9672fb09adc996516de0b7bc38349f5f0dfe3026d224e0dc2b79a0274145f |

## 测试索引与执行状态

以下测试均位于相应 `*.test.ts`。列出的编号是本清单的定位标签，不是新增测试框架。

| 编号 | 文件与可定位测试名/覆盖范围 | 状态 |
|---|---|---|
| S01 | task-schema-v1：STRICT/manifest、append-only/replacement、monotonic；`Session current revision requires immutable history and keeps its original contract body`；`Session history reasons constrain authorization, creation and event references` | 源码已核对；最终运行待验证 |
| T01 | task-store-v1：`Task transaction preserves exact versions, WorkingState and response-loss idempotency across reopen`；`advancing clock is captured once per transaction...` | 同上 |
| T02 | task-store-v1：same-key冲突、stale revision、错误reducer、retry追加attempt、late invalid version回滚 | 同上 |
| T03 | task-store-v1：`new daemon fences old owner and preserves READY without automatic execution`；Session reopen/forget | 同上 |
| T04 | task-store-v1：`reverse input, receipt, WorkingState and dependency coverage survives body revocation`；rich WorkingState与真实Observation校验 | 同上 |
| T05 | task-store-v1：`runtime input records the exact managed snapshot before allocation and replays once` | 同上 |
| T06 | task-store-v1：forget/purge、Session依赖闭包、retention expiry不重执行 | 同上 |
| T07 | task-store-v1：attempt投影、取消completeness、伪造attempt、撤销后伪造attempt/Outcome | 同上 |
| T08 | task-store-v1：`post-restart retry receipt covers the Session reauthorization event and final Task version`；snapshot/consumer cursor不可跳事件 | 同上 |
| T09 | task-store-v1：`all input kinds reject extra metadata or reused command rows before reads and reopen` | 同上 |
| T10 | task-store-v1：`metadata integrity rejects future Task owner crossprojection` | 同上 |
| T11 | task-store-v1：`metadata integrity rejects out-of-order Task version cursors` | 同上 |
| T12 | task-store-v1：`metadata integrity rejects revoked self-dependency`；`revoked graph and input order retain fresh-target and commit-order invariants` | 同上 |
| T13 | task-store-v1：`metadata integrity rejects revoked malformed attempt identifier` | 同上 |
| T14 | task-store-v1：runtime input在CREATED、create结束WAITING_INPUT、unsupported成功Outcome、命令跨度与终态分类 | 同上 |
| T15 | task-store-v1：`Session contract and reauthorization metadata must equal the admitted writer history`；`Session revision facts preserve daemon ownership...`；`Session immutable history rejects current owner drift...` | 同上 |
| T16 | task-store-v1：`metadata integrity rejects extra Session receipt after revoked body` | 同上 |
| T17 | task-store-v1：`metadata integrity rejects malformed zero consumer`；`metadata integrity rejects published event without consumer`；`consumer publication state is exactly the committed acknowledged prefix` | 同上 |
| T18 | task-store-v1：所有ProductEvent孤立聚合矩阵；wrong scope/owner/version/input/source事实矩阵 | 同上 |
| T19 | task-store-v1：`Task-managed content roles retain purpose, publication and transaction time invariants`，覆盖session/task/user-input/runtime-input的purpose/staged/time分支 | 源码已核对；最终运行待验证 |
| X01 | task-execution-store-v1：allocation→READY→dispatch、精确spec/binding reopen、allocation复核Task/input/model/owner | 同上 |
| X02 | task-execution-store-v1：原始source序号跳跃/回退/冲突、错误Worker和未观测完整来源身份 | 同上 |
| X03 | task-execution-store-v1：实际projected model request持久化、bounds/幂等、reasoning文本拒绝、settled/DRAINING后不开始新请求 | 同上 |
| X04 | task-execution-store-v1：正文角色唯一性、失效后的snapshot/event/model依赖覆盖、必须已派发binding依赖 | 同上 |
| X05 | task-execution-store-v1：partial/full close、owner fencing、真实custody关闭、拒绝伪造关闭/错误echo | 同上 |
| X06 | task-execution-store-v1：`orphan or drifted checkpoints are corruption on verified reads` | 同上 |
| X07 | task-execution-store-v1：settled原子VERIFYING/ack、settlement失败全回滚、撤销后ack与source依赖 | 同上 |
| X10 | task-execution-store-v1：`a Task start receipt cannot point to later runtime progress at the same Task revision` | 源码已核对；最终运行待验证 |
| X11 | task-execution-store-v1：`revoked execution and model content metadata retain exact time, role and recovery provenance` 的future-epoch分支 | 源码已核对；最终运行待验证 |
| XF01 | task-execution-store-v1：`available allocation bodies must match their exact input, installation and Session contract` 的initial-observations/initial-close分支 | 源码已核对；最终运行待验证 |
| XF02 | task-execution-store-v1：`available execution snapshot deltas correspond to one supported writer operation` | 同上 |
| XF03 | task-execution-store-v1：`available allocation bodies must match their exact input, installation and Session contract` 的prompt/installation/contract/model/tool/runtime-profile分支 | 同上 |
| XF04 | task-execution-store-v1：`retained source tuple and normalized IDs remain validated after event body removal` | 同上 |
| XF05 | task-execution-store-v1：同上slot-ID分支；`a retained source tuple still matches its available historical binding when only event bytes are revoked` | 同上 |
| XF06 | task-execution-store-v1：`event row order and per-binding event/model revision history cannot rewind` | 同上 |
| XF07 | task-execution-store-v1：`revoked execution and model content metadata retain exact time, role and recovery provenance`；`revoked execution references cannot change the managed content version` | 同上 |
| XF08 | task-execution-store-v1：`revoked settled receipt starts exactly at the source event Task revision`；`no unrelated progress may appear between settled intake and its first Task state event`；`settled intake and its command span share the exact pinned transaction timestamp` | 源码已核对；最终SHA/运行确认pending |
| XF10 | task-execution-store-v1：`first runtime progress after a pause request uses the exact committed Task head`，对应T.validateRows当前Task head精确相等检查；input分支使用同等谓词 | 源码已核对；最终SHA/运行确认pending |
| XF09 | task-execution-store-v1：`one binding belongs to an attempt; only an explicit new attempt can allocate again`；`duplicate attempt bindings are rejected on verified reads even when both transports are closed` | 同上 |

“覆盖映射”不表示每个列都已有单独负例。复合关系可由组合用例覆盖；新增常量、时间和权限关系应在最终测试报告中列出实际执行结果与缺失用例。

## session_v1（12列）

入口与检查：T.createSession / fenceRestartedOwners / quarantineRecovery / executeTask / validateRows。

不可变性：禁止替换和删除；更新时身份、scope、原始created_at及合同正文引用不变，revision恰好+1；当前revision通过延迟外键引用不可变历史。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| id | 生成Session标识，终身不变 | 标识语法；精确Session scope | 历史与创建事件、创建receipt均指回同一Session | 完整保留 | T01,T03,T15,S01 |
| workspace_id | 来自已验证命令与调用上下文 | 标识语法；与scope和所有历史行相同 | Task复合外键、Outbox及receipt Workspace相同 | 完整保留 | T01,T03,T15 |
| scope_key | 由workspace_id与id生成Session元组 | 精确scopeKey；scope_catalog及正文复合外键 | 创建receipt须同scope；Task首版依赖本Session正文 | 完整保留 | T03,T06,T15 |
| revision | 初始1；每次实际围栏或显式再授权+1 | 历史行数等于revision；历史版本连续1..N | 当前指针精确匹配最后历史行 | 完整保留 | T03,T15,S01 |
| owner_epoch | 初始1；换owner或恢复+1；再授权不变 | 正安全整数；不大于revision；与历史末行相同 | 对应历史理由、Session事件及Task事件时点授权 | 完整保留 | T03,T10,T15 |
| owner_instance_id | 初始/换owner使用固定daemon ID；恢复与再授权不改 | 标识语法；精确匹配历史末行 | owner-fenced必须实际换ID，其他理由不得换ID | 完整保留 | T03,T15 |
| requires_reauthorization | 创建0；owner/recovery fence为1；显式新attempt命令清0 | 布尔域；与历史末行相同；按理由验证0/1变化 | reauthorized事件须紧邻对应显式Task命令；runtime input不得在授权未恢复时写入 | 完整保留 | T03,T08,T15 |
| contract_revision | 当前writer固定1，无合同替换入口 | SQL CHECK=1；reader再校验=1 | 所有Session历史、runtime input及execution contract一致 | 完整保留 | T15,S01 |
| content_id | 创建时新分配合同/命令/receipt正文；之后不改 | C+MC；聚合正文引用不复用；创建时间等于Session创建时间 | 唯一创建receipt同引用；Session正文没有入边 | 引用/角色保留；合同文本不可重建 | T03,T06,T15,S01 |
| content_version | 新正文固定1，后续不改 | C+MC无条件version1/purpose=cognition/非staged及合法recovery fence | 创建receipt、内容对象和依赖引用完全一致 | 引用及version1等角色常量完整保留 | T03,T06,S01 |
| created_at | 创建事务时间，之后不变 | 规范ISO；等于content_object.created_at及首历史时间 | 等于session.created.occurredAt | 完整保留 | T01,T15,S01 |
| updated_at | 最新Session转换事务时间 | 规范ISO；等于末历史created_at | 非恢复历史与对应Outbox时间精确相同；恢复历史仍有独立时间记录 | 完整保留 | T15,S01 |

## session_revision_v1（11列）

入口与检查：T.#recordSessionRevision / validateRows；C传入recoveryEpochs。

不可变性：全列append-only；禁止替换、UPDATE、DELETE；主键(session_id,revision)，event_cursor唯一。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| session_id | 当前Session ID | 同Session循环内关联；复合FK | 每个Session当前revision必须有完整连续历史 | 完整保留 | T15,S01 |
| revision | 每次Session转换的新revision | 恰为数组索引+1；总行数=当前revision | Session当前指针与Outbox精确历史版本双向关联 | 完整保留 | T15,S01 |
| workspace_id | 从当前Session复制 | 等于Session.workspace_id；复合FK | 所有对应Outbox同Workspace | 完整保留 | T15,S01 |
| owner_epoch | 从转换后的Session复制 | 首版1；owner/recovery fence恰+1；reauthorized不变 | 事件owner相同；当前owner等于末行；Task授权按历史位置解析 | 完整保留 | T10,T15,S01 |
| owner_instance_id | 转换后的固定daemon ID | 标识语法；owner-fenced与前版不同；其他理由相同 | 当前Session精确等于末行，不再只凭当前行自证 | 完整保留 | T15 |
| requires_reauthorization | 创建/再授权0，换owner/恢复1 | SQL布尔与理由CHECK；再授权前版必须1 | 当前布尔精确等于末行；显式命令/事件关联 | 完整保留 | T15,S01 |
| contract_revision | 固定1 | SQL及reader均要求1 | 全部历史与当前合同版本保持一致 | 完整保留 | T15,S01 |
| recovery_epoch | 独立控制世代；普通转换保持不变 | 不超过当前控制世代；首版等于合同content fence；恢复严格增加 | recovery-fenced世代序列精确等于Session创建后独立控制记录中的恢复世代；末行等于当前世代 | 完整保留；不以SQL历史替代控制真源 | T15,S01；恢复分支运行证据待最终验证 |
| reason | created/owner-fenced/reauthorized/recovery-fenced四选一 | 逐理由检查首版、ID/owner/布尔/恢复世代变化；非首版不得created | 有事件理由匹配session.created或session.owner_fenced；恢复理由无产品事件 | 完整保留 | T15,S01 |
| created_at | 该次Session转换的事务时间 | 规范ISO；不早于Session创建或上一历史行 | 非恢复精确等于事件时间；末行等于Session.updated_at | 完整保留 | T15,S01 |
| event_cursor | 非恢复为该转换Outbox cursor；恢复为NULL | NULL当且仅当recovery-fenced；非NULL精确核对Outbox全部身份/时间/世代 | 每个Session事件必须有对应历史行；末非空历史cursor等于Session事件头；创建事件还需唯一receipt | 完整保留 | T15,S01 |

## task_v1（5列）

入口与检查：T.#persistVersion / validateRows。

不可变性：身份、Session与scope固定；仅current_revision+1；禁止替换/删除。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| id | 生成Task ID | 标识语法；Task scope精确 | 所有版本、attempt、receipt、input、事件都回到同一Task | 完整保留 | T01,T02,T04,S01 |
| workspace_id | 调用上下文Workspace | 标识语法；与Session复合FK及scope一致 | 各版本事件、receipt、执行记录同Workspace | 完整保留 | T01,T02,T10 |
| session_id | create命令的Session ID | 标识语法；同Workspace Session存在 | 首Task正文依赖Session；事件授权按此Session不可变历史定位 | 完整保留 | T01,T03,T10 |
| scope_key | Task元组 | 精确scopeKey；子表复合FK | 所有子表正文与Task scope一致 | 完整保留 | T04,T06 |
| current_revision | 1起连续递增，包含中间状态 | 精确等于完整snapshot数；1..N无缺口 | receipt命令段覆盖到N；版本事件也逐版覆盖 | 完整保留 | T01,T02,T11 |

## task_snapshot_v1（10列）

入口与检查：T.executeTask / #persistVersion / #commandMetadata / validateRows。

不可变性：append-only；禁止替换、更新和删除。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| task_id | 当前Task | Task FK；可用正文精确匹配Task.id | 每个Task必须有连续snapshot | 完整保留 | T01,T04 |
| revision | 逐次+1，命令保留所有中间版本 | 索引+1；receipt段连续；Outbox版本顺序精确 | 每版恰一WorkingState与版本事件，final receipt指向段末 | 完整保留 | T01,T11 |
| scope_key | Task scope | 等于Task scope；正文复合FK | WorkingState与receipt同scope | 完整保留 | T04,T06 |
| state | 正式reducer的当前状态 | SQL枚举；#commandMetadata验证命令完整状态序列及跨版合法边；可用正文再做领域历史检查 | attempt首/末状态、Outbox state payload及终态Outcome覆盖 | 标量完整保留；已删除flags/结果解释不重建 | T02,T07,T14 |
| intent_revision | 创建1；同attempt固定；revise新attempt+1，其余新attempt不变 | 正整数；命令元数据与attempt全部版本一致 | input、事件、Outcome及执行记录绑定同意图 | 完整保留 | T02,T07,T14 |
| attempt_id | 最新attempt ID | 命令元数据无条件检查标识；FK及attempt首末范围 | 每个attempt必须有首CREATED快照；input/WorkingState/Outcome一致 | 完整保留 | T02,T07,T13 |
| owner_epoch | 当前Session owner事务写入 | 命令段内相同；input和事件相同；事件时点匹配Session历史owner | 由对应版本事件连接到Session不可变授权历史，不只比较当前owner上限 | 完整保留 | T10 |
| content_id | 每版全新受控正文 | C+MC；聚合引用不复用；content创建时间等于snapshot时间 | WorkingState同引用；段末receipt同引用；前版/首Session必要依赖 | 引用/必要角色保留；正文语义仅可用时检查 | T01,T04,T06,T12 |
| content_version | 新正文固定1 | C+MC无条件version1/purpose=cognition/非staged及合法recovery fence | WorkingState、receipt、依赖使用同精确引用 | 引用及version1等角色常量完整保留 | T01,T04 |
| created_at | 本版Task.updatedAt=事务时间 | 命令元数据无条件ISO；等于内容对象时间；同命令段相同 | 版本事件同时间，attempt首末时间相同 | 完整保留 | T01,T11,T14 |

## task_attempt_v1（8列）

入口与检查：T.#persistVersion / #commandMetadata / validateRows。

不可变性：ID/task/no/intent/created_at不改；active只可1→0；终态不改；updated_at单调；禁止替换/删除。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| id | 每次新attempt分配 | 无条件标识语法；各snapshot引用与可用正文一致 | 必须拥有非空连续snapshot区间 | 完整保留 | T02,T07,T13 |
| task_id | 所属Task | FK及Task循环范围 | 所有snapshot/Outcome/input复合关系一致 | 完整保留 | T02,T07 |
| attempt_no | 历史数组下标+1 | 连续1..N；后一个首版紧接前一个末版 | 当前完整Task可用时数组长度/顺序也精确匹配 | 完整保留 | T02,T07 |
| intent_revision | 新attempt意图版本，之后冻结 | 匹配该attempt所有snapshot；跨attempt由命令类型决定相同或+1 | Outcome/input/execution绑定同意图 | 完整保留 | T02,T14 |
| state | 该attempt最后snapshot.state | 精确匹配末版；所有旧attempt已终态由命令跨度约束 | current Task正文可用时逐attempt匹配 | 完整保留 | T02,T07,T14 |
| active | 非终态1，终态0 | 精确按末版是否终态计算；早期attempt均0；唯一active索引 | 不会有多个活动attempt或已终态active1 | 完整保留 | T07,S01 |
| created_at | 该attempt首CREATED版时间 | 无条件ISO；等于首snapshot时间 | 同命令创建新attempt时可与Session再授权事件关联 | 完整保留 | T02,T08,T15 |
| updated_at | 该attempt末snapshot时间 | 无条件ISO；精确末版时间；SQL不倒退 | 可用正文逐attempt时间匹配 | 完整保留 | T01,T07 |

## task_outcome_v1（8列）

入口与检查：T.#operationReduction / #persistVersion / validateRows。

不可变性：append-only；当前只写初始中断Outcome，不支持成功验证/后续裁定写入。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| id | 为实际中断结果生成 | 无条件标识；可用正文精确Outcome ID | 每个UNVERIFIABLE snapshot恰一Outcome；正文Outcome须存在SQL行 | 标识/基数保留，删除后不再验证解释文本 | T07,T14 |
| revision | 固定1 | reader无条件=1 | 正文历史与SQL revision一致 | 完整保留 | T07,T14 |
| task_id | 中断Task | 与attempt/snapshot复合FK | Task正文存在时结果归属一致 | 完整保留 | T07 |
| attempt_id | 中断attempt | 精确snapshot.attempt_id；FK | attempt与结果相互归属 | 完整保留 | T07,T13 |
| intent_revision | 中断意图版本 | 精确snapshot.intent_revision | 可用正文结果/criterion绑定相同 | 完整保留 | T07,T14 |
| status | 固定unverifiable | 无条件unverifiable，snapshot必须UNVERIFIABLE | CANCELLED snapshot不需Outcome；其他最终Outcome状态当前拒绝 | 完整保留 | T07,T14 |
| snapshot_revision | 追加Outcome的Task revision | 精确存在且绑定attempt/intent/time | 终态snapshot反向覆盖、命令状态段检查 | 完整保留 | T07,T14 |
| recorded_at | 中断事务时间 | 精确snapshot.created_at，后者已ISO验证 | 可用正文recordedAt一致 | 完整保留 | T07 |

## task_input_v1（11列）

入口与检查：T.executeTask / recordRuntimeInput / validateRows。

不可变性：append-only；attempt内ordinal唯一。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| id | 新生成输入ID | 无条件标识；可用runtime正文匹配 | runtime input事件唯一覆盖 | 完整保留 | T05,T09 |
| task_id | 命令目标Task | Task/snapshot/attempt FK；receipt同目标 | 所有Task receipt各有且仅有一个input | 完整保留 | T04,T09 |
| attempt_id | 命令最终attempt，或READY runtime input的当前attempt | 精确snapshot和attempt行；标识由attempt/命令元数据验证 | receipt/Outbox/execution input引用一致 | 完整保留 | T05,T09,T13 |
| task_revision | 普通命令最终版；runtime input当前READY版 | 实际snapshot存在，intent/owner/attempt精确；runtime必须READY | receipt revision一致，input事件引用revision必须精确等于该cursor处已提交Task版本头 | 完整保留 | T05,T09,T14 |
| intent_revision | 目标意图版本 | 精确snapshot及attempt意图 | 正文/receipt/事件所有相关投影一致 | 完整保留 | T09 |
| kind | user_command、internal_command、runtime_input三个正式入口 | SQL枚举；与唯一receipt.command_kind分类及正文角色一致 | 每个receipt恰对应一种输入，用户输入还需Observation | 完整保留 | T04,T09 |
| ordinal | attempt内max+1 | 连续1..N；相邻输入receipt.cursor严格增、task_revision不退 | runtime body和Outbox ordinal精确；重复输入/重复receipt拒绝 | 完整保留 | T05,T09,T12 |
| owner_epoch | 当前Session owner并与snapshot相同 | 精确snapshot.owner_epoch；事件回接历史授权 | runtime输入事件要求授权已恢复；执行输入保持相同owner | 完整保留 | T09,T10,T14 |
| content_id | user为独立命令证据；internal共用最终Task；runtime独立正文 | C+MC；非internal不复用聚合/其他输入；internal精确snapshot引用 | 唯一receipt；user唯一Observation；非internal精确Session+前版/当前版依赖集合 | 引用/角色完整保留 | T04,T06,T09,T12 |
| content_version | 新输入正文1；internal用Task版本 | C+MC无条件version1及受控正文角色/状态；internal精确共享Task ref | receipt/Observation/依赖复合引用一致 | 引用保留 | T04,T09 |
| scope_key | Task scope | 精确Task元组、snapshot、receipt；正文FK | 输入不会跨Task/Workspace共享正文 | 完整保留 | T04,T09 |

## working_state_v1（6列）

入口与检查：T.#persistVersion / #validateWorking / validateRows。

不可变性：每个Task版本一行，append-only。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| task_id | 对应Task | Task及snapshot/attempt FK | 每个snapshot反向要求此行存在 | 完整保留 | T01,T04 |
| task_revision | 对应Task revision | 精确snapshot PK | 每版一行、无额外不存在版本 | 完整保留 | T01,T04 |
| attempt_id | 该版当前attempt | 精确snapshot.attempt_id | 对应attempt必须存在 | 完整保留 | T04,T13 |
| content_id | 与同版Task共用正文 | C+MC（共享Task正文）；精确snapshot引用 | Task→WorkingState反向覆盖，可用时再验完整WorkingState证据 | 引用关系保留；文本与证据细节不重建 | T04,T06 |
| content_version | 与同版Task相同 | 精确snapshot版本；共享引用由MC无条件要求version1 | 正文共享是有意且唯一允许角色之一 | 引用和角色常量保留 | T04 |
| scope_key | 与Task版本相同 | 精确snapshot.scope_key | 正文FK和Task scope同时约束 | 完整保留 | T04 |

## task_receipt_v1（12列）

入口与检查：T.#receipt / #replayReceipt / validateRows。

不可变性：append-only；主键principal/kind/key，principal/command唯一，commit_cursor唯一。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| principal_id | 已验证调用上下文的主体ID | 无条件标识；参与持久幂等命名空间 | 同主体命令/键唯一；未另存正文主体副本 | 语法和键保留；不额外宣称密码学认证 | T01,T02 |
| command_kind | session.create、支持的Task命令、task.runtime-input | 标识；Task白名单与状态段；Session无条件固定session.create | 与input种类、最终事件类型、创建Session相互约束 | 完整保留 | T09,T11,T14,T16 |
| idempotency_key | 正式命令键 | 标识；可用正文精确；语义相同重放原receipt | PK按主体+种类+key避免重执行 | 键保留；正文不可用时返回unavailable而非重新执行 | T01,T02,T06 |
| command_id | 原始命令相关ID | 标识；正文命令及receipt相同；主体内唯一 | 同语义不同commandId仍重放原记录 | 键保留 | T01,T02 |
| workspace_id | 调用/命令Workspace | 标识；事件/Task或Session/scope一致 | input、聚合和最终Outbox同Workspace | 完整保留 | T09,T16 |
| entity_kind | session或task | SQL枚举；事件类型匹配；对应聚合存在 | Session只创建receipt；Task每个receipt都有input | 完整保留 | T04,T16 |
| entity_id | 实际创建/操作的聚合ID | 标识；事件、scope及聚合精确 | Task命令段覆盖；Session创建事件一一对应 | 完整保留 | T04,T16 |
| revision | Session固定1；Task命令最终版或runtime input当前版 | 与实际snapshot/事件一致；Session无条件1 | 所有命令段覆盖current revision，不能虚构额外Session版本receipt | 完整保留 | T11,T14,T16 |
| commit_cursor | 该命令最后state_changed/input_committed，Session为created | 事件角色精确；Task命令段事件按版本顺序且无中间其他事件；最后cursor精确相等 | 覆盖该命令所有中间版本及紧邻其前的再授权事件；不能指向progress | 完整保留 | T08,T11,X10 |
| content_id | Session原合同/Task最终版/runtime input正文 | C+MC；精确对应聚合/输入引用 | 创建receipt与Session同ref；Task receipt与段末及唯一input互相覆盖 | 引用关系保留 | T04,T06,T09,T16 |
| content_version | 与对应正式正文相同 | C+MC无条件version1及受控正文角色/状态；精确role ref | 正文对象和所有指针一致 | 引用关系保留 | T04,T09 |
| scope_key | 聚合的精确scope | 内容复合FK，Task/Session/input匹配 | 不允许receipt指向另一scope正文 | 完整保留 | T04,T09,T16 |

## task_content_dependency_v1（4列）

入口与检查：C.#writeTaskBody / #taskBodyBytes / #validateRows；T.validateRows；E.validateRows。

不可变性：append-only，双端复合FK；写入时target总是新分配正文。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| source_id | 实际存在、可用、同Workspace的源正文 | 内容存在、非global同Workspace、隐私不放宽、retention不延长；target可用时source必须可用 | 全图无自环/环；可用target正文入边精确；已知角色集合在失效后仍精确 | 图/已知角色保留；富WorkingState的已删证据集合不猜测 | T06,T12,X04 |
| source_version | 实际精确源版本，可来自通用认知内容 | 正版本且源对象存在；依赖引用精确 | 同上；不能把所有source_version强制为1 | 完整引用保留 | T06,T12,X04 |
| target_id | 新分配的Task受控正文 | 目标存在且属于Session/Task/input/execution snapshot/event/model正文角色；同scope/生命周期约束 | Session入边为空；user/runtime输入精确入边；execution各类精确角色；Task必需前版和证据边 | 已知事实保留；任意历史语义不重建 | T06,T12,X04 |
| target_version | 新managed正文固定1 | 目标属于已知managed角色；对应T.#body或E.claimBody无条件version1/purpose=cognition/非staged | 源/目标版本精确匹配role ref；全图DAG | 引用保留 | T06,T12,X04 |

## task_outbox_v1（12列）

入口与检查：T.#outbox / acknowledgeOutbox / quarantineRecovery；E.ingestExecutionEvent。

不可变性：正文和身份全列不可改；只允许pending→published/quarantined、published→quarantined；禁止替换/删除。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| cursor | SQLite正AUTOINCREMENT | 正序扫描；Task版本事件按revision连续；命令事件段末水位精确 | receipt、Session历史、消费者、execution source/ack引用真实cursor | 完整保留 | T08,T11,T17,X10 |
| event_id | 生成事件ID | P标识语法且与event_json相同；唯一 | 实际aggregate/source核对 | 完整保留 | T18 |
| workspace_id | 实际聚合Workspace | P标识；JSON投影；真实Session/Task Workspace | receipt/input/execution/consumer同Workspace | 完整保留 | T18,T17 |
| entity_kind | session/task | P枚举及type-kind对应 | 真实Session或Task snapshot存在 | 完整保留 | T18 |
| entity_id | 真实聚合ID | P标识，实际聚合和JSON一致 | 聚合所有版本/输入/Session历史反向要求事件 | 完整保留 | T04,T18 |
| revision | 提交的实际聚合revision | 实际snapshot或Session历史精确；Task事件按1..N顺序；input/progress精确等于当时Task head，不能滞后引用已被后续版本替代的历史版本 | receipt段末和历史event_cursor双向匹配 | 完整保留 | T11,T15,T18 |
| event_type | 六个正式产品事件类型 | P枚举；逐类型核验真实source；receipt只允许对应最终事件 | 不存在孤立progress/input/Task版本/Session事件 | 完整保留 | T04,T18,X10 |
| owner_epoch | 实际事务owner，进度为绑定owner | Session事件同历史；Task/input/progress同snapshot/source且按cursor解析历史授权 | 对应Session历史owner在事件发生前已生效 | 完整保留 | T10,T15,T18 |
| recovery_epoch | 当次独立控制世代 | 非负且<=当前；Session/history、内容fence、execution source相同 | 旧世代强制quarantined；不凭产品SQL增加控制世代 | 完整保留 | T15,T17,X11 |
| occurred_at | 捕获的事务时间 | P规范ISO；精确Session历史/Task版本/input内容/source时间；不得早于历史授权 | 各来源时间和正文metadata相互校验 | 完整保留 | T01,T15,T18 |
| publish_state | 初始pending；ack覆盖后published；恢复后quarantined | 旧世代必须quarantined；当前世代按同Workspace消费者最大cursor精确推导published/pending | 消费者前缀与发布状态双向约束，禁止无消费者published和当前世代假quarantine | 完整保留 | T17 |
| event_json | canonical ProductEventV1 | 正式parser、canonical重编码；所有索引列逐项相同，payload按来源精确 | inline事件不会因managed body失效而跳过验证 | 完整保留 | T18 |

## task_consumer_v1（3列）

入口与检查：T.acknowledgeOutbox / validateRows。

不可变性：ID/Workspace固定，cursor不倒退；禁止替换/删除。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| consumer_id | API传入合法ID | 无条件标识语法 | consumer/Workspace复合主键；对应实际已确认事件 | 完整保留 | T17 |
| workspace_id | API选定并实际确认事件的Workspace | 无条件标识；cursor必须在同Workspace存在 | Outbox发布前缀按Workspace隔离 | 完整保留 | T17 |
| cursor | 每次恰确认当前cursor之后的下一实际事件；持久行永远>0 | 无条件正整数；真实同Workspace事件存在 | 其覆盖前缀在当前世代须published，旧世代须quarantined | 完整保留 | T08,T17 |

## task_execution_v1（14列）

入口与检查：E.allocateExecution / #append / validateRows。

不可变性：身份、分配Task坐标、owner/recovery不变；current_revision+1；active不可回升；updated_at单调；每attempt仅一个绑定。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| binding_id | 正式binding ID | 标识；唯一；完整snapshot引用 | 所有event/model/checkpoint及正文binding一致 | 完整保留 | X01,X05 |
| execution_unit_id | 正式spec执行单元ID | 标识；唯一；可用spec/binding精确 | 同attempt不得分配第二执行身份 | 标识保留；已删spec不重建 | X01,X05 |
| workspace_id | 已验证上下文Workspace | 标识；Task和scope精确 | snapshot/event/model全路径匹配 | 完整保留 | X01,X02 |
| task_id | 实际Task | 标识；同Workspace存在 | 分配snapshot与所有child FK关联 | 完整保留 | X01,X02 |
| attempt_id | 当前attempt | 标识；分配READY snapshot精确；task/attempt唯一 | 所有执行历史及输入指向同attempt | 完整保留 | X01,X05 |
| task_revision | 分配时当前READY Task revision | 正整数；实际READY快照；不随执行历史变化 | 首execution snapshot依赖该分配版本 | 完整保留 | X01,X02 |
| intent_revision | 分配时意图版本 | 正整数；精确分配Task意图 | snapshot/event/model/input完全一致 | 完整保留 | X01,X02 |
| owner_epoch | 分配时Session owner | 正整数；分配Task owner相同 | Task版本事件回接历史Session授权；执行历史不被新owner改写 | 完整保留 | X01,X02 |
| recovery_epoch | 分配时独立控制世代 | 无条件非负且<=当前控制世代；正文metadata fence一致 | snapshot/event/model全坐标相同 | 完整保留 | X11,XF07 |
| scope_key | Task scope | 精确scopeKey；Task存在 | 所有正文scope和child FK一致 | 完整保留 | X01,XF07 |
| current_revision | 初始1，每个实际变化+1 | 执行snapshot数等于current；连续1..N | 末snapshot决定active/updated_at | 完整保留 | X01,XF02 |
| active | 初始1，完整关闭后0 | 恰等于1-末snapshot.closed | closed历史不能再追加；同attempt无替换执行 | 完整保留 | X05,XF09 |
| created_at | 分配事务时间 | 无条件ISO；首snapshot时间精确 | 执行正文content时间、首快照时间一致 | 完整保留 | X01,XF07 |
| updated_at | 末snapshot时间 | 无条件ISO且>=创建；精确末snapshot.created_at | 当前指针与末历史时间一致 | 完整保留 | X01,XF07 |

## task_execution_snapshot_v1（15列）

入口与检查：E.#insertSnapshot / #append / validateRows。

不可变性：append-only；SQL约束closed==(state=STOPPED)，BUSY/DRAINING需dispatched，ALLOCATED/READY禁止dispatched。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| binding_id | 从不可变execution根坐标逐项复制 | 每列精确等于root；FK；recovery受根和内容fence约束 | 完整root→连续历史→current反向关系 | 完整保留 | X01,X04,X11,XF07 |
| revision | 初始1逐次+1 | 精确index+1 | current指针与总行数精确 | 完整保留 | X01,XF02 |
| task_id | 从不可变execution根坐标逐项复制 | 每列精确等于root；FK；recovery受根和内容fence约束 | 完整root→连续历史→current反向关系 | 完整保留 | X01,X04,X11,XF07 |
| task_revision | 从不可变execution根坐标逐项复制 | 每列精确等于root；FK；recovery受根和内容fence约束 | 完整root→连续历史→current反向关系 | 完整保留 | X01,X04,X11,XF07 |
| attempt_id | 从不可变execution根坐标逐项复制 | 每列精确等于root；FK；recovery受根和内容fence约束 | 完整root→连续历史→current反向关系 | 完整保留 | X01,X04,X11,XF07 |
| intent_revision | 从不可变execution根坐标逐项复制 | 每列精确等于root；FK；recovery受根和内容fence约束 | 完整root→连续历史→current反向关系 | 完整保留 | X01,X04,X11,XF07 |
| owner_epoch | 从不可变execution根坐标逐项复制 | 每列精确等于root；FK；recovery受根和内容fence约束 | 完整root→连续历史→current反向关系 | 完整保留 | X01,X04,X11,XF07 |
| recovery_epoch | 从不可变execution根坐标逐项复制 | 每列精确等于root；FK；recovery受根和内容fence约束 | 完整root→连续历史→current反向关系 | 完整保留 | X01,X04,X11,XF07 |
| scope_key | 从不可变execution根坐标逐项复制 | 每列精确等于root；FK；recovery受根和内容fence约束 | 完整root→连续历史→current反向关系 | 完整保留 | X01,X04,X11,XF07 |
| state | ALLOCATED→READY→BUSY→DRAINING/STOPPED；真正观测或部分关闭可保留原状态 | 初始ALLOCATED；标量合法边；正文可用时还验证ready/dispatch/observed/close四类实际writer形状并拒绝重复无变化版本 | 最后状态决定active；依赖Task与输入匹配 | 标量保留；已删观测/关闭细节不重建 | X01,X05,XF01,XF02 |
| dispatched | 初始0；实际BUSY边界转1；不回退 | SQL布尔+state组合；reader单调；可用body精确 | event/model只能依赖真实dispatched开放绑定 | 完整保留 | X03,X04,XF02 |
| closed | 初始0；完整实际关闭证据才1 | SQL布尔+STOPPED等价；closed后禁止追加；可用body检查完整关闭证据 | root.active精确反向；新owner记录真实关闭不改旧lease | 标量保留；不能从失效正文重新证明物理关闭 | X05,XF02 |
| content_id | 每次实际快照全新正文 | C+EC；角色不复用；初始依赖Task+input，后续依赖前快照+当前Task+同input，集合精确 | 每个快照正文只属一个执行角色；当前Task版本不倒退 | 引用/依赖角色保留 | X04,XF07 |
| content_version | 固定1 | EC无条件=1 | 所有来源/引用精确 | 完整保留 | XF07 |
| created_at | append事务时间 | 无条件ISO、不早于前版；精确content时间 | 初始等于root.created；末版等于root.updated | 完整保留 | X01,XF07 |

## task_execution_stream_v1（5列）

入口与检查：E.ingestExecutionEvent / validateRows。

不可变性：source身份固定；checkpoint序列只前进；禁止替换/删除。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| binding_id | 来源事件binding | 精确对应source_key事件头binding | checkpoint总数恰等于实际source heads数 | 完整保留 | X02,X06 |
| source_key | 完整10项来源身份canonical元组 | 精确匹配已验证事件source head | 无事件的checkpoint或缺少checkpoint均拒绝 | 完整保留 | X02,X06,XF04 |
| source_stream_id | 实际来源stream | 精确事件头stream | 事件来源完整身份必须一致 | 完整保留 | X02,X06 |
| last_sequence | 最后接受的原始序号，允许数值空洞 | 精确事件头序号；按原完整source domain严格增 | 不能重编号或将跨surface数字空洞视为缺失事件 | 完整保留 | X02,X06 |
| last_event_id | 该source最后事件ID | 精确事件头ID；FK | checkpoint和事件尾双向匹配 | 完整保留 | X02,X06 |

## task_execution_event_v1（18列）

入口与检查：E.ingestExecutionEvent / validateRows。

不可变性：append-only；event/idempotency/source-slot/commit cursor唯一。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| row_id | SQLite正自增摄取顺序 | 正整数；按row_id验证cursor全局增加及每binding Task/绑定依赖版本不退 | stream checkpoint源头由这个顺序重建 | 完整保留 | X02,XF06 |
| event_id | 正式来源槽位派生ID | 标识；根据保留source tuple+sequence重新计算正式hash ID并精确比较 | 实际slot、checkpoint、ack、settled receipt名字一致 | 完整保留来源槽位；不证明已删payload字节 | X02,XF04,XF05 |
| idempotency_key | 正式事件body幂等键 | 标识；无条件nre1b_加64位hex；body可用时parser/投影精确 | 唯一幂等槽位；失效正文不重新执行 | 格式/键保留；body哈希原文不可恢复 | X02,XF04 |
| binding_id | 实际执行绑定 | 根execution存在；source tuple首项一致 | 精确开放dispatched绑定快照依赖 | 完整保留 | X02,X04 |
| task_id | 摄取时执行/Task精确坐标 | 逐列等于execution根；Task snapshot精确，EC复核recovery | 对应progress所有坐标一致；Task事件回接Session历史 | 完整保留 | X02,X04,X11,XF07 |
| attempt_id | 摄取时执行/Task精确坐标 | 逐列等于execution根；Task snapshot精确，EC复核recovery | 对应progress所有坐标一致；Task事件回接Session历史 | 完整保留 | X02,X04,X11,XF07 |
| task_revision | 摄取时Task当前版本 | 实际snapshot且>=分配版本；按binding非递减；progress在自身cursor处必须精确引用最新Task head | progress revision一致；依赖currentTask与已派发绑定相容 | 完整保留 | X02,XF06 |
| intent_revision | 摄取时执行/Task精确坐标 | 逐列等于execution根；Task snapshot精确，EC复核recovery | 对应progress所有坐标一致；Task事件回接Session历史 | 完整保留 | X02,X04,X11,XF07 |
| owner_epoch | 摄取时执行/Task精确坐标 | 逐列等于execution根；Task snapshot精确，EC复核recovery | 对应progress所有坐标一致；Task事件回接Session历史 | 完整保留 | X02,X04,X11,XF07 |
| recovery_epoch | 摄取时执行/Task精确坐标 | 逐列等于execution根；Task snapshot精确，EC复核recovery | 对应progress所有坐标一致；Task事件回接Session历史 | 完整保留 | X02,X04,X11,XF07 |
| scope_key | 摄取时执行/Task精确坐标 | 逐列等于execution根；Task snapshot精确，EC复核recovery | 对应progress所有坐标一致；Task事件回接Session历史 | 完整保留 | X02,X04,X11,XF07 |
| source_stream_id | 实际已观测stream | 标识；tuple第二项；可用binding宣告成员关系 | checkpoint和body引用相同stream | 语法/成员关系在binding可用时可核验 | X02,XF04 |
| source_key | binding、stream、Workspace、nativeSession、runtimeInstance、adapter、implementation、version、surface、domain的canonical10元组 | 所有项语法与surface枚举无条件检查；前3项精确投影；可用binding核验source已实际观测；可用event body核验完整10项 | slot ID、sequence、stream checkpoint全部回接本tuple | 保留完整tuple；已删binding的动态宣告集合不猜测 | X02,XF04,XF05 |
| source_sequence | 原始正source序号 | 正整数；同source按row_id严格增；正式slot ID重算 | checkpoint精确头部；body可用时sequence精确 | 完整保留 | X02,X06,XF05 |
| content_id | 新事件正文 | C+EC；角色唯一；精确依赖BUSY/DRAINING已派发未关闭binding+Task+同input | progress、ack及settled来源关系保留 | 引用/角色保留 | X04,XF07 |
| content_version | 固定1 | EC无条件1 | 引用和正文对象版本精确 | 完整保留 | XF07 |
| commit_cursor | 本次progress事件cursor | 实际progress类型和全部坐标/时间精确；按row_id严格增加 | ack为本cursor或同事务settled后最终Task receipt cursor | 完整保留 | X02,X07,XF06 |
| recorded_at | 摄取事务时间 | ISO；EC内容时间；progress时间精确；settled还需等于最终Task snapshot.created_at | 正文可用时还核验正式envelope投影 | 完整保留 | X02,XF07 |

## task_model_request_v1（14列）

入口与检查：E.recordModelRequest / validateRows。

不可变性：append-only；binding/request主键，binding/ordinal唯一。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| binding_id | 当时实际执行绑定 | 根存在；精确BUSY未关闭已派发binding依赖 | Task RUNNING且同attempt/owner/intent | 完整保留 | X03,X04 |
| request_id | 正式请求ID | 无条件标识；可用body精确 | binding内唯一，重复请求只exact replay | 完整保留 | X03 |
| task_id | 当前Task和执行固定坐标 | 逐列同execution；Task RUNNING坐标匹配；EC recovery溯源 | 精确依赖binding/Task/input | 完整保留 | X03,X04,X11,XF07 |
| attempt_id | 当前Task和执行固定坐标 | 逐列同execution；Task RUNNING坐标匹配；EC recovery溯源 | 精确依赖binding/Task/input | 完整保留 | X03,X04,X11,XF07 |
| task_revision | 当时RUNNING版本 | 实际RUNNING snapshot；按binding ordinal不倒退 | 引用的binding历史版本也不倒退 | 完整保留 | X03,XF06 |
| intent_revision | 当前Task和执行固定坐标 | 逐列同execution；Task RUNNING坐标匹配；EC recovery溯源 | 精确依赖binding/Task/input | 完整保留 | X03,X04,X11,XF07 |
| owner_epoch | 当前Task和执行固定坐标 | 逐列同execution；Task RUNNING坐标匹配；EC recovery溯源 | 精确依赖binding/Task/input | 完整保留 | X03,X04,X11,XF07 |
| recovery_epoch | 当前Task和执行固定坐标 | 逐列同execution；Task RUNNING坐标匹配；EC recovery溯源 | 精确依赖binding/Task/input | 完整保留 | X03,X04,X11,XF07 |
| ordinal | binding内max+1 | 连续1..N；Task/binding依赖版本非递减 | 可用spec核对maxModelRequests | ordinal保留；已删spec预算不可恢复 | X03,XF06 |
| max_tokens | 实际请求上限，<=spec预算 | 无条件正数；可用spec<=maxTokens；可用body精确 | 保存实际投影请求，不把runtime input充当请求 | 正值保留；失效预算不重建 | X03,XF07 |
| scope_key | 当前Task和执行固定坐标 | 逐列同execution；Task RUNNING坐标匹配；EC recovery溯源 | 精确依赖binding/Task/input | 完整保留 | X03,X04,X11,XF07 |
| content_id | 实际projected model context新正文 | C+EC；唯一角色；精确BUSY绑定+Task+input依赖 | 调用接收器前已持久化；无任意raw reasoning字段 | 引用/角色保留；投影文本不可恢复 | X03,X04,XF07 |
| content_version | 固定1 | EC无条件1 | 正文对象和依赖版本精确 | 完整保留 | XF07 |
| created_at | 请求事务时间 | ISO；EC内容时间；body可用时精确 | 该时间不依赖已删context去验证格式/metadata相等 | 完整保留 | X03,XF07 |

## task_execution_ack_v1（2列）

入口与检查：E.ingestExecutionEvent / validateRows。

不可变性：append-only；每个事件一个ack，禁止替换/更新/删除。

| 列 | writer可达值/变化 | reader精确检查 | 反向事实/组合约束 | 正文不可用时 | 测试映射 |
|---|---|---|---|---|---|
| event_id | 每个已提交来源事件ID | FK；逐事件需要ack；ack总数=event总数 | 无多余或缺失ack；与真实来源slot身份一致 | 完整保留 | X07 |
| commit_cursor | 普通事件progress cursor；settled为原子Task VERIFYING receipt最终cursor | 精确等于二者之一；settled command ID/key固定、前一命令终点==来源Task revision、结果VERIFYING、来源依赖存在，且最终Task snapshot.created_at==source.recorded_at | receipt、progress、来源事件、最终快照相互覆盖；settled进度后紧邻第一Task状态事件，不能夹入无关进度；缺失body不允许只保留松散同aggregate指针 | 完整保留标量/依赖；完整settled payload仅body可用时验证 | X07,XF08 |

## 命令跨度与历史状态组合

`#commandMetadata`用于writer和reader共同检查仍然保留的标量事实：

| 命令 | 当前允许的本事务状态序列 | 额外事实 |
|---|---|---|
| task.create | CREATED,READY | 初始revision1/intent1，同一新attempt；最终READY，恰两版 |
| task.cancel | CANCELLING；或CANCELLING,CANCELLED | 不得绕过关闭/未绑定执行判断；完整停止后才CANCELLED |
| task.pause | RUNNING | 前状态必须RUNNING；正文可用时验证pauseRequested变化 |
| task.retry | CREATED,READY | 前attempt终态；必须新attempt；意图版本不变 |
| task.continue | READY；CREATED,READY；CANCELLING,CANCELLED,CREATED,READY | 是否新attempt由既有状态决定；新attempt前必须终态；意图版本不变 |
| task.revise-request | CREATED,READY；CANCELLING,CANCELLED,CREATED,READY | 必须新attempt；意图版本恰+1；可用正文检查新请求与标准精确对应命令 |
| task.runtime | READY、RUNNING、VERIFYING、CANCELLED、PAUSED、UNVERIFIABLE；或VERIFYING,UNVERIFIABLE | event及真实execution evidence可用时再核验具体操作；effect-unknown等未实现路径不因DTO枚举而获得写入能力 |

同attempt必须遵守当前writer可达的状态边，intent_revision不变；换attempt必须从终态进入CREATED。每个命令段的所有版本同owner和事务时间；版本事件按revision连续，段内不夹入其他Outbox事件，receipt精确指向最终state_changed。再授权事件紧邻命令首事件之前，因此最终receipt水位覆盖它，但不把它算成Task版本。

旧owner的真实execution关闭记录与新owner的Task中断处理是不同事实。新owner完成实际custody关闭后可写interrupted相关Task版本，不代表可以在requires_reauthorization=1时开始新执行。Session历史和Task事件位置共同验证owner，不以时间经过或owner数字增大当作关闭证明。

## 受控正文逐字段合同

所有Task/Session正文先做不依赖字节可用性的MC检查，执行正文先做EC检查；正文可用时再验证canonical JSON和精确managed wrapper：`format`固定task-managed-content-v1；`dependencies[]`每项为ContentRef；正文可用时wrapper列出的入边与SQL集合完全相同。正文失效后不重新物化，不用摘要替代。

| 字段集合 | writer及reader合同 | 反向事实/正文失效边界 | 测试映射 |
|---|---|---|---|
| Session正文.schemaVersion | 固定1，精确字段集contract/command/receipt | 删除后保留Session合同版本1与原始ref，不恢复合同内容 | T01,T15 |
| contract.schemaVersion, interactionKind | 1；interactive/single-task枚举 | 原始创建命令contract整体相同 | T01及Session协议测试 |
| contract.runtimeProfile.id/revision, modelProfile.id/revision, toolProfile.id/revision | 每个profile恰id/revision；标识/正版本；create及allocation使用精确相关profile | 执行spec可用时与Session profile匹配；不能猜已删profile | X01,XF03 |
| contract.policyProfile.id/revision, dataProfile.id/revision, compilerProfile.id/revision | 同样精确profile结构；原始command与contract全等 | 不凭这些声明扩大实际授权 | Session协议测试 |
| Task正文.schemaVersion | 固定1，task/workingState/command/receipt精确结构 | 每个当前writer版本都由receipt命令段覆盖 | T01,T04 |
| Task.id,workspaceId,sessionId,revision,state,createdAt,updatedAt | 正式parser；精确SQL投影；created不变、revision连续、时间与完整历史一致 | 标量投影持续校验；已删请求不可恢复 | T01,T02,T11,T14 |
| Task.intent.revision,request,constraints[] | 正版本、非空有界文本/数组；同attempt意图冻结；writer命令与最终Task完全对应 | 完整可用命令段重用#operationReduction；缺少所需正文时只验保留标量 | T02,T14 |
| Task.intent.criteria[].id,revision,description,required,method | ID唯一、正版本、非空说明、布尔required、正式method枚举、至少一项必需标准 | 不把合法标准结构当作真实验证执行 | T14及领域/协议测试 |
| Task.attempts[].id,taskId,workspaceId,intent,state,createdAt,updatedAt | 正式完整字段集；Task归属、intent、历史前缀与SQL投影精确 | 历史attempt不可覆盖；SQL首末版/active关系失效后保留 | T02,T07,T13 |
| Attempt.pauseRequested,cancellationRequested,completeness | 严格布尔/枚举；pause仅RUNNING；CANCELLING需取消标志；CANCELLED必须complete；未settled状态不带结果 | 字段仅在正文中，删除后不猜flags；SQL状态序列仍检查 | T07,T14 |
| Attempt.unresolvedActions[].id/revision | 正式引用、唯一ID/正版本；仅允许领域指定取消/协调状态 | 当前实际writer未开放其他执行副作用功能 | 领域/协议测试 |
| Attempt.outcomes[] | 只追加保留历史；当前P1-04仅初始中断unverifiable | SQL双向覆盖与status/revision常量仍检查 | T07,T14 |
| Outcome.id,revision,taskId,attemptId,workspaceId,intentRevision,status,recordedAt | 精确attempt/intent归属、连续Outcome历史、时间约束；SQL进一步限制revision1/unverifiable | 失效后保留归属/基数/终态关系，不复原解释 | T07,T14 |
| criteriaResults[].taskId,attemptId,workspaceId,intentRevision,criterionId,criterionRevision,method | 完整标准集合恰一次，绑定原标准和方法 | 不接受错attempt/意图或缺标准结果 | 领域/协议测试 |
| criteriaResults[].checkedAt,explanation,status,reason,evidence[].id/revision,validUntil? | 时间/文本/状态分支结构合法；当前writer仅unknown/incomplete/空evidence；全段可用时reader重用同操作限制 | pass/fail/后续Outcome裁定不由通用parser暗示已支持；正文删除后不能复原判定 | T14 |
| WorkingState.schemaVersion,id,revision,scope,privacy,sourceTrust,createdAt,updatedAt | schema2；精确Task坐标/时间/scope；隐私不放宽；正式sourceTrust枚举 | custom reducer可合法提供非默认sourceTrust，不强制全部verified-tool | T04 |
| WorkingState.task.kind/id/revision,taskAttempt.taskId/attemptId/intentRevision,intentRevision | 精确当前Task/attempt/intent引用 | 对应SQL WorkingState行与Task snapshot同ref | T04,T13 |
| WorkingState.currentStep,known[],unknown[],pendingInput[],nextSteps[] | 默认当前步骤/空列表，或reducer提供的正式有界文本列表 | currentStep可为描述文本，不强制等于Task状态 | T04 rich WorkingState |
| WorkingState.evidence[].source.kind/id/revision,scope,privacy,sourceTrust,observedAt,role,fragmentId? | source为真实Observation/rev1；完整metadata精确；同scope、隐私不放宽；时间不在未来；至少一supports；Task writer不接受fragmentId | 真实Observation和必须依赖边校验；富WorkingState删除后不能推断曾引用哪些额外Observation | T04,T06 |
| RuntimeInput.schemaVersion,id,taskId,attemptId,taskRevision,intentRevision,ownerEpoch,ordinal,kind | schema1/runtime_input，逐字段等于SQL投影；目标READY | input/receipt/event/依赖双向对应不受正文生命周期影响 | T05,T09,T14 |
| RuntimeInput.contractRevision,text,createdAt | 与Session合同版本相同；非空文本<=1MiB且与command相同；规范ISO且等于content创建时间 | text删除后不恢复；时间metadata仍与Outbox一致 | T05,T09 |
| command.schemaVersion,commandId,idempotencyKey,workspaceId,expectedRevision | 正式schema与标识；receipt精确匹配；expectedRevision为该命令段起点/当前input revision | 主体/键保留不等于能在正文失效后重做语义比较 | T01,T02,T09 |
| session.create payload.kind,contract | 固定kind，完整SessionContract parser | Session只允许一个revision1创建receipt | T15,T16 |
| task.create payload.kind,sessionId,request,constraints[],acceptanceChecks[],executionProfile.id/revision,goalRef? | 精确正式DTO；Session存在；writer profile与合同匹配；goalRef仅保留合法声明 | 不把尚未实现的Goal消费关系算作当前Task事实 | T01及API协议测试 |
| task.continue/pause/cancel/retry payload.kind,targetRef.kind/id/revision | targetRef为Task；revision==expectedRevision；目标ID匹配 | 保留kind与命令状态跨度相符 | T02,T14 |
| task.revise-request payload.kind,targetRef,intentRevision,request,constraints[],acceptanceChecks[] | 意图版本匹配旧版本；新attempt意图恰+1；最终请求/标准精确匹配 | 缺少正文时仅验证版本/状态/归属，不造回请求文本 | T02,T14 |
| task.runtime payload.kind,taskId,event,completeness?,evidenceRefs[].id/revision | 精确字段和enum；除prepare外需真实execution evidence；start需READY开放未派发；结束确认需真实closed绑定 | 可用证据正文验证settled类型；保留依赖角色仍校验；不把已删证据视为可重新证明关闭 | T09,X05,X07 |
| task.runtime-input payload.kind,taskId,attemptId,intentRevision,text | 精确字段集，与runtime input及receipt一致 | metadata目标必须READY且已授权 | T05,T14 |
| task.respond、task.confirm-result附加字段 | 当前API明确unsupported，无合法持久化writer | 正式DTO存在不表示pending question消费或成功验证已接通 | API与领域边界测试 |
| Receipt.schemaVersion,commandId,status,aggregate.kind/id/revision | schema1/committed；精确持久receipt及真实聚合/最终事件 | 状态只表示committed，不宣称任务成功 | T01,T11,T16 |
| Receipt.result.kind,ownerEpoch或taskState/intentRevision/outcome/initialOutcome引用 | 正式receipt parser；Session创建owner1；Task result逐项等于最终snapshot，正文可用时等于完整receiptResult | 当前不写后续Outcome裁定；不从已删正文发明result细节 | T01,T07,T14 |

## 正文删除后的边界

- 可继续证明：身份语法、revision/ordinal、scope、owner/recovery历史、命令状态跨度、唯一性与基数、双向外键关系、实际Outbox顺序、最终receipt水位、consumer发布前缀、内容metadata、DAG、已知角色的精确依赖集合。
- 可精确枚举入边的角色：Session为空；user_command为Session及命令开始前Task（若存在）；runtime_input为Session及目标Task版本；执行首snapshot为分配Task+同runtime input，后续snapshot再加前execution snapshot；event/model为实际可消费的binding snapshot+Task+同input。
- Task正文可依赖自定义WorkingState所引用的额外真实Observation，也可依赖命令实际execution evidence。正文可用时这些引用逐项解析并验证；正文删除后，没有另一个独立明细表保存完整历史语义集合，不能根据默认WorkingState猜出“原来没有额外证据”，也不能声称每条额外边都已按被删语义重新验证。
- 动态binding宣告、物理关闭细节、spec预算、model context及Outcome解释若只在已失效正文中，不从标量或摘要恢复。保留closed/dispatched等标量一致性，不等于重新执行或再次证明物理事件。
- 本合同保证正式writer/reader的可达状态、投影与保留事实一致；不引入全数据库重签名、防任意一致性重造或密码学真实性的新系统。

## 11项反例与修复定位

Session原有三项问题另由固定contract_revision=1、requires_reauthorization逐理由历史和owner_instance_id不可变历史共同处理；对应T15/S01。新增 `session_revision_v1` 的全部11列已在上表逐列列出，不以新增一张表本身代替双向检查。

| 编号 | 已确认反例类型 | 当前修复定位 | 测试映射/执行状态 |
|---|---|---|---|
| F1 | Task snapshot/input/event共同改成未来owner仍被接受 | T.validateRows按cursor与recovery选择Session历史授权；owner/时间/fence精确 | T10；最终运行待验证，合法custody中断正例仍需保留X05 |
| F2 | consumer坏标识、未知Workspace或cursor0被接受 | T.validateRows无条件标识/正cursor/真实同Workspace事件检查 | T17；最终运行待验证 |
| F3 | Session正文失效后可增加不存在命令的receipt | T.validateRows无条件限定session.create、revision1、created事件、owner1与原合同ref | T16；最终运行待验证 |
| F4 | 无消费者也能把Outbox标published | T.validateRows精确推导当前世代消费者前缀，旧世代强制quarantined | T17；最终运行待验证 |
| F5 | Task版本事件倒序，receipt水位漏掉同事务版本 | T.validateRows逐Task版本顺序、命令事件跨度及段末水位精确 | T11；最终运行待验证 |
| F6 | 失效后依赖自环/环及已知角色多余边 | T.validateRows目标角色集合、DAG、Session空入边、user/runtime精确入边；C保留scope/privacy/retention/lifecycle检查 | T12；最终运行待验证；不猜已删WorkingState证据 |
| F7 | 正文失效后非法attempt ID只靠关系一致即可通过 | T.validateRows和#commandMetadata无条件标识检查 | T13；最终运行待验证 |
| F8 | runtime_input关联CREATED而非READY快照 | T.validateRows精确READY谓词，recordRuntimeInput写入口保持相同条件 | T14；最终运行待验证 |
| F9 | task.create最终WAITING_INPUT等不可达命令状态仍被接受 | writer/reader共用T.#commandMetadata；所需正文完整可用时重用#operationReduction | T14；最终运行待验证；unsupported Outcome保留原错误分类 |
| F10 | start receipt改指同Task revision的后续progress | T.validateRows精确最终事件角色/命令段末cursor；E真实progress夹具验证 | X10；最终运行待验证 |
| F11 | 已失效ALLOCATED execution根/历史出现未来recovery epoch | E.validateRows根世代上界及各正文content fence精确 | X11/XF07；最终运行待验证 |

执行部分另外补足初始binding事实、逐writer转换、可用Session/input/spec关联、完整来源语法/slot ID、事件与模型顺序、内容metadata、settled起点与事件紧邻关系、同attempt单绑定。具体测试名见XF01–XF09；这些不是重新创造失效正文语义的检查。

## 补充精确相等条件：最终确认仍为pending

以下是执行覆盖对照中的F7/F9补充项，编号不替代上方原11项反例编号。源码中已看到修正，但不据静态阅读标记全部resolved：

| 补充项 | 当前源码事实 | 待完成确认 |
|---|---|---|
| Execution F7：input/progress引用当时版本 | T.validateRows对task.input_committed和task.progress均要求 `event.aggregate.revision === taskEventHeads.get(taskId)`；不再只检查其版本已出现过 | 最终冻结文件SHA确认及回归运行pending；XF10对应progress负例；input精确分支需随最终测试报告核对 |
| Execution F9：settled同事务时间 | E.validateRows要求settled来源的recorded_at精确等于最终Task snapshot.created_at，同时保留各自content创建时间和事件邻接检查 | 最终冻结文件SHA确认及回归运行pending；XF08新增精确时间负例 |

## 精确ContentRef的既有边界修正

C.#resolveTargets处理既有 `RecoveryControlTargetV2` 的content目标时，向严格的#content函数只传入 `{contentId,contentVersion}`，scope仍作为原独立参数传入。公开目标结构及parser不变，授权、允许生命周期状态和作用域均未放宽。该修正避免把含kind/scope等字段的完整控制目标误当成ContentRef。

`a retained source tuple still matches its available historical binding when only event bytes are revoked` 先通过既有精确content FORGET路径使事件正文不可用，再验证保留的source tuple仍需匹配可用历史binding。测试运行状态仍以最终记录为准。

## 验证与验收状态

- 源码覆盖：18张表、170列已逐项登记；对应现有及新增测试名称已映射。
- 本文编制：静态核对，未运行测试或诊断；收到的中间局部结果不替代最终提交上的完整运行。
- 中间开发运行记录：Task相关116/116、strict类型检查130根及架构检查已有通过报告；正式最终结果须绑定冻结源码和最终提交后另行记录，本文不据此写整体通过。
- 补充Execution F7/F9：代码已加入；最终SHA确认和对应运行pending。
- 最终完整测试/独立R3：待验证。本清单是候选输入，不是审批记录。
- 产品验收：`not_run`。真实数据/真实模型/正式官方Runtime完整组合、完整OS死亡后未知orphan custody、硬件断电、Windows及生产备份恢复均不由本合成SQLite覆盖清单认证。
- 历史资格：检查已存历史时不把当前policy/cognition或已过期lease重新当作当年写入时的值；必须区分历史完整性与当前可执行资格。

本清单不替代最终HEAD的完整检查、独立完整性审查和既定交付门。测试状态更新应引用实际命令、Node补丁版本和对应提交，不通过本清单中的“有检查”推导“已通过”。
