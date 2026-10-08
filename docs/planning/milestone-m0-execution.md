# M0 执行细化：能观察

> 文档状态：Issue #72 的执行细化提案，随本项 PR 合入后生效；不是实现完成记录、ADR 批准或 PR 审查结论。

范围依据：[原 M0 计划](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/milestone-m0.md)；派工和完成门以[执行总计划](execution-plan.md)为准。当前继续 #56/#69，不从未合入候选直接开发下一层。

## 原 Workstream 对照

| 原工作流 | 本轮承接 |
|---|---|
| A Runtime Spike | 复用已验证事实；G-3 选型闭包、M0-4 产品化，不重做全部 Probe |
| B Normalized Protocol | 复用已合入 v1；M0-3/6 扩展必须按版本决策，不静默改语义 |
| C Ledger | M0-1；G-5 测量与演进另行交付 |
| D Daemon / Worker | M0-2/3/4/5/6 |
| E CLI / 可观察性 | M0-7，承接 #44 的服务基础 |
| F 端到端 | M0-8 与下表场景 |

## 就绪与不做

M0 不注入长期记忆、不提取 Candidate、不提供 FTS、主动提醒、完整 Delegation、桌面或旧数据库兼容。SessionContract 和输入记录只验证无记忆会话；M2 再扩展记忆内容。与 #67 的重建承诺通过 D-01 先明确，不假装仅有 hash 就保存了输入。

G-1…5 是有限基线交付，不是搭建无限通用框架；G-2 的最小安全限制可在合成数据环境验证，真实工具和真实外发接入时由 M0-4/5 补齐，不能构成循环依赖。M0-3 先完成数据合同与写读函数，正式运行链路证据由 M0-4 和 M0-8 闭合。

## 场景矩阵（规划，尚未执行）

| 场景 ID | 给定与动作 | 必须观察 | 归属 |
|---|---|---|---|
| E0-01 | 合成正常会话，实际 Worker 执行受限工具 | 接受、Run/Turn、Tool、Result、回答、settled、关闭各有来源 | M0-4/5/8 |
| E0-02 | 提交记录后关闭并重启 | 已提交事件可查，身份和回放顺序正确 | M0-1/2/6 |
| E0-03 | 交付已有前缀和新后缀 | 前缀幂等，新后缀只提交一次 | M0-1/6 |
| E0-04 | 同 ID/Key 不同正文或倒序 source slot | 明确冲突；批次新行和 cursor 不部分提交 | M0-1/6 |
| E0-05 | 运行中取消、Retry 未继续 | 不伪造成功或必然存在后续 Run | M0-4/5 |
| E0-06 | Worker 异常退出，宿主在确认前后中断 | 已提交数据保留；不确定结果不盲目重试副作用 | M0-5/6 |
| E0-07 | Compaction 与同/异 Instance 会话替换 | 原事实保留，lineage 和 listener rebind 正确 | M0-4/6/8 |
| E0-08 | Workspace A/B 与旧 owner 并发请求 | 查询、归属和恢复不串域 | M0-2/5/7 |
| E0-09 | 模型输入引用缺失或 Runtime 变换未观测 | 重建完整性降为明确未证明或拒绝，绝不虚构正文 | M0-3/4/8 |
| E0-10 | 慢订阅者、断线重连、消息缺口 | 背压/节流/去重与 gap 可见，不额外轮询模型 | M0-6/7 |
| E0-11 | 迁移漂移、损坏、锁争用、磁盘满 | 稳定错误；不静默修复或丢事件 | M0-1/G-5 |
| E0-12 | 1千/1万/10万合成事件 | 记录延迟、吞吐、内存和重启曲线，接受明确运行预算 | G-5/M0-8 |

所有压力规模只是拟定实验。断电/硬件故障如未实测必须标为未证明；应用崩溃场景不能替代。M0 Gate 仍要求原四类场景，不因增加矩阵删去原要求。

## 任务索引

| 编号 | 工作包 | 直接前置 | 规划风险 |
|---|---|---|---|
| M0-1 | SQLite Ledger v1 收口 | 无任务依赖；仍须仓库对账 | R2 |
| M0-2 | Workspace / Session 持久化与所有权 | M0-1, G-1, G-5 | R2 |
| M0-3 | SessionContract 与输入记录基础 | M0-2, G-1, G-2, G-3 | R2 |
| M0-4 | 正式 Pi Runtime Adapter | M0-3, G-2, G-3 | R3 |
| M0-5 | Daemon / Worker Supervisor | M0-2, M0-3, M0-4, G-2 | R3 |
| M0-6 | 可靠摄取与领域 Observation 投影 | M0-1, M0-2, M0-3, M0-4, M0-5, G-4 | R2 |
| M0-7 | CLI 查询回放与事件订阅 | M0-6, G-2 | R3 |
| M0-8 | M0 端到端与恢复证据 | M0-7, G-4, G-5 | R2 |

## M0-1 · SQLite Ledger v1 收口

**交付结果：**完成 #56 / PR #69 的现有交付，不重新开替代 Ledger。

**前置：**无任务依赖；仍须仓库对账。 **规划风险：**R2。

**预计触及：**`packages/memory-store`、`docs/adr`、`docs/architecture`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 开始和结束核对 repo/open/draft/merged_at/base/branch/完整 HEAD。
- [ ] 复核当前代码、事务/迁移/快照/恢复及负向测试。
- [ ] 独立批准后仍通过当前 Ready CI、受保护合并和 Main Provenance 回读。

### 必须覆盖的失败路径

- HEAD 变化不能继承批准。
- 未知协议、身份冲突、批次失败不能静默成功。

**明确不做：**不混入后续表、Daemon、记忆或性能合同变更。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**已有交付面：**#56 / PR #69；不新建重复 Issue，不在本规划中给出批准。

**规划依据：**[PR69](https://github.com/ntygod/zhiwei-next/pull/69)；[I56](https://github.com/ntygod/zhiwei-next/issues/56)；[LEDGER](https://github.com/ntygod/zhiwei-next/blob/f4b94886020ea5c67c302f6eac2db518ac6bde27/docs/architecture/sqlite-observation-ledger-v1.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M0-2 · Workspace / Session 持久化与所有权

**交付结果：**重启后能定位正确工作空间与逻辑会话，明确 Runtime Session/Instance 映射。

**前置：**M0-1, G-1, G-5。 **规划风险：**R2。

**预计触及：**`packages/domain`、`packages/memory-store`、`apps/daemon`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-02, D-09。

### 完成条件

- [ ] create/get/list 与身份映射可持久化。
- [ ] 定义活跃会话所有权与并发策略。
- [ ] 新增 Schema 使用前向迁移或经批准的分库边界。

### 必须覆盖的失败路径

- 跨 Workspace 绑定。
- 重复创建/并发占用/旧 owner 恢复。
- 迁移中断。

**明确不做：**不做多用户、同步和完整委托。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[M0](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/milestone-m0.md)；[ARCH](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/system-architecture.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M0-3 · SessionContract 与输入记录基础

**交付结果：**会话合同和已观测模型输入具有可解释的版本与保存范围。

**前置：**M0-2, G-1, G-2, G-3。 **规划风险：**R2。

**预计触及：**`packages/protocol`、`packages/domain`、`packages/memory-store`、`packages/pi-adapter`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-01, D-04。

### 完成条件

- [ ] 记录 Runtime/模型/能力/策略/config revision。
- [ ] M0 只覆盖无记忆会话，记忆引用留给 M2-3。
- [ ] 可重建内容保留获准正文或可解析不可变引用，不只保存 hash。
- [ ] 区分事件回放、输入重建和输出复现；单元合同先用脱敏证据验证，真实路径在 M0-4/M0-8 验证。

### 必须覆盖的失败路径

- 缺失内容引用或摘要漂移。
- 模型可见但未记录输入。
- 配置半应用。

**明确不做：**不注入长期记忆、不保存原始思维链、不声称复现供应商隐藏内容。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[I67](https://github.com/ntygod/zhiwei-next/issues/67)；[M0](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/milestone-m0.md)；[NRE](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/normalized-runtime-event-v1.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M0-4 · 正式 Pi Runtime Adapter

**交付结果：**将已验证的运行时边界转成产品调用入口，Daemon 不直接依赖 Pi 对象。

**前置：**M0-3, G-2, G-3。 **规划风险：**R3。

**预计触及：**`packages/pi-adapter`、`packages/protocol`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-07, D-08。

### 完成条件

- [ ] 选定正式 SDK/RPC 路径并记录依据。
- [ ] Request/Response、Runtime Event、Process Boundary、来源域分别映射。
- [ ] 正常/工具/取消/Retry/Compaction/替换路径有契约。
- [ ] 使用固定依赖及合成 Provider/受限工具。

### 必须覆盖的失败路径

- 非法 framing/EOF 尾片。
- 被接受后 Provider 失败。
- 缺关联或不支持能力。

**明确不做：**不顺手升级 Pi、不实现第二 Runtime、不让 Pi 类型进入领域。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[NRE](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/normalized-runtime-event-v1.md)；[M0](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/milestone-m0.md)；[I67](https://github.com/ntygod/zhiwei-next/issues/67)。具体拆分、依赖和完成条件是本执行计划的提案。

## M0-5 · Daemon / Worker Supervisor

**交付结果：**管理 Worker 启动、关闭、故障和恢复并保持会话身份。

**前置：**M0-2, M0-3, M0-4, G-2。 **规划风险：**R3。

**预计触及：**`apps/daemon`、`packages/pi-adapter`、`packages/protocol`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-08, D-09。

### 完成条件

- [ ] 状态机和资源 owner 明确，关闭有排空边界。
- [ ] 正常退出/异常/取消/未知执行分别表达。
- [ ] 恢复正确会话，释放进程、连接和监听器。

### 必须覆盖的失败路径

- 启动失败/断流/重复 stop。
- active 与 idle 终止。
- 宿主重启及孤立进程。

**明确不做：**不做 Scheduler、Delegation，不假定各平台信号相同。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[M0](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/milestone-m0.md)；[ARCH](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/system-architecture.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M0-6 · 可靠摄取与领域 Observation 投影

**交付结果：**Runtime 事实可靠提交，并形成带来源的版本化领域证据。

**前置：**M0-1, M0-2, M0-3, M0-4, M0-5, G-4。 **规划风险：**R2。

**预计触及：**`apps/daemon`、`packages/protocol`、`packages/memory-store`、`packages/domain`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-05, D-09。

### 完成条件

- [ ] 定义提交确认点、source sequence、cursor、投影 watermarks。
- [ ] 映射可重建且不覆盖 Ledger 原事实。
- [ ] 队列有界/背压可观察；未记录区间显式 gap/incomplete。
- [ ] 流式未闭合与非法 Trace 分开。

### 必须覆盖的失败路径

- 写入前后崩溃/重复前缀新后缀。
- 乱序/缺失来源/投影中断。
- 慢消费者。

**明确不做：**不把幂等写入当零丢失，不承诺外部 exactly-once，不直接生成 Claim。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[M0](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/milestone-m0.md)；[NRE](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/architecture/normalized-runtime-event-v1.md)；[LEDGER](https://github.com/ntygod/zhiwei-next/blob/f4b94886020ea5c67c302f6eac2db518ac6bde27/docs/architecture/sqlite-observation-ledger-v1.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M0-7 · CLI 查询回放与事件订阅

**交付结果：**查询与回放会话，用事件获取进度而非让模型轮询。

**前置：**M0-6, G-2。 **规划风险：**R3。

**预计触及：**`apps/cli`、`apps/daemon`、`packages/protocol`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**D-08。

### 完成条件

- [ ] doctor、sessions list/show/replay 有人类与 JSON 输出。
- [ ] 订阅有权限范围、cursor 重连、去重、节流和背压。
- [ ] 稳定状态与流式细节分离，观察进度不额外调用模型。

### 必须覆盖的失败路径

- 跨 Workspace cursor。
- 重连缺口/慢读者/断线。
- 无效 ID/无权限。

**明确不做：**不做完整桌面或后台委托，本项不自动关闭 #44。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**父级产品输入：**#44；只回链产品结果，不把 CI 日志投递到父需求。

**规划依据：**[I44](https://github.com/ntygod/zhiwei-next/issues/44)；[M0](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/milestone-m0.md)。具体拆分、依赖和完成条件是本执行计划的提案。

## M0-8 · M0 端到端与恢复证据

**交付结果：**证明真实运行链路，不仅单独 Fixture，通过 M0 范围的场景。

**前置：**M0-7, G-4, G-5。 **规划风险：**R2。

**预计触及：**`packages/evals`、`apps/daemon`、`apps/cli`、`packages/pi-adapter`、`packages/memory-store`、`docs/planning`。这是责任边界，不预创建空壳包；远期新增包路径需在实施 ADR 中确定。

**前置决策：**沿用已接受合同；发现冲突则先登记决策。

### 完成条件

- [ ] 正常会话含工具/结果/回答/settled/关闭。
- [ ] 覆盖取消、Worker/宿主异常、重复交付、Compaction/替换。
- [ ] 记录平台、输入覆盖、故障限制和代码身份。
- [ ] 必需工作包与前置决策证据齐全，合入回读后进入 M1。

### 必须覆盖的失败路径

- 未关联 Tool Result。
- 跨域关联/伪造成功。
- 将历史报告当本次运行。

**明确不做：**不要求确定性重跑远端模型，不把有限测试外推普遍零风险。

**证据与回滚：**行为和故障测试、作者自审、npm run check、适用的独立审查、真实 CI 和合入后回读；未运行必须列明。 未发布数据前回退代码；已应用迁移仅前向修复；发生的外部副作用需对账/补偿，不可逆删除不能靠 revert 撤销。

**执行与审查：**实施 AI；进入执行时在真实 Issue 登记具体上下文；新的独立 AI 上下文，R2/R3 绑定最终完整 HEAD。

**规划依据：**[M0](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/milestone-m0.md)；[AC](https://github.com/ntygod/zhiwei-next/blob/843c09569360184592f3d5cecb3b1b165eba6af7/docs/planning/acceptance-criteria.md)。具体拆分、依赖和完成条件是本执行计划的提案。
