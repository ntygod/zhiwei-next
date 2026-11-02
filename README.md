# 知微 · Super Agent

知微是持续在线、跨入口协作的个人 Agent：接收用户与环境事件，理解目标，并行推进任务，形成可纠正的长期记忆，在适当时机提供帮助。

本仓库已按所有者 2026-11-02 的明确指令重建。当前交付为 **SA1 完整架构设计**，不是产品实现或可运行演示。不按开发阶段拆分架构；UI 设计不在本次范围。旧实现、测试与设计可从 Git 历史恢复。

## 已选定的设计

- TypeScript；默认云端部署，同一控制面支持本地与混合部署。
- 采用 DeepSeek Super-agent 的 Router / Worker、事件过滤与订阅直通、异步交互、计算/状态/执行环境分离和独立监督思路。
- 默认应用宿主与 Runtime 为 **DeepSeek Harness 的专用 Profile/Bundle 组合及其原生 Agent Loop**；知微在独立仓库开发自己的 TypeScript 插件，不自研模型/工具执行循环。
- **Markdown 保存记忆正文及语义元数据**；PostgreSQL 保存当前有效版本、权限、任务、队列和提交状态；对象存储保存文档与证据。该方案不是“全系统无关系型数据库”。
- 模型提出判断与行动；服务验证身份、范围、版本、预算和完成证据。长期认知不属于 Runtime 会话。

## 阅读入口

| 问题 | 事实源 |
|---|---|
| 完整系统如何组织 | [架构总览](docs/architecture/overview.md) |
| 对象、真源与状态如何划分 | [领域模型](docs/architecture/domain.md) |
| 事件如何路由，执行中如何继续对话 | [事件与全双工交互](docs/architecture/events-and-interaction.md) |
| 如何接入现成 Runtime | [Runtime 选择与合同](docs/architecture/runtime.md) |
| Harness 源码、知微插件与发布如何配合 | [Harness 开发方式](docs/architecture/harness-development.md) |
| 如何调度、调用工具并避免重复副作用 | [执行与调度](docs/architecture/execution.md) |
| Markdown 记忆如何可靠工作 | [记忆与存储](docs/architecture/memory.md) |
| 如何主动学习并证明效果 | [学习系统](docs/architecture/learning.md) |
| 何时保持安静、准备、提醒和行动 | [主动协作](docs/architecture/proactivity.md) |
| 云端、设备与外部内容的权限边界 | [安全与身份](docs/architecture/security.md) |
| 常驻、扩容、掉线、备份与恢复 | [部署与运维](docs/architecture/deployment.md) |
| 外部接口、内部端口及数据提交 | [接口合同](docs/architecture/contracts.md) |
| 如何验收整个产品 | [场景与验收](docs/architecture/acceptance.md) |
| 哪些来自论文，哪些是本项目决策 | [来源与差异](docs/architecture/references.md) |
| 为什么清空以及如何恢复旧仓库 | [重建记录](docs/repository-reset.md) |

长期决策见 [ADR 0027](docs/adr/0027-super-agent-reset.md)、[ADR 0029](docs/adr/0029-markdown-memory.md)、[ADR 0030](docs/adr/0030-harness-host.md)。原 Pi 选择保留在已被替代的 [ADR 0028](docs/adr/0028-pi-runtime.md)。

## 检查

```sh
npm run check
```

当前命令仅检查架构文档链接、机器合同、来源登记和需求/验收映射。它不证明 Runtime、事务、隔离、恢复或模型效果已实现。不存在产品启动命令。重建前旧检查的真实结果及合并限制见[重建记录](docs/repository-reset.md)。
