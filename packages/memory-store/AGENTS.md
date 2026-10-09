# packages/memory-store/AGENTS.md

适用范围：`packages/memory-store/**`。本包负责存储端口和持久化适配，不解释认知含义。

## 边界

- 只依赖 `domain` 与 Runtime-neutral `protocol`；不得导入 Pi SDK、应用层或 UI 类型。
- Store 保存调用方已经构造的领域对象或正式版本的事件；现有 `NormalizedRuntimeEvent v1` 写读继续使用原 parser，新合同必须使用匹配版本的正式 parser，未知版本拒绝。不从文本提取记忆或判断任务成功。
- Observation Ledger 是 append-only 证据层；已写 Observation 或 Runtime Event 不做原地语义修改。
- 派生索引、缓存、FTS 和向量不是事实真源，必须可重建。

## 持久化规则

- 事件 ID/Observation ID 写入必须幂等且结果确定；exact replay、source-slot conflict、idempotency conflict 和新事件要有不同语义。
- Runtime source sequence 只在协议声明的完整 source stream 内单调；不得按墙钟时间或仅按 Surface 建立伪全序。
- Session 回放使用稳定 SQLite Row Cursor；Workspace、Runtime Session 与 Source Stream 必须隔离。
- 相关 Observation、Session 状态和 Outbox 的一致性由显式事务保证。
- SQLite 启用 WAL、外键和合理的 busy timeout；journal mode、foreign keys、busy timeout、synchronous、trusted schema、temp store 与 integrity_check 必须在每个真实连接上机械回读，公开 open API 不得提供绕过。
- 已应用迁移不可重写；修复 Schema 必须新增前向迁移，version/name/checksum/history 均 fail closed。只允许为空数据库初始化 migration metadata，已存在数据库禁止 `IF NOT EXISTS` 式静默修复。
- 数据库行中的 canonical event 与索引投影必须逐项一致；open 和每次写事务都要验证既有完整行，未知协议、非 canonical JSON 或任一投影漂移按 corruption 拒绝。每个正式 read 必须在一个显式 SQLite snapshot 内完成验证，并从同一份已验证 row 集合生成结果。
- 安装态 Schema 必须按 quote-aware table/index/trigger SQL signature、STRICT、table_xinfo 与 index_xinfo manifest 验证；quoted CHECK/RAISE literal、同名弱化对象和额外 trigger 也必须拒绝。
- 所有 SQLite operational failure（包括 constructor 与 close）统一为 `code=sqlite`，不得让原生 message 逃逸；domain conflict、sequence、migration 和 corruption 语义保持不变。
- 正式 open 只能使用模块内固定 migration source；migration 在 reference/target 执行前必须拒绝顶层 PRAGMA、transaction control 与 `END [TRANSACTION]`，每步用 `DatabaseSync.isTransaction` 证明外层事务仍存活；pending migrations、history、user_version 与最终验证一次原子提交，公开 API 不得暴露 migration override。
- UPDATE/DELETE 和 `INSERT OR REPLACE`/`REPLACE` 都不得覆写既有 Runtime row 或 migration row；row cursor 必须为正，跨行 source sequence 必须按 row_id 顺序严格递增。
- 崩溃恢复、部分写入和重启重放是核心场景，不是后续优化。

## 当前范围

当前 P0 只取得现有 v1 Ledger 的接入前/规模/恢复基线；现有内存 Claim 仍为架构哨兵。P1-02 按[数据合同](../../docs/architecture/data-and-api.md)以明确新版本和前向迁移实现正文生命周期与认知事务，P1-05 才接 FTS5/记忆服务；条件检索增强按 X2-01 的实测门，不提前引入图/向量服务。

上方既有 v1 行、Schema 与迁移完整性细则继续约束原 v1 公开入口，不因新规划放松。新正文/聚合合同使用独立版本入口与相应完整性校验；不得向 v1 塞引用、增加 override 或改写 0001。v2 的授权清除与恢复必须符合 ADR0014/0017 和新任务 R3 证据，不从设计接受推导真实清除能力。

## 测试

- SQLite 行为使用真实临时数据库，不用 Mock SQL 代替。
- 覆盖 exact replay、冲突、完整 source-stream 单调性、批量事务回滚、Cursor、Workspace/Session 隔离、进程重启、未提交事务、排序稳定性、迁移 checksum/user_version/history gap、Schema manifest、PRAGMA readback、projection corruption 与 SQLite error classification。
- 文件数据库必须证明 WAL 与 `PRAGMA integrity_check=ok`；`:memory:` 的 journal mode 单独记录，不能冒充文件 WAL。正式 Runtime 范围为 Node.js `>=22.16.0 <23`，exact-head 验证记录实际 22.x patch，并在每个新 HEAD 上重跑完整真实 `node:sqlite` 矩阵。
- 测试数据必须是虚构内容，不包含真实用户记忆、密钥或本机数据库副本。
