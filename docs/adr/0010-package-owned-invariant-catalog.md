# ADR 0010：包归属不变量与可执行证据目录

- 状态：Accepted
- 日期：2026-10-08
- 计划决策：D-10；G-1 包归属决策
- 被取代关系：不取代 ADR 0001—0006；ADR 0007 保留核心/外壳和组合边界

## 背景

#67 的核心边界、会话记录及 package-owned Runtime Invariants 分别由 ADR 0007、0008、0010 承接；额外的 Schema ADR 0009 不是第三项核心 ADR 的替代。父项其他要求与产品能力不因这些决议自动完成。

## 有限决策文本

每个不变量一个语义 owner，可以有多个 enforcement 调用点。选择现有包公开入口复用、单一目录生成视图和固定显式组合，不建立第二份 validator 或动态 capability registry。

| 责任 | 唯一语义 owner | 消费者/机制 |
|---|---|---|
| ID/Scope 与基础证据/置信度 | domain | Cognition/Compiler/Store 复用 |
| Candidate 接受与 Claim 纠正 | cognition-core | 未来应用协调事务；Store 不判断真假 |
| Scope 先过滤再排序 | context-compiler | 未来检索/预算不得关闭过滤 |
| Runtime-neutral 单事件与 Trace | protocol | Adapter create / Store parse 复用核心断言 |
| append-only、事务、Schema/行与 cursor | memory-store | SQLite 是当前唯一正式实现 |
| Pi 投影及观察来源差异 | pi-adapter | 不覆盖协议 owner |
| 启停、调用顺序、依赖选择 | apps/daemon | 组合责任，不复制业务不变量 |

Adapter create 与 Store parse 是不同公开入口，并非两个 owner；单事件和跨事件 Trace 是不同不变量，不能把 Trace 塞进任意 append 批次。跨包只用公开入口；memory-store → protocol 已由 ADR 0006 接受，不是本次新增依赖。

[catalog.json](../spikes/invariant-ownership/catalog.json)是现有 13 项映射的唯一维护源；生成架构视图，记录 owner、公开入口、精确正反测试、成熟度及限制。它描述证据，不是运行权限；代码/测试和已接受 ADR 才定义实际行为。固定 imports 验证真实导出/类自身方法，实际 Node 测试执行验证名称/结果，不能靠注释或字符串存在冒充执行。owner 的语义正确性与覆盖是否足够仍须独立审查。

## 备选方案

- 纯手工重复表格：容易漂移，不选。
- 每 Provider 自带核心 validator：重复真源，不选。
- 动态 Host/通用 registry：无实际替换需求，不选。
- 单一目录、生成视图、现有公开入口与固定组合：选择；产品配置/Harness 分离由 ADR 0007 定义。

## 证据与审查

[G-1b 实验](../spikes/invariant-ownership/README.md)覆盖重复 ID、缺/多 owner、无效包/导出/方法/精确测试和生成漂移；固定组合在 Provider 输入/SQLite I/O 前拒绝关闭/替换核心校验。有效声明真实运行现有 Adapter → protocol → 临时 Ledger，验证 WAL/重开/exact replay，坏数据仍被原核心拒绝。45 项 opt-in、其中单独引用 30 项已有测试、全仓 138 项分别计数，不相加。

[当前执行决议 D-10](../planning/current-decisions.md#d-10)是状态/范围/证据/审查的单一执行投影。PR #77 的实验批准不是决策接受；新正式决策与最终 HEAD 各自按现行治理审查。

## 后果、限制与回滚

目录有维护成本但消除手工双份表。接受方向不证明动态 Provider 不可绕过、恶意同进程隔离、sandbox、Daemon/真实 Worker 已组合、未来入口完整覆盖或完整记忆能力。新增入口仍须独立任务验证。G-1 按原卡单独验收，不自动完成 #67、M0 或后续产品工作。

本轮不改产品 API、v1、Schema、迁移、CI 或合并门。撤回文档/执行状态资料即可；不回退数据库或删除审计历史。
