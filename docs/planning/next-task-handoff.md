# 下一开发上下文交接

当前 [#116](https://github.com/ntygod/zhiwei-next/issues/116) / [PR117](https://github.com/ntygod/zhiwei-next/pull/117) 已发布完整 P1-04 代码 `5d378978b18f7f0368ca241d5cba0a1d2f326fd8`。新重建树完整检查766/766、144 strict roots；当前最终HEAD独立R3、Ready/live、保护合入与main回读须实际完成，不能从本文件推导已经合入。

## 先完成交付

保持唯一 canonical Issue/primary PR/工作分支，不另开整合或验证PR。比较器已精确恢复原blob，原PR117 artifacts重新读回/完整比较通过，不重新采集Runtime。完整HEAD变化后更新检查和独立审查，严格原Ready CI/保护合入/main provenance；核实后关闭#116，#44 owner-input保持开放。源码重建使用新验证，不复用不可访问旧树的通过数字。

## 下一实现 P1-05

P1-04 完成交付后重新 reconciliation：读最新 main、AGENTS/局部规则、原 [任务目录](implementation-plan.md)、[执行索引](../harness/execution-mode.json)、[开发与验收分离](../harness/development-and-acceptance.md)及 P1-05 精确合同，再建立唯一新工作项。不得凭本摘要扩展范围。

实现依赖按已发布代码推进，用户可后验收；正常类型、领域、隔离事务/进程开发验证必须继续。P1-04 Session/Task/WorkingState/输入与精确执行历史真源已经可供后续消费者使用；P1-06 完整认知循环、P1-07 验证/Episode、P1-08 UI，P1-09仅Alpha验收，不把真实缺口推给验收阶段。

## 保持边界

真实入口仍关闭，只用虚构临时材料；官方Pi+新扩展完整进程组合和产品Z10/Z11/Z12均not_run。旧#90/preintegration-safety、Private/链接替换/备份攻击及等价争议动态诊断禁跑，具体拒绝原文上报不得换路。v1、0001/0002、旧Accepted范围不改；不接真实模型/账户凭据、个人数据、外发、部署或新持续权限；#98原型仍暂停。

已应用schema3无破坏性down migration；回滚停新接纳、关闭API、排空/停止Worker，保留已提交历史，通过新受审revert PR或前向修复执行。
