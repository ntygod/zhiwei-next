# 版本化认知持久化

P1-02 / [#112](https://github.com/ntygod/zhiwei-next/issues/112) 的代码开发入口为 `openSyntheticCognitionStoreV2`。名称有意标明当前仅合成开发；没有 Daemon、API、模型、Worker 或真实数据消费者。该入口不是启用许可，布尔 `authorized/accepted` 也不能开启生产能力。

## 版本与支持范围

- v1 的 `0001`、公开 parser、Ledger API、Fixture 和完整性验证均不改写。独立 v2 固定列表追加 `0002`，迁移后旧 `runtime_events` 仅供只读审计；旧 v1 opener 对新 schema fail closed。没有自动扫描/转换旧正文。
- Observation v2：独立 canonical 元数据、不可变内容引用、完整 stream identity、单调 source sequence/committed checkpoint、exact replay 和冲突、稳定 row cursor。gap 保持 incomplete，不把收件当作 Outcome。
- Claim：正文仅受管文件；SQL 保留不可变受控元数据/版本/证据。纠正使用持久 CAS，同事务新增版本、supersede、依赖失效、epoch、生命周期记录、Outbox。旧正文保留受政策约束的历史，不原位改成新事实。
- 同一 Claim 版本的通用 dispute/expire 状态持久入口按原 M1-4 规划留给 P1-05；当前实现纠正、FORGET、control-first 收紧与按有效时间拒绝读取，没有任意状态 override。
- Candidate、Hypothesis、Goal：正式 domain parser 验证的独立类型、规范正文、精确最小元数据投影和 revision history；指针、依赖、epoch、Outbox 同事务。不是任意 JSON Repository，也不实现 P2 学习晋升。
- Episode/WorkingState：有严格 codec/非正文投影；当前公开持久提交/读取返回固定 `unsupported`，因为其 Task/Attempt/Outcome 精确引用需要 P1-04/09 的真实任务事务。没有任意“引用已验证”开关。Procedure/P2、权限执行/预算/租约表不提前铺空壳。
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

当前范围无存储的 Grant/会话凭据/执行 lease，不能从恢复历史取得执行权限。上述明文、受控合成 source/catalog 是 P1 最小开发闭环，不能用普通 store opener 绕开 coordinator generation 选择，也不是生产备份产品。P4 的 age/ZIP codec、vault、加密备份来源认证、跨安装导入与生产服务接线仍未实现。

## 证据与限制

正常开发验证包括真实隔离临时 SQLite、合成正文的提交/纠正/重开/幂等/CAS/回滚、元数据分离、隐私与过期、受管副本和正常进程锁退出。仓库固定 Node22.23.1/npm10.9.8 执行完整 `npm run check`，最终精确结果记录在 PR。

历史 #90/preintegration-safety、旧 private 替换/重建/备份攻击复现及等价争议动态诊断不执行，也不换环境绕过。journal 故障窗口、旧备份攻击/损坏恢复和完整 Z05/Z06/Z07 产品场景中未运行部分明确 `not_run`，用户随后验收不被合成单测替代。D-04/D-08、原任务验收 DAG、真实数据/模型/权限接入门不变。

恢复协调者目前只执行纯 manifest/activation 输入合同测试与严格类型检查；capture、隔离旧备份恢复、切换故障窗口、恢复副本清除及重启验收均为 `not_run`。这些路径已实现但没有动态通过证据，不能因 parser 测试通过就宣称 Z07 或整条 P1-02 产品验收完成。受限场景未写成绕过或跳过的可执行诊断。

代码回退通过新受审 PR。已应用 0002 不能让旧软件直接打开，不做 down migration；迁移前一致副本与当前控制状态必须保留，失败事务回滚，后续只允许前向修复或满足当前 journal 的隔离恢复，绝不能回生已遗忘数据。
