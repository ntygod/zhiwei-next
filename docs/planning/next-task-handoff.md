# 下一开发上下文交接

当前唯一实现是 [#123](https://github.com/ntygod/zhiwei-next/issues/123) / `feat/123-task-outcomes`：P1-07 结果验证、Episode 与记忆使用记录。基线 protected main `f02349bc45ade4c7ed6dd650c9fe6e9168302722` 已交付 P1-06 / [PR122](https://github.com/ntygod/zhiwei-next/pull/122)，完整1125项原检查、精确 HEAD R3、Ready/live、保护合入与 main 来源/分支审计成功，#121 已关闭；[交付记录](https://github.com/ntygod/zhiwei-next/pull/122#issuecomment-6110983805)覆盖上一提交的待验证快照。

## 本项任务

先读根和目标路径 AGENTS、[开发与验收分离](../harness/development-and-acceptance.md)、[执行索引](../harness/execution-mode.json)与原 [P1-07 合同](implementation-plan.md#p1-07--交付结果验证episode-与使用记录)。Outcome、Episode、MemoryUse 及结果复验以领域模型、认知流水线、Runtime 与持久化事实源为准。

[ADR0022](../adr/0022-outcome-episode-memory-use.md) 仍 Proposed，先由独立上下文审查有限设计再实现。目标为执行前的标准绑定、获准真实观测、核心纯归约及 Task/Outcome/Episode/使用/Outbox 原子提交。工具成功和 Runtime settled 不自动完成目标；后续用户否定追加同 Outcome ID 新 revision，原终态/判定不改写。Exposure 只记录实际请求，接收前只能 uncertain；采用自报与可验证步骤分开，没有对照的收益仍 unknown。

新增固定前向 schema7 或版本化 DTO 时保留已应用0001—0006、旧严格入口和所有已有合同；正文进入现有受管内容/依赖。验证前后一致读取与提交屏障同样覆盖最后请求后纠正/遗忘且再无工具的 final。正常开发验证只补本次必要场景，真实存储用自有临时数据库，不做无改动重复矩阵。

最终完整 `npm run check` 使用原 Node22.23.1/npm10.9.8；当前 HEAD 独立 R3、当前 primary 原 Runtime 来源、Ready/live、保护合入和 main 来源回读仍须实际完成。不能把局部检查或历史 HEAD 批准写成当前实现交付。

## 保持边界

只使用虚构临时资源和固定注入的模型/I/O，普通真实入口关闭。Z16/Z17 产品验收保持 not_run；官方 Pi+新扩展完整组合、真实 tokenizer/structuredDecision 及 P0-01/02、D-04/D-08、G-2/G-5 不由本项认证。

旧 #90/preintegration-safety、Private/链接替换/备份攻击、capture/restore 及等价争议实验禁跑，具体拒绝不得换路绕过。不接实际模型账户、凭据、个人数据、外发或部署；遗忘不能随代码/数据回滚复活。完整 OS 失去 custody 后的 orphan 回收仍 unsupported，不借本项补修。

本项只形成结果与使用记录，不运行 P2 自动学习、Procedure 晋升或学习调度。UI 继续由所有者安排 Gemini，#98 原型状态保留。代码走新的受审 revert PR，数据和最新控制 journal 保留且仅前向修复。

## 后续

P1-07 在本 primary 完成受保护交付与 reconciliation 后，下一候选为 P1-08；P1-09 做 Alpha 产品验收。后续各项仍采用独立 canonical Issue/primary PR。
