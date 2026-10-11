# 下一开发上下文交接

当前唯一实现是 [#121](https://github.com/ntygod/zhiwei-next/issues/121) / `feat/121-cognitive-context`：原 P1-06 认知协调与受预算上下文。基线 protected main `d55a7d6e052c2bcb6ccfc83e5efa81409398a66a` 已含 P1-04 / [PR117](https://github.com/ntygod/zhiwei-next/pull/117) 和 P1-05 / [PR120](https://github.com/ntygod/zhiwei-next/pull/120)；#118 完成交付关闭，1095 项原完整 CI、最终 R3、Ready/live、合入树和 main provenance 均已回读，远端旧分支回收。

## 本项任务

先读根与目标目录 AGENTS、[开发与验收分离](../harness/development-and-acceptance.md)、[执行索引](../harness/execution-mode.json)与原 [P1-06 合同](implementation-plan.md#p1-06--交付认知协调与受预算上下文)。领域、认知流水线和持久化仍为原事实源；不从本摘要推导额外权限。

首批 compileCognitiveContextV1 复用已交付预算阶段，增加当前任务/WorkingState 与合格 Claim 的不可变胶囊；3项组件检查、157个严格类型roots及架构检查通过。此输出不是发送许可。唯一primary为[Draft PR122](https://github.com/ntygod/zhiwei-next/pull/122)；[ADR0021](../adr/0021-bounded-coordination-context-snapshots.md)获独立提案字节设计批准并Accepted，指出的WorkingState跨Session计数前缺口已修复，3项场景通过。继续在同一primary接入有界决策、快照/read-set持久化与受控合成接收，最终实现HEAD另做R3。最终前端布局和视觉由所有者安排 Gemini；不新增自动学习、向量或通用 Provider。

每个行为用最少足够的正常合成开发检查验证，复用已通过的相同源码证据；不重复无改动全量验证，不做假想攻防矩阵。最终完整 check、当前 HEAD 独立 R3、当前 PR 原 Runtime 来源、Ready/live 与受保护合入继续执行。

## 保持边界

真实入口关闭，只使用虚构临时材料。Z14/Z15 产品验收保持 not_run；官方 Pi+新扩展完整组合与 P0-01/02、D-04/D-08、G-2/G-5 不由本项认证。旧 #90/preintegration-safety、Private/链接替换/备份攻击及等价争议动态诊断禁跑，具体拒绝不得换路绕过。

不接实际模型账户、凭据、个人数据、外发或部署；v1、已应用迁移和旧 Accepted 范围保持。胶囊不可变仍须发送/结果边界复验当前资格，遗忘不能随回滚复活。已交付 P1-04 的完整 OS 失去 custody/跨世代 orphan 回收仍 unsupported，不将这些实现偷偷加入本 PR。

## 后续

本项完成保护交付与 reconciliation 后才进入 P1-07 验证/Episode；P1-08 接功能界面，P1-09 做 Alpha 产品验收。各项保留独立 canonical Issue/primary PR。
