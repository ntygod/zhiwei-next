# 知微 Next · ZhiWei

> 持续理解目标，完成任务，从结果学习，在合适时机帮助。

知微是本地优先的完整个人 Agent。它把可纠正记忆、任务执行、结果学习、主动帮助与有界授权连成长期合作体验；Pi 是首个执行 Runtime，认知真源由知微维护。

## 设计与开发入口

- [完整设计总览](docs/planning/design-baseline.md)
- [产品与使用场景](docs/product/product-vision.md)、[交互设计](docs/product/ui-design.md)
- [系统架构](docs/architecture/system-architecture.md)、[领域模型](docs/architecture/domain-model.md)
- [详细架构设计与模块合同](docs/architecture/detailed-design.md)
- [认知循环](docs/architecture/cognitive-loop.md)、[学习与评估](docs/architecture/learning-and-evaluation.md)
- [主动与执行](docs/architecture/proactivity-and-execution.md)、[数据与接口](docs/architecture/data-and-api.md)、[安全](docs/architecture/trust-and-safety.md)
- [P0—P5 路线图](docs/planning/roadmap.md)、[完整任务卡](docs/planning/implementation-plan.md)、[验收标准](docs/planning/acceptance-criteria.md)
- [旧设计过渡](docs/planning/design-transition.md)、[下一任务交接](docs/planning/next-task-handoff.md)

## 当前实现

当前产品验收阶段为 **design-v2 / P0**。已交付 Runtime v1、SQLite Ledger v1、固定工具链与 CLI 方向、受保护本地诊断、场景运行器，以及按[开发与验收分离](docs/harness/development-and-acceptance.md)推进的 Task/Outcome、预算、P1 领域合同与 v2 认知持久化。当前 [P1-03 受控 Worker/Broker](docs/architecture/controlled-pi-worker.md)只接固定合成材料和接收器；完整会话/真实授权、学习、主动、工作台和桌面仍待相应任务与验收，不能从组件已实现推导产品可用。

新顺序为：接入前置 → 连续协作 Alpha → 可验证学习 → 主动协作 → 可靠委托与完整桌面 v1 → 跨 Runtime 扩展。P1 就有可用工作台与结果验证；原 M0—M7 计划保留为历史，不再自动决定下一任务。全部既有质量与合并门保留。

本仓库不兼容旧知微数据库，不以旧功能迁移率评价进度。实际已合入状态与限制见[项目状态](docs/harness/project-state.md)。
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
  desktop/             桌面壳（P4 目标）
  web/                 产品工作台（P1 目标）

packages/
  domain/              纯领域类型和不变量
  cognition-core/      候选、Claim、纠正和生命周期
  memory-store/        存储端口、SQLite Ledger 与后续认知持久化
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

P1-04 当前合成实施边界见[持久任务与会话](docs/architecture/persistent-task-sessions.md)；不启用真实入口。
