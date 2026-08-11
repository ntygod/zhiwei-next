# 知微 2.0 · ZhiWei Next

> 记得对，想得早，做得稳。

知微是一个**本地优先、记忆可治理、主动但不过界、模型与 Agent Runtime 可替换的个人认知 Agent**。

本仓库是知微 2.0 的全新实现。旧版知微作为研究原型和事故资料库保留；新版本不追求功能迁移率，也不兼容旧数据库结构。

## 产品边界

知微不再自研通用 Agent Loop。Pi 是默认 Agent Runtime，知微掌握长期价值：

- 带来源、版本、作用域和生命周期的长期记忆；
- 用户纠正后真正失效的旧认知；
- 小而稳定、可解释的上下文编译；
- 基于真实结果的经验学习；
- 克制的主动关注与受控委托；
- 本地权限、审计、导出与数据所有权。

```text
用户界面 / CLI
       │
       ▼
ZhiWei Local Daemon
├─ Cognition Core
├─ Context Compiler
├─ Attention / Delegation / Policy（后续里程碑）
└─ SQLite Truth Source
       │
       ▼
Pi Adapter → Pi Agent Runtime
```

## 当前状态

当前处于 **M0：能观察（Bootstrap）**。

这一阶段只解决一件事：将 Pi 生命周期规范化为知微自己的不可变 Observation，并能够可靠保存、查询和回放。记忆提取、向量检索、主动提醒和桌面端均不属于 M0。

详细计划见：

- [产品愿景](docs/product/product-vision.md)
- [系统架构](docs/architecture/system-architecture.md)
- [领域模型](docs/architecture/domain-model.md)
- [路线图](docs/planning/roadmap.md)
- [M0 实施计划](docs/planning/milestone-m0.md)
- [UI 设计总纲](docs/product/ui-design.md)
- [低保真交互原型](docs/design/prototype/index.html)

## Bootstrap 运行方式

当前骨架刻意保持**零第三方依赖**，使用 Node.js 22 的类型擦除能力运行 TypeScript。M0 的 Pi 适配器技术验证完成后，再固定 Pi、TypeScript 编译器和包管理器版本。

```bash
# 架构约束 + 全部测试
npm run check

# 启动本地 Daemon（默认 http://127.0.0.1:4265）
npm run start:daemon

# 另一个终端检查状态
npm run start:cli -- doctor
```

> Node.js 的 Type Stripping 在 Node 22 中仍可能输出实验性提示；这是 Bootstrap 阶段的临时选择，不是最终构建方案。

## 仓库结构

```text
apps/
  daemon/              本地认知服务进程
  cli/                 开发与诊断入口
  desktop/             最终桌面端边界说明（M6）
  web/                 最终 Web UI 边界说明（M6）

packages/
  domain/              纯领域类型和不变量
  cognition-core/      候选、Claim、纠正和生命周期
  memory-store/        数据存储端口与 Bootstrap 内存实现
  context-compiler/    上下文胶囊编译
  protocol/            与 Runtime 无关的事件协议
  pi-adapter/          唯一允许接触 Pi 类型的边界
  evals/               长期场景评估
docs/
  product/             产品与交互设计
  architecture/        长期架构
  planning/            里程碑与验收
  adr/                 不可轻易反复的架构决策
  design/prototype/    低保真 UI 原型
```

## 架构红线

1. `domain`、`cognition-core`、`memory-store`、`context-compiler` 不得依赖 Pi。
2. LLM 只能提出 `MemoryCandidate`，不能直接写入长期 `MemoryClaim`。
3. 任何可使用的 Claim 都必须有证据、作用域、状态和有效时间。
4. 用户明确纠正必须创建新版本并 supersede 旧版本。
5. 先做结构化作用域过滤，再做相关性排序；跨 Workspace 泄漏目标为零。
6. 主动发现与外部执行分离；默认不能因 Attention 直接产生副作用。
7. 不为旧知微保留兼容层，不复制未经重新证明的旧模块。

## 许可证

仓库当前处于私有孵化阶段，暂标记为 `UNLICENSED`。在首次公开发布前单独完成许可证决策，不默认沿用旧仓库许可证。
