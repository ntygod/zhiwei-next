# 来源、核对范围与设计差异

核对日期：2026-11-02。来源是设计依据，不是本项目运行验收。未执行真实模型、部署或外部写。

## 1. DeepSeek 主来源

- [Super-agent 设计探索：中文原文](https://zhuanlan.zhihu.com/p/2099987320443237060)。本次直接访问返回 403，阅读了[注明转载来源的全文](https://blog2.eimoon.com/p/deepseek-super-agent-design/)及[官方账号英文文章镜像](https://threadnavigator.com/thread/2116857257245987236/)。英文版自身声明为机器翻译。
- [研究原型 README](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/6337fc823ce20251c8de8085948165c81aaa701e/README.md)：研究用途，部分设计未实现，公开版不等于内部版本。
- [原型领域模型](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/6337fc823ce20251c8de8085948165c81aaa701e/docs/001-domain.md)：Source/Trigger/Thread、Ticket/Assignment、订阅直通与 Mandate。
- [原型执行合同](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/6337fc823ce20251c8de8085948165c81aaa701e/docs/003-execution.md)。
- [后台 Job 与子任务处理源码](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/6337fc823ce20251c8de8085948165c81aaa701e/src/executor/background.ts)：事件订阅、等待、kill 与 drain。

继承 Router/Worker、Fast/Slow Path、订阅直通、批处理、Inline/Spill、Chain of Recall、提前准备、异步交互、存算与执行环境分离、独立监督。文章实验是合成调度实验，不证明真实开发质量或长期记忆效果。

## 2. 明确不直接继承的原型简化

| 原型取舍 | 本项目的设计 |
|---|---|
| 跨 Source 身份对应可写在 Prompt 中 | 可信 PrincipalBinding，模型只能建议关联 |
| 订阅 fan-out 不做同样的发件人接纳 | 上下文投递与控制权限分开；控制每次鉴权 |
| 规则变化不直接取消现有执行 | 权限收紧立即阻止新派发，已发生效果保留核对 |
| 近期任务链式回忆为主 | Markdown 长期知识、纠正、过期、来源与依赖治理 |
| 执行器报告驱动部分结束判定 | 独立 criterion/Artifact/receipt 验证 Outcome |

`src/core/memory.ts` 是用于测试的内存 Repository 实现，不是认知记忆模块，不能据文件名推断原型已有长期记忆系统。

## 3. Runtime 源码与官方文档

Pi 备选调查 commit：`c9f4c7b9fcd0f3e6b5bbc35c7c9b6cda35580eb8`，源码包版本 1.4.0，MIT。npm 元数据核对了版本与 integrity；真实安装/编译/模型合同尚未验证。当前默认选择已由 ADR 0030 改为 Harness 宿主。

- [Pi SDK](https://github.com/earendil-works/pi/blob/c9f4c7b9fcd0f3e6b5bbc35c7c9b6cda35580eb8/packages/coding-agent/docs/sdk.md)：prompt、steer/followUp、abort、事件、inMemory 与资源控制。
- [Pi extensions](https://github.com/earendil-works/pi/blob/c9f4c7b9fcd0f3e6b5bbc35c7c9b6cda35580eb8/packages/coding-agent/docs/extensions.md)：provider/tool/context hooks；扩展有宿主权限。
- [Pi 权限说明](https://github.com/earendil-works/pi/blob/c9f4c7b9fcd0f3e6b5bbc35c7c9b6cda35580eb8/README.md)：不自带文件/进程/网络/凭据隔离。
- [Pi npm 元数据](https://registry.npmjs.org/%40earendil-works%2Fpi-coding-agent/1.4.0)。

DeepSeek Harness 当前选定 commit：`ce7073d51254c26cd63b22a60835b8f948deb447`，源码根版本 0.2.2-alpha.2，MIT；`@deepseek-ai/dsh` 同版本 npm 元数据与 integrity 已核对，真实安装/运行未验证。

- [公开 Agent API](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/core/agent/README.md)：插件侧 create/resume/steer/followup/inject/cancel/whenIdle。此前将此接入面笼统称为“内部 API”不准确。
- [原生 Agent Loop](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/core/agent-loop/README.md)：未挂持久化后端时 memory-only；已知 root shutdown 与预算边界需额外合同。
- [工具执行链](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/core/tools/README.md)：固定 executor、单调 guard；自定义 executor 可不使用共享链路，不能假设可选 hook 覆盖全部路径。
- [统一模型服务](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/llm/llm/README.md)：主请求、压缩和辅助调用通过模型 seam。
- [后台 Job](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/jobs/jobs/README.md)：完成通知与 owner 边界；默认后端随进程结束。
- [插件生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/docs/cordis-tutorial/02-lifecycle-and-effects.zh.md)：effect 清理；不同异步 disposer 可能并发。
- [打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/docs/user/develop/basic/publish.zh.md)：独立 Bundle、Profile、本地链接、peer + dev 依赖和预构建分发。
- [CLI 组合与默认值](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/apps/cli/reference/README.md)：首次自定义 Profile 的 base、重置语义、默认日志上传与环境读取。知微必须预检最终组合。
- [vendor 边界](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/vendor/README.md)：Loader 变更不是完整事务，启动失败可能部分应用。
- [Harness npm 元数据](https://registry.npmjs.org/%40deepseek-ai%2Fdsh/0.2.2-alpha.2)。
- [CLI 启动诊断源码](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/apps/cli/src/startup-diagnostics.ts)：原始错误直接写 DSH_HOME/logs，失败后回落 stderr；不能只靠禁用 Profile 日志插件处理。
- [CLI 退出控制源码](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/apps/cli/src/process-shutdown.ts)及[信号入口](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/apps/cli/src/profile-boot.ts)：信号触发 root disposal，固定5秒硬上限；知微15秒业务drain必须先于该入口。
- [Cordis npm 元数据](https://registry.npmjs.org/%40deepseek-ai%2Fcordis/4.0.6-alpha.1)及[dsh-agent 发布 peer 要求](https://registry.npmjs.org/%40deepseek-ai%2Fdsh-agent/0.2.2-alpha.2)：Cordis 的版本独立于 dsh，示例与锁文件不能直接复制同一个版本号。

- [SDK Server](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/sdk/server/README.md)：入队、事件、resume 与 shutdown。
- [SDK Protocol](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/sdk/protocol/README.md)：当前无单会话 cancel/session-close；无协议版本协商承诺。
- [官方产品入口](https://www.deepseek.com/en/harness/)确认开源与开发文档入口。

Codex 使用[官方 App Server 文档](https://learn.chatgpt.com/docs/app-server)：Thread/Turn/Item、turn/steer、turn/interrupt、事件与审批。该文档为滚动来源，尚未选定并测试具体 Codex 发布制品，不据此承诺替换即兼容。

SDK wire 的限制不代表原生插件 API 的能力限制；本次选择的是后者，并显式保留跨进程桥接的实现与验收责任。

## 4. 基础设施依据

- [PostgreSQL 17 SELECT/行锁](https://www.postgresql.org/docs/17/sql-select.html)：支持队列领取使用的 SKIP LOCKED；SQL 能力不自动证明本项目幂等与业务正确性。
- [S3 条件写](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)：If-None-Match/If-Match 是单对象条件，不能宣称跨对象事务。

本地文件对象适配器和其他 S3 兼容服务必须独立验证原子写、条件写、读一致性、崩溃持久性和删除行为，不能仅因 API 名称一致继承 Amazon S3 的保证。

## 5. 本项目新增的设计

本项目自行负责：长期记忆与主动学习、受众分区、可信身份映射、消息应用回执、任务结果验证、权限/失效屏障、资源冲突、删除后恢复、设备掉线与任务停滞。这些是明确的设计选择，并非宣称原论文完全没有想到相关问题；论文也将长期记忆、安全、上下文边界和协作扩展列为开放问题。
