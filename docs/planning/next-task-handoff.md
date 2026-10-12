# 下一开发上下文交接

当前唯一实现是 [#125](https://github.com/ntygod/zhiwei-next/issues/125) / `feat/125-workbench-api`：P1-08 的 API 与交互接线切片。基线 protected main `e84273dbb0417cd3a091330e6291f97d1c6cc62b` 已交付 P1-07 / [PR124](https://github.com/ntygod/zhiwei-next/pull/124)，完整1152项原检查、精确 HEAD R3、Ready/live、保护合入与 main 来源/分支审计成功，#123 已关闭；[最终交付](https://github.com/ntygod/zhiwei-next/pull/124#issuecomment-6118425312)覆盖上一提交的待验证快照。

## 本项任务

先读根和目标路径 AGENTS、[开发与验收分离](../harness/development-and-acceptance.md)、[执行索引](../harness/execution-mode.json)、原 [P1-08 合同](implementation-plan.md#p1-08--交付项目工作台与记忆纠错界面)及 [Local API](../architecture/local-api-contract.md)。同源身份、业务状态、正文资格、版本和命令提交仍由 Daemon/协议事实源决定。

所有者本轮明确答复「尚未完成，先推进 API 和交互接线」，Gemini 继续负责最终 UI 布局。本 execution 交付无布局的浏览器 API 客户端和确定性交互状态：配对、任务开始/继续、事件恢复、记忆查看/纠错、结果核验/反馈。复用现有 DTO、Cookie/CSRF、scope、revision、幂等、分页快照和 SSE；不另造后端业务真源或通用客户端框架。

客户端只展示后端已确认版本；断线显示最后确认状态，权限失效停止消费并清除不再获准的正文，迟到响应不得污染新范围。未知命令提交不得伪成失败或成功，不能自动重复写；SSE 只触发获准重读，不凭进度制造终态。没有页面/实际浏览器证明时，P1-08 整体仍 in_progress，Z18 仍 not_run。

最终完整 `npm run check` 使用原 Node22.23.1/npm10.9.8；当前 HEAD 独立 R3、当前 primary 原 Runtime 来源、Ready/live、保护合入和 main 来源回读仍须实际完成。不能把局部检查或历史 HEAD 批准写成当前实现交付。

## 保持边界

只使用虚构临时资源和固定注入的模型/I/O，普通真实入口关闭。Z18 实际浏览器/键盘/200% 产品验收保持 not_run；官方 Pi+新扩展完整组合、真实 tokenizer/structuredDecision 及 P0-01/02、D-04/D-08、G-2/G-5 不由本项认证。

旧 #90/preintegration-safety、Private/链接替换/备份攻击、capture/restore 及等价争议实验禁跑，具体拒绝不得换路绕过。不接实际模型账户、凭据、个人数据、外发或部署；遗忘不能随代码/数据回滚复活。完整 OS 失去 custody 后的 orphan 回收仍 unsupported，不借本项补修。

本项只交付 API/交互接线，不设计 UI 布局、不运行 P2 自动学习、Procedure 晋升或学习调度。UI 继续由所有者安排 Gemini，#98 原型状态保留。代码走新的受审 revert PR，数据和最新控制 journal 保留且仅前向修复。

## 后续

本切片在同一 primary 完成验证、受保护交付与 reconciliation 后，P1-08 尚待 Gemini 界面接入与对应开发验证；不提前转 P1-09。后续实质切片仍采用独立 canonical Issue/primary PR。
