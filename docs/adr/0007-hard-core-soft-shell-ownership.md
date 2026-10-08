# ADR 0007：Hard Core / Soft Shell 与显式组合边界

- 状态：Proposed
- 日期：2026-10-08
- 计划决策：D-10；G-1 有限架构基线
- 被取代关系：不取代 ADR 0001—0006；ADR 0010 单独定义包归属与证据目录

## 背景

[系统架构](../architecture/system-architecture.md)选择模块化单体。现有正式产品边界是协议、Adapter 规范化和 SQLite Ledger；Daemon 仍为 bootstrap HTTP 入口。认知和 Context 代码是后续里程碑的哨兵，不能作为完整记忆能力证据。可组合不意味着 Provider 可以关闭核心语义。

## 有限决策文本

Hard Core 包含身份/Scope、证据与状态转换、协议解析、持久化完整性、模型输入可解释性、权限与审计。Soft Shell 是遵守这些合同的执行机制；Runtime、模型或存储驱动可替换，不意味着对应核心语义可替换或关闭。

选择固定显式函数/对象组合，未来 apps 是组合根；当前以已有公开入口的合成组合验证。拒绝 skipValidation、替换核心断言、migration override 或全局 unsafe。拒绝应在读取 Provider 输入、打开数据库等产品资源之前；目录校验自身会读取仓库文件发生。此选择不声称当前有通用正式组合入口；现有 Ledger 固定迁移与不可关闭 integrity check 是已接受 ADR 0006 的局部事实。

产品配置与 harness.config.json 分离。产品进程不能将 Harness 风险、CI 或批准字段消费为运行权限；Harness 不充当 Session config revision。本项不创建未消费的产品配置空壳。稳定 revision 的合成语义见 ADR 0008；实际权限收紧与撤销、owner/disposer 和生命周期仍属后续各责任包。

## 备选方案

- 动态 Host/通用 DI/反射：没有第二个正式 Runtime/Store 需求，不选。
- Provider 自带可替换的核心 validator：制造多份真源，不选。
- 全部校验只放应用入口：无法覆盖 Store 公开边界，不选。
- 固定显式组合与现有公开入口复用：选择，验证范围限于合成路径。

## 证据与审查

[G-1b 实验](../spikes/invariant-ownership/README.md)拒绝重复能力/不变量 ID、缺失或多 owner，以及关闭或替换核心校验；有效声明走现有 Adapter → protocol → 真实临时 Ledger 的 WAL、重开和 exact replay。有效声明下的坏输入仍被原核心拒绝。

[当前执行决议 D-10](../planning/current-decisions.md#d-10)是唯一当前状态/有限范围/证据/决策审查投影。PR #77 的实验批准不接受本决策。状态变为 Accepted 需要同一新 primary PR 对完整决议证据 HEAD 的真实独立审查，再记录逐项范围摘要；记载审查的新完整 HEAD 还须现行独立 cold review、CI 和合并。

## 后果、限制与回滚

此选择明确不可委托语义和组合方向，不证明动态 Provider 不可绕过、恶意同进程隔离、sandbox、Daemon/真实 Worker 已组合或正式产品配置已经实现。不能仅凭目录通过认定未来 Provider 安全；新入口须在独立任务证明同一核心边界。

不改变 v1 payload、包导出、数据库或已接受 ADR。仅本决策接受不自动完成 G-1、#67 或阶段；G-1 须按原卡单独验收。撤回本提案/状态资料即可回滚本轮，已有不可变迁移不回写。
