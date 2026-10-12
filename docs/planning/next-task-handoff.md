# 下一开发上下文交接

当前新execution为[#127](https://github.com/ntygod/zhiwei-next/issues/127) / `feat/127-workbench-ui` / [Draft PR128](https://github.com/ntygod/zhiwei-next/pull/128)：所有者提供`banxing-agent-ui-v0.2`，已明确「先接通PC与安卓浏览器版，再打包客户端」。本primary先接共享网页，最新app.js/style.css/Token为知微黑曜/冷瓷；screens仍有旧伴行图片。共享UI复用BrowserWorkbench和正式DTO，不采用原型LocalStorage/task-contract或模拟设备/审批为业务真源。安装壳为后续独立工作，平台交付不能从手机viewport推定。

新基线protected main734f4e698a3887e518545a8351829af06c137c02 / tree6540dd53d25033cf9ee9d4febd3f4f7e75803a20；#125/PR126已交付1168完整测试、当前HEAD独立R3、Ready/live、保护合入/main及分支审计，#125已关闭，[最终交付](https://github.com/ntygod/zhiwei-next/pull/126#issuecomment-6122087005)覆盖下面提交前历史。#127 [ADR0024](../adr/0024-shared-workbench-ui-and-owned-preview.md)设计91502c7已获[独立R3批准](https://github.com/ntygod/zhiwei-next/pull/128#issuecomment-6127573456)，最终实现另审。已有生产构建、strict195及16项既有API场景通过；新UI/固定Worker、原完整CI/当前primary原Runtime来源/最终冷审仍须完成。实际PC/安卓/USB/Cookie与200%未验收，不把开发DOM当浏览器证明；[运行入口](../../apps/web/README.md)仅新自有虚构临时资料。

保持原完整检查/当前primary来源/独立R3/Ready/live/保护合入，不改治理门。用户原型和未跟踪文件不动，不重试旧受限实验/被拒浏览器；真实入口关闭，P1-08in_progress/Z18not_run，当前共享切片不提前P1-09/P2。

以下保留前项API的提交前交接：[#125](https://github.com/ntygod/zhiwei-next/issues/125) / `feat/125-workbench-api`，P1-08 API切片。其基线 protected main `e84273dbb0417cd3a091330e6291f97d1c6cc62b` 已交付 P1-07 / [PR124](https://github.com/ntygod/zhiwei-next/pull/124)，完整1152项原检查、精确 HEAD R3、Ready/live、保护合入与 main 来源/分支审计成功，#123 已关闭；[最终交付](https://github.com/ntygod/zhiwei-next/pull/124#issuecomment-6118425312)覆盖上一提交的待验证快照。

## 本项任务

先读根和目标路径 AGENTS、[开发与验收分离](../harness/development-and-acceptance.md)、[执行索引](../harness/execution-mode.json)、原 [P1-08 合同](implementation-plan.md#p1-08--交付项目工作台与记忆纠错界面)及 [Local API](../architecture/local-api-contract.md)。同源身份、业务状态、正文资格、版本和命令提交仍由 Daemon/协议事实源决定。

所有者本轮明确答复「尚未完成，先推进 API 和交互接线」，Gemini 继续负责最终 UI 布局。本 execution 交付无布局的浏览器 API 客户端和确定性交互状态：配对、任务开始/继续、事件恢复、记忆查看/纠错、结果核验/反馈。复用现有 DTO、Cookie/CSRF、scope、revision、幂等、分页快照和 SSE；不另造后端业务真源或通用客户端框架。

客户端只展示后端已确认版本；断线显示最后确认状态，权限失效停止消费并清除不再获准的正文，迟到响应不得污染新范围。未知命令提交不得伪成失败或成功，不能自动重复写；SSE 只触发获准重读，不凭进度制造终态。没有页面/实际浏览器证明时，P1-08 整体仍 in_progress，Z18 仍 not_run。

当前实现入口见 [apps/web 接线](../../apps/web/README.md)；[ADR0023](../adr/0023-browser-workbench-api-interactions.md) 的修订设计已独立 R3 批准，最终实现另审。实际临时 HTTP/SQLite 验证了重新配对、任务命令、记忆新版本、自然到期和迟到读；受控 Worker 结果/反馈也已通过。正式完整 CI、当前 primary 成对来源、最终精确 HEAD 审查与合入证明仍待实际完成，以 project-state 和 primary PR 为准。

最终完整 `npm run check` 使用原 Node22.23.1/npm10.9.8；当前 HEAD 独立 R3、当前 primary 原 Runtime 来源、Ready/live、保护合入和 main 来源回读仍须实际完成。不能把局部检查或历史 HEAD 批准写成当前实现交付。

## 保持边界

只使用虚构临时资源和固定注入的模型/I/O，普通真实入口关闭。Z18 实际浏览器/键盘/200% 产品验收保持 not_run；官方 Pi+新扩展完整组合、真实 tokenizer/structuredDecision 及 P0-01/02、D-04/D-08、G-2/G-5 不由本项认证。

旧 #90/preintegration-safety、Private/链接替换/备份攻击、capture/restore 及等价争议实验禁跑，具体拒绝不得换路绕过。不接实际模型账户、凭据、个人数据、外发或部署；遗忘不能随代码/数据回滚复活。完整 OS 失去 custody 后的 orphan 回收仍 unsupported，不借本项补修。

本项只交付 API/交互接线，不设计 UI 布局、不运行 P2 自动学习、Procedure 晋升或学习调度。UI 继续由所有者安排 Gemini，#98 原型状态保留。代码走新的受审 revert PR，数据和最新控制 journal 保留且仅前向修复。

## 后续

本切片在同一 primary 完成验证、受保护交付与 reconciliation 后，P1-08 尚待 Gemini 界面接入与对应开发验证；不提前转 P1-09。后续实质切片仍采用独立 canonical Issue/primary PR。
