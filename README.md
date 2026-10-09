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

`NormalizedRuntimeEvent v1` 与 SQLite Ledger 已通过 PR #66/#69 合入。G-1 有限架构基线由 PR #81 完成；D-01/02/10 仅在[登记范围](docs/planning/current-decisions.md)内 Accepted。G-3 正式工具链与 CLI JSONL 路径由 PR #83/#87 完成，D-07 有限接受；root SDK 的 46 个声明诊断仍不支持。G-4 场景证据运行器已由 PR #89 交付，仅三个 Ledger 场景 PARTIAL，另外 21 项未运行，不等于完整 M0 产品场景。

G-2a 的 [health/meta/doctor 保护](docs/architecture/local-diagnostics.md)已由 PR #85 交付，需用户或可信启动器显式配置诊断凭据。当前 [Issue #90](https://github.com/ntygod/zhiwei-next/issues/90)补齐接入前文件、Private 外发、工具信任和保留实证；[安全合同候选](docs/architecture/trust-and-safety.md)及 D-04/D-08 仍 Proposed。G-2 整体未完成，G-5 继续等待 G-2，M0-2 继续等待 G-5；#67、正式 Host/Session/Worker/Daemon 链与 M0 整体未完成。

详细计划见：

- [产品愿景](docs/product/product-vision.md)
- [系统架构](docs/architecture/system-architecture.md)
- [领域模型](docs/architecture/domain-model.md)
- [路线图](docs/planning/roadmap.md)
- [M0—M7 执行计划与任务依赖](docs/planning/execution-plan.md)
- [M0 实施计划](docs/planning/milestone-m0.md)
- [UI 设计总纲](docs/product/ui-design.md)
- [低保真交互原型](docs/design/prototype/index.html)

## Bootstrap 运行方式

固定 Node 22.23.1 / npm 10.9.8 / TypeScript 5.9.3。先完成无凭证隔离安装，再执行真实 strict noEmit 编译和原有 Node 类型擦除行为测试；支持边界与 root SDK 声明限制见[工具链说明](docs/architecture/formal-toolchain.md)。

```bash
# 精确依赖安装（临时 HOME/cache，禁止 lifecycle scripts）
sh scripts/formal-toolchain.sh install

# 严格类型检查 + 架构约束 + 全部测试
npm run check

# 先由用户或可信启动器向两个进程注入同一个 ZHIWEI_DIAGNOSTIC_TOKEN
# 必填 64 字符十六进制值；此处不提供或保存实际凭据
# 启动本地 Daemon（默认 http://127.0.0.1:4265）
npm run start:daemon

# 另一个终端检查状态
npm run start:cli -- doctor
```

配置、兼容变化、错误类别和未保证边界见[本地诊断说明](docs/architecture/local-diagnostics.md)。未配置凭据时 Daemon/doctor 在 I/O 前失败；help/version 不受影响。

> Node.js 的 Type Stripping 在 Node 22 中仍可能输出实验性提示；运行时擦除与编译检查是两条独立验证路径；正式构建/生产执行路径仍待后续里程碑。

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

仓库当前公开可读，许可证仍标记为 `UNLICENSED`；公开仓库不表示已授予开源许可。在首次产品发布前单独完成许可证决策，不默认沿用旧仓库许可证。
