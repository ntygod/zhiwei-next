# packages/memory-store/AGENTS.md

适用范围：`packages/memory-store/**`。本包负责存储端口和持久化适配，不解释认知含义。

## 边界

- 只依赖 `domain` 与 Runtime-neutral `protocol`；不得导入 Pi SDK、应用层或 UI 类型。
- Store 保存调用方已经构造的领域对象或 `NormalizedRuntimeEvent v1`；写入和读回都必须通过正式协议 parser，不从文本提取记忆或判断任务成功。
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

M0 只实现 `NormalizedRuntimeEvent v1` Observation Ledger、Workspace/Session 查询和回放。不要提前加入 FTS5、Embedding、图谱、自动记忆提取或完整 Claim Repository。现有内存 Claim 接口仅是架构哨兵，不应在 M0 横向扩张。

## 测试

- SQLite 行为使用真实临时数据库，不用 Mock SQL 代替。
- 覆盖 exact replay、冲突、完整 source-stream 单调性、批量事务回滚、Cursor、Workspace/Session 隔离、进程重启、未提交事务、排序稳定性、迁移 checksum/user_version/history gap、Schema manifest、PRAGMA readback、projection corruption 与 SQLite error classification。
- 文件数据库必须证明 WAL 与 `PRAGMA integrity_check=ok`；`:memory:` 的 journal mode 单独记录，不能冒充文件 WAL。正式 Runtime 范围为 Node.js `>=22.16.0 <23`，exact-head 验证记录实际 22.x patch，并在每个新 HEAD 上重跑完整真实 `node:sqlite` 矩阵。
- 测试数据必须是虚构内容，不包含真实用户记忆、密钥或本机数据库副本。
