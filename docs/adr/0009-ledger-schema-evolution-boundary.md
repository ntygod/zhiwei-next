# ADR 0009：Ledger 完整 manifest 的演进边界

- 状态：Proposed
- 日期：2026-10-08
- 计划决策：D-02；关联 D-03/D-09
- 被取代关系：不取代 ADR 0006；不授权任何新表或迁移

## 背景

当前 Ledger 的完整 Schema manifest 故意拒绝额外用户表、索引和 trigger。`memory-store` 在公开 open、写入与正式读取边界验证安装态；M0-2 不能直接添加 Workspace/Session 表后禁用这些验证。[ADR 0006](0006-sqlite-observation-ledger-v1.md)要求已应用迁移不可变、合法 pending migration 原子提交。已有测试证明内部迁移失败原子回滚，但没有批准未来业务表或证明完整旧库升级产品路径。

## 拟议决策

优先评估同库、模块私有前向迁移与按已应用版本确定的完整 reference manifest。旧库迁移前先验证旧版本完整 Schema/行；在一笔事务内应用全部待执行迁移、history、user_version 并验证新 manifest，失败整体回滚。迁移之后继续拒绝任何不在批准 manifest 中的对象。新版本的合法新增对象不是允许任意额外对象的通行证。

迁移 1 与其 history 校验保持不可变；新增 Schema 必须新版本，不向调用方开放 migrations/manifest override 或关闭完整验证。旧程序打开新版本库应 fail closed，不降级改写版本或静默删表。升级时应避免新旧应用并发写；具体 owner/锁定策略依赖 D-09，不能靠该文档假定已经解决。

同库是候选而非已经接受的数据库布局。若实验证明需分库，必须重新比较：各库真源、逻辑 Session 与 Runtime 事件的关联、跨库提交与 Outbox/对账边界、部分完成和恢复。分库不能被用于避开每库完整 manifest。

## 备选方案与权衡

| 方案 | 收益 | 代价/结论 |
|---|---|---|
| 同库、版本化完整 manifest | 原子关联和单库恢复边界较清晰 | 升级协调、全量校验成本；优先实验 |
| 分库、各自完整 manifest | 可以隔离演进和负载 | 跨库故障/确认点复杂；证据充分才选择 |
| 添加表后忽略未知对象 | 接入方便 | 隐藏篡改，违反 ADR 0006；拒绝 |
| 重写迁移 1 或暴露 override | 少写一次迁移 | 破坏历史/公开入口保障；拒绝 |

## 证据与接受条件

现有证据见[不变量目录](../architecture/invariant-ownership-baseline.md)的 I-LEDGER-SCHEMA、I-LEDGER-IMMUTABILITY：未知表拒绝、checksum 漂移、事务逃逸、pending final validation 失败回滚。接受仍需下列完整条件。G-1c 的合成证据见下方，D-02 继续 Proposed：

1. 由未修改迁移 1 生成合成旧库，以候选新迁移升级并逐项保留已有 canonical event/cursor/history。
2. 合法新增领域表通过新版本完整 manifest；同名弱化表、额外 trigger、未知表仍被拒绝。
3. 在升级前、DDL/history 写入中、最终验证与 commit 边界注入失败；重开后只能看到完整旧态或完整新态，不存在部分状态。
4. 旧二进制打开新库明确失败；恢复备份/前向修复路径有测试，不能以 revert 代码冒充降级数据库。
5. 独立 R2 审查绑定正式 PR/完整 HEAD；D-02 登记 ADR、实验和审查来源。性能预算留给 D-03/G-5，不能为了实验变快删除全量验证。

这些是候选选择的最小验证条件，不创建未来表/包，不提前实现 M0-2。实验夹具使用合成数据库，不能使用真实个人资料。

### G-1c 的已运行有限证据

[Issue #78 的包内实验](../../packages/memory-store/fixtures/schema-evolution/README.md)使用未修改的 migration 1 和公开 Ledger 创建含 3 条虚构事件的真实旧文件库，再通过原内部 migration runner、原 manifest/row validator 升级候选合成表。覆盖完整旧行/cursor/history 保留、合法新表 STRICT/table_xinfo/index_xinfo、未知表/额外索引与 trigger、弱化定义、坏旧态拒绝、DDL/history/最终验证/commit 边界异常，以及突然进程退出和闭库备份恢复。原 validator 真正发现候选索引缺失与主动注入 throw 分开测试。COMMIT 后异常保留完整新态，不能将调用失败推断为未提交。

该路径不是公开产品升级 API。唯一新增 seam 为同包内部测试复用，不能由 public index、open 参数或既有 Ledger 实例配置进入；正式入口仍使用固定 migration 1。候选表无业务含义，不注册未来 Session/Workspace Schema。子进程退出不证明断电或存储设备故障；闭库合成备份不证明在线备份或多 owner 协调。

当前原 manifest 的明确覆盖是 table/index/trigger；独立观察脚本确认额外 view 尚不在此验证范围，这不是泄漏或损坏证据。后续选择须明确是否纳入 view，不能把“未知额外表拒绝”扩大成任意 SQLite 对象全拒绝。D-09 升级所有权、真实 Schema 与生产接入、D-03 性能/持久性、新 PR/完整 HEAD 的独立审查仍未闭合，本提案不标 Accepted。


## 后果、兼容与回滚

目前不改 Schema 或 runtime；只是给后续演进提供可证伪方案。文档可撤回，已应用迁移不能回退。未来选择被接受后仍须为实际 Schema PR 提供前向迁移和恢复证据。
