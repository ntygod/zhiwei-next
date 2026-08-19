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
- SQLite 启用 WAL、外键和合理的 busy timeout，并用真实连接验证。
- 已应用迁移不可重写；修复 Schema 必须新增前向迁移，version/name/checksum/history 均 fail closed。
- 数据库行中的 canonical event 与索引投影必须逐项一致；未知协议、非 canonical JSON 或投影漂移按 corruption 拒绝。
- 崩溃恢复、部分写入和重启重放是核心场景，不是后续优化。

## 当前范围

M0 只实现 `NormalizedRuntimeEvent v1` Observation Ledger、Workspace/Session 查询和回放。不要提前加入 FTS5、Embedding、图谱、自动记忆提取或完整 Claim Repository。现有内存 Claim 接口仅是架构哨兵，不应在 M0 横向扩张。

## 测试

- SQLite 行为使用真实临时数据库，不用 Mock SQL 代替。
- 覆盖 exact replay、冲突、完整 source-stream 单调性、批量事务回滚、Cursor、Workspace/Session 隔离、进程重启、未提交事务、排序稳定性和迁移 checksum 漂移。
- 文件数据库必须证明 WAL 与 `PRAGMA integrity_check=ok`；`:memory:` 的 journal mode 单独记录，不能冒充文件 WAL。
- 测试数据必须是虚构内容，不包含真实用户记忆、密钥或本机数据库副本。
