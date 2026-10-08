# G-1 不变量归属与调用证据基线

状态：**决策资料，不是运行时 registry 或 G-1 完成证明**。G-1a 已由 PR #75 合入；本轮取证基线为 `main@e2dfa854585cb8365c17ffea6b95a491ad8e8636`。当前工作为 [Issue #76](https://github.com/ntygod/zhiwei-next/issues/76)，分支 `spike/76-invariant-ownership-evidence`；增加独立 opt-in 实验，不改产品实现、协议、迁移或质量门。

## 如何读取

“owner”是唯一语义定义者，不是所有调用点必须位于该包。下面的 ID 是本文局部审计键，不是 Runtime eventId、能力 ID 或产品 API。现有代码事实与未来拟议合同分开；测试名称对应源文件中的实际 test 名，不能用一个正例推断完整功能。执行结果以当前 PR 的 exact-head 记录为准，测试存在不等于本次已经运行。

相关提案：[核心边界 ADR 0007](../adr/0007-hard-core-soft-shell-ownership.md)、[会话记录 ADR 0008](../adr/0008-session-record-reconstruction-boundary.md)、[Schema 演进 ADR 0009](../adr/0009-ledger-schema-evolution-boundary.md)、[包归属 ADR 0010](../adr/0010-package-owned-invariant-catalog.md)。四个提案均 Proposed，不改变已接受 ADR。

## #67 父需求映射与能力角色

[owner-input #67](https://github.com/ntygod/zhiwei-next/issues/67)要求 Hard Core、Session Contract 和 package-owned Runtime Invariants 三类核心决策。ADR 0007 提出核心边界，ADR 0008 提出会话合同边界，独立 ADR 0010 承接从 0007 分出的包归属；ADR 0009 是执行计划额外要求的 D-02 资料，**不是 #67 第三份核心 ADR 的替代验收**。分开提案并不代表父项“三份核心 ADR 被接受”已经满足；三项接受记录仍待后续决策任务完成。#67 保持开放，原文清单不自动勾选。

| 当前 seam/角色 | Definition | Provider / 实现机制 | Consumer | 核心/外壳及成熟度 |
|---|---|---|---|---|
| Runtime 事件边界 | `protocol` 的 NormalizedRuntimeEventV1、公开 create/parse | `pi-adapter.normalizePiRuntimeEventV1` | `memory-store` 正式 Ledger；Trace 调用者 | 协议是核心、Pi 投影是外壳；不是正式 AgentRuntime 启停接口 |
| Ledger 调用边界 | `memory-store` 公开 open/append/read 类型 | `SqliteObservationLedgerV1` | 当前测试；未来 Daemon 组合 | 核心语义与 SQLite 机制在同包内显式分工；没有第二实现或通用存储 Provider |
| Context 哨兵 | `context-compiler` 的 ContextRequest/ContextCapsule | `compileContext` | 当前测试，M2 才产品化 | 核心过滤不可关闭；不存在 ContextContributor registry |
| 迁移时钟 seam | `memory-store` 的 OpenSqliteObservationLedgerOptions.clock | 调用方注入 MigrationClock，缺省使用 Store 边界时钟 | 固定迁移安装过程 | 测试确定性边界；不影响协议时间由调用方注入的约束 |

Retrieval、Connector、DelegationExecutor 和 ExecutionPolicy Provider 仍是未来需求，不创建空接口。#67 的稳定配置 ID、明确资源 owner/disposer、last-known-good 与权限撤销审计保留为后续合同：M0 不搭建动态生命周期 Host。模型/工具普通变化默认不隐式改写既有 SessionContract，具体切换与权限收紧语义须经各自决策，不能由本目录代替安全实现。

<!-- ownership-catalog:start -->

以下两表由 [catalog.json](../spikes/invariant-ownership/catalog.json) 生成；不得手工维护第二份映射。公开入口从所属包的 `src/index.ts` 验证，精确测试名通过真实 Node 测试执行验证。角色/限制仍需人工审查，测试通过不自动证明 owner 正确或功能完整。

## 已实现的正式 v1 边界

| 不变量 ID / 唯一 owner | 公开入口 | 已有正反测试 | 限制 |
|---|---|---|---|
| I-EVENT-SHAPE / `protocol`：闭合形状、版本、canonical body/身份 | [createNormalizedRuntimeEventV1](../../packages/protocol/src/index.ts)；[parseNormalizedRuntimeEventV1](../../packages/protocol/src/index.ts) | 正：[v1 canonical body, source-slot event ID and idempotency key have fixed golden vectors](../../packages/protocol/src/runtime-event-v1.test.ts)；反：[parser fails closed for protocol, identity, phase and global-order drift](../../packages/protocol/src/runtime-event-v1.test.ts) | Adapter 调用 create、Ledger 调用 parse，复用 protocol 断言；只验证单事件，不证明目标存在。 |
| I-TRACE-RELATIONS / `protocol`：同域严格顺序、先行关联、完整回放 | [parseNormalizedRuntimeEventTraceV1](../../packages/protocol/src/index.ts)；[assertReplayableNormalizedRuntimeEventTraceV1](../../packages/protocol/src/index.ts) | 正：[independent sequence domains may both start at one without implying a total order](../../packages/protocol/src/runtime-event-stream-v1.test.ts)；反：[Tool links cannot borrow a declaration from another Agent Run or Runtime instance](../../packages/protocol/src/runtime-event-stream-v1.test.ts)；反：[explicit links cannot point forward](../../packages/protocol/src/runtime-event-stream-v1.test.ts)；反：[complete replay fails closed on required unknown vocabulary](../../packages/protocol/src/runtime-event-stream-v1.test.ts) | 调用方须提供足够 Trace，不等于单批 append。 |
| I-PI-PROJECTION / `pi-adapter`：字段级投影，不发明关联 | [normalizePiRuntimeEventV1](../../packages/pi-adapter/src/index.ts) | 正：[State and Messages snapshots are projected field-by-field instead of passing raw Pi objects](../../packages/pi-adapter/src/normalized-runtime-event-v1.test.ts)；反：[Adapter does not invent missing correlation IDs](../../packages/pi-adapter/src/normalized-runtime-event-v1.test.ts) | 复用 protocol；不能证明正式 Worker 已接入。 |
| I-LEDGER-IDENTITY / `memory-store`：exact replay 幂等、冲突和完整 source stream 单调 | [SqliteObservationLedgerV1.append](../../packages/memory-store/src/index.ts)；[SqliteObservationLedgerV1.appendBatch](../../packages/memory-store/src/index.ts) | 正：[SQLite Ledger appends once and exact replay returns the existing row](../../packages/memory-store/src/sqlite-observation-ledger.test.ts)；反：[source-slot conflict is rejected before it can become a duplicate row](../../packages/memory-store/src/sqlite-observation-ledger.test.ts)；反：[sequence monotonicity is scoped to the complete v1 source stream](../../packages/memory-store/src/sqlite-observation-ledger.test.ts) | 入口复用 protocol parser；eventId 规则仍归 protocol。 |
| I-LEDGER-ATOMICITY / `memory-store`：批次不部分提交 | [SqliteObservationLedgerV1.appendBatch](../../packages/memory-store/src/index.ts) | 正：[batch replay prefix and new suffix are atomic and preserve result identity](../../packages/memory-store/src/sqlite-observation-ledger.test.ts)；反：[a later batch conflict rolls back all earlier inserts in that batch](../../packages/memory-store/src/sqlite-observation-ledger.test.ts)；反：[batch conflicts and reverse sequence preserve the exact cursor state](../../packages/memory-store/src/sqlite-observation-ledger-r2-third.test.ts) | 不证明上游确认点。 |
| I-LEDGER-READ / `memory-store`：Scope/cursor 隔离、canonical 行与投影、单 snapshot | [SqliteObservationLedgerV1.readSession](../../packages/memory-store/src/index.ts)；[SqliteObservationLedgerV1.readWorkspace](../../packages/memory-store/src/index.ts)；[SqliteObservationLedgerV1.getByEventId](../../packages/memory-store/src/index.ts)；[SqliteObservationLedgerV1.getByIdempotencyKey](../../packages/memory-store/src/index.ts)；[SqliteObservationLedgerV1.countEvents](../../packages/memory-store/src/index.ts) | 正：[row cursor replay keeps Workspace and Runtime Session isolated](../../packages/memory-store/src/sqlite-observation-ledger.test.ts)；正：[every business read uses one validated SQLite snapshot](../../packages/memory-store/src/sqlite-observation-ledger-r2-third.test.ts)；反：[DB read rejects a denormalized projection that differs from canonical event_json](../../packages/memory-store/src/sqlite-observation-ledger.test.ts) | 数据库隔离不等于 HTTP 客户端身份认证。 |
| I-LEDGER-SCHEMA / `memory-store`：完整安装态、PRAGMA、integrity fail closed | [openSqliteObservationLedgerV1](../../packages/memory-store/src/index.ts)；[SqliteObservationLedgerV1.integrityCheck](../../packages/memory-store/src/index.ts)；[SqliteObservationLedgerV1.assertIntegrity](../../packages/memory-store/src/index.ts) | 正：[file Ledger uses WAL and replays the same validated event after reopen](../../packages/memory-store/src/sqlite-observation-ledger.test.ts)；反：[post-open hidden-prefix Schema drift fails every public read/write and integrity boundary](../../packages/memory-store/src/sqlite-observation-ledger-r2-fifth.test.ts)；反：[integrity check cannot be disabled and accepts only one exact ok row](../../packages/memory-store/src/sqlite-observation-ledger.test.ts) | 公开读/写边界继续验证；没有产品级 Provider 组合测试。 |
| I-LEDGER-IMMUTABILITY / `memory-store`：append-only、固定迁移与原子历史 | [openSqliteObservationLedgerV1](../../packages/memory-store/src/index.ts)；[SqliteObservationLedgerV1.append](../../packages/memory-store/src/index.ts)；[SqliteObservationLedgerV1.appendBatch](../../packages/memory-store/src/index.ts) | 正：[migration source file is stable UTF-8 SQL](../../packages/memory-store/src/sqlite-observation-ledger.test.ts)；正：[file Ledger uses WAL and replays the same validated event after reopen](../../packages/memory-store/src/sqlite-observation-ledger.test.ts)；反：[INSERT OR REPLACE and REPLACE cannot rewrite Runtime or migration history](../../packages/memory-store/src/sqlite-observation-ledger-r2-third.test.ts)；反：[public Ledger API ignores migration overrides and hides migration execution seams](../../packages/memory-store/src/sqlite-observation-ledger-r2-third.test.ts)；反：[pending migration installation and metadata roll back when final validation fails](../../packages/memory-store/src/sqlite-observation-ledger-r2-third.test.ts) | 迁移源模块私有；不证明未来新领域表升级。 |
| I-LEDGER-ERROR / `memory-store`：SQLite operational 错误稳定分类 | [openSqliteObservationLedgerV1](../../packages/memory-store/src/index.ts)；[SqliteObservationLedgerV1.append](../../packages/memory-store/src/index.ts)；[SqliteObservationLedgerV1.readSession](../../packages/memory-store/src/index.ts)；[SqliteObservationLedgerV1.close](../../packages/memory-store/src/index.ts) | 正：[SQLite Ledger appends once and exact replay returns the existing row](../../packages/memory-store/src/sqlite-observation-ledger.test.ts)；反：[real SQLITE_FULL during metadata installation retains sqlite category and atomic rollback](../../packages/memory-store/src/sqlite-observation-ledger-r2-fifth.test.ts)；反：[DatabaseSync constructor and close failures use the stable sqlite contract](../../packages/memory-store/src/sqlite-observation-ledger-r2-third.test.ts) | 语义冲突另见 I-LEDGER-IDENTITY；不是所有硬件故障持久性承诺。 |

## 架构哨兵与明确缺口

| 不变量 ID / 唯一 owner | 公开入口 | 已有正反测试 | 限制 |
|---|---|---|---|
| I-EVIDENCE / `domain`：非空证据 ID、置信度范围 | [assertEvidence](../../packages/domain/src/index.ts)；[assertConfidence](../../packages/domain/src/index.ts) | 正：[explicit correction supersedes the old claim and activates a new version](../../packages/cognition-core/src/index.test.ts)；反：[a correction without evidence is rejected](../../packages/cognition-core/src/index.test.ts) | 没有查证 Observation 存在、同 Scope、可信来源；置信度越界没有专属负例，不能称完整 Claim 接受验证。 |
| I-CORRECTION / `cognition-core`：返回 superseded 与新版本 | [correctClaim](../../packages/cognition-core/src/index.ts) | 正：[explicit correction supersedes the old claim and activates a new version](../../packages/cognition-core/src/index.test.ts)；反：[a correction without evidence is rejected](../../packages/cognition-core/src/index.test.ts) | 没有持久化原子 supersede、并发/有效时间/重复 Claim ID 合同；InMemoryCognitionStore.putClaim 可覆盖同 ID，只是 bootstrap。 |
| I-CONTEXT-SCOPE / `context-compiler`：先过滤 active/Scope 再排序 | [compileContext](../../packages/context-compiler/src/index.ts) | 正/反：[workspace compilation never leaks a claim from another workspace](../../packages/context-compiler/src/index.test.ts) | 仅单一跨 Workspace 哨兵，同时保留 A/排除 B；没有去重测试/实现，未完成状态与预算矩阵；浅 freeze 不证明深层不可变；M0 不注入 Context。 |
| I-BOOTSTRAP-OBSERVATION / `memory-store`：内存 Observation 拒绝重复 ID | [InMemoryCognitionStore.appendObservation](../../packages/memory-store/src/index.ts) | 正/反：[observation ledger preserves session order and rejects duplicate ids](../../packages/memory-store/src/index.test.ts) | 哨兵按 occurredAt 排序，不能替代正式 Ledger 的 source/cursor 合同、持久性或 Workspace 查询。 |

Runtime 事实分类/来源还由已接受 [ADR 0005](../adr/0005-normalized-runtime-event-v1.md)及其专项测试限定。本目录不是全部字段断言的穷举，也不替代完整测试矩阵。域 ID 构造器仅 trim/非空检查，不负责全局唯一性；协议 eventId、Ledger row、bootstrap Observation 与本目录 ID 的重复语义各自独立。

<!-- ownership-catalog:end -->

## 组合与配置边界

当前 [Daemon](../../apps/daemon/src/index.ts)只有 `/health`、`/v1/meta` 和 404；尚未组合 Ledger/正式 Worker，也不存在运行中的 Provider registry。`ZHIWEI_HOST`/`ZHIWEI_PORT` 是 bootstrap 监听参数；[CLI](../../apps/cli/src/index.ts)的连接参数也是产品入口参数。它们不是 [harness.config.json](../../harness.config.json) 的字段。

`harness.config.json` 仅是仓库自治开发配置（风险、工作项、CI、合并、停机与来源审计）。当前上述产品入口不读取它。拟议产品配置应有独立的校验、revision 与 Session 引用，不能由 Harness `risk`、review 或 developmentPause 推导产品授权。独立产品配置加载器及半应用拒绝尚未实现，不新建无消费者的 config 文件。

[G-1b opt-in 实验](../spikes/invariant-ownership/README.md)现在可执行目录重复 ID、缺/多 owner、无效包/入口/测试引用以及 Provider 声明关闭核心校验等负例。源目录生成上述表格并做精确比较；映射的测试通过真实 Node 子进程执行，不使用名称子串匹配。这些仍是目录/固定组合声明证据，实际正例只在合成输入与临时文件 SQLite 范围内调用已有公开入口；不是运行中的 Provider registry 或 sandbox。

D-10 仍 Proposed，受约束正式入口须在决策接受后接入。实验不注册到 `npm run check` 或 CI，不以新规则约束/豁免本任务。已有 `check:architecture` 仅扫描部分包的 `.ts` 导入文本防 Pi 越界；未完整验证包依赖图、所有导入形式或动态加载，其绿色结果不等于正式 composition 检查已交付。

## G-1 剩余工作与验证

G-1a 给出提案与现状目录，G-1b 补上单一目录及有限合成实验；完整 G-1 尚需 D-01/D-02/D-10 的实验证据、正式接受与审查记录，以及按真实需要的有限映射/组合验证。D-05 只在会话 ADR 中澄清摄取确认与投影的交界，仍归后续 M0-6 定案；G-2…G-5 不因本文件自动放行。

验证包括 [实验命令](../spikes/invariant-ownership/README.md)、`npm run check`、`node scripts/check-execution-plan.mjs`、`git diff --check`；新独立 R2 审查与真实 CI 绑定最终完整 HEAD。当前没有新产品 runtime 行为，旧正反行为证据通过真实执行核对；不将固定声明拒绝外推成未来 Host 防绕过。文档和机械依赖表对齐可 revert；不修改 migration 1、正式 v1、已接受门禁、Runtime/provenance 证据或 owner-input 正文。
