# ADR 0010：包归属不变量与可执行证据目录

- 状态：Proposed
- 日期：2026-10-08
- 计划决策：D-10；G-1b / Issue #76 的包归属决策资料
- 被取代关系：不取代已接受 ADR 0001—0006；从仍为 Proposed 的 ADR 0007 分出包归属责任，0007 保留核心/外壳与组合边界

## 背景

#67 要求分别记录核心边界、会话记录和 package-owned Runtime Invariants。ADR 0007 同时讨论核心和包归属不等于该三项决策已被分别接受；本提案与 [ADR 0007](0007-hard-core-soft-shell-ownership.md)、[ADR 0008](0008-session-record-reconstruction-boundary.md)分别对应三项，ADR 0009 仍独立负责 Schema 演进，不能代替包归属。三项都保持 Proposed，父需求不自动完成。

## 拟议决策

| 责任 | 唯一语义 owner | 消费者/机制 |
|---|---|---|
| ID/Scope 值与基础证据/置信度约束 | `domain` | Cognition/Compiler/Store 复用，不重新定义 |
| Candidate 接受与 Claim 纠正 | `cognition-core` | 未来应用协调存储事务；Store 不判断事实真假 |
| Scope 先过滤再排序的胶囊选择 | `context-compiler` | 未来检索/预算机制提供输入，不关闭过滤 |
| Runtime-neutral 单事件与 Trace 合同 | `protocol` | Adapter 调用公开 create；Store 调用公开 parse，复用 protocol 核心断言 |
| append-only、事务、Schema/行验证与 cursor | `memory-store` | SQLite 是当前唯一正式实现 |
| Pi 字段投影及可观察来源差异 | `pi-adapter` | Pi 为执行机制；不得覆盖协议 owner |
| 启停、调用顺序、依赖选择 | `apps/daemon` | 组合责任，不新增业务不变量副本 |

一项不变量只有一个语义 owner，可以有多个 enforcement 调用点。Adapter 的 createNormalizedRuntimeEventV1 与 Store 的 parseNormalizedRuntimeEventV1 是不同公开入口，内部复用 protocol 的核心形状/扩展断言；多处边界验证不是两个 owner；单事件与跨事件 Trace 是两个不同不变量，不能把 Trace 校验塞进任意 append 批次。跨包只走公开入口。现有 `memory-store → protocol` 已由 ADR 0006 和局部规则确定，不是此次提案新增依赖。

[catalog.json](../spikes/invariant-ownership/catalog.json)是当前 13 项映射的唯一维护源，架构基线中的表格从它生成。每项包含局部审计 ID、唯一 owner、公开入口、正反测试的完整文件/精确名称、成熟度和明确限制。它是现状证据目录，不是产品 capability registry；语义和已实现行为仍由已接受 ADR、代码与测试决定。多处调用不复制语义 owner，也不复制 validator。

实验通过固定公开模块 imports 核对真实导出和类自身的公开方法；通过真实 Node 测试执行核对名称和通过结果，不用注释/子串存在冒充测试。手工标注的正/反角色、owner 是否语义正确以及测试是否足够仍需独立审查。以后新增入口或包须按任务更新目录及实验，不能动态装载任意字符串模块。

## 备选方案

- 保留纯手工表格：维护简单，但不能发现引用/生成漂移；不选作后续证据维护方式。
- 为每个 Provider 再写 validator：重复现有协议与 Ledger 真源；拒绝。
- 通用静态 registry/动态注册宿主：当前没有需要，扩大组合与生命周期合同；不引入。
- 单一目录、生成视图、固定函数组合：拟选；用有限 opt-in 实验取证，接受前不接入正式产品或质量门。

核心不可由 Provider 关闭、产品配置与 Harness 分离的原则由 ADR 0007 持有；此处只记录 owner 和调用/证据映射，不另设配置 revision、Session 或生命周期 Host。

## 实证与接受边界

[G-1b 实验说明](../spikes/invariant-ownership/README.md)记录真实正负命令和限制：目录重复 ID、缺/多 owner、无效包/导出/方法/测试、生成漂移明确拒绝；固定组合拒绝重复能力及关闭/替换核心校验声明，拒绝发生于读取 Provider 输入和打开 SQLite 之前。有效声明走现有 Adapter→protocol→真实临时文件 Ledger，证明 WAL、重开和 exact replay；有效声明下坏数据仍被已有核心拒绝。

这些结果不证明动态 Provider 不可绕过、不证明恶意同进程代码隔离，也不证明 Daemon/真实 Worker 已组合。旧不变量的测试执行不是穷举覆盖承诺。实验可以支持后续接受有限 D-10，但接受仍须正式 PR/完整 HEAD 的新独立 R2 审查，ADR/决策登记/机器投影一致，且不得依靠本轮新规则授权本轮正式实现。D-01/D-02 和完整 G-1 仍各自待证。

## 后果、兼容与回滚

目录多一个生成步骤，但移除了手工双份表；opt-in 实验失败可定位到声明、真实入口或精确测试。没有改动产品公开 API、事件 v1、Schema、固定迁移或质量门。回退本实验与生成表/提案即可；不回退数据库，不删历史审计。以后正式入口接入需要独立任务与相应验证，不能将本目录直接当作运行权限。
