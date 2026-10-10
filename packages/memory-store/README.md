# 版本化认知持久化

P1-02 / [#112](https://github.com/ntygod/zhiwei-next/issues/112) 的代码开发入口为 `openSyntheticCognitionStoreV2`。名称有意标明当前仅合成开发；P1-04 增加默认关闭的合成 Daemon/API/Worker 组合，没有真实数据或外部模型消费者。该入口不是启用许可，布尔 `authorized/accepted` 也不能开启生产能力。

## 版本与支持范围

- v1 的 `0001`、公开 parser、Ledger API、Fixture 和完整性验证均不改写。独立 v2 固定列表追加 `0002`，迁移后旧 `runtime_events` 仅供只读审计；旧 v1 opener 对新 schema fail closed。没有自动扫描/转换旧正文。
- Observation v2：独立 canonical 元数据、不可变内容引用、完整 stream identity、单调 source sequence/committed checkpoint、exact replay 和冲突、稳定 row cursor。gap 保持 incomplete，不把收件当作 Outcome。
- Claim：正文仅受管文件；SQL 保留不可变受控元数据/版本/证据。纠正使用持久 CAS，同事务新增版本、supersede、依赖失效、epoch、生命周期记录、Outbox。旧正文保留受政策约束的历史，不原位改成新事实。
- 同一 Claim 版本的通用 dispute/expire 状态持久入口按原 M1-4 规划留给 P1-05；当前实现纠正、FORGET、control-first 收紧与按有效时间拒绝读取，没有任意状态 override。
- Candidate、Hypothesis、Goal：正式 domain parser 验证的独立类型、规范正文、精确最小元数据投影和 revision history；指针、依赖、epoch、Outbox 同事务。ACCEPTED Candidate 必须走 `commitCandidateAcceptance` 与 Claim 同事务提交，独立提交拒绝；生命周期 revision 不得改写 Candidate 原正文。不是任意 JSON Repository，也不实现 P2 学习晋升。
- Episode/WorkingState：有严格 codec/非正文投影；旧通用认知入口保持 `unsupported`。P1-04 专用 Task 事务已经写读绑定真实 Task/Attempt/Observation 的 WorkingState，由 P1-06 消费；Episode 由 P1-07 的 Outcome 消费者基于 P1-04 精确 Task/Attempt/Outcome 历史接线。P1-09 只负责 Alpha 端到端验收，不承担这两项存储实现。没有任意“引用已验证”开关。Procedure/P2、权限执行/预算/租约表不提前铺空壳。
- 独立 evidence fragment 没有正式存储解析器时返回 `unsupported`，不会因为父 Observation 存在而接纳悬空 fragmentId。
- v1→v2 转换要求显式 mapping；`fixtures/cognitive-v2` 保留两版 Fixture。版本转换不物化正文，不认证来源或授权，不迁移真实数据。

## 事务与正文

每个真实 v2 连接使用 WAL、FULL、foreign_keys、busy_timeout、trusted_schema、temp_store 和 secure_delete 的机械回读。固定迁移历史、完整 SQL/table/index/trigger/xinfo manifest、所有旧 v1 行及所有新索引投影在显式 snapshot 中校验；读结果来自同一事务。每次写入前后检查既有完整行，operational SQLite 错误保持固定 `sqlite`，不泄露原始 message/路径。

reserve 先提交不可读的 staged 记录；文件以 UUID 受控定位，exclusive write、大小上限、flush、rename、目录 flush；业务事务重验 fence/正文完整性后才发布 available。失败保留不可读 reservation/孤儿，正常恢复回收不从文件名推断业务成功。staging 不进入普通查询、模型或备份。正文 hash/大小只在 content_object，可清除，不复制进 immutable 审计。

独占协调者使用 `data-root/coordinator-lock.sqlite` 和 `control-root/coordinator-lock.sqlite` 的 SQLite EXCLUSIVE 事务作为进程 mutex。它们没有业务/控制记录，不是真源；进程退出由 OS/SQLite 释放，文件不删除，不复制进业务备份。业务真源仍只有 `product.sqlite`，恢复控制真源仍只有独立 journal。当前测试平台为 Linux；不据此声明 Windows 支持或任意硬件断电保证。

## 遗忘与恢复隔离

FORGET/SOURCE_SUPPRESS/PRIVACY_RESTRICT/RETENTION_SHORTEN/RESTORE_BEGIN 使用独立控制日志与校验 head，先 durable intent 再业务投影。两处写入不是原子事务：短窗口 gate 阻止读取/发布；失败保持 recovery_required，启动先 reconcile。已 durable 的合法 log-ahead 通过显式记录推进 head；坏尾、缺失、错误身份/水位拒绝，不能空初始化修复。

逻辑遗忘遍历必要依赖并即时拒绝旧正文与迟到引用；控制记录只保留受控身份，不保留正文指纹。隐私收紧保留仍获准正文但有效读取为 local-only；保留期限只缩短不延长。每项读取独立检查资格/有效时间，正常过期不被误报为全库损坏。

清除按 `file/staging/database/wal/projection/cache/artifact/backup` 报告。当前注册的本地文件/数据库指纹/WAL可分别 pending/purged/failed；当前实现不管理的类别明确 outside，不能将其当作全体副本已清除。`purgeContent` 只处理已 revoked 的受管 ID，不接收任意文件路径；WAL checkpoint 可独立重试，secure_delete+TRUNCATE 也不是 SSD 介质级销毁承诺。

`createSyntheticRecoveryCoordinatorV2` / `openSyntheticRecoveryCoordinatorV2` 提供最小合成恢复协调者。它在独立 `recoveryRoot` 的 generations/snapshots 下管理受控副本，持有额外容器 mutex；独立 `controlRoot` 保留可信目录、当前 generation 选择与清除记录。只有 `captureSnapshot(snapshotId)` 能登记来源：真实已验证且静止的 SQLite 一致副本、当前仍合格正文的精确清单/摘要、安装/Schema/控制水位完成 flush 后，才登记不随副本回滚的 catalog。staged/revoked/到期正文使 capture 拒绝，必须先按明确清理路径处理；没有任意路径导入、扫描自动登记、注入验证器或 `accepted:true` 证明。

`restoreSnapshot({snapshotId,generationId,operationId})` 先核对独立 catalog 与有界、严格路径的精确库存/摘要，再复制至新隔离 generation；关闭旧 store 后，候选正常 open 施加当前独立 journal 的遗忘、隐私和保留约束。随后 durable RESTORE_BEGIN 创建新 recoveryEpoch，隔离旧 Outbox；全量验证/checkpoint、同步候选与切换凭据后，在候选仍持有控制 mutex 时以同目录 atomic rename 切换可信 active 清单。候选不提前交给消费者，旧 store 引用保持 closed。重开核对可信清单、候选凭据、catalog 来源与当前控制水位；部分切换临时文件 fail closed，不能自动挑选孤儿候选或倒退恢复世代。失败后可重开仍被选中的旧库并施加当前世代，或保持 recovery_required。

`listManagedRecoveryCopies()` 将登记/未登记 snapshots 和 inactive generations 如实列为 pending/failed/purged。`purgeInactiveRecoveryCopies()` 是显式、整份副本清理：先在独立控制区持久撤销 snapshot 恢复资格，再删除精确受管正文/数据库/WAL/清单文件并同步目录；活动 generation 永远排除，inactive generation 清理持有其数据 mutex，永久空 mutex 与无正文审计身份保留。失败逐项报告，重试不撤销已持久的失效。它不接收任意路径，不做 P4 选择性重打包；没有副本或清除记录不能冒充执行过清除。使用恢复协调者的消费者必须调用其 `managedCopies(scope,ref)` 合并结果：任一仍保留的恢复副本使 backup 至少 pending；base store 的 backup/outside 只表达 base store 自身不拥有恢复目录。外部复制品、介质级残留仍在保证范围外。

当前不存储 Grant/会话凭据；P1-04 的执行绑定、ownerEpoch 与输入记录只用于受控协调/历史核对，不能从恢复历史取得执行权限。上述明文、受控合成 source/catalog 是 P1 最小开发闭环，也是 trusted-caller 接线合同。raw synthetic opener 本身不机械强制 active-generation 所有权；未来服务/Launcher 只能通过 coordinator 选择 generation，不得直接打开 inactive generation。当前没有任何生产消费者，也不是生产备份产品。P4 的 age/ZIP codec、vault、加密备份来源认证、跨安装导入与生产服务接线仍未实现。

## 证据与限制

正常开发验证包括真实隔离临时 SQLite、合成正文的提交/纠正/重开/幂等/CAS/回滚、元数据分离、隐私与过期、受管副本和正常进程锁退出。仓库固定 Node22.23.1/npm10.9.8 执行完整 `npm run check`，最终精确结果记录在 PR。

历史 #90/preintegration-safety、旧 private 替换/重建/备份攻击复现及等价争议动态诊断不执行，也不换环境绕过。journal 故障窗口、旧备份攻击/损坏恢复和完整 Z05/Z06/Z07 产品场景中未运行部分明确 `not_run`，用户随后验收不被合成单测替代。D-04/D-08、原任务验收 DAG、真实数据/模型/权限接入门不变。

恢复协调者目前只执行纯 manifest/activation 输入合同测试与严格类型检查；capture、隔离旧备份恢复、切换故障窗口、恢复副本清除及重启验收均为 `not_run`。这些路径已实现但没有动态通过证据，不能因 parser 测试通过就宣称 Z07 或整条 P1-02 产品验收完成。受限场景未写成绕过或跳过的可执行诊断。

代码回退通过新受审 PR。已应用 0002 不能让旧软件直接打开，不做 down migration；迁移前一致副本与当前控制状态必须保留，失败事务回滚，后续只允许前向修复或满足当前 journal 的隔离恢复，绝不能回生已遗忘数据。


## P1-04 合成 Task/Session 存储（Schema 3）

[#116](https://github.com/ntygod/zhiwei-next/issues/116) 在相同 `product.sqlite` 追加固定 `0003_task_session_v1.sql`。`0001/0002`、Runtime v1 和既有 Ledger 入口不变；旧 v1/v2-only opener 拒绝更高版本。产品 opener 使用固定前向链，并在迁移同一事务中验证已有完整领域/正文投影。Schema、STRICT、索引/触发器 manifest、PRAGMA 及完整行校验继续 fail closed。没有迁移 override 或 down migration。

`taskPersistence` 是合成组合根一次注入、固定捕获的同步无 I/O reducer、实例身份、内容政策和 ID 来源。HTTP 不接受 Task/Attempt/Outcome/历史对象或验证开关。`store.tasks` 从锁定的当前 Task 计算持久 CAS，独立检查正式 parser、连续 revision、不可变 intent/attempt/outcome 前缀和状态不变量。CREATED→READY、CANCELLING→CANCELLED 等所有中间版本都持久保存。状态、真实用户输入 Observation、WorkingState、幂等 receipt 与任务 Outbox 同事务，注入时钟每事务只读取一次。

P1-04 没有任务成功验证器。Runtime settled 原子进入 VERIFYING，不能当成功；已实际停止的中断仅能产生 all-unknown/incomplete 的 UNVERIFIABLE Outcome。P1-07 才实现正式成功验证与 Episode 消费者。历史终态 attempt 和已有 Outcome 不原位重写。

WorkingState 的旧通用认知入口保持 unsupported；专用 Task 入口保存真实 Task/attempt/intent/revision 及 Observation 证据。默认快照记录已提交 Task 状态；固定 reducer 也可返回与版本一一对应、非空 known/unknown/pendingInput/nextSteps 的完整状态。每个引用、时间、Scope、隐私与必要内容依赖均验证，独立更新必须伴随合法 Task revision，不开放任意覆写。

SessionContract 六类 profile、输入、Task 历史和工作正文使用原 `content_object` 生命周期。新 Daemon 先提高 Session ownerEpoch、发布 owner-fenced 状态、使旧 owner 写入失效，不自动派发。显式认证继续/重试登记新 attempt 后才能重新取得执行资格。旧 ALLOCATED/已派发绑定没有真实 EOF/close 证据时不能假设已停止；恢复 epoch 也不能充当无外部副作用证明。旧 owner 未关闭执行显示 `recovery-blocked`，新用户命令返回 `recovery_required`，不把取消意图部分写成不可恢复的 CANCELLING；已有命令 receipt 仍可按原语义重放。

新 owner 可调用不接受自报 close 字段的 `recoverExecutionClose`。固定组合根 `recoveryCustody.observedClose` 只读取受控 Supervisor 已实际观察的完整 EOF/close 记录，精确回显持久 spec、binding 与 execution revision；Store 独立验证新 owner、旧 lease、当前 attempt 和 CAS，再追加保留旧身份的 STOPPED 历史。缺失 custody/证据保持 unavailable 与 recovery-blocked；不会扫描 PID、猜测孤儿进程已消失或凭 owner fence 伪造停止。跨进程实际 custody 缺失时保持明确受阻，不能默认重试。

`store.executions` 先持久 ALLOCATED spec、实际 runtime_input 和 fence，再由可信主机启动；实际 READY 及单调扩展来源映射先于事件，dispatched 先于运行派发。完整 EOF/close 才显示 closed。模型请求的确切受控上下文在 receiver 前记录为独立 model_request，仅证明已捕获输入，不冒称发送 Exposure。`readExecutionDetails`、`listRuntimeInputs`、`listModelRequests` 从重开的受管正文重建真实输入。

来源 transport 实现标识与原始 package 标识是不同命名空间。一次性 `runtimeSourceIdentity` 由可信组合根固定，随执行正文保存；Store 没有 Provider 特例、每事件映射器或客户端覆盖。完整 Worker/binding/native Session/source stream 身份逐项匹配。当前有界实现每个 attempt 只允许一个 durable binding；同 binding 精确重放不新增记录，再次执行必须经过显式新 attempt，不能暗中复用旧租约。最新执行按经验证的 Task allocation revision 选择，不以隐式 rowid 充当历史真源。保留 Runtime v1 原始严格递增 source sequence；不同 Surface 可能共享上游计数器，数字跳跃本身不证明丢失，不重编号或伪造连续性。倒序、已占来源槽冲突拒绝，exact replay 返回原确认。settled 事件、checkpoint、Task VERIFYING、Outbox 与最终确认游标一次事务提交，失败全部回滚。

任务事件是独立 `task-session-v1` 投影流，`task_outbox_v1` cursor 不是认知 Outbox 的通用数据库提交号。读快照、校验与 cursor 在同一 SQLite snapshot；消费者顺序推进并按 eventId 去重。消费者必须指向正数的同 Workspace 游标；当前世代 published/pending 与已确认前缀严格对应，旧世代事件只能 quarantined。每个 Session/Task/input/progress 事件双向校验实际聚合、版本、Workspace、owner、时间与来源；孤立 canonical 事件也按 corruption 拒绝。Session 的不可变 revision 历史精确记录 daemon、ownerEpoch、固定 contractRevision=1、重授权状态、恢复世代、时间与事件游标；当前行和每个事件均有双向历史链接。恢复历史只关联本 Store 已应用的控制记录，每条实际恢复转换增加一次 owner/revision，不从世代差推算虚构转换。当前没有删除/压缩事件的保留窗口，未知或跨 Workspace cursor 拒绝。外部不透明 token 的主体、Scope 和恢复 generation 绑定由 API 层负责。

所有 Task/Session/输入/WorkingState/spec/envelope/model_request/命令比较资料都在受管文件，SQL 不复制永久正文或指纹。内部版本化正文 envelope 包含精确必要依赖，与 SQL 依赖投影比对；Session→命令→Task→执行/模型的闭包参与原 FORGET/隐私/保留/恢复控制。事务失败文件为不可读孤儿，原 collector 回收。命令 receipt 必须覆盖同事务全部连续版本，并指向该命令最后一个状态事件；输入顺序、Task/Attempt 标量状态、精确可保留依赖角色和依赖图无环性在正文失效后仍校验。已清除的 request、criteria、WorkingState 额外证据选择及模型上下文不重建，也不声称仍可验证其语义。最小 receipt 定位键按原合同留在受限数据库；可清除比较/结果正文到期或已清除后返回 unavailable，绝不重新执行，不把哈希称为匿名化。

恢复协调者接受固定 `taskPersistence` 并传入每个重开 store；服务必须由协调者选择 active generation。RESTORE_BEGIN 隔离旧任务 Outbox、提高 Session epoch，不恢复运行授权。Schema 2 历史清单可以经明确前向迁移读取；清单解析成功不是恢复证明。现有 capture/备份攻击/隔离恢复/切换故障窗口等未运行路径保持 not_run；不执行旧 #90、Private 替换/备份攻击或等价受限诊断。

验证仅使用虚构输入和真实隔离临时 SQLite；精确当前 HEAD 的 Node22.23.1/npm10.9.8 类型、事务、迁移、完整行、生命周期与正常进程重开结果在交付记录。产品验收始终 not_run，真实个人数据、模型、凭据、外部副作用和部署不启用。回退关闭新入口并排空 Worker，保留独立控制日志；不允许旧软件打开 Schema 3，也不通过恢复回生已遗忘正文，只能兼容软件或受审前向修复。


#### 历史接纳与未启动收尾

Execution allocation 同事务保存实际 global/workspace cognition/policy 四个不可变接纳 epoch，供历史 spec 精确投影校验；历史 lease 只与原事务时间比较，不因现在已到期否定过去合法记录。Task 相邻版本、跨 attempt 时间和新 attempt 的 Session 再授权在正文失效后仍双向检查；settled receipt 的来源关系不能通过改名跳过。

受控 Runtime 的 `processDisposition: not_spawned` 证明只适用于关闭 spawn admission 后从未创建 child 的 ALLOCATED 执行。Store 要求未 dispatch、未观察 native Session/stream、无 EOF/close 迹象，再追加 STOPPED；原 ALLOCATED 事实保留。READY/BUSY 和未知进程状态不能借此收尾。完整字段与失效边界见[完整性覆盖清单](task-session-integrity-coverage.md)。


必要的 execution proof 依赖不随命令正文清除而变成可选：start、关闭确认、interrupted 及确实依赖旧绑定闭合的用户停止/新 attempt 命令，都逐版本保留对应真实 snapshot。没有当前 attempt execution 的取消仍合法。

真实 execution 首次完整闭合还会在同一事务发布 `task.execution_closed`，使用当前 Task revision 和严格 binding/execution revision 引用；旧 lease 不改写。它推进持久投影 cursor，使 custody 恢复解除 blocked 后可从 replay/SSE观察，exact replay不重复。后续独立关闭不会改写原 settled ACK 或命令 receipt 的历史水位。
