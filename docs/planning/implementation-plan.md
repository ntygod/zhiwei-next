# 完整开发计划

由 development-plan.json 生成；修改 JSON 后运行 node scripts/check-design-plan.mjs --write。全部任务是计划，不表示已完成；当前进度见 next-task-handoff.md 与真实 Issue/PR。

每个任务对应一个可独立验收的 execution Issue/primary PR；范围过大时先保持同一用户结果拆分并更新依赖。每项均须 npm run check、相关场景、实际失败/恢复证据及 R2/R3 独立审查；高风险使用受控合成/测试资源。代码未完成或证据缺失不得勾选验收。

先完成依赖再实施；同阶段没有依赖的任务允许设计/阅读准备，但遵守仓库 WIP 上限。条件任务不阻塞必需阶段。工期取决于实际证据，不按任务数推算日期。

## 阶段

| 阶段 | 用户结果 | 退出门 |
|---|---|---|
| P0 | 接入前置与验证基线 | 安全有限决议、原 G-5 基线与合成验收资料齐全；没有真实产品能力声明。 |
| P1 | 连续协作 Alpha | 用户可在界面开始/继续跨日任务、使用并纠正记忆、检查产物与结果，Z03—Z18 端到端通过。 |
| P2 | 可验证学习 | 保留任务显示有边界的学习收益，晋升/退役和失效传播通过，无安全退化。 |
| P3 | 主动协作 | 有价值提醒与遗漏/噪声分别达标；静音、去重和无授权写入违规为零。 |
| P4 | 可靠委托与完整桌面 v1 | 受控真实副作用、恢复、安装/升级/备份、14天持续使用与全部核心验收完成。 |
| P5 | 跨 Runtime 产品扩展 | 第二真实 Runtime 与 MCP/认知 API 通过相同权限、记忆、恢复和兼容验收。 |

## 任务依赖总览

| ID | 任务 | 前置 | 风险 |
|---|---|---|---|
| P0-01 | 定案接入前安全与保留基线 | 无 | R3 |
| P0-02 | 测量 Ledger 与冻结产品验收夹具 | P0-01 | R3 |
| P1-01 | 建立认知与任务领域合同 | P0-02 | R2 |
| P1-02 | 实现正文生命周期与认知事务存储 | P1-01 | R3 |
| P1-03 | 接通受控 Pi Worker 与工具/模型边界 | P1-02 | R3 |
| P1-04 | 接通 Session、任务摄取与事件 API | P1-03 | R3 |
| P1-05 | 交付可纠正记忆与检索 | P1-04 | R3 |
| P1-06 | 交付认知协调与受预算上下文 | P1-05 | R3 |
| P1-07 | 交付结果验证、Episode 与使用记录 | P1-06 | R2 |
| P1-08 | 交付项目工作台与记忆纠错界面 | P1-07 | R3 |
| P1-09 | 验收连续协作 Alpha | P1-08 | R3 |
| P2-01 | 自动提取与冲突候选 | P1-09 | R2 |
| P2-02 | 做法候选、试用与退役 | P2-01 | R2 |
| P2-03 | 采用验证与收益试验 | P2-02 | R2 |
| P2-04 | 学习审阅与漂移恢复界面 | P2-03 | R2 |
| P2-05 | 验收学习迁移与成本 | P2-04 | R2 |
| P3-01 | 承诺、调度与事件信号 | P2-05 | R3 |
| P3-02 | 只读日历连接器 | P3-01 | R3 |
| P3-03 | GitHub 只读变化连接器 | P3-01 | R3 |
| P3-04 | 主动决策、准备与负担控制 | P3-02, P3-03 | R3 |
| P3-05 | 今天页面与主动性验收 | P3-04 | R2 |
| P4-01 | 有界委托、授权与预算账本 | P3-05 | R3 |
| P4-02 | 后台恢复与配置生命周期 | P4-01 | R3 |
| P4-03 | 受控文件产物发布 | P4-02 | R3 |
| P4-04 | 受控 GitHub 写动作 | P4-02 | R3 |
| P4-05 | Windows 桌面壳与系统凭据 | P4-03, P4-04 | R3 |
| P4-06 | 备份、升级与恢复交付 | P4-05 | R3 |
| P4-07 | 完整本地产品 v1 验收与发布 | P4-06 | R3 |
| P5-01 | 稳定认知 API 与能力协商 | P4-07 | R3 |
| P5-02 | 第二 Runtime：Codex 适配与验收 | P5-01 | R3 |
| P5-03 | 跨 Runtime 产品与兼容发布 | P5-02 | R3 |
| X2-01 | 条件检索增强 | P2-05 | R2 |
| X4-01 | 条件桌面平台扩展 | P4-07 | R3 |
| X5-01 | 条件加密同步与移动审批 | P5-03 | R3 |
| X5-02 | 条件增加 Claude 或 dsh Runtime | P5-03 | R3 |
| X5-03 | 条件第三方插件宿主 | P5-03 | R3 |

## P0-01 · 定案接入前安全与保留基线

**结果：**按原流程接受 D-04/D-08 的有限合同，明确真实产品仍须逐入口验证。

**前置：**无；**风险：**R3；**类型：**必需。

**触及：**`docs/planning/current-decisions.json`、`docs/adr/0014-data-retention-boundary.md`、`docs/adr/0015-preintegration-safety-boundary.md`。

**合同：**[decision-execution-layer.md](../../docs/planning/decision-execution-layer.md)、[trust-and-safety.md](../../docs/architecture/trust-and-safety.md)。

**完成条件：**

- 作者与独立审查复跑原 90 项实验，绑定历史源码和真实结果
- Evidence Ready → 独立逐项决策接受 → 新最终 HEAD 审查；原 source/checker 字节保留
- 原 G-2 完成条件逐项给证据和非保证，不把合成测试变成真实接入许可

**必须验证的失败：**

- 缺失或伪造审查、来源同 PR 冒充新决策必须拒绝
- 旧 inline 备份仍有正文时报告 partial

**场景：**Z01。

**回滚：**通过 PR 撤回新决议记录，保留源实验与既有诊断保护。

**不做：**不改生产 Schema，不读取真实用户数据。

## P0-02 · 测量 Ledger 与冻结产品验收夹具

**结果：**用现有公开入口取得规模、持久性与恢复基线，并给新场景准备合成数据。

**前置：**P0-01；**风险：**R3；**类型：**必需。

**触及：**`packages/evals`、`packages/memory-store`、`docs/planning`。

**合同：**[data-and-api.md](../../docs/architecture/data-and-api.md)、[acceptance-criteria.md](../../docs/planning/acceptance-criteria.md)。

**完成条件：**

- 按原 G-5/D-03 覆盖规模、强校验与升级/回滚，声明硬件/负载/重复次数
- 建立能源方案、软件项目、研究综述三类任务夹具，分生成/调参/保留集
- 原 E0/E1 场景保留身份；新增 Z 场景不得用组件 partial 冒充端到端

**必须验证的失败：**

- 损坏、磁盘满、中断与未知 Schema 拒绝
- 未测断电/Windows 能力标未证明，性能失败不跳完整性检查

**场景：**Z02。

**回滚：**保留现有实现；基准和夹具可 revert，实验库为可丢弃合成数据。

**不做：**不为性能提前改存储安全合同，不实现产品会话。

## P1-01 · 建立认知与任务领域合同

**结果：**代码准确表达五类记忆、假设、目标与任务，提供纯状态转换。

**前置：**P0-02；**风险：**R2；**类型：**必需。

**触及：**`packages/domain`、`packages/cognition-core`、`packages/protocol`。

**合同：**[domain-model.md](../../docs/architecture/domain-model.md)、[cognitive-loop.md](../../docs/architecture/cognitive-loop.md)。

**完成条件：**

- Scope/privacy/trust/epistemic 正交，目标与做法不再借 Claim kind 混用
- revision/CAS、纠正、Task/Outcome 状态及错误类型有公开契约
- 新增 Local API DTO 与 Observation v2 schema，v1 未改变

**必须验证的失败：**

- 不合法终态回退/Scope 漂移拒绝
- 模型推断无法直接取得事实或授权

**场景：**Z03, Z04。

**回滚：**回滚新类型消费者；尚无生产迁移，保留 v1 导出。

**不做：**不建通用插件框架，不接模型。

## P1-02 · 实现正文生命周期与认知事务存储

**结果：**真源能够安全保存/纠正/遗忘新产品对象，正文与元数据分别管理。

**前置：**P1-01；**风险：**R3；**类型：**必需。

**触及：**`packages/memory-store`。

**合同：**[data-and-api.md](../../docs/architecture/data-and-api.md)、[domain-model.md](../../docs/architecture/domain-model.md)、[trust-and-safety.md](../../docs/architecture/trust-and-safety.md)。

**完成条件：**

- 追加版本化迁移、v2 转换 Fixture、完整 manifest；旧表只读保留
- 内容 staging/提交/孤儿回收与认知版本/epoch/outbox 原子性通过真实存储测试
- 逻辑遗忘、当前受管副本清除和旧备份隔离恢复闭环

**必须验证的失败：**

- 并发纠正、崩溃、磁盘满、坏引用不产生半提交
- 旧备份/缓存不能使遗忘回生，缺最新 journal 拒绝

**场景：**Z05, Z06, Z07。

**回滚：**迁移前一致备份；失败事务回滚；只允许验证过的前向修复/隔离恢复，已遗忘数据不恢复。

**不做：**不改已应用 0001，不宣称介质级销毁。

## P1-03 · 接通受控 Pi Worker 与工具/模型边界

**结果：**一个真实 Pi 任务在明确目录、环境和权限下执行，全部工具/外发受控。

**前置：**P1-02；**风险：**R3；**类型：**必需。

**触及：**`packages/pi-adapter`、`apps/daemon`。

**合同：**[pi-integration.md](../../docs/architecture/pi-integration.md)、[trust-and-safety.md](../../docs/architecture/trust-and-safety.md)。

**完成条件：**

- 沿固定 CLI JSONL 路径，保留原 Runtime 来源/生命周期合同
- 只读文件/memory/隔离草稿工具可用，未受控内建工具/扩展/环境能力禁用
- 合法合成请求真实到达测试接收器，越界/Private/注入无输出；支持平台逐项实测

**必须验证的失败：**

- 坏字节/EOF/重启/未知能力显式失败
- 路径链接替换、伪授权与隐藏外发无法绕过 Broker

**场景：**Z08, Z09。

**回滚：**关闭新 profile 回到诊断模式；停止 Worker，保留已提交事件与安全检查。

**不做：**不启用 shell、任意网络或第三方扩展。

## P1-04 · 接通 Session、任务摄取与事件 API

**结果：**用户可发起、取消、查询、重启继续任务，并通过订阅获得真实状态。

**前置：**P1-03；**风险：**R3；**类型：**必需。

**触及：**`apps/daemon`、`apps/cli`、`packages/memory-store`、`packages/protocol`。

**合同：**[data-and-api.md](../../docs/architecture/data-and-api.md)、[domain-model.md](../../docs/architecture/domain-model.md)。

**完成条件：**

- SessionContract、ownerEpoch、Task attempt 与输入快照落库
- 确认只到 committed，Outbox/cursor/快照恢复可用；重复输入不重复写
- 新数据 API 配对/CSRF/Scope 与旧诊断 token 隔离；CLI 可查询回放

**必须验证的失败：**

- 旧 owner、事件 gap、重复幂等键不同内容拒绝
- 进程中断/断线/响应丢失不丢已提交状态、不虚报成功

**场景：**Z10, Z11, Z12。

**回滚：**禁用新任务入口、排空 Worker；按存储恢复合同恢复，游标从持久状态重建。

**不做：**不靠模型查询进度，不开启后台自治。

## P1-05 · 交付可纠正记忆与检索

**结果：**remember/search/correct/forget/explain 可从真实用户路径使用。

**前置：**P1-04；**风险：**R3；**类型：**必需。

**触及：**`packages/cognition-core`、`packages/memory-store`、`apps/daemon`。

**合同：**[domain-model.md](../../docs/architecture/domain-model.md)、[cognitive-loop.md](../../docs/architecture/cognitive-loop.md)。

**完成条件：**

- 证据存在、同 scope、有效时间和隐私检查先于检索
- FTS5 可重建；显式用户记忆、纠正与冲突分别处理
- 依赖失效同步水位；解释精确版本和可见来源

**必须验证的失败：**

- 跨 Workspace/已遗忘/过期内容零返回
- 并发纠正、旧缓存和索引滞后不放行旧认知

**场景：**Z04, Z06, Z13。

**回滚：**停用记忆注入，真源与版本保留；索引可重建，遗忘不能回退。

**不做：**不做自动提取或向量优先。

## P1-06 · 交付认知协调与受预算上下文

**结果：**Agent 能基于项目状态与合格记忆选择继续、澄清或执行，并解释依据。

**前置：**P1-05；**风险：**R3；**类型：**必需。

**触及：**`apps/daemon`、`packages/context-compiler`、`packages/pi-adapter`。

**合同：**[cognitive-loop.md](../../docs/architecture/cognitive-loop.md)、[domain-model.md](../../docs/architecture/domain-model.md)。

**完成条件：**

- 有限 DecisionInput/输出校验与调用上限；确定性命令不额外调模型
- Capsule 有序、不可变、预算明确，真实发送绑定 snapshot
- 按需 memory 工具复用资格过滤；纠正/撤销在发送前重验

**必须验证的失败：**

- 必需上下文超预算明确失败，不静默截断
- 过期 epoch、隐藏材料、无进展决策循环被阻止

**场景：**Z14, Z15。

**回滚：**切回无长期记忆的受控执行 profile，保留请求与记忆真源；不得降安全边界。

**不做：**不自研 Runtime loop，不多 Agent 自由聊天。

## P1-07 · 交付结果验证、Episode 与使用记录

**结果：**每个任务给可检查的 Outcome，并留下经历和记忆使用信号。

**前置：**P1-06；**风险：**R2；**类型：**必需。

**触及：**`packages/cognition-core`、`apps/daemon`、`packages/evals`。

**合同：**[cognitive-loop.md](../../docs/architecture/cognitive-loop.md)、[learning-and-evaluation.md](../../docs/architecture/learning-and-evaluation.md)。

**完成条件：**

- 标准在执行前绑定 Task revision，验证器返回 pass/fail/unknown
- Runtime settled 进入 VERIFYING，完成/部分/失败/取消/不可验证分开
- Episode、Exposure 和候选 adoption 关联真实请求/步骤，保存未知收益

**必须验证的失败：**

- 工具成功但目标失败不得 completed
- 验证器失败、用户后续否定、缺证据保留未知与新版本；最后请求发送后纠正/遗忘、final 迟到且无后续工具调用时，不发布旧 completed 结果或回写已遗忘正文

**场景：**Z16, Z17。

**回滚：**暂停学习消费者，保留 Outcome/Episode 证据；修复验证器后追加新判定。

**不做：**不把模型自评当事实，不自动晋升做法。

## P1-08 · 交付项目工作台与记忆纠错界面

**结果：**用户在浏览器完整走通开始、继续、查看依据、纠正和检查产物。

**前置：**P1-07；**风险：**R3；**类型：**必需。

**触及：**`apps/web`、`apps/daemon`。

**合同：**[ui-design.md](../../docs/product/ui-design.md)、[product-vision.md](../../docs/product/product-vision.md)、[trust-and-safety.md](../../docs/architecture/trust-and-safety.md)。

**完成条件：**

- React/TypeScript/Vite 同源界面与受保护 API；依赖精确锁定
- 今天/项目/记忆/设置及任务/产物详情按合同实现
- 正常/空/加载/错误/权限/降级、键盘与 200% 缩放验收

**必须验证的失败：**

- 断线/后端重启显示最后确认状态
- 未获准附件、跨 origin 与不可信 HTML 无执行

**场景：**Z18。

**回滚：**关闭 Web 写入口，CLI 仍按相同授权访问；UI revert 不改变数据。

**不做：**不提前做桌面自动升级，不复制后端状态真源。

## P1-09 · 验收连续协作 Alpha

**结果：**完成首个跨日合作产品证明，给用户可运行的受限 Alpha。

**前置：**P1-08；**风险：**R3；**类型：**必需。

**触及：**`packages/evals`、`docs/planning`。

**合同：**[acceptance-criteria.md](../../docs/planning/acceptance-criteria.md)、[product-vision.md](../../docs/product/product-vision.md)。

**完成条件：**

- Z03—Z18 对应完整链真实执行，旧 E 场景给新的真实覆盖而非改名
- 三类 12 条跨会话任务与四基线同模型预算对照
- Windows 11 x64 冷启动/重启/取消/纠错演示；性能与限制如实记录

**必须验证的失败：**

- 任一泄漏/越权/遗忘回生阻止发布
- 主场景未过不把组件绿当阶段完成

**场景：**Z03, Z04, Z05, Z06, Z07, Z08, Z09, Z10, Z11, Z12, Z13, Z14, Z15, Z16, Z17, Z18。

**回滚：**保持 Alpha 开关关闭或退回上一受验证版本；数据按迁移恢复规则处理。

**不做：**不宣传已具备自动学习或后台自主执行。

## P2-01 · 自动提取与冲突候选

**结果：**任务后自动提出有来源的记忆候选，并发现冲突。

**前置：**P1-09；**风险：**R2；**类型：**必需。

**触及：**`packages/cognition-core`、`apps/daemon`。

**合同：**[learning-and-evaluation.md](../../docs/architecture/learning-and-evaluation.md)、[domain-model.md](../../docs/architecture/domain-model.md)。

**完成条件：**

- 作业按 outcomeRevision/learnerVersion 幂等
- 提取输出 schema/证据/隐私/时间全部校验
- 明确陈述、推断与冲突走不同接受路径，学习预算受控

**必须验证的失败：**

- 自我摘要循环证明、伪用户确认拒绝
- 重复/迟到结果不重复提议

**场景：**Z19。

**回滚：**停用 learner，保留可解释候选，可撤回其派生内容。

**不做：**不自动修改权限或跨域推广。

## P2-02 · 做法候选、试用与退役

**结果：**做法具有明确前提、检查与失败边界，可试用/暂停/回滚。

**前置：**P2-01；**风险：**R2；**类型：**必需。

**触及：**`packages/cognition-core`、`apps/daemon`。

**合同：**[learning-and-evaluation.md](../../docs/architecture/learning-and-evaluation.md)。

**完成条件：**

- Procedure 状态与版本实现完整
- 全部样本/失败/未知保留，满足晋升门才 ACTIVE
- 安全反例立即暂停，前提过期不适用

**必须验证的失败：**

- 重复 attempt/选择性成功样本不能晋升
- 新版本不能继承旧版本未验证收益

**场景：**Z20。

**回滚：**退回 previousActiveVersion；撤销/遗忘状态不得回退。

**不做：**不运行学习产生的任意脚本。

## P2-03 · 采用验证与收益试验

**结果：**能区分记忆出现、实际采用和有证据的改进。

**前置：**P2-02；**风险：**R2；**类型：**必需。

**触及：**`packages/evals`、`packages/cognition-core`、`apps/daemon`。

**合同：**[learning-and-evaluation.md](../../docs/architecture/learning-and-evaluation.md)。

**完成条件：**

- Adoption verified 绑定真实步骤/参数/检查
- 离线配对对照与保留集隔离，未知收益明确显示
- 在线试用仅在无额外副作用或明确授权范围

**必须验证的失败：**

- 注入的所有记忆不能随任务成功一起记功
- 模型自报与用户点赞不被伪装为因果收益

**场景：**Z21。

**回滚：**停止新试用并冻结候选，不删除失败证据。

**不做：**不为对照重复真实外部动作。

## P2-04 · 学习审阅与漂移恢复界面

**结果：**用户看懂学到了什么，能否定、停用与恢复合适版本。

**前置：**P2-03；**风险：**R2；**类型：**必需。

**触及：**`apps/web`、`apps/daemon`。

**合同：**[ui-design.md](../../docs/product/ui-design.md)、[learning-and-evaluation.md](../../docs/architecture/learning-and-evaluation.md)。

**完成条件：**

- 学习条目可追到原结果与适用范围
- 用户反馈立即影响状态及后续检索
- 离线/预算不足/候选过多不阻塞交互，队列可观察

**必须验证的失败：**

- 否定后迟到作业不能复活旧做法
- 回滚不会恢复已遗忘证据

**场景：**Z22。

**回滚：**关闭自动建议，保留人工记忆与受控执行。

**不做：**不把所有学习都做成强制审批弹窗。

## P2-05 · 验收学习迁移与成本

**结果：**用保留任务证明经验学习的范围与收益。

**前置：**P2-04；**风险：**R2；**类型：**必需。

**触及：**`packages/evals`、`docs/planning`。

**合同：**[acceptance-criteria.md](../../docs/planning/acceptance-criteria.md)、[learning-and-evaluation.md](../../docs/architecture/learning-and-evaluation.md)。

**完成条件：**

- 四基线+关闭学习消融，报告样本/未知/失败与成本
- 至少 30 个保留任务、三类别、三次重复，防止任务泄漏
- 满足学习门槛才开放 ACTIVE 做法自动推荐

**必须验证的失败：**

- 无显著收益不捏造学习成功，保留候选/试用状态
- 任一安全退化阻止开放

**场景：**Z19, Z20, Z21, Z22。

**回滚：**停用新策略，恢复前一已评估版本，不撤销用户纠正。

**不做：**不复现全部论文或追逐排行榜。

## P3-01 · 承诺、调度与事件信号

**结果：**获准承诺与环境变化可持久唤醒任务，不轮询模型。

**前置：**P2-05；**风险：**R3；**类型：**必需。

**触及：**`packages/cognition-core`、`apps/daemon`。

**合同：**[proactivity-and-execution.md](../../docs/architecture/proactivity-and-execution.md)、[data-and-api.md](../../docs/architecture/data-and-api.md)。

**完成条件：**

- 用户确认 Commitment，时区/期限/取消清楚
- 作业 owner/disposer、lease 与幂等唤醒
- 睡眠/重启/错过窗口合并处理

**必须验证的失败：**

- 失效目标/撤销订阅不再唤醒
- 时钟跳变/重复信号不形成通知风暴

**场景：**Z23。

**回滚：**关闭 scheduler 并取消其排队作业，保留承诺与反馈。

**不做：**不全盘扫描，不自由常驻思考。

## P3-02 · 只读日历连接器

**结果：**用户显式导入/订阅的 ICS 事件成为有来源的时间信号。

**前置：**P3-01；**风险：**R3；**类型：**必需。

**触及：**`apps/daemon`、`apps/web`。

**合同：**[proactivity-and-execution.md](../../docs/architecture/proactivity-and-execution.md)、[trust-and-safety.md](../../docs/architecture/trust-and-safety.md)。

**完成条件：**

- 来源/范围/TTL/撤销与游标有界
- 重复、更新、删除、时区与 recurrence 有可验 Fixture
- 只读范围可见，数据按 Workspace/privacy 进入

**必须验证的失败：**

- 恶意内容不成为指令，过大/坏输入拒绝
- 撤销后停止读取且旧触发失效

**场景：**Z24。

**回滚：**停用连接器、撤销订阅与派生信号，保留必要审计。

**不做：**不写日历，不假定提供商私有 API。

## P3-03 · GitHub 只读变化连接器

**结果：**选定仓库的任务/PR 变化可关联项目目标。

**前置：**P3-01；**风险：**R3；**类型：**必需。

**触及：**`apps/daemon`、`apps/web`。

**合同：**[proactivity-and-execution.md](../../docs/architecture/proactivity-and-execution.md)、[trust-and-safety.md](../../docs/architecture/trust-and-safety.md)。

**完成条件：**

- 最小只读权限、限定 repo、稳定事件/轮询 cursor
- 断线/限流/重复更新不丢或重复提醒
- Webhook 非必需；确定性网络轮询不用模型 Token

**必须验证的失败：**

- 其他仓库不被读取，内容注入不赋权
- 凭据失效显式显示并停止

**场景：**Z24。

**回滚：**撤销 Connector Grant，停止同步并使过期信号失效。

**不做：**不自动评论/合并/推送。

## P3-04 · 主动决策、准备与负担控制

**结果：**系统选择静默、准备或提醒，并能解释为什么现在。

**前置：**P3-02, P3-03；**风险：**R3；**类型：**必需。

**触及：**`apps/daemon`、`packages/cognition-core`。

**合同：**[proactivity-and-execution.md](../../docs/architecture/proactivity-and-execution.md)。

**完成条件：**

- 确定性资格/预算先于单次模型判断
- 去重、24h 冷却、日预算、quiet hours 与过期规则实现
- 准备只用获准读取/草稿，反馈持久并影响后续

**必须验证的失败：**

- Attention 无法直接执行外部写
- disable/snooze/源失效立即生效

**场景：**Z25, Z26。

**回滚：**切回 shadow mode，停止通知与准备，保留候选诊断。

**不做：**不因模型说紧急绕过用户规则。

## P3-05 · 今天页面与主动性验收

**结果：**用户可处理提醒，并证明价值高于噪声。

**前置：**P3-04；**风险：**R2；**类型：**必需。

**触及：**`apps/web`、`packages/evals`、`docs/planning`。

**合同：**[ui-design.md](../../docs/product/ui-design.md)、[acceptance-criteria.md](../../docs/planning/acceptance-criteria.md)。

**完成条件：**

- whyNow/目标/依据/建议/准备成果齐全
- 120 个标注机会与静默对照，分别测误报和遗漏
- shadow 后按类别开放，通知反馈不伪装为任务收益

**必须验证的失败：**

- 静音、重复、已处理违规为零
- 只显示提醒数量不能通过阶段门

**场景：**Z23, Z24, Z25, Z26。

**回滚：**关闭系统通知，只保留手动查看记录。

**不做：**不强迫用户逐条评价。

## P4-01 · 有界委托、授权与预算账本

**结果：**用户把具体任务交给后台，能审批/撤销/停止。

**前置：**P3-05；**风险：**R3；**类型：**必需。

**触及：**`apps/daemon`、`packages/cognition-core`、`packages/memory-store`、`apps/web`。

**合同：**[proactivity-and-execution.md](../../docs/architecture/proactivity-and-execution.md)、[trust-and-safety.md](../../docs/architecture/trust-and-safety.md)。

**完成条件：**

- Grant/Delegation/ActionAttempt/预算 reservation 持久事务
- 审批展示精确动作/对象/内容/外发/期限
- 撤销 epoch 与 kill switch 覆盖队列及下一派发边界

**必须验证的失败：**

- 并发预算预留不超额，旧授权无法重用
- 在途结果未知显示核对，不伪称取消成功

**场景：**Z27。

**回滚：**停用后台执行、撤销未用 Grant、核对在途动作。

**不做：**不提供全局无限自主开关。

## P4-02 · 后台恢复与配置生命周期

**结果：**后台任务可恢复，配置变化不制造重复行动或漂移。

**前置：**P4-01；**风险：**R3；**类型：**必需。

**触及：**`apps/daemon`、`packages/pi-adapter`。

**合同：**[system-architecture.md](../../docs/architecture/system-architecture.md)、[proactivity-and-execution.md](../../docs/architecture/proactivity-and-execution.md)。

**完成条件：**

- 默认总并发2/每 Workspace1，排队公平、进度订阅不调模型
- prepare/validate/commit/drain/dispose 与 last-known-good
- 重启、Worker 丢失、租约过期按 checkpoint/外部回执决定恢复

**必须验证的失败：**

- 旧 owner 重活与重放不能重复派发
- 未知副作用进入 NEEDS_RECONCILIATION

**场景：**Z28。

**回滚：**排空新 Worker、恢复上一配置 revision，保留核对账本。

**不做：**不热切换正在执行的 Runtime 身份。

## P4-03 · 受控文件产物发布

**结果：**获准草稿可以安全发布到指定文件目标。

**前置：**P4-02；**风险：**R3；**类型：**必需。

**触及：**`apps/daemon`、`apps/web`。

**合同：**[trust-and-safety.md](../../docs/architecture/trust-and-safety.md)、[proactivity-and-execution.md](../../docs/architecture/proactivity-and-execution.md)。

**完成条件：**

- 目标路径/差异/覆盖前置条件可审阅
- 真实平台隔离与路径/链接/替换检查通过
- 原子写入、旧内容恢复和取消/崩溃证据

**必须验证的失败：**

- 不得写出根、覆盖已变更文件或未经确认删除
- 部分完成按文件列明，不假装全成功

**场景：**Z29。

**回滚：**保留经授权备份并按版本恢复；不可恢复操作先拒绝。

**不做：**不开放任意 shell 或全盘写入。

## P4-04 · 受控 GitHub 写动作

**结果：**能在指定仓库创建/更新明确 Issue/PR 内容并可靠核对回执。

**前置：**P4-02；**风险：**R3；**类型：**必需。

**触及：**`apps/daemon`、`apps/web`。

**合同：**[proactivity-and-execution.md](../../docs/architecture/proactivity-and-execution.md)、[trust-and-safety.md](../../docs/architecture/trust-and-safety.md)。

**完成条件：**

- 最小写 scope，提交前精确对象类型与 revision 验证
- dry-run、受控测试 repo 回执与授权撤销验证
- 幂等/查询核对覆盖响应丢失和重复请求

**必须验证的失败：**

- 不确定发送不盲重试，不能误投同号 Issue/PR
- 不越 repo、不自动合并超出 Grant 的 PR

**场景：**Z29。

**回滚：**撤销 token/Grant；可逆内容按原版本补偿，保留外部已发生事实。

**不做：**不发布包、转账、发送邮件。

## P4-05 · Windows 桌面壳与系统凭据

**结果：**Windows 11 x64 用户拥有托盘、通知、启动与安全凭据体验。

**前置：**P4-03, P4-04；**风险：**R3；**类型：**必需。

**触及：**`apps/desktop`、`apps/web`。

**合同：**[ui-design.md](../../docs/product/ui-design.md)、[trust-and-safety.md](../../docs/architecture/trust-and-safety.md)。

**完成条件：**

- Electron 打包同一 UI、隔离 renderer 与白名单桥
- OS vault、Provider/Connector 撤销、冷启动与多开控制
- 托盘/通知/键盘/读屏/200% 缩放与断线恢复验收

**必须验证的失败：**

- 恶意网页/IPC/外链不越权，凭据不进入 renderer
- 凭据库锁定时明确不可用

**场景：**Z30。

**回滚：**卸载/禁用桌面壳不删用户数据；CLI/本地 Web 按原授权继续。

**不做：**不承诺未验证 OS 平台，不把壳沙箱当 Worker 沙箱。

## P4-06 · 备份、升级与恢复交付

**结果：**用户可以导出、备份、升级并在失败后恢复，遗忘不会复活。

**前置：**P4-05；**风险：**R3；**类型：**必需。

**触及：**`apps/desktop`、`apps/daemon`、`packages/memory-store`。

**合同：**[data-and-api.md](../../docs/architecture/data-and-api.md)、[trust-and-safety.md](../../docs/architecture/trust-and-safety.md)。

**完成条件：**

- 加密/完整性校验备份，密钥恢复说明与凭据排除
- 升级签名/来源验证、迁移前检查与失败恢复演练
- 当前 deletion journal 先于旧备份重建，逐副本清除状态可见；新 recoveryEpoch 禁用全部旧 Grant/会话凭据/自动任务，重新授权前不能派发

**必须验证的失败：**

- 损坏备份/旧 journal/不兼容版本拒绝启用
- 升级中断不丢已提交状态，不偷偷恢复被忘内容

**场景：**Z31。

**回滚：**退回已验证应用版本，数据只走受支持恢复/前向修复；不宣称可恢复已清除正文。

**不做：**不加入全量云同步。

## P4-07 · 完整本地产品 v1 验收与发布

**结果：**提供可安装、可长期使用、有清楚能力边界的完整个人 Agent v1。

**前置：**P4-06；**风险：**R3；**类型：**必需。

**触及：**`packages/evals`、`docs/planning`、`apps/desktop`。

**合同：**[acceptance-criteria.md](../../docs/planning/acceptance-criteria.md)、[product-vision.md](../../docs/product/product-vision.md)。

**完成条件：**

- Z01—Z31、恢复/升级/撤销与真实受控写动作通过；Z32 由 P5 验收，不阻塞 P4
- 14天连续使用协议记录质量/打扰/成本，未完成观察不虚报
- 发布签名与凭据可用才发布；证据/已知限制/回滚包齐全

**必须验证的失败：**

- 任何安全红线或关键恢复失败阻止发布
- 缺凭据仅阻塞发布，不伪造签名或标记已发布

**场景：**Z27, Z28, Z29, Z30, Z31。

**回滚：**停止分发新版本，指引受支持回滚并保留审计。

**不做：**不把本设计合入或构建成功当 v1 完成。

## P5-01 · 稳定认知 API 与能力协商

**结果：**外部 Agent 可在相同治理下使用记忆与任务，不绕过真源。

**前置：**P4-07；**风险：**R3；**类型：**必需。

**触及：**`packages/protocol`、`apps/daemon`、`packages/evals`。

**合同：**[data-and-api.md](../../docs/architecture/data-and-api.md)、[system-architecture.md](../../docs/architecture/system-architecture.md)。

**完成条件：**

- 版本化 cognition API/MCP 映射、scope token、能力协商
- 只读/提议/执行权限分开，客户端不写核心表
- 兼容 Fixture、升级/撤销与并发客户端隔离

**必须验证的失败：**

- 未知协议/未声明能力拒绝，不静默 fallback
- MCP 内容注入不能扩大权限

**场景：**Z32。

**回滚：**撤销外部接口凭据并停入口，保留本地产品。

**不做：**不开放任意数据库/全部记忆导出。

## P5-02 · 第二 Runtime：Codex 适配与验收

**结果：**在一个真实第二 Runtime 上证明认知层与执行层可分离。

**前置：**P5-01；**风险：**R3；**类型：**必需。

**触及：**`packages/codex-adapter`、`apps/daemon`、`packages/evals`。

**合同：**[system-architecture.md](../../docs/architecture/system-architecture.md)、[pi-integration.md](../../docs/architecture/pi-integration.md)。

**完成条件：**

- 以实施时官方支持接口为依据锁定版本，记录能力/不支持项
- 复用 scope/context/Outcome/权限/事件合同，原生身份不混用
- 同一跨日任务跨 Runtime 继续，记忆/授权一致

**必须验证的失败：**

- 缺失工具/模型边界控制时禁止相应 profile
- 不能把文案适配或 Mock 当真实兼容

**场景：**Z32。

**回滚：**停用新 adapter，保留 Pi 与同一真源；不降权限保证。

**不做：**不深 Fork Runtime，不同时引入第三个 Provider。

## P5-03 · 跨 Runtime 产品与兼容发布

**结果：**用户可选择已验证 Runtime，失败与差异透明。

**前置：**P5-02；**风险：**R3；**类型：**必需。

**触及：**`packages/evals`、`apps/web`、`docs/planning`。

**合同：**[acceptance-criteria.md](../../docs/planning/acceptance-criteria.md)、[system-architecture.md](../../docs/architecture/system-architecture.md)。

**完成条件：**

- UI 能力差异可见，替换需排空与新 contract revision
- 兼容回归、升级/降级与长期记忆一致性通过
- 同模型可比时做配对评估，不同模型结果分层报告

**必须验证的失败：**

- Provider 消失/配置失败保留 last-known-good
- 外部 Agent 撤权后不能继续读取旧上下文

**场景：**Z32。

**回滚：**撤回兼容版本声明并停新 Provider，保留可用主 Runtime。

**不做：**不宣称任意 Agent 无缝兼容。

## X2-01 · 条件检索增强

**结果：**仅在实测漏召回时增加本地向量/混合检索。

**前置：**P2-05；**风险：**R2；**类型：**条件扩展。

**启用条件：**FTS5 在保留集出现明确召回瓶颈，且成本预算可接受。

**触及：**`packages/context-compiler`、`packages/memory-store`。

**合同：**[cognitive-loop.md](../../docs/architecture/cognitive-loop.md)、[learning-and-evaluation.md](../../docs/architecture/learning-and-evaluation.md)。

**完成条件：**

- 同数据/预算对照证明收益
- 索引可重建且资格过滤不变

**必须验证的失败：**

- 陈旧 embedding 不能绕过遗忘
- 没有收益不默认启用

**场景：**Z13。

**回滚：**删派生索引，回到 FTS5。

**不做：**不建远程向量服务。

## X4-01 · 条件桌面平台扩展

**结果：**为新增 macOS/Linux 平台建立独立支持矩阵。

**前置：**P4-07；**风险：**R3；**类型：**条件扩展。

**启用条件：**出现明确非 Windows 用户需求与可测试设备/签名条件。

**触及：**`apps/desktop`、`packages/evals`。

**合同：**[ui-design.md](../../docs/product/ui-design.md)、[trust-and-safety.md](../../docs/architecture/trust-and-safety.md)。

**完成条件：**

- 安装/更新/凭据/通知/文件边界均实测
- 许可与签名渠道可用

**必须验证的失败：**

- 不支持能力显式关闭
- 不能沿用 Windows 证据

**场景：**Z30。

**回滚：**撤回该平台包与支持声明。

**不做：**不把 Electron 跨平台等同产品已支持。

## X5-01 · 条件加密同步与移动审批

**结果：**经独立设备/密钥 ADR 后提供最小审批和必要状态同步。

**前置：**P5-03；**风险：**R3；**类型：**条件扩展。

**启用条件：**本地 v1 和跨 Runtime 验收完成，用户明确需要多设备。

**触及：**`apps/daemon`、`packages/protocol`、`packages/memory-store`。

**合同：**[data-and-api.md](../../docs/architecture/data-and-api.md)、[trust-and-safety.md](../../docs/architecture/trust-and-safety.md)。

**完成条件：**

- 先设计端到端加密、设备撤销、冲突和遗忘传播，再分小任务实现
- 移动首版只审批/查看必要摘要，不复制全部正文

**必须验证的失败：**

- 丢设备/旧设备/旧备份不能复活数据或授权
- 没有最新撤销状态时拒绝写

**场景：**Z31, Z32。

**回滚：**撤销设备与同步凭据，保留本地离线能力。

**不做：**不把本条件任务当已定案的同步协议。

## X5-02 · 条件增加 Claude 或 dsh Runtime

**结果：**逐一证明更多执行 Runtime 满足相同边界。

**前置：**P5-03；**风险：**R3；**类型：**条件扩展。

**启用条件：**真实用户场景要求第二 Runtime 以外的能力。

**触及：**`packages/claude-adapter`、`packages/dsh-adapter`、`packages/evals`。

**合同：**[system-architecture.md](../../docs/architecture/system-architecture.md)。

**完成条件：**

- 每个真实 Provider 独立版本/能力/契约 Fixture
- 继承 P5 第二 Runtime 的验收，不省略权限/恢复

**必须验证的失败：**

- 不支持项不通过统一接口掩盖
- 兼容漂移拒绝启用

**场景：**Z32。

**回滚：**停用该 Provider，不影响真源。

**不做：**不因已有名字先建空 adapter。

## X5-03 · 条件第三方插件宿主

**结果：**只有固定组合无法满足实际扩展需求时设计受隔离宿主。

**前置：**P5-03；**风险：**R3；**类型：**条件扩展。

**启用条件：**至少两个独立扩展需求无法由现有显式组合完成。

**触及：**`apps/daemon`、`packages/protocol`。

**合同：**[system-architecture.md](../../docs/architecture/system-architecture.md)、[trust-and-safety.md](../../docs/architecture/trust-and-safety.md)。

**完成条件：**

- 新 ADR 定义来源、签名、权限、生命周期和隔离
- 至少两个真实扩展消费者证明抽象必要

**必须验证的失败：**

- 插件不能替换核心 validator
- 卸载不能遗留能力/任务/凭据

**场景：**Z32。

**回滚：**停用宿主并撤销插件权限。

**不做：**不把一切皆插件作为产品总原则。

## 场景归属

| ID | 场景 | 实施/验收任务 |
|---|---|---|
| Z01 | 有限安全实证与真实接入分离 | P0-01 |
| Z02 | 规模/持久性/恢复基线 | P0-02 |
| Z03 | 跨日继续同一目标 | P1-01, P1-09 |
| Z04 | 纠正与有效时间/冲突 | P1-01, P1-05, P1-09 |
| Z05 | 事务/内容原子性 | P1-02, P1-09 |
| Z06 | 遗忘与依赖失效 | P1-02, P1-05, P1-09 |
| Z07 | 旧备份隔离恢复 | P1-02, P1-09 |
| Z08 | 真实 Runtime 输入与生命周期 | P1-03, P1-09 |
| Z09 | 工具来源/Private/路径边界 | P1-03, P1-09 |
| Z10 | 摄取确认/顺序/缺口 | P1-04, P1-09 |
| Z11 | 取消/崩溃/重启 | P1-04, P1-09 |
| Z12 | 订阅/游标/配对认证 | P1-04, P1-09 |
| Z13 | 检索资格/重建/预算 | P1-05, P1-09, X2-01 |
| Z14 | 上下文组成/真实发送 | P1-06, P1-09 |
| Z15 | 未知项/决策有界/并发纠正 | P1-06, P1-09 |
| Z16 | 任务验证与不可验证 | P1-07, P1-09 |
| Z17 | Episode/采用/结果关联 | P1-07, P1-09 |
| Z18 | 工作台全状态与可访问性 | P1-08, P1-09 |
| Z19 | 自动候选与证据污染 | P2-01, P2-05 |
| Z20 | 做法试用/晋升/退役 | P2-02, P2-05 |
| Z21 | 收益对照与未知归因 | P2-03, P2-05 |
| Z22 | 学习审阅/反馈/回滚 | P2-04, P2-05 |
| Z23 | 时间/承诺/睡眠恢复 | P3-01, P3-05 |
| Z24 | 连接器变化与撤销 | P3-02, P3-03, P3-05 |
| Z25 | 主动价值/准备边界 | P3-04, P3-05 |
| Z26 | 去重/静音/负担/反馈 | P3-04, P3-05 |
| Z27 | 委托/授权/预算/撤销 | P4-01, P4-07 |
| Z28 | 后台 owner/配置/恢复 | P4-02, P4-07 |
| Z29 | 副作用回执/幂等/核对 | P4-03, P4-04, P4-07 |
| Z30 | 桌面/凭据/通知/可访问性 | P4-05, P4-07, X4-01 |
| Z31 | 备份/升级/删除不回生 | P4-06, P4-07, X5-01 |
| Z32 | 跨 Runtime/MCP/兼容 | P5-01, P5-02, P5-03, X5-01, X5-02, X5-03 |

## 原工作包完整映射

此映射覆盖原 60 个工作包。reused 仅复用原有限成果；replanned 不继承旧完成状态；conditional 是明确缩小首版承诺；maintenance 保留独立维护队列。

| 原 ID / 名称 | 处置 | 新任务 | 原因 |
|---|---|---|---|
| M0-1 SQLite Ledger v1 收口 | reused | 保留既有成果/队列 | 已由 PR #69 交付 v1 Ledger；复用原合同，新正文生命周期不是其已交付能力。 |
| M0-2 Workspace / Session 持久化与所有权 | replanned | P1-01, P1-02, P1-04 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M0-3 SessionContract 与输入记录基础 | replanned | P1-04, P1-06 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M0-4 正式 Pi Runtime Adapter | replanned | P1-03 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M0-5 Daemon / Worker Supervisor | replanned | P1-04, P4-02 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M0-6 可靠摄取与领域 Observation 投影 | replanned | P1-04 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M0-7 CLI 查询回放与事件订阅 | replanned | P1-04, P1-08 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M0-8 M0 端到端与恢复证据 | replanned | P1-09 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M1-1 Candidate / Claim 持久化 | replanned | P1-02 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M1-3 Scope 访问与传播规则 | replanned | P1-01, P1-05 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M1-2 候选接受与证据验证 | replanned | P1-05 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M1-4 Claim 生命周期、纠正与冲突 | replanned | P1-05 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M1-5 遗忘、保留与失效传播 | replanned | P1-02, P1-05, P4-06 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M1-6 FTS5 与可重建检索投影 | replanned | P1-05 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M1-7 记忆 API / CLI 与阶段证据 | replanned | P1-05, P1-08, P1-09 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| G-1 架构合同与不变量归属基线 | reused | 保留既有成果/队列 | PR #81 的有限架构基线保留；不从有限接受推导新认知实现。 |
| G-2 数据策略、威胁模型和接入前安全 | replanned | P0-01, P1-02, P1-03 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| G-3 正式工具链与依赖闭包 | reused | 保留既有成果/队列 | PR #83/#87 工具链与 CLI 方向保留，新增消费者仍要真实接线验证。 |
| G-4 可执行场景与证据运行器基线 | replanned | P0-02, P1-09 | PR #89 场景运行器复用；原三项 PARTIAL/21 not-run 不自动升级。 |
| G-5 Ledger 规模、持久性与演进验证 | replanned | P0-02, P1-02 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| G-6 项目状态与治理噪声维护 | maintenance | 保留既有成果/队列 | #15 及必要状态维护保留独立低优先级队列，不阻塞产品；本设计不改合并/来源门。 |
| M2-1 上下文资格过滤与相关性排序 | replanned | P1-06 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M2-2 固定预算 Capsule 与贡献者接口 | replanned | P1-06 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M2-3 记忆快照与失效水位 | replanned | P1-06 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M2-4 Pi 上下文注入与原生 Package | replanned | P1-06, P5-01 | 真实记忆注入提前；原生 Pi Package 经后续统一认知接入面承接，不要求用户先安装 Pi 才能用产品。 |
| M2-5 Goal 与项目工作状态 | replanned | P1-01, P1-04, P1-06 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M2-6 本轮依据解释与阶段证据 | replanned | P1-08, P1-09 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M3-1 Outcome 与结果证据 | replanned | P1-07 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M3-2 自动 MemoryCandidate 提取 | replanned | P2-01 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M3-3 Procedure Candidate 与适用条件 | replanned | P2-02 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M3-4 Procedure 晋升、版本和退役 | replanned | P2-02, P2-03 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M3-5 学习审阅与阶段证据 | replanned | P2-04, P2-05 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M4-1 常驻调度与资源归属 | replanned | P3-01 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M4-2 DUE / FOLLOW_UP / CONFLICT Attention | replanned | P3-04 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M4-3 冷却、去重、静默与提醒预算 | replanned | P3-04 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M4-4 Attention 收件箱与接口 | replanned | P3-05 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M4-5 主动性反馈与阶段证据 | replanned | P3-05 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M5-1 Delegation Contract 与状态机 | replanned | P4-01 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M5-2 PolicyGrant 与 Policy Decision | replanned | P1-03, P4-01 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M5-3 审批、撤销与紧急停止 | replanned | P4-01 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M5-4 Sandbox 与凭证边界 | replanned | P1-03, P4-03 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M5-5 成本、次数与执行预算 | replanned | P1-06, P4-01 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M5-6 后台执行、事件进度与副作用恢复 | replanned | P4-02 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M5-7 Provider 生命周期与配置对账 | replanned | P4-02 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M6-1 桌面壳、本地通信与可访问性 | replanned | P1-08, P4-05 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M6-2 Today / Workspace / 会话界面 | replanned | P1-08, P3-05 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M6-3 Memory 管理界面 | replanned | P1-08 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M6-4 Attention / Delegation / 审批与进度界面 | replanned | P1-08, P3-05, P4-01, P4-05 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M6-5 活动审计、状态与外发可见性 | replanned | P1-08, P4-05 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M6-6 选定核心连接器 | replanned | P1-03, P3-02, P3-03, P4-03, P4-04 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M6-7 安装、升级、签名与发布 | replanned | P4-06, P4-07 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M6-8 用户备份、导出与恢复 | replanned | P4-06 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M7-1 稳定 Cognition Protocol 与能力声明 | replanned | P5-01 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M7-2 Codex Adapter | replanned | P5-02 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M7-3 Claude Adapter | conditional | X5-02 | 改为有真实需求后逐 Provider 扩展，首个第二 Runtime 固定为 Codex。 |
| M7-4 MCP 认知接入面 | replanned | P5-01 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| M7-5 移动伴侣与远程审批 | conditional | X5-01 | 改为条件扩展，移动审批不隐含全量同步。 |
| X-1 向量 / 图 / 混合检索增强 | conditional | X2-01 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| X-2 第三方插件宿主与生态 | conditional | X5-03 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
| X-3 加密跨设备同步 | conditional | X5-01 | 保留用户结果和失败语义，由目标任务承接；旧阶段完成状态不继承。 |
