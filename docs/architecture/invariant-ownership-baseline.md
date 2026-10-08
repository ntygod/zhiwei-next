# G-1 不变量归属与调用证据基线

状态：**决策资料，不是运行时 registry 或 G-1 完成证明**。取证基线为 `main@f0fb58c9095aeca5121f9e196b158f7fda2ad442`（PR #69 合入；PR #73 的规划资料已在其祖先中）。当前工作为 [Issue #74](https://github.com/ntygod/zhiwei-next/issues/74)，分支 `docs/74-core-boundary-baseline`；不改产品实现、协议、迁移或质量门。

## 如何读取

“owner”是唯一语义定义者，不是所有调用点必须位于该包。下面的 ID 是本文局部审计键，不是 Runtime eventId、能力 ID 或产品 API。现有代码事实与未来拟议合同分开；测试名称对应源文件中的实际 test 名，不能用一个正例推断完整功能。执行结果以当前 PR 的 exact-head 记录为准，测试存在不等于本次已经运行。

相关提案：[核心/包归属 ADR 0007](../adr/0007-hard-core-soft-shell-ownership.md)、[会话记录 ADR 0008](../adr/0008-session-record-reconstruction-boundary.md)、[Schema 演进 ADR 0009](../adr/0009-ledger-schema-evolution-boundary.md)。三个提案均 Proposed，不改变已接受 ADR。

## #67 父需求映射与能力角色

[owner-input #67](https://github.com/ntygod/zhiwei-next/issues/67)要求 Hard Core、Session Contract 和 package-owned Runtime Invariants 三类核心决策。此处 ADR 0007 同时提出核心边界和包归属，ADR 0008 提出会话合同边界；ADR 0009 是执行计划额外要求的 D-02 资料，**不是 #67 第三份核心 ADR 的替代验收**。三份新提案并不代表父项“三份核心 ADR 被接受”已经满足；必要的独立包归属 ADR/接受记录由后续决策任务完成。#67 保持开放，原文清单不自动勾选。

| 当前 seam/角色 | Definition | Provider / 实现机制 | Consumer | 核心/外壳及成熟度 |
|---|---|---|---|---|
| Runtime 事件边界 | `protocol` 的 NormalizedRuntimeEventV1、公开 create/parse | `pi-adapter.normalizePiRuntimeEventV1` | `memory-store` 正式 Ledger；Trace 调用者 | 协议是核心、Pi 投影是外壳；不是正式 AgentRuntime 启停接口 |
| Ledger 调用边界 | `memory-store` 公开 open/append/read 类型 | `SqliteObservationLedgerV1` | 当前测试；未来 Daemon 组合 | 核心语义与 SQLite 机制在同包内显式分工；没有第二实现或通用存储 Provider |
| Context 哨兵 | `context-compiler` 的 ContextRequest/ContextCapsule | `compileContext` | 当前测试，M2 才产品化 | 核心过滤不可关闭；不存在 ContextContributor registry |
| 迁移时钟 seam | `memory-store` 的 OpenSqliteObservationLedgerOptions.clock | 调用方注入 MigrationClock，缺省使用 Store 边界时钟 | 固定迁移安装过程 | 测试确定性边界；不影响协议时间由调用方注入的约束 |

Retrieval、Connector、DelegationExecutor 和 ExecutionPolicy Provider 仍是未来需求，不创建空接口。#67 的稳定配置 ID、明确资源 owner/disposer、last-known-good 与权限撤销审计保留为后续合同：M0 不搭建动态生命周期 Host。模型/工具普通变化默认不隐式改写既有 SessionContract，具体切换与权限收紧语义须经各自决策，不能由本目录代替安全实现。

## 已实现的正式 v1 边界

测试文件简称只用于下表；均可从链接直接定位测试名：

- P：[runtime-event-v1.test.ts](../../packages/protocol/src/runtime-event-v1.test.ts)
- T：[runtime-event-stream-v1.test.ts](../../packages/protocol/src/runtime-event-stream-v1.test.ts)
- A：[normalized-runtime-event-v1.test.ts](../../packages/pi-adapter/src/normalized-runtime-event-v1.test.ts)
- L：[sqlite-observation-ledger.test.ts](../../packages/memory-store/src/sqlite-observation-ledger.test.ts)
- L3：[sqlite-observation-ledger-r2-third.test.ts](../../packages/memory-store/src/sqlite-observation-ledger-r2-third.test.ts)
- L5：[sqlite-observation-ledger-r2-fifth.test.ts](../../packages/memory-store/src/sqlite-observation-ledger-r2-fifth.test.ts)

| 不变量 ID / 唯一 owner | 实际公开调用入口 | 正证据 | 反证据 / 限制 |
|---|---|---|---|
| I-EVENT-SHAPE / `protocol`：闭合形状、版本、canonical body/身份 | [createNormalizedRuntimeEventV1 / parseNormalizedRuntimeEventV1](../../packages/protocol/src/runtime-event-v1.ts)；Adapter 调用 create，Ledger 调用 parse，二者复用 protocol 的核心形状/扩展断言 | P: `v1 canonical body, source-slot event ID and idempotency key have fixed golden vectors` | P: `parser fails closed for protocol, identity, phase and global-order drift`；只验证单事件，不证明目标存在 |
| I-TRACE-RELATIONS / `protocol`：同域严格顺序、先行关联、完整回放 | [parseNormalizedRuntimeEventTraceV1 / assertReplayableNormalizedRuntimeEventTraceV1](../../packages/protocol/src/runtime-event-stream-v1.ts) | T: `independent sequence domains may both start at one without implying a total order` | T: `Tool links cannot borrow a declaration from another Agent Run or Runtime instance`、`explicit links cannot point forward`、`complete replay fails closed on required unknown vocabulary`；调用方须提供足够 Trace，不等于单批 append |
| I-PI-PROJECTION / `pi-adapter`：字段级投影，不发明关联 | [normalizePiRuntimeEventV1](../../packages/pi-adapter/src/normalized-runtime-event-v1.ts) → protocol | A: `State and Messages snapshots are projected field-by-field instead of passing raw Pi objects` | A: `Adapter does not invent missing correlation IDs`；不能证明正式 Worker 已接入 |
| I-LEDGER-IDENTITY / `memory-store`：exact replay 幂等、冲突和完整 source stream 单调 | [append / appendBatch](../../packages/memory-store/src/sqlite-observation-ledger.ts) → protocol parser | L: `SQLite Ledger appends once and exact replay returns the existing row` | L: `source-slot conflict is rejected before it can become a duplicate row`、`sequence monotonicity is scoped to the complete v1 source stream`；eventId 规则仍归 protocol |
| I-LEDGER-ATOMICITY / `memory-store`：批次不部分提交 | appendBatch | L: `batch replay prefix and new suffix are atomic and preserve result identity` | L: `a later batch conflict rolls back all earlier inserts in that batch`；L3: `batch conflicts and reverse sequence preserve the exact cursor state`；不证明上游确认点 |
| I-LEDGER-READ / `memory-store`：Scope/cursor 隔离、canonical 行与投影、单 snapshot | readSession / readWorkspace / getByEventId 等[公开读入口](../../packages/memory-store/src/sqlite-observation-ledger.ts) | L: `row cursor replay keeps Workspace and Runtime Session isolated`；L3: `every business read uses one validated SQLite snapshot` | L: `DB read rejects a denormalized projection that differs from canonical event_json`；数据库隔离不等于 HTTP 客户端身份认证 |
| I-LEDGER-SCHEMA / `memory-store`：完整安装态、PRAGMA、integrity fail closed | openSqliteObservationLedgerV1；读/写边界继续验证 | L: `file Ledger uses WAL and replays the same validated event after reopen` | L5: `post-open hidden-prefix Schema drift fails every public read/write and integrity boundary`；L: `integrity check cannot be disabled and accepts only one exact ok row`；无产品级 Provider 组合测试 |
| I-LEDGER-IMMUTABILITY / `memory-store`：append-only、固定迁移与原子历史 | openSqliteObservationLedgerV1；append / appendBatch；模块私有迁移源 | L: `migration source file is stable UTF-8 SQL`；文件重开正例见 I-LEDGER-SCHEMA | L3: `INSERT OR REPLACE and REPLACE cannot rewrite Runtime or migration history`、`public Ledger API ignores migration overrides and hides migration execution seams`、`pending migration installation and metadata roll back when final validation fails`；不证明未来新领域表升级 |
| I-LEDGER-ERROR / `memory-store`：SQLite operational 错误稳定分类 | 公开 open/read/write/close 边界 | L 的正常 open/append/read；语义冲突例见 I-LEDGER-IDENTITY | L5: `real SQLITE_FULL during metadata installation retains sqlite category and atomic rollback`；L3: `DatabaseSync constructor and close failures use the stable sqlite contract`；不是所有硬件故障持久性承诺 |

Runtime 事实分类/来源还由已接受 [ADR 0005](../adr/0005-normalized-runtime-event-v1.md)及其关联专项测试限定。上述目录是有限基线，不穷举 v1 每一个字段断言，也不替代已存在的完整测试矩阵。

## 架构哨兵与明确缺口

| 不变量 ID / 唯一 owner | 当前入口及证据 | 不能外推的能力 |
|---|---|---|
| I-EVIDENCE / `domain`：非空证据 ID、置信度范围 | [assertEvidence/assertConfidence](../../packages/domain/src/index.ts)；[correctClaim 的无证据负例](../../packages/cognition-core/src/index.test.ts) | 没有查证 Observation 存在、同 Scope、可信来源；不能称完整 Claim 接受验证 |
| I-CORRECTION / `cognition-core`：返回 superseded 与新版本 | [correctClaim](../../packages/cognition-core/src/index.ts)；[explicit correction supersedes the old claim and activates a new version](../../packages/cognition-core/src/index.test.ts)，同文件无证据负例 | 没有持久化原子 supersede、并发/有效时间/重复 Claim ID 合同；`InMemoryCognitionStore.putClaim` 可覆盖同 ID，只是 bootstrap |
| I-CONTEXT-SCOPE / `context-compiler`：先过滤 active/Scope 再排序 | [compileContext](../../packages/context-compiler/src/index.ts)；[workspace compilation never leaks a claim from another workspace](../../packages/context-compiler/src/index.test.ts) 同时保留 A/排除 B | 仅单一跨 Workspace 哨兵；没有去重测试/实现，未完成状态与预算矩阵；浅 freeze 不证明深层不可变；M0 不注入 Context |
| I-BOOTSTRAP-OBSERVATION / `memory-store`：内存 Observation 拒绝重复 ID | [InMemoryCognitionStore.appendObservation](../../packages/memory-store/src/index.ts)；[observation ledger preserves session order and rejects duplicate ids](../../packages/memory-store/src/index.test.ts) | 该哨兵按 occurredAt 排序，不能替代正式 Ledger 的 source/cursor 合同、持久性或 Workspace 查询 |

域 ID 构造器只是 trim/非空检查，不负责全局唯一性。协议 eventId、Ledger row identity、bootstrap Observation ID 和未来目录 ID 的重复语义不同，不能用一个“duplicate ID”测试宣称全部覆盖。

## 组合与配置边界

当前 [Daemon](../../apps/daemon/src/index.ts)只有 `/health`、`/v1/meta` 和 404；尚未组合 Ledger/正式 Worker，也不存在运行中的 Provider registry。`ZHIWEI_HOST`/`ZHIWEI_PORT` 是 bootstrap 监听参数；[CLI](../../apps/cli/src/index.ts)的连接参数也是产品入口参数。它们不是 [harness.config.json](../../harness.config.json) 的字段。

`harness.config.json` 仅是仓库自治开发配置（风险、工作项、CI、合并、停机与来源审计）。当前上述产品入口不读取它。拟议产品配置应有独立的校验、revision 与 Session 引用，不能由 Harness `risk`、review 或 developmentPause 推导产品授权。独立产品配置加载器及半应用拒绝尚未实现，不新建无消费者的 config 文件。

后续 D-10 接受/有限静态实验需要区分：

| 失败路径 | 当前证据 | 待证明 |
|---|---|---|
| 重复不变量/能力 ID | 本目录人工核对无重复；不是可执行校验 | 注入重复目录项时静态检查明确失败 |
| 无 owner / 多 owner | 表格每项一个语义 owner；调用者不是 owner | 删除/重复 owner、指向不存在包/入口/测试时明确失败 |
| Provider 关闭核心校验 | Ledger 固定迁移、不允许关闭 integrity 的局部负例 | 静态组合声明/实际入口拒绝关闭校验；不把静态 JSON 检查说成 runtime sandbox |

本切片范围不实现正式 checker 或产品组合入口。D-10 仍 Proposed，但允许先开展独立合成实验/Spike（包括目录一致性检查负例）补足决策证据；受约束的正式入口在决策接受后接入。已有 `check:architecture` 仅扫描部分包的 `.ts` 导入文本防 Pi 越界；并未完整验证包依赖图、所有导入形式或动态加载。不能把它的绿色结果当成未来 composition 检查已交付。

## G-1 剩余工作与验证

本切片完成可复核的边界提案与现状目录；完整 G-1 尚需 D-01/D-02/D-10 的实验证据、正式接受与审查记录，以及按真实需要的有限映射/组合验证。D-05 只在会话 ADR 中澄清摄取确认与投影的交界，仍归后续 M0-6 定案；G-2…G-5 不因本文件自动放行。

在当前提交运行 `npm run check`、`node scripts/check-execution-plan.mjs`、`git diff --check`；新独立 R2 审查与真实 CI 绑定最终完整 HEAD。当前没有新 runtime 行为，正反行为证据复用当前完整测试，不将未来失败路径写成已通过。文档和机械依赖表对齐可 revert；不修改 migration 1、正式 v1、已接受门禁、Runtime/provenance 证据或 owner-input 正文。
