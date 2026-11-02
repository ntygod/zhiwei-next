# ADR 0030：DeepSeek Harness 宿主与独立知微插件仓库

- 状态：Proposed，待本次精确 HEAD 独立设计审查与合入；真实接入未验证。
- 日期：2026-11-02。
- 工作项：[#132](https://github.com/ntygod/zhiwei-next/issues/132)，沿用 [PR #133](https://github.com/ntygod/zhiwei-next/pull/133)。
- 替代：[ADR 0028](0028-pi-runtime.md) 的默认 Pi SDK 选择；细化 ADR 0027 的应用组合与进程入口。

## 背景

所有者要求重评 Harness 的插件理念，并明确选择 DeepSeek Harness。此前比较主要依据 SDK JSON-RPC，把单会话取消缺口用于默认选型；复核发现公开插件侧 Agent API 已提供 cancel/steer/followup/inject/whenIdle，因此应比较应用宿主路线，而非仅比较三个外部执行器 SDK。

## 决策

1. 采用固定 DeepSeek Harness 0.2.2-alpha.2、原生 Agent Loop 与 Cordis 组合机制，不自研 Loop。
2. 知微在独立仓库编写 TypeScript 插件、Bundle、领域合同、持久任务和记忆能力。上游源码可另行 checkout 阅读与调试，默认不 Fork 或向上游树内塞入业务代码。
3. 控制面与 Worker 使用专用 Profile，以公开插件侧 Agent API 驱动。跨进程提供知微窄桥接，不把原生方法虚构为 SDK wire 方法。
4. 权限、Task/EffectFence、Markdown 记忆、结果验证继续由知微负责；原生 Session/Job 所有权不是长期业务授权。
5. 固定受审组合与 mandatory readiness；不挂载原始会话持久化/上传，不开放 Agent 自管理插件，生产不使用 HMR 作为事务升级机制。
6. 优先发布预构建 Bundle/tarball 与固定宿主制品。需要上游补丁时登记独立差异与升级回归，不维护未记录的深度 Fork。

## 取舍

复用依赖管理、作用域、effect 清理、Agent 生命周期、模型与工具执行链，减少知微自行维护的应用宿主机制。代价是更广的框架绑定、preview 版本变化、Profile/peer 解析与清理顺序验证。

上游默认 jobs-local 随进程结束，Loader/HMR 不提供完整配置事务，原生 shutdown 不能独自证明业务回执持久。这些通过知微的持久账本、受控桥接、显式 drain 与 EffectFence 合同处理，不放宽既有数据与授权标准。

## 验证与回滚

R01—R09、S11 及现有全部效果/恢复/记忆场景仍须实际接入验证。本次只检查设计一致性、固定官方来源与 npm 元数据，进行独立 R3 设计审查。若设计选择撤回，以新受审变更恢复前一设计；不自动切换运行中的 Agent，也不因此恢复旧权限或旧数据。
