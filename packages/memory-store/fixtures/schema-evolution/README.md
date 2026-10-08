# D-02 合成 Schema 演进实验

状态：G-1c / [Issue #78](https://github.com/ntygod/zhiwei-next/issues/78) 的 opt-in 实验。基线 `main@f1156747e94760e26f9ac3afdfc5accfbe52b98b`，工作分支 `spike/78-session-schema-evidence`。不是正式 migration 2、Workspace/Session Schema 或生产升级 API；D-02 / [ADR 0009](../../../../docs/adr/0009-ledger-schema-evolution-boundary.md) 仍 Proposed。

## 实际路径

`candidate.mjs` 先通过正式公开 `openSqliteObservationLedgerV1` 和未修改 migration 1 创建真实临时文件库，写入 3 条公开 protocol parser 构造的虚构事件，关闭后再使用包内原 `applyObservationLedgerMigrations` 升级。候选 migration 2 只存在于此夹具：一个 `synthetic_evolution_probe` STRICT 表、CHECK、PRIMARY KEY/UNIQUE 和降序索引。它没有领域产品含义，不加入模块固定 `MIGRATION_FILES`。

前置/最终验证复用原 manifest capture/comparison 和原 canonical row validator。唯一新增生产文件内容是非 public index 导出的 `@internal` 测试 seam：原 reference builder 可接受明确测试表清单；原 production 调用不传此参数、默认分支不变。闭包只持有候选 reference，不接触正式 Ledger 的私有 manifest。表名只允许小写安全标识符，重复、不存在、不完整或可插入 SQL 的名称拒绝；测试要求 reference 中每张用户表都有 STRICT、table_xinfo 和 index_xinfo 元数据。

抽取整个 manifest 模块会连带拆分当前错误类/依赖；这里沿用已有 `validateObservationLedgerRuntimeRowsForTest` 的同包测试方式，不复制 validator，不扩大公开 API。夹具直接导入同包私有模块；外部包不能据此跨包穿透。该 seam 不构成同进程恶意代码隔离。

## 重现与覆盖

使用 Node `>=22.16.0 <23`，已本地运行 `22.23.1`：

```bash
node --experimental-strip-types --test packages/memory-store/fixtures/schema-evolution/experiment.test.mjs
node --experimental-strip-types packages/memory-store/fixtures/schema-evolution/manifest-coverage-probe.mjs
npm run check
```

35 个 opt-in 测试通过；完整 `npm run check` 另行记录，不能将实验数加到全仓测试数。最终 PR/完整 HEAD、独立审查和 exact-head 复跑以 #78 的 primary PR 为准，工作树结果不预填批准。实验未注册 npm/CI，不改现有质量门。

| 场景 | 实际检查 | 边界 |
|---|---|---|
| 旧库升级 | 原 v1 source SHA-256 固定；canonical 全行、fingerprint、row cursor、自增状态及旧 history 逐项保留 | 只有虚构小库，不代表真实个人数据库已升级 |
| 合法新表 | 原 validator 真实查询新表 STRICT、table_xinfo、两个 autoindex 和显式 index_xinfo；实际 CHECK/UNIQUE 拒绝无效插入；另对真实 PRAGMA 结果作 STRICT/column/index 读回故障注入，SQL 不变仍由原 comparator 拒绝 | 不授权新的业务表或协议 |
| 未知/弱化 Schema | 未知表（含 sqlitex 前缀）、额外索引/trigger、弱化 CHECK/STRICT/索引方向重开后失败 | 这里的对象范围明确是 table/index/trigger |
| 坏旧态 | 旧完整 manifest 或 canonical 投影腐败在 pending 前被原 validator 拒绝 | 保留坏态用于诊断，不自动修复原证据 |
| 失败原子性 | 真实 DDL 后、真实 history INSERT 后、最终校验后、COMMIT 前注入异常，重开严格等于旧态 | 注入异常不是硬件故障模拟 |
| 原 manifest 最终拒绝 | 在事务内、history/user_version 已更新后移除候选索引，由原 verifier 拒绝；重开恢复完整旧态 | 与“验证后主动 throw”分开取证 |
| COMMIT 后错误 | 真正 COMMIT 完成后再抛异常，重开只能看到完整新态 | 调用失败不等于未提交；不假报安全重试或自动降级 |
| 突然退出 | 子进程在 DDL/history/最终验证后及 COMMIT 后 `process.exit(73)`；重开分别完整旧态/新态 | 仅进程退出，不是断电、OS crash、磁盘损坏或所有故障穷尽 |
| 旧程序读新库 | 原 public open 即使传入 migrations/manifest/skipValidation 仍拒绝 version 2，原数据不变 | 不实现 downgrade |
| 备份恢复 | 种子连接关闭且 WAL 已消失后备份，恢复到独立文件，v1 回放、exact replay 与下个 cursor 通过 | 恢复仅是闭库合成样本，不含在线备份/多进程协调 |
| 正式入口不受影响 | public index 不导出 seam/runner；恶意 override getter 不被读取；正式 open 固定 version 1，read/append/integrity 仍拒未知表且全行/cursor 不变 | 不是 sandbox 或对源码篡改的保证 |

## 已实现 manifest 范围观察

独立 `manifest-coverage-probe.mjs` 在真实 v1 文件库中加入合成 view，再调用原 public open。本轮 Node 22.23.1 输出 `outcome=accepted, schemaVersion=1, eventCount=3`。原 manifest 的枚举范围是 table/index/trigger，view 不在其已实现覆盖内。此事实不构成已发现泄漏/损坏，也不要求未来继续接受 view；故观察脚本不写一个“必须接受 view”的回归断言。后续 D-02 决策必须明确是否扩展该范围，不能把本实验外推为任意 SQLite 对象全拒绝。

## 决策边界、风险与恢复

证据支持继续评估同库、私有前向迁移、按版本完整的 table/index/trigger manifest；不支持关闭 manifest、改写已应用迁移或开放 public override。真实 Schema、升级期间多 owner/旧 owner 并发与在线备份仍待 D-09/M0-2；性能预算、OS/设备故障和持久性保证待 D-03/G-5。

回退本夹具与内部测试 seam 即可；生产 migration 1、公开导出、原 validator 逻辑、Runtime v1 和 Workflow 均未修改。没有持久个人数据。任何将来应用过的新迁移仍只允许前向修复或经验证的恢复，不能以 revert 代码冒充数据库降级。
