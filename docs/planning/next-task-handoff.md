# 下一开发上下文交接

当前唯一工作是 [#108](https://github.com/ntygod/zhiwei-next/issues/108)，分支 `chore/108-development-acceptance`，分离代码实现与产品验收。开始规则基于 main `e7077df36fe794e296008c7db88c175fb588013f`；本治理不实施产品，未保护合入前不得使用新模式。PR/HEAD/CI/批准须实时回读。

## 先读

根/目标目录 AGENTS、[开发与验收分离](../harness/development-and-acceptance.md)、[执行索引](../harness/execution-mode.json)、原 P1-01 [任务合同](implementation-plan.md#p1-01--建立认知与任务领域合同)、领域/数据/认知详设。依次区分真实实现依赖、用户稍后验收、真实启用许可。

## 已交付与仍未证明

- P0-03 PR103 已合入 `c32a13d65fbf484e099bca432502f03ba00a61e1`；P0-04 PR107 已合入 `e7077df36fe794e296008c7db88c175fb588013f`，固定工具链完整 check 428/428。它们是已测组件，不是产品验收。
- P0-01 受原实验限制，P0-02 产品验收仍阻塞；D-04/D-08 Proposed、G-2/G-5 未通过。不得运行、重演、替代受限实验或换环境绕过，不把用户愿稍后验收当作平台解除限制。
- PR99 已 closed unmerged，#98 原型暂停未交付，不恢复视觉打磨。

## 下一唯一实现

本治理按旧规则完成独立 R3、完整 check、当前 PR Runtime 来源、Ready CI、保护合入与 main 来源之后，另起独立 P1-01 canonical 实现上下文。直接交付正式领域/Scope/认知状态、Observation v2/Local API DTO；技术依赖 P0-03 已实现。限定合成输入与确定性类型/单测，保留 v1，不接生产消费者/迁移/模型或真实数据。完整范围与待验清单见唯一[分工合同](../harness/development-and-acceptance.md#真实技术依赖与下一实现)。不再为允许编码新造 P0 纯计算任务。

后续 P1-02 依赖 P1-01，按真实临时 SQLite 完整性/事务测试开发；不得把纯内存 CAS 当持久化证明。服务接线按其技术依赖继续，真实入口默认关闭，许可/验收未满足不得开放。

## 本治理交付检查

确认旧任务目录、design-plan validate/10 负例、冻结计划/安全决议不变；新 checker 是增量验证。最终 HEAD 旧完整检查与新检查、正反回滚演练、独立 R3、当前 PR Runtime 来源及全部现有 CI/保护流程均须真实完成。未运行/失败/跳过分别报告，下一任务从实时 main 重新对账，不继承旧 HEAD 批准。
