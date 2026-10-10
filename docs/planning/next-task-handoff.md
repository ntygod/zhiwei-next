# 下一开发上下文交接

当前唯一实现是 [#110](https://github.com/ntygod/zhiwei-next/issues/110)，分支 `feat/110-cognitive-domain-contracts`，基于已保护 main `009387778d2f473945e89239557bf2d16735d242`。#108 / PR109 已完成开发/验收分离治理，本独立任务按新模式实现 P1-01 正式领域与协议合同。代码实现与开发验证已在候选提交 `0cc3d85c57f2b85d9bab16715b3d42b8c0e6cdd6` 完成，完整 check 499/499、strict 类型94 roots通过。PR/最终 HEAD/独立批准/Ready/保护合入须实时回读；尚未据候选状态宣布主分支交付或产品验收。

## 先读

根/目标目录 AGENTS、[开发与验收分离](../harness/development-and-acceptance.md)、[执行索引](../harness/execution-mode.json)、原 P1-01 [任务合同](implementation-plan.md#p1-01--建立认知与任务领域合同)、领域/数据/认知详设。依次区分真实实现依赖、用户稍后验收、真实启用许可。

## 已交付与仍未证明

- P0-03 PR103 已合入 `c32a13d65fbf484e099bca432502f03ba00a61e1`；P0-04 PR107 已合入 `e7077df36fe794e296008c7db88c175fb588013f`，固定工具链完整 check 428/428。它们是已测组件，不是产品验收。
- P0-01 受原实验限制，P0-02 产品验收仍阻塞；D-04/D-08 Proposed、G-2/G-5 未通过。不得运行、重演、替代受限实验或换环境绕过，不把用户愿稍后验收当作平台解除限制。
- PR99 已 closed unmerged，#98 原型暂停未交付，不恢复视觉打磨。

## 当前交付与下一唯一实现

P1-01 在 #110 内实现正式领域/Scope/认知纯状态转换、Observation v2/Local API DTO；技术依赖 P0-03 已实现。限定合成输入与确定性类型/单测，保留 v1，不接生产消费者/迁移/模型或真实数据。完整范围与待验清单见唯一[分工合同](../harness/development-and-acceptance.md#真实技术依赖与下一实现)。本任务不修改治理、原任务 DAG 或已接受设计来通过自己。

先完成 PR111 精确最终 HEAD 的独立审查、Ready/live、CI、保护合入与 main 来源回读，随后另起 P1-02 独立 canonical 任务。P1-02 依赖的 P1-01 合同按已核验 main 读取，使用真实临时 SQLite 完整性/事务测试开发；不得把纯内存 CAS 当持久化证明。服务接线按其技术依赖继续，真实入口默认关闭，许可/验收未满足不得开放。

## 本实现交付检查

固定工具链完整类型/单元及原 `npm run check`，新正式合同的正反例、版本/Scope/证据/历史不变量和 v1 兼容。仅内存 CAS 不证明持久事务，序列化 DTO 不证明鉴权或实际提交。最终完整 HEAD 新独立 R3、当前 PR Runtime 来源、真实 Ready/live/CI、保护合入与 main 来源分别保存证据。产品/真实场景验收另行记录，不把实现检查等同原阶段退出。
