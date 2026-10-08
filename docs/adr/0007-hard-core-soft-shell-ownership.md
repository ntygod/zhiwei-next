# ADR 0007：Hard Core / Soft Shell 与显式组合边界

- 状态：Proposed
- 日期：2026-10-08
- 计划决策：D-10；G-1 的决策资料切片
- 被取代关系：不取代 ADR 0001—0006；接受前不授权受约束的正式校验入口

## 背景

[现有架构](../architecture/system-architecture.md)已选择模块化单体，但“可组合库”不意味着 Provider 可以决定校验是否执行。当前正式产品边界只有协议、Adapter 规范化和 SQLite Ledger；Daemon 仍是 bootstrap HTTP 入口，没有正式 Worker 组合、动态插件或产品配置加载器。认知与 Context 代码是未来里程碑的不变量哨兵，不能据此宣布完整记忆能力。

## 拟议决策

Hard Core 指知微不可委托给可替换 Provider 决定的语义：身份/Scope、证据与状态转换、协议解析、持久化完整性、模型输入的可解释性、权限与审计。Soft Shell 指在相同合同下可替换的执行机制，例如 Pi Runtime、模型和存储驱动；可替换机制不等于可关闭核心语义。

采用显式函数/对象组合，`apps/*` 是组合根；不增加通用 DI、动态注册宿主、反射或未来包空壳。逐项包归属和 owner/enforcement 的区别由独立 [ADR 0010](0010-package-owned-invariant-catalog.md) 负责，不在本决策保留第二份归属表。该拆分只整理仍为 Proposed 的提案，不改变已接受 ADR。

Provider 只能提供合同允许的数据/能力；不得提供 `skipValidation`、替换核心断言、迁移覆盖或全局 `unsafe` 开关。后续组合入口应先拒绝重复能力/不变量 ID、没有 owner 的映射，以及关闭核心校验的配置，再进行任何 I/O。这里是待验收合同，当前不存在这样的通用组合入口；已有 Ledger 的固定迁移与不可关闭 integrity check 只是局部先例。

产品配置与 `harness.config.json` 分离：前者选择产品能力、限制和版本，后者只管理仓库开发/CI/合并。产品进程不得消费 Harness 的风险或批准字段作为运行权限；Harness 不作为 Session 配置 revision。当前只有 `ZHIWEI_HOST`/`ZHIWEI_PORT` 等 bootstrap 参数，不创建一个未使用的产品配置文件来制造完成证据。

## 备选方案

- 动态插件 Host/DI：目前没有第二个正式 Runtime/Store，扩大可绕过面与测试矩阵，拒绝提前引入。
- 每个 Provider 自带安全/协议 validator：形成多份真源，拒绝。
- 把全部校验集中到应用入口：Store 公开入口和数据库读回仍可绕过，拒绝。
- 静态目录加 opt-in 一致性检查：已有 [G-1b 合成实验](../spikes/invariant-ownership/README.md)；只检查已存在入口/测试与固定组合，不冒充通用 runtime enforcement。

## 证据、接受条件与后果

[不变量证据目录](../architecture/invariant-ownership-baseline.md)列出当前入口、正反测试与缺口。D-10 接受前需要新的独立 R2 审查，绑定正式 PR/完整 HEAD；决策登记还须具备实验证据并与机器投影一致。[G-1b 实验](../spikes/invariant-ownership/README.md)覆盖重复 ID、缺/多 owner、无效引用和 Provider 声明关闭核心校验；只支持有限声明与固定合成路径结论，不证明运行中 Provider Host。独立审查、正式决策接受和受约束入口接入仍未完成。

这会使 owner 和调用点可审查，但不能阻止有权限的恶意源码修改，也不是 sandbox。未来新增 Provider 需要证明经过同一核心入口，不能仅凭目录通过。未接受前不实现受约束的正式新入口、不放行 G-1；独立合成实验/Spike 可在 Proposed 阶段先行，以产生接受所需证据。

## 兼容与回滚

不改变 v1 payload、包导出、数据库或现有行为。提案可通过后续文档提交撤回；已接受 ADR 和不可变迁移保持不变。
