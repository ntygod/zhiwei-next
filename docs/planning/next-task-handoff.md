# 下一开发上下文交接

当前唯一实现是 [#121](https://github.com/ntygod/zhiwei-next/issues/121) / `feat/121-cognitive-context`：原 P1-06 认知协调与受预算上下文。基线 protected main `d55a7d6e052c2bcb6ccfc83e5efa81409398a66a` 已含 P1-04 / [PR117](https://github.com/ntygod/zhiwei-next/pull/117) 和 P1-05 / [PR120](https://github.com/ntygod/zhiwei-next/pull/120)；#118 完成交付关闭，1095 项原完整 CI、最终 R3、Ready/live、合入树和 main provenance 均已回读，远端旧分支回收。

## 本项任务

先读根与目标目录 AGENTS、[开发与验收分离](../harness/development-and-acceptance.md)、[执行索引](../harness/execution-mode.json)与原 [P1-06 合同](implementation-plan.md#p1-06--交付认知协调与受预算上下文)。领域、认知流水线和持久化仍为原事实源；不从本摘要推导额外权限。

唯一primary为[Draft PR122](https://github.com/ntygod/zhiwei-next/pull/122)；[ADR0021](../adr/0021-bounded-coordination-context-snapshots.md)与不可变决定记录补充均已独立设计批准。实现已串起 compileCognitiveContextV1、同视图资格/read-set、protected capsule/RuntimeInput、持久两次调用上限、六动作决定和现有受控 Worker 的实际接收。澄清/等待问题保留在 Task/WorkingState，实际 task.respond 精确匹配问题后产生新 revision；取消/继续/查询走确定性路径，不能用 task.continue 跳过待输入。

固定 schema5→6 保存预约、实际请求及每次不可变决定，保留0001—0005和旧严格读取器。实际请求重新计数，并在发送及最终事件落库复验当前来源；同 attempt 的 READY→RUNNING 必须有原准备证明。正常组件/临时存储/受控进程场景已验证预算失败、隐藏材料、两次上限、等待/回复、注入和发送前/最后请求后纠正。首个 Runtime 记忆工具只读当前胶囊已选且仍合格材料，结果连同精确引用进入实际请求；补检索由有界协调完成。完整原 check、当前 HEAD R3、PR122 原来源和 Ready/live/保护交付仍继续，不从局部绿色认定交付完成。

每个行为用最少足够的正常合成开发检查验证，复用已通过的相同源码证据；不重复无改动全量验证，不做假想攻防矩阵。最终完整 check、当前 HEAD 独立 R3、当前 PR 原 Runtime 来源、Ready/live 与受保护合入继续执行。

正常重启问题回复已补齐：owner fencing 后确认停止旧 attempt，实际输入重新授权并建立新 attempt，历史问题/计数保留。cognitive-context-v1 必须关联已提交胶囊，不退回裸输入。PR122 的原 SDK/Worker 来源已按原完整比较和双 attempt ZIP验证续期（run38145094526 /38146677440），原比较器精确恢复；来源事实以两 manifest 为准。下一步完成当前 HEAD 原生完整 CI、独立 R3、实际 Ready/live 和保护交付。容器不能解析Windows worktree Git路径，不靠跳过main provenance获得绿色。

## 保持边界

真实入口关闭，只使用虚构临时材料。Z14/Z15 产品验收保持 not_run；官方 Pi+新扩展完整组合与 P0-01/02、D-04/D-08、G-2/G-5 不由本项认证。旧 #90/preintegration-safety、Private/链接替换/备份攻击及等价争议动态诊断禁跑，具体拒绝不得换路绕过。

不接实际模型账户、凭据、个人数据、外发或部署；v1、已应用迁移和旧 Accepted 范围保持。胶囊不可变仍须发送/结果边界复验当前资格，遗忘不能随回滚复活。已交付 P1-04 的完整 OS 失去 custody/跨世代 orphan 回收仍 unsupported，不将这些实现偷偷加入本 PR。

## 后续

本项完成保护交付与 reconciliation 后才进入 P1-07 验证/Episode；P1-08 接功能界面，P1-09 做 Alpha 产品验收。各项保留独立 canonical Issue/primary PR。
