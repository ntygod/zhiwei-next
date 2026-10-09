> 历史规划：design-v2 已重新安排产品顺序。本文原任务/场景/证据保留，不再作为选工作入口；当前见 [完整设计](design-baseline.md)、[开发任务](implementation-plan.md) 与 [过渡映射](design-transition.md)。

# 横向工程执行计划

> 文档状态：Issue #72 的执行细化提案，随本项 PR 合入后生效；不是实现完成记录、ADR 批准或 PR 审查结论。

G-1…G-5 是当前后续阶段需要的有限基线。G-6 是维护项，不阻塞正常产品链。实现和测试细节随产品包增加，不把未来每一次维护重复计为新工作包。

## 拆分策略

G-1 先交付有实质内容的边界/决策文档，再按真实需要交付静态不变量映射与组合校验；不在一个 PR 同时实现协议、存储和宿主。G-2 先接受威胁/保留合同，再落实实际接入所需最小拒绝边界；它不是要求 M0 提前完成 M5。

G-6a（状态/历史事实源分离）与 G-6b（#15 去重）必须分别作为单目标任务，不共用一个大 PR。两者在工作包统计中仍只算 G-6。#15 开工前先核对旧范围和现行机器规则，历史 private/free 风险文字不能被当作当前状态。

| 编号 | 工作包 | 直接前置 | 规划风险 |
|---|---|---|---|
| G-1 | 架构合同与不变量归属基线 | 无任务依赖；仍须仓库对账 | R2 |
| G-2 | 数据策略、威胁模型和接入前安全 | G-1 | R3 |
| G-3 | 正式工具链与依赖闭包 | G-1 | R2 |
| G-4 | 可执行场景与证据运行器基线 | G-1, G-3 | R2 |
| G-5 | Ledger 规模、持久性与演进验证 | M0-1, G-2, G-3, G-4 | R2 |
| G-6 | 项目状态与治理噪声维护 | 无任务依赖；仍须仓库对账 | R3 |

## G-1 · 架构合同与不变量归属基线

**交付结果：**明确不可插拔核心和可替换能力，使不变量有唯一 owner。

**前置：**无任务依赖；仍须仓库对账。 **规划风险：**R2。

**预计触及：**`docs/adr`、`docs/architecture`、`packages/protocol`、`packages/domain`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-01, D-02, D-10。

### 完成条件

- [ ] 分别记录核心边界/会话记录/包归属决策。
- [ ] 建立不变量→所属包→调用入口→正反测试映射。
- [ ] harness.config.json 与产品配置分离。

### 必须覆盖的失败路径

- 重复 ID/无 owner。
- Provider 关闭核心校验。

**明确不做：**不重写 v1、不引入 Cordis/通用 DI、不改合并门禁。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[I67](https://github.com/ntygod/zhiwei-next/issues/67)；[ARCH](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/system-architecture.md)；[NRE](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/normalized-runtime-event-v1.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## G-2 · 数据策略、威胁模型和接入前安全

**交付结果：**真实数据、凭证、外发或工具接入前有明确边界。

**前置：**G-1。 **规划风险：**R3。

**预计触及：**`docs/adr`、`docs/architecture/trust-and-safety.md`、`apps/daemon`、`packages/protocol`、`packages/memory-store`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-04, D-08。

### 完成条件

- [ ] 描述可信进程/同机其他进程/文件修改能力与不保证情形。
- [ ] 最小本地 API/路径/模型外发限制可用合成数据测试。
- [ ] 事件元数据、正文、Claim、缓存和备份保留明确。

### 必须覆盖的失败路径

- 未授权客户端/路径越界。
- Private 外发/工具返回指令。
- 凭证标记进入日志。

**明确不做：**不在 M0 实现完整 Delegation，不上传用户资料作证据。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## G-3 · 正式工具链与依赖闭包

**交付结果：**正式 Adapter 可重复安装和完整类型检查。

**前置：**G-1。 **规划风险：**R2。

**预计触及：**`package.json`、`packages/pi-adapter`、`scripts`、`docs/adr`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-07。

### 完成条件

- [ ] 决定 Node/TS/包管理器/Pi 支持版本。
- [ ] 固定闭包并测试无凭证环境。
- [ ] 变更依赖重新跑兼容矩阵，Workflow 修改按 R3。

### 必须覆盖的失败路径

- 依赖漂移/缺 API/类型错误。
- 读取宿主配置。

**明确不做：**不因新版本发布就升级 Pi。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[README](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/README.md)；[NRE](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/normalized-runtime-event-v1.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## G-4 · 可执行场景与证据运行器基线

**交付结果：**场景描述能执行、注入故障并输出可对比证据。

**前置：**G-1, G-3。 **规划风险：**R2。

**预计触及：**`packages/evals`、`scripts`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 时钟/ID/模型/I/O 可注入。
- [ ] 失败/跳过/未运行分开。
- [ ] 绑定 HEAD/环境/场景版本；提供运行器自测。

### 必须覆盖的失败路径

- 故意错误/超时。
- 未知场景/缺证据伪通过。

**明确不做：**不实现未来阶段能力，不以覆盖率替代行为。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## G-5 · Ledger 规模、持久性与演进验证

**交付结果：**测清强校验成本与故障边界，决定后续 Schema 合法扩展。

**前置：**M0-1, G-2, G-3, G-4。 **规划风险：**R2。

**预计触及：**`packages/memory-store`、`packages/evals`、`docs/adr`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-02, D-03。

### 完成条件

- [ ] 1千/1万/10万合成事件测试写入、分页、重启、内存、事件循环延迟。
- [ ] 区分应用崩溃、系统和存储故障及未证明保证。
- [ ] 固定设备和负载后接受数值预算或独立优化任务。
- [ ] 旧库升级/新表/完整 manifest 的兼容路径明确。

### 必须覆盖的失败路径

- 磁盘满/锁竞争/权限不足。
- 损坏/迁移中断/恢复失败。

**明确不做：**不删全量验证，不把优化塞回 #56。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[LEDGER](https://github.com/ntygod/zhiwei-next/blob/f4b94886020ea5c67c302f6eac2db518ac6bde27/docs/architecture/sqlite-observation-ledger-v1.md)；[I56](https://github.com/ntygod/zhiwei-next/issues/56)。具体拆分、依赖和完成条件是本执行计划的提案。

## G-6 · 项目状态与治理噪声维护

**交付结果：**当前状态不混同历史证据，并降低安全重复 dispatch。

**前置：**无任务依赖；仍须仓库对账。 **规划风险：**R3。

**预计触及：**`docs/harness`、`scripts`、`.github/workflows`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] G-6a 单独处理状态/历史导航，保留机器锚点。
- [ ] G-6b 复用 #15 独立实现去重。
- [ ] 保留 required checks/冷审/保护/receiver live readback。

### 必须覆盖的失败路径

- 旧 HEAD/错对象。
- 并发标记/失败重试。

**明确不做：**不阻塞正常主线，不改 owner-input 正文，不删未知分支。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[I15](https://github.com/ntygod/zhiwei-next/issues/15)；[STATE](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/harness/project-state.md)；[WORK](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/harness/work-item-lifecycle.md)。具体拆分、依赖和完成条件是本执行计划的提案。
