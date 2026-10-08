# ADR 0009：Ledger 完整 manifest 的演进边界

- 状态：Proposed
- 日期：2026-10-08
- 计划决策：D-02；关联 D-03/D-09
- 被取代关系：不取代 ADR 0006；本轮不注册任何新生产表或迁移

## 背景

ADR 0006 的公开 Ledger 固定 migration 1，并在 open、append 和正式读取边界验证已安装 Schema 与行。M0-2 不能加 Workspace/Session 表后关闭完整验证。候选演进要保持旧 canonical event、cursor、自增状态及 history，并有失败/恢复证据。

## 有限决策文本

选择同库、模块私有前向迁移，按已应用版本选择完整 reference manifest。旧态先验证，在单一事务内应用全部 pending DDL/history/user_version 并验证新 manifest，失败回滚；COMMIT 后异常不能误报未提交。manifest 的本次准确对象范围是 table/index/trigger，并核对 quoted SQL signature、STRICT、table_xinfo/index_xinfo 等已实现属性；合法新对象必须进入对应版本 manifest，未知表/索引/trigger、弱化定义和坏旧态继续 fail closed。

原 migration 1 与既有 history 不变；新增 Schema 必须新版本。公开 API 不接受 migrations/manifest override 或 skipValidation。旧二进制打开新版本明确失败，不静默删表、降级版本或覆盖历史。未来真实业务 Schema 须在独立任务接受，不能用本夹具合成表作为业务合同。

view 当前不在原 manifest 枚举覆盖内。此次选择不保证任意 SQLite 对象全拒绝，也不把“允许 view”定为未来兼容合同；以后若引入 view 或扩大对象范围，必须显式扩展 validator/manifest 和正反测试，再评审实际迁移。

旧态 prevalidation 在原 runner 的 BEGIN IMMEDIATE 之前；单 owner 合成实验不证明跨连接升级排他性或检查到使用之间无竞态。生产升级的 owner/epoch、旧 owner 复活、并发写入和在线备份前置仍由 D-09/M0-2 定案。不能把 SQLite 写事务推导成完整多 owner 协调。

## 备选方案

- 同库、版本化完整 manifest：选择，事务及恢复边界简单，保留全量验证成本。
- 分库、各库独立 manifest：当前无需增加跨库提交/Outbox/对账复杂度；未来有真实证据再 supersede 本选择，仍不得关闭任一库的完整验证。
- 忽略额外对象、重写 migration 1 或开放 override：破坏已接受边界，不选。

## 证据与审查

[G-1c 包内实验](../../packages/memory-store/fixtures/schema-evolution/README.md)用正式公共入口和未修改 migration 1 创建含 3 条虚构事件的旧文件库，经原内部 runner/validator 升级合成候选。覆盖旧行/cursor/history 完整保留、合法 STRICT 表与索引、未知/弱化对象拒绝、DDL/history/最终验证/commit 异常、原 validator 真拒绝缺索引、进程突然退出、旧程序拒新库和闭库备份恢复。

这不是生产升级 API，测试 seam 无公开 override；子进程退出不是断电/OS/设备损坏证明，闭库样本不是在线备份证明。[当前执行决议 D-02](../planning/current-decisions.md#d-02)维护范围/证据/审查。PR #79 实验批准不接受本决策，需新正式决策 HEAD 独立审查及最终新 HEAD cold review。

## 后果、限制与回滚

同库方向减少当前跨库一致性负担，保留升级协调和全量校验成本。D-03/G-5 的性能预算与硬件持久性、D-09 并发、真实 Schema/生产接入仍待各自任务。本轮不交付 M0-2，不自动完成 G-1 或阶段门。

撤回决策资料即可回滚本轮，没有生产 Schema 变化。未来应用过的新迁移只允许前向修复或经验证恢复；代码 revert 不是数据库降级方案。
