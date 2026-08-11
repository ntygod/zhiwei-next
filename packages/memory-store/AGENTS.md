# packages/memory-store/AGENTS.md

适用范围：`packages/memory-store/**`。本包负责存储端口和持久化适配，不解释认知含义。

## 边界

- 只依赖 `domain`；不得导入 Pi SDK、应用层或 UI 类型。
- Store 保存调用方已经验证的领域对象，不负责从文本提取记忆或判断成功。
- Observation Ledger 是 append-only 证据层；已写 Observation 不做原地语义修改。
- 派生索引、缓存、FTS 和向量不是事实真源，必须可重建。

## 持久化规则

- 事件 ID/Observation ID 写入必须幂等且结果确定；重复、冲突重复和重放要有不同语义。
- Session 回放顺序不能只依赖可能相同的墙钟时间，应有稳定排序策略。
- 相关 Observation、Session 状态和 Outbox 的一致性由显式事务保证。
- SQLite 启用 WAL、外键和合理的 busy timeout，并用真实连接验证。
- 已应用迁移不可重写；修复 Schema 必须新增前向迁移。
- 崩溃恢复、部分写入和重启重放是核心场景，不是后续优化。

## 当前范围

M0 只实现 Observation Ledger、Session 查询和回放。不要提前加入 FTS5、Embedding、图谱、自动记忆提取或完整 Claim Repository。现有内存 Claim 接口仅是架构哨兵，不应在 M0 横向扩张。

## 测试

- SQLite 行为使用真实临时数据库，不用 Mock SQL 代替。
- 覆盖重复事件、事务回滚、进程重启、排序稳定性、取消/崩溃状态和迁移升级。
- 测试数据必须是虚构内容，不包含真实用户记忆、密钥或本机数据库副本。