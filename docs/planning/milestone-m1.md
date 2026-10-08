# M1 实施计划：记得对

> 文档状态：Issue #72 的执行细化提案，随本项 PR 合入后生效；不是实现完成记录、ADR 批准或 PR 审查结论。

进入条件：M0 Gate 有完整证据，G-2 数据策略仍有效。M1 的独立价值是认知可治理；不为了提前验收把生产 Context 注入并入本阶段。范围依据：[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[DOMAIN](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/domain-model.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。

## 执行次序和边界

```text
M1-1 持久化 → M1-3 Scope → M1-2 候选接受
→ M1-4 生命周期/纠正 → M1-5 遗忘
→ M1-6 检索投影 → M1-7 API/CLI 与阶段证据
```

编号延续前次盘点，顺序按依赖而非数字大小。领域类型和端口可先由单元合同验证；生产 API 只有 Scope、接受和生命周期闭合后才暴露。

业务上区分证据、候选、Claim 身份和 Claim 版本；区分记录时间、有效期与查询时点；纠正须原子生成新版本而非覆盖旧正文。检索投影与缓存不是真源。Private 是外发限制而不只是界面隐藏。具体合同通过 D-04/D-06 落地，本计划不为新字段自行假设已发布语义。

## API 合同检查点

| 操作（拟提供） | 关键输入 | 成功结果 | 不能静默处理的错误 |
|---|---|---|---|
| remember | 调用 Scope、陈述、证据、来源类型、请求幂等身份 | 候选/已接受 Claim 的明确状态与版本 | 证据缺失、越域、未经验证的推断 |
| search | Scope、查询、资格时间点、分页与预算 | 仍有效的结果及原因/版本 | 未授权 Scope、投影失效、未知查询 |
| correct | 当前 Claim/revision、新陈述与证据 | 新版本和 supersedes 关系 | 陈旧 revision、并发冲突、循环引用 |
| forget | 目标及范围、逻辑/物理模式、具体确认 | 可解释的清除状态与失效水位 | 权限不足、策略未定、部分清除失败 |
| explain | Scope、Claim/version | 来源、生命周期与影响范围 | 已清除正文、无法解析证据、无权限 |

字段名最终由协议 PR 决定，不按此表虚构已存在 API。

## 场景矩阵（规划，尚未执行）

| 场景 ID | 给定与动作 | 必须观察 | 归属 |
|---|---|---|---|
| E1-01 | 创建带证据候选、接受、重启 | 候选与 Claim/版本/证据完整可查 | M1-1/2 |
| E1-02 | 无证据或越域证据接受 | 拒绝，不产生孤立 Claim | M1-2/3 |
| E1-03 | 两个 Workspace 相同关键词 | 先过滤，绝不返回另一个域认知 | M1-3/6 |
| E1-04 | Session/Private 认知尝试升级或外发 | 显式限制，不自动升级或发送 | M1-3 |
| E1-05 | 用户纠正旧结论 | 原子 supersede；旧版不在 active 结果 | M1-4 |
| E1-06 | 两方纠正同 revision | 一方成功或明确冲突，不丢失更新 | M1-4 |
| E1-07 | 相互冲突或到期的认知 | disputed/expired 资格一致，不任意选边 | M1-4/6 |
| E1-08 | 逻辑遗忘后重新搜索与重建 | 不再返回，失效水位一致 | M1-5/6 |
| E1-09 | 清除中断、恢复旧备份、旧消息迟到 | 不恢复为可使用认知，部分完成可见 | M1-5 |
| E1-10 | 中文、代码标识符、术语与否定陈述 | 固定语料基线，可解释排序 | M1-6 |
| E1-11 | 重复 API 请求、未授权命令、空结果 | 幂等或明确错误，不伪造成功 | M1-7 |
| E1-12 | 恶意工具内容提出记忆/权限指令 | 保留来源可信度；不变成用户授权 | M1-2/3/7 |

上下文失效在本阶段以查询资格和消费者合同测试验证；实际 Pi 上下文注入的端到端保证由 M2 再完成，不提前宣称交付。

## 任务索引

| 编号 | 工作包 | 直接前置 | 规划风险 |
|---|---|---|---|
| M1-1 | Candidate / Claim 持久化 | M0-8, G-2 | R2 |
| M1-3 | Scope 访问与传播规则 | M1-1, G-2 | R3 |
| M1-2 | 候选接受与证据验证 | M1-1, M1-3 | R2 |
| M1-4 | Claim 生命周期、纠正与冲突 | M1-2, M1-3 | R2 |
| M1-5 | 遗忘、保留与失效传播 | M1-4, G-2 | R3 |
| M1-6 | FTS5 与可重建检索投影 | M1-4, M1-5 | R2 |
| M1-7 | 记忆 API / CLI 与阶段证据 | M1-2, M1-3, M1-4, M1-5, M1-6 | R3 |

## M1-1 · Candidate / Claim 持久化

**交付结果：**候选、Claim、版本及证据跨进程保留。

**前置：**M0-8, G-2。 另外须完成 M0 阶段门。 **规划风险：**R2。

**预计触及：**`packages/domain`、`packages/memory-store`、`packages/cognition-core`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-02, D-04。

### 完成条件

- [ ] Schema 保存 Scope/状态/有效时间/版本。
- [ ] 证据引用存在且在允许范围。
- [ ] 迁移前向且重启可查询，内存实现仅作测试替身。

### 必须覆盖的失败路径

- 缺证据/跨域引用。
- 重复身份/无效时间。
- 部分提交。

**明确不做：**不自动提取，不引入向量数据库。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[DOMAIN](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/domain-model.md)；[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M1-3 · Scope 访问与传播规则

**交付结果：**所有读取、写入和传播遵守同一作用域与隐私边界。

**前置：**M1-1, G-2。 另外须完成 M0 阶段门。 **规划风险：**R3。

**预计触及：**`packages/domain`、`packages/cognition-core`、`packages/memory-store`、`packages/protocol`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-04, D-08。

### 完成条件

- [ ] 固定 Global/Workspace/Session/Task/Private 允许矩阵。
- [ ] 先过滤再排序，所有 API 校验调用上下文。
- [ ] Private 外发限制在执行边界落实。

### 必须覆盖的失败路径

- 跨 Workspace。
- Session 自动升级。
- 恶意 Scope 参数/Private 外发。

**明确不做：**不实现多用户，不默认 Global 覆盖项目约束。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)；[DOMAIN](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/domain-model.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M1-2 · 候选接受与证据验证

**交付结果：**只有经规则允许的候选才能成为可使用认知。

**前置：**M1-1, M1-3。 另外须完成 M0 阶段门。 **规划风险：**R2。

**预计触及：**`packages/cognition-core`、`packages/domain`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-04。

### 完成条件

- [ ] 区分用户陈述/确认/Agent 推断。
- [ ] 接受幂等并原子关联候选、Claim 与证据。
- [ ] 不足和冲突显式处理，不以 confidence 数值单独判真。

### 必须覆盖的失败路径

- 越域证据/重复接受。
- 提示注入。
- 已拒绝候选。

**明确不做：**不做 M3 自动提取，不把外部材料当用户授权。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[DOMAIN](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/domain-model.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M1-4 · Claim 生命周期、纠正与冲突

**交付结果：**纠正使旧认知失效，保留版本链和争议关系。

**前置：**M1-2, M1-3。 另外须完成 M0 阶段门。 **规划风险：**R2。

**预计触及：**`packages/cognition-core`、`packages/domain`、`packages/memory-store`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-06。

### 完成条件

- [ ] 状态转换与有效时间明确。
- [ ] 新版本与旧版本 supersede 原子提交，支持 expected revision。
- [ ] 冲突不任意选边，证据撤回和过期可追踪。

### 必须覆盖的失败路径

- 并发纠正/循环 supersedes。
- 纠正失效版本。
- 有效期倒置/中断。

**明确不做：**不原地覆盖历史，不做模糊自动合并。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[DOMAIN](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/domain-model.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M1-5 · 遗忘、保留与失效传播

**交付结果：**遗忘对象不再从查询、重建、缓存及恢复路径重新生效。

**前置：**M1-4, G-2。 另外须完成 M0 阶段门。 **规划风险：**R3。

**预计触及：**`packages/cognition-core`、`packages/memory-store`、`packages/protocol`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-04, D-06。

### 完成条件

- [ ] 区分逻辑遗忘与物理清除的授权和结果。
- [ ] 产生失效记录/水位，后续消费者遵守。
- [ ] 清除覆盖正文引用/投影/备份策略；无法追回已外发内容明确说明。
- [ ] 审计不重复保留被清除敏感正文。

### 必须覆盖的失败路径

- 遗忘中断。
- 重建索引/恢复旧备份。
- 延迟消息/旧缓存。

**明确不做：**不用 tombstone 假装字节已删除，不把 revert 当不可逆删除的撤销。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[DOMAIN](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/domain-model.md)；[SAFETY](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/trust-and-safety.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M1-6 · FTS5 与可重建检索投影

**交付结果：**在允许范围内检索仍然有效的认知。

**前置：**M1-4, M1-5。 另外须完成 M0 阶段门。 **规划风险：**R2。

**预计触及：**`packages/memory-store`、`packages/cognition-core`、`packages/evals`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-05, D-06。

### 完成条件

- [ ] Retrieval 接口不允许绕过 Scope。
- [ ] 水位/更新/删除/重建一致，排序分页可解释。
- [ ] 中文、标识符、术语和纠正有固定语料基线。

### 必须覆盖的失败路径

- 索引延迟。
- 失效/遗忘结果。
- 跨域查询/恶意搜索语法。

**明确不做：**不把索引当真源，不默认追加向量或图。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ARCH](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/system-architecture.md)；[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M1-7 · 记忆 API / CLI 与阶段证据

**交付结果：**提供 remember/search/correct/forget/explain 并证明完整治理行为。

**前置：**M1-2, M1-3, M1-4, M1-5, M1-6。 另外须完成 M0 阶段门。 **规划风险：**R3。

**预计触及：**`apps/daemon`、`apps/cli`、`packages/evals`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 返回对象版本、来源、状态和影响范围。
- [ ] 正常/空/权限/冲突/重启场景可执行。
- [ ] 纠正与遗忘有效、Scope 不泄漏；完整 M1 不依赖生产 Context 注入。

### 必须覆盖的失败路径

- 重复命令。
- 陈旧版本/并发操作。
- 未授权删除。

**明确不做：**不提前交付自动候选、提醒或桌面。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[ROADMAP](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/roadmap.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。
