> 历史规划：design-v2 已重新安排产品顺序。本文原任务/场景/证据保留，不再作为选工作入口；当前见 [完整设计](design-baseline.md)、[开发任务](implementation-plan.md) 与 [过渡映射](design-transition.md)。

# M2—M7 执行边界与条件扩展

> 文档状态：Issue #72 的执行细化提案，随本项 PR 合入后生效；不是实现完成记录、ADR 批准或 PR 审查结论。

保留原路线图，不为赶验收合并里程碑。每阶段开始前将该阶段工作包再拆成小型 canonical execution Issue；以下是执行合同框架，不预创建未来模块、目录或全部 Issue。具体新包路径需经架构 ADR 选择。

完成门见[执行总计划](execution-plan.md)。M5-7 的配置生命周期先于 M5-6 完整执行器；M6-8 备份恢复先于 M6-7 发布；阶段门要求阶段内全部必需包，不按编号最大的任务自动判完成。M7 先验证当时真实接入能力，不从 Pi 合同外推其他 Runtime。

# M2 工作包

| 编号 | 工作包 | 直接前置 | 规划风险 |
|---|---|---|---|
| M2-1 | 上下文资格过滤与相关性排序 | M1-7 | R3 |
| M2-2 | 固定预算 Capsule 与贡献者接口 | M2-1 | R2 |
| M2-3 | 记忆快照与失效水位 | M2-2, M0-3 | R3 |
| M2-4 | Pi 上下文注入与原生 Package | M2-3 | R3 |
| M2-5 | Goal 与项目工作状态 | M1-7 | R2 |
| M2-6 | 本轮依据解释与阶段证据 | M2-4, M2-5 | R2 |

## M2-1 · 上下文资格过滤与相关性排序

**交付结果：**合法、有效、相关的认知进入编译候选。

**前置：**M1-7。 另外须完成 M1 阶段门。 **规划风险：**R3。

**预计触及：**`packages/context-compiler`、`packages/cognition-core`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-06。

### 完成条件

- [ ] 状态/有效期/Scope/隐私先于排序。
- [ ] 同输入排序确定，无结果不自动扩大范围。

### 必须覆盖的失败路径

- 失效记录/Private 外发/跨域。
- 争议项任意选边。

**明确不做：**不改变 Claim 事实以迎合回答。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M2-2 · 固定预算 Capsule 与贡献者接口

**交付结果：**在预算内形成可解释、不可变的上下文。

**前置：**M2-1。 另外须完成 M1 阶段门。 **规划风险：**R2。

**预计触及：**`packages/context-compiler`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 贡献顺序、去重、分层预算与截断可复现。
- [ ] token 预算含输入、工具 schema、记忆和输出预留。

### 必须覆盖的失败路径

- 超长记忆/空预算。
- 未知 tokenizer/贡献者超额。

**明确不做：**不建设动态插件 Host。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[I67](https://github.com/ntygod/zhiwei-next/issues/67)；[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M2-3 · 记忆快照与失效水位

**交付结果：**记录实际使用的 Claim 版本与编译信息并使纠正对后续请求生效。

**前置：**M2-2, M0-3。 另外须完成 M1 阶段门。 **规划风险：**R3。

**预计触及：**`packages/context-compiler`、`packages/memory-store`、`packages/protocol`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-01, D-04, D-06。

### 完成条件

- [ ] 保存版本、Claim 引用、水位、内容引用和摘要。
- [ ] 历史快照不可变，下一请求刷新；权限撤销及时生效。

### 必须覆盖的失败路径

- 编译与纠正/遗忘并发。
- 内容被清除/水位落后。

**明确不做：**不改写过去快照伪装一直正确。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[I67](https://github.com/ntygod/zhiwei-next/issues/67)；[DOMAIN](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/domain-model.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M2-4 · Pi 上下文注入与原生 Package

**交付结果：**实际 Pi 会话通过受控表面使用知微认知。

**前置：**M2-3。 另外须完成 M1 阶段门。 **规划风险：**R3。

**预计触及：**`packages/pi-adapter`、`packages/context-compiler`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-01, D-08。

### 完成条件

- [ ] 注入位置/优先级/Runtime 变换后记录范围可观察。
- [ ] 失效与外发策略有效，安装停用不损害真源。

### 必须覆盖的失败路径

- 重复注入/变换漂移。
- Private 外发/stale capsule。

**明确不做：**不接第二 Runtime，不扩大工具权限。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[I67](https://github.com/ntygod/zhiwei-next/issues/67)。具体拆分、依赖和完成条件是本执行计划的提案。

## M2-5 · Goal 与项目工作状态

**交付结果：**目标、继续点和未解决问题可跨会话保留。

**前置：**M1-7。 另外须完成 M1 阶段门。 **规划风险：**R2。

**预计触及：**`packages/domain`、`packages/cognition-core`、`packages/memory-store`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 目标有完成条件、来源、版本，摘要有适用期。
- [ ] 状态变更引用结果证据。

### 必须覆盖的失败路径

- 自报完成。
- 旧摘要/自动 Scope 升级。

**明确不做：**不引入 Scheduler/Delegation。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[DOMAIN](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/domain-model.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M2-6 · 本轮依据解释与阶段证据

**交付结果：**解释选取和排除的认知及其实际注入内容。

**前置：**M2-4, M2-5。 另外须完成 M1 阶段门。 **规划风险：**R2。

**预计触及：**`apps/cli`、`apps/daemon`、`packages/evals`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 来源/版本/原因/预算可查看。
- [ ] 固定任务对比无长期记忆、固定摘要、治理记忆，报告失败与差异。

### 必须覆盖的失败路径

- 编译和注入不一致。
- 纠正后仍用旧版。

**明确不做：**不虚构收益或普遍零风险。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。

# M3 工作包

| 编号 | 工作包 | 直接前置 | 规划风险 |
|---|---|---|---|
| M3-1 | Outcome 与结果证据 | M2-6 | R2 |
| M3-2 | 自动 MemoryCandidate 提取 | M3-1, M1-7 | R3 |
| M3-3 | Procedure Candidate 与适用条件 | M3-1, M3-2 | R2 |
| M3-4 | Procedure 晋升、版本和退役 | M3-3 | R2 |
| M3-5 | 学习审阅与阶段证据 | M3-4 | R2 |

## M3-1 · Outcome 与结果证据

**交付结果：**真实结果独立于模型与进程完成信号。

**前置：**M2-6。 另外须完成 M2 阶段门。 **规划风险：**R2。

**预计触及：**`packages/domain`、`packages/cognition-core`、`packages/memory-store`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 区分完成、部分完成、失败、取消、无法验证。
- [ ] 检查器/产物/证据有版本，可被纠正。

### 必须覆盖的失败路径

- exit 0/settled/自报成功单独判成功。

**明确不做：**不等待 M5 才评价普通交互任务。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[DOMAIN](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/domain-model.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M3-2 · 自动 MemoryCandidate 提取

**交付结果：**基于证据提出候选而不直接写长期事实。

**前置：**M3-1, M1-7。 另外须完成 M2 阶段门。 **规划风险：**R3。

**预计触及：**`packages/cognition-core`、`packages/pi-adapter`、`packages/evals`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 记录提取器版本/输入范围/来源/去重。
- [ ] 仍经 M1 接受与隐私/外发检查。

### 必须覆盖的失败路径

- 提示注入/无证据。
- 失败经验伪造成功。

**明确不做：**不自授写真源和执行权限。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M3-3 · Procedure Candidate 与适用条件

**交付结果：**形成包含前提与失败边界的可复用做法候选。

**前置：**M3-1, M3-2。 另外须完成 M2 阶段门。 **规划风险：**R2。

**预计触及：**`packages/domain`、`packages/cognition-core`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 步骤关联真实证据。
- [ ] 区分一次经验和稳定程序，保留环境限制。

### 必须覆盖的失败路径

- 删去失败路径。
- 环境变化/偶然成功。

**明确不做：**不自动执行生成程序。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[DOMAIN](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/domain-model.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M3-4 · Procedure 晋升、版本和退役

**交付结果：**依据重复结果和反证管理可复用经验。

**前置：**M3-3。 另外须完成 M2 阶段门。 **规划风险：**R2。

**预计触及：**`packages/cognition-core`、`packages/memory-store`、`packages/evals`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 固定晋升/退役/supersede 规则。
- [ ] 使用记录与适用性可追踪。

### 必须覆盖的失败路径

- 重复计同一结果。
- 选择性忽略失败/循环自证。

**明确不做：**不只用模型自评评分。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M3-5 · 学习审阅与阶段证据

**交付结果：**用户可以接受、拒绝或纠正学习产物。

**前置：**M3-4。 另外须完成 M2 阶段门。 **规划风险：**R2。

**预计触及：**`apps/daemon`、`apps/cli`、`packages/evals`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 依据与影响可查。
- [ ] 反馈持久化并影响后续提取，失败不生成成功经验。

### 必须覆盖的失败路径

- 重复反馈/丢反馈。
- 退役候选自动复活。

**明确不做：**不等待 M6 图形界面。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。

# M4 工作包

| 编号 | 工作包 | 直接前置 | 规划风险 |
|---|---|---|---|
| M4-1 | 常驻调度与资源归属 | M3-5, M0-5 | R3 |
| M4-2 | DUE / FOLLOW_UP / CONFLICT Attention | M4-1, M2-5 | R2 |
| M4-3 | 冷却、去重、静默与提醒预算 | M4-2 | R2 |
| M4-4 | Attention 收件箱与接口 | M4-3 | R2 |
| M4-5 | 主动性反馈与阶段证据 | M4-4 | R2 |

## M4-1 · 常驻调度与资源归属

**交付结果：**在既有 Daemon 上提供可恢复调度。

**前置：**M3-5, M0-5。 另外须完成 M3 阶段门。 **规划风险：**R3。

**预计触及：**`apps/daemon`、`packages/domain`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 时区/休眠/漏跑/重复触发语义明确。
- [ ] timer/watcher/job 有 owner 和释放路径。

### 必须覆盖的失败路径

- 时钟跳变/重启。
- 提醒风暴/遗留资源。

**明确不做：**不重做 Supervisor，不默认产生外部副作用。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[I67](https://github.com/ntygod/zhiwei-next/issues/67)。具体拆分、依赖和完成条件是本执行计划的提案。

## M4-2 · DUE / FOLLOW_UP / CONFLICT Attention

**交付结果：**提出具有证据和为何现在的关注事项。

**前置：**M4-1, M2-5。 另外须完成 M3 阶段门。 **规划风险：**R2。

**预计触及：**`packages/cognition-core`、`packages/domain`、`packages/memory-store`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 每项有证据、时间、Scope 和原因。
- [ ] 触发依据失效时更新或撤销。

### 必须覆盖的失败路径

- 无依据推测/过期目标。
- 跨域信号。

**明确不做：**不从 Attention 直接执行。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M4-3 · 冷却、去重、静默与提醒预算

**交付结果：**提醒频率受用户控制且重启后有效。

**前置：**M4-2。 另外须完成 M3 阶段门。 **规划风险：**R2。

**预计触及：**`packages/cognition-core`、`apps/daemon`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 单项/类别/时间段关闭可持久化。
- [ ] 预算和去重状态可恢复。

### 必须覆盖的失败路径

- 重复信号/重新生成 ID。
- 时区变化绕过静默。

**明确不做：**不允许模型自行解除静默。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M4-4 · Attention 收件箱与接口

**交付结果：**查看、延后、忽略和关闭建议并保留解释链。

**前置：**M4-3。 另外须完成 M3 阶段门。 **规划风险：**R2。

**预计触及：**`apps/daemon`、`apps/cli`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 状态操作有清晰合同。
- [ ] 空/失效/并发场景受控，处理建议不等于授权。

### 必须覆盖的失败路径

- 点击/阅读触发业务动作。
- 陈旧操作。

**明确不做：**不重复实现桌面端。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M4-5 · 主动性反馈与阶段证据

**交付结果：**反馈改善提醒而不扩大权限。

**前置：**M4-4。 另外须完成 M3 阶段门。 **规划风险：**R2。

**预计触及：**`packages/evals`、`packages/cognition-core`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 时间场景可回放，噪声与漏报分别报告。
- [ ] 建议仍有证据与时间原因。

### 必须覆盖的失败路径

- 忽略负反馈/重置冷却。
- 绕过长期静默。

**明确不做：**不把通知点击率当唯一目标。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。

# M5 工作包

| 编号 | 工作包 | 直接前置 | 规划风险 |
|---|---|---|---|
| M5-1 | Delegation Contract 与状态机 | M4-5, M3-1 | R2 |
| M5-2 | PolicyGrant 与 Policy Decision | M5-1, G-2 | R3 |
| M5-3 | 审批、撤销与紧急停止 | M5-2 | R3 |
| M5-4 | Sandbox 与凭证边界 | M5-2 | R3 |
| M5-5 | 成本、次数与执行预算 | M5-2 | R3 |
| M5-6 | 后台执行、事件进度与副作用恢复 | M5-3, M5-4, M5-5, M5-7, M0-7 | R3 |
| M5-7 | Provider 生命周期与配置对账 | M5-3, M5-4, M5-5 | R3 |

## M5-1 · Delegation Contract 与状态机

**交付结果：**把明确用户选择转成目标、范围和完成条件。

**前置：**M4-5, M3-1。 另外须完成 M4 阶段门。 **规划风险：**R2。

**预计触及：**`packages/domain`、`packages/memory-store`、`packages/cognition-core`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 定义运行/等待审批/暂停/结果/未知状态。
- [ ] 转换依据实际证据和契约版本。

### 必须覆盖的失败路径

- 重复请求/越域。
- 缺失完成条件。

**明确不做：**不从 Attention 自动生成已授权任务。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M5-2 · PolicyGrant 与 Policy Decision

**交付结果：**每个动作有可解释、具体的授权边界。

**前置：**M5-1, G-2。 另外须完成 M4 阶段门。 **规划风险：**R3。

**预计触及：**`packages/domain`、`packages/cognition-core`、`apps/daemon`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] Agent/Workspace/动作/工具/资源/时间/预算共同决策。
- [ ] 决定绑定策略和契约版本，Provider 不能覆盖核心。

### 必须覆盖的失败路径

- 过期 Grant/资源别名/路径逃逸。
- 记忆注入扩大权限。

**明确不做：**不提供全局始终允许开关。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)；[I67](https://github.com/ntygod/zhiwei-next/issues/67)。具体拆分、依赖和完成条件是本执行计划的提案。

## M5-3 · 审批、撤销与紧急停止

**交付结果：**审批与具体动作绑定且撤销及时生效。

**前置：**M5-2。 另外须完成 M4 阶段门。 **规划风险：**R3。

**预计触及：**`apps/daemon`、`packages/protocol`、`packages/cognition-core`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 审批 ID、范围、版本、有效期明确。
- [ ] 新动作拒绝，在途不可撤销动作标记已发生或不确定。

### 必须覆盖的失败路径

- 陈旧确认/审批重放。
- 并发撤销/失联。

**明确不做：**不声称杀进程撤回已经发生的请求。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)；[I67](https://github.com/ntygod/zhiwei-next/issues/67)。具体拆分、依赖和完成条件是本执行计划的提案。

## M5-4 · Sandbox 与凭证边界

**交付结果：**执行器只得到任务需要的文件、网络和凭证能力。

**前置：**M5-2。 另外须完成 M4 阶段门。 **规划风险：**R3。

**预计触及：**`apps/daemon`、`packages/pi-adapter`、`docs/architecture`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 按支持平台验证隔离能力。
- [ ] 凭证最小暴露，日志脱敏和失效路径可测。

### 必须覆盖的失败路径

- 文件/网络逃逸。
- 环境泄漏/配置失效。

**明确不做：**不支持沙箱时不静默降级。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)；[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M5-5 · 成本、次数与执行预算

**交付结果：**并发、重试和恢复不能突破授权预算。

**前置：**M5-2。 另外须完成 M4 阶段门。 **规划风险：**R3。

**预计触及：**`packages/cognition-core`、`packages/memory-store`、`apps/daemon`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 预留/消耗/释放及不确定计费明确。
- [ ] 边界耗尽停止或请求新授权。

### 必须覆盖的失败路径

- 并发超额/重试绕过。
- 遗留预留/未知价格当零。

**明确不做：**不使用未经核验的实时价格。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)；[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M5-6 · 后台执行、事件进度与副作用恢复

**交付结果：**任务可暂停恢复取消，异常不盲目重复副作用。

**前置：**M5-3, M5-4, M5-5, M5-7, M0-7。 另外须完成 M4 阶段门。 **规划风险：**R3。

**预计触及：**`apps/daemon`、`packages/pi-adapter`、`packages/memory-store`、`packages/protocol`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 幂等键/outbox 或明确对账路径。
- [ ] 进度合并、节流、重连与持久状态一致。
- [ ] 副作用响应丢失进入对账而非直接重试。

### 必须覆盖的失败路径

- 外部响应丢失/取消竞态。
- 重启/非幂等工具/落后订阅。

**明确不做：**不承诺普遍 exactly-once，本项不自动关闭 #44。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**父级产品输入：**#44；只回链产品结果，不把 CI 日志投递到父需求。

**规划依据：**[I44](https://github.com/ntygod/zhiwei-next/issues/44)；[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M5-7 · Provider 生命周期与配置对账

**交付结果：**能力切换和停用有 owner、版本及明确回退。

**前置：**M5-3, M5-4, M5-5。 另外须完成 M4 阶段门。 **规划风险：**R3。

**预计触及：**`apps/daemon`、`packages/pi-adapter`、`packages/protocol`、`packages/evals`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 区分 desired/validated/running/committed。
- [ ] prepare/start/health-check 后切换。
- [ ] 普通配置在合法边界生效，撤销不等待普通切换。

### 必须覆盖的失败路径

- 启动失败/排空超时。
- 半应用/dispose 异常。

**明确不做：**不引入第三方动态插件 Host；M5 总体验证在 M5-6 后。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[I67](https://github.com/ntygod/zhiwei-next/issues/67)；[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)。具体拆分、依赖和完成条件是本执行计划的提案。

# M6 工作包

| 编号 | 工作包 | 直接前置 | 规划风险 |
|---|---|---|---|
| M6-1 | 桌面壳、本地通信与可访问性 | M5-6, M5-7 | R3 |
| M6-2 | Today / Workspace / 会话界面 | M6-1 | R2 |
| M6-3 | Memory 管理界面 | M6-1, M1-7 | R3 |
| M6-4 | Attention / Delegation / 审批与进度界面 | M6-1, M5-6 | R3 |
| M6-5 | 活动审计、状态与外发可见性 | M6-1, M6-2, M6-3, M6-4 | R3 |
| M6-6 | 选定核心连接器 | M6-1, M5-2, M5-7 | R3 |
| M6-7 | 安装、升级、签名与发布 | M6-2, M6-3, M6-4, M6-5, M6-6, M6-8 | R3 |
| M6-8 | 用户备份、导出与恢复 | M6-1, G-5, M1-5 | R3 |

## M6-1 · 桌面壳、本地通信与可访问性

**交付结果：**受控客户端访问同一服务真源。

**前置：**M5-6, M5-7。 另外须完成 M5 阶段门。 **规划风险：**R3。

**预计触及：**`apps/desktop`、`apps/web`、`apps/daemon`、`docs/product`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-11。

### 完成条件

- [ ] 先决定框架/支持平台/Web 是否独立部署。
- [ ] 连接恢复、设置、键盘/读屏与空/错/权限/降级状态齐备。

### 必须覆盖的失败路径

- 跨来源访问/连接错服务。
- 离线或权限丢失被隐藏。

**明确不做：**不让客户端直写数据库。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[UI](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/product/ui-design.md)；[ARCH](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/system-architecture.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M6-2 · Today / Workspace / 会话界面

**交付结果：**查看今日事项、工作空间和会话依据。

**前置：**M6-1。 另外须完成 M5 阶段门。 **规划风险：**R2。

**预计触及：**`apps/desktop`、`apps/web`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 沿用六区信息架构，会话属于 Workspace。
- [ ] 继续点/本轮依据与服务一致。

### 必须覆盖的失败路径

- 空项目/消息失败。
- 重连/切换串域。

**明确不做：**不创建第二套真源。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[UI](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/product/ui-design.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M6-3 · Memory 管理界面

**交付结果：**可查看、纠正、确认候选、处理冲突与遗忘。

**前置：**M6-1, M1-7。 另外须完成 M5 阶段门。 **规划风险：**R3。

**预计触及：**`apps/desktop`、`apps/web`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 版本与来源渐进展示，清除有具体确认。
- [ ] 操作后回读真实服务结果。

### 必须覆盖的失败路径

- 陈旧版本/取消确认。
- 服务失败/虚假成功。

**明确不做：**不在 UI 绕过 M1 规则。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[UI](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/product/ui-design.md)；[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M6-4 · Attention / Delegation / 审批与进度界面

**交付结果：**一处查看建议、授权范围和后台进度。

**前置：**M6-1, M5-6。 另外须完成 M5 阶段门。 **规划风险：**R3。

**预计触及：**`apps/desktop`、`apps/web`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 审批卡明确动作、资源、工具、时间和预算。
- [ ] 订阅/暂停/恢复/取消无需模型轮询。
- [ ] #44 完成证据覆盖 M0-7、M5-6 与本任务。

### 必须覆盖的失败路径

- 旧审批/未知结果。
- 执行失败/断线伪造完成。

**明确不做：**打开建议详情不是执行授权。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**父级产品输入：**#44；只回链产品结果，不把 CI 日志投递到父需求。

**规划依据：**[UI](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/product/ui-design.md)；[I44](https://github.com/ntygod/zhiwei-next/issues/44)；[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M6-5 · 活动审计、状态与外发可见性

**交付结果：**展示行动、来源、权限、Runtime 和数据外发状态。

**前置：**M6-1, M6-2, M6-3, M6-4。 另外须完成 M5 阶段门。 **规划风险：**R3。

**预计触及：**`apps/desktop`、`apps/web`、`apps/daemon`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 关联证据和版本，最小必要信息导出。
- [ ] 持续显示隐私状态，不复制凭证到日志。

### 必须覆盖的失败路径

- 失效引用/已清除正文。
- 跨域审计/隐藏失败。

**明确不做：**不展示原始思维链，不以 UI 摘要替代审计真源。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[UI](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/product/ui-design.md)；[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M6-6 · 选定核心连接器

**交付结果：**按有限名单引入外部材料，保留权限、来源和撤销。

**前置：**M6-1, M5-2, M5-7。 另外须完成 M5 阶段门。 **规划风险：**R3。

**预计触及：**`apps/daemon`、`packages/protocol`、`docs/architecture`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-11。

### 完成条件

- [ ] 每个服务独立 Issue，明确读写范围。
- [ ] 资料有来源/更新时间/水位。
- [ ] 停用和撤销不残留任务。

### 必须覆盖的失败路径

- 重复导入/远端删除。
- 限流/过期授权/恶意材料。

**明确不做：**不一次承诺所有服务。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[I67](https://github.com/ntygod/zhiwei-next/issues/67)。具体拆分、依赖和完成条件是本执行计划的提案。

## M6-7 · 安装、升级、签名与发布

**交付结果：**产品可在明确平台安全安装升级和回退。

**前置：**M6-2, M6-3, M6-4, M6-5, M6-6, M6-8。 另外须完成 M5 阶段门。 **规划风险：**R3。

**预计触及：**`apps/desktop`、`scripts`、`docs`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-11。

### 完成条件

- [ ] 正式决定许可证/依赖许可/分发签名。
- [ ] 升级验证迁移与备份。
- [ ] 发布凭证及平台差异明确。

### 必须覆盖的失败路径

- 中断升级/签名失败。
- 不支持平台/降级破坏旧库。

**明确不做：**不为发布绕过独立审查。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[README](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/README.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M6-8 · 用户备份、导出与恢复

**交付结果：**用户掌握一致性备份和可解释恢复。

**前置：**M6-1, G-5, M1-5。 另外须完成 M5 阶段门。 **规划风险：**R3。

**预计触及：**`apps/daemon`、`apps/cli`、`apps/desktop`、`packages/memory-store`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-04。

### 完成条件

- [ ] 版本格式/完整性校验/恢复 dry-run 可执行。
- [ ] 凭证排除，恢复尊重遗忘策略。

### 必须覆盖的失败路径

- 损坏归档/未知版本。
- 路径穿越/恢复中断/旧数据复活。

**明确不做：**不把导出包作公开 Fixture。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)。具体拆分、依赖和完成条件是本执行计划的提案。

# M7 工作包

| 编号 | 工作包 | 直接前置 | 规划风险 |
|---|---|---|---|
| M7-1 | 稳定 Cognition Protocol 与能力声明 | M6-7, M6-8 | R2 |
| M7-2 | Codex Adapter | M7-1 | R3 |
| M7-3 | Claude Adapter | M7-1 | R3 |
| M7-4 | MCP 认知接入面 | M7-1 | R3 |
| M7-5 | 移动伴侣与远程审批 | M7-1, M5-3 | R3 |

## M7-1 · 稳定 Cognition Protocol 与能力声明

**交付结果：**多 Runtime 使用相同认知语义但可声明能力差异。

**前置：**M6-7, M6-8。 另外须完成 M6 阶段门。 **规划风险：**R2。

**预计触及：**`packages/protocol`、`packages/cognition-core`、`docs/architecture`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 版本协商、兼容性和最小操作闭包明确。
- [ ] Scope/来源/纠正由核心决定。

### 必须覆盖的失败路径

- 未知 required 字段。
- 旧消费者/不支持能力伪成功。

**明确不做：**不抹平 Runtime 真实差异。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[I67](https://github.com/ntygod/zhiwei-next/issues/67)。具体拆分、依赖和完成条件是本执行计划的提案。

## M7-2 · Codex Adapter

**交付结果：**在实施时经验证的接入面连接同一认知核心。

**前置：**M7-1。 另外须完成 M6 阶段门。 **规划风险：**R3。

**预计触及：**`packages/protocol`、`docs/architecture`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 先能力 Spike 再实现，记录不可支持能力。
- [ ] 通过跨会话/纠正/隔离/停用场景。

### 必须覆盖的失败路径

- 版本漂移/事件缺失。
- 编造完成或来源。

**明确不做：**不预设与 Pi 等价，不自研 Loop。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M7-3 · Claude Adapter

**交付结果：**另一 Runtime 遵守相同治理记忆边界。

**前置：**M7-1。 另外须完成 M6 阶段门。 **规划风险：**R3。

**预计触及：**`packages/protocol`、`docs/architecture`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 实施时核验可用接入面和授权条件。
- [ ] 共享认知与专属故障矩阵均通过。

### 必须覆盖的失败路径

- 不可观测输入/隐式替换。
- 未经授权外发。

**明确不做：**不照搬 Pi 对象模型。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M7-4 · MCP 认知接入面

**交付结果：**按最小权限开放认知操作。

**前置：**M7-1。 另外须完成 M6 阶段门。 **规划风险：**R3。

**预计触及：**`packages/protocol`、`apps/daemon`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 身份/Scope/授权和能力集明确。
- [ ] 写操作通过既有核心端口。

### 必须覆盖的失败路径

- 越域读取/未经授权纠正删除。
- 恶意客户端/工具注入。

**明确不做：**本地监听不等于不需认证。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M7-5 · 移动伴侣与远程审批

**交付结果：**安全查看提醒和结果并审批具体动作。

**前置：**M7-1, M5-3。 另外须完成 M6 阶段门。 **规划风险：**R3。

**预计触及：**`apps`、`docs/architecture`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-11。

### 完成条件

- [ ] 设备配对/身份/传输/撤销明确。
- [ ] 审批绑定当前任务版本，离线过期不能复用。

### 必须覆盖的失败路径

- 丢失设备/重放。
- 旧审批/推送泄漏。

**明确不做：**不隐含 X-3 全量同步。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)。具体拆分、依赖和完成条件是本执行计划的提案。

# X 工作包

| 编号 | 工作包 | 直接前置 | 规划风险 |
|---|---|---|---|
| X-1 | 向量 / 图 / 混合检索增强 | M1-6, M2-6 | R2 |
| X-2 | 第三方插件宿主与生态 | M5-7, M6-7, M7-1 | R3 |
| X-3 | 加密跨设备同步 | M6-8, M7-1 | R3 |

## X-1 · 向量 / 图 / 混合检索增强

**交付结果：**只有固定场景证明必要和收益时才增加检索复杂度。

**前置：**M1-6, M2-6。 **规划风险：**R2。

**预计触及：**`packages/memory-store`、`packages/evals`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 记录基线缺陷/目标/预算/成本后立项。
- [ ] 投影可从合法真源重建并继承失效规则。

### 必须覆盖的失败路径

- 平均命中提高但陈旧召回/泄漏增加。

**明确不做：**不是默认必做功能。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ARCH](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/system-architecture.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## X-2 · 第三方插件宿主与生态

**交付结果：**有真实外部扩展需求才评估宿主。

**前置：**M5-7, M6-7, M7-1。 **规划风险：**R3。

**预计触及：**`apps/daemon`、`docs/architecture`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 来源/版本/签名/升级/卸载和信任模型明确。
- [ ] 比较静态组合、轻量宿主和框架。

### 必须覆盖的失败路径

- 恶意注册/卸载泄漏。
- 扩大权限/升级失败。

**明确不做：**不让插件定义核心真相，不预定 Cordis。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[I67](https://github.com/ntygod/zhiwei-next/issues/67)。具体拆分、依赖和完成条件是本执行计划的提案。

## X-3 · 加密跨设备同步

**交付结果：**明确多设备需求后安全同步允许的数据。

**前置：**M6-8, M7-1。 **规划风险：**R3。

**预计触及：**`packages/memory-store`、`apps/daemon`、`docs/architecture`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 独立设计密钥/冲突/撤销/删除传播/恢复。
- [ ] 备份和重建不绕过同步策略。

### 必须覆盖的失败路径

- 旧设备上线/密钥丢失。
- 旧备份/回滚/遗忘冲突。

**明确不做：**不以加密宣传替代实现和审查。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)。具体拆分、依赖和完成条件是本执行计划的提案。
