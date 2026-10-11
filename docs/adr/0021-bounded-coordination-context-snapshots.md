# ADR 0021：有界认知协调与上下文快照接线

- 状态：Accepted（仅设计；实现及产品验收另需当前 HEAD 证据）
- 日期：2026-10-11
- 工作项：#121 / P1-06
- 被取代关系：细化 ADR0017 的 Context/有限决策与 ADR0019 的受控调用接线；不替代既有 Runtime、Task、快照 v1 或遗忘合同。

独立审查：[PR122 设计记录](https://github.com/ntygod/zhiwei-next/pull/122#issuecomment-6109122422)批准 Proposed 提案 SHA256 `d103fb55e6ffb9c97c62ba6608fbfd3e6f27078b38e4c7bb44997329edb8e46f`；该记录不批准任何实现 HEAD。其指出的 WorkingState 跨 Session 关联缺口已加入计数前检查和原组件场景。

## 背景

P1-04 已保存 Task/WorkingState、Runtime 输入与受控模型请求；P1-05 已提供当前有来源的记忆与精确版本，P0-04 已有纯预算选择。尚未接通认知协调、编译 read-set 与实际发送的一致绑定。纯胶囊或模型建议都不是发送授权。

## 决策

1. Context Compiler 消费调用方已经从一致视图取得并复验来源的当前材料，保持 domain-only、纯计算。再次限定当前 Workspace/Task/Session、model-allowed、ACTIVE 和有效时间，才调用既有预算选择阶段。首版仅消费 Claim 与 required Task/WorkingState；Episode/Procedure 的正式消费留给已规定的后续任务。Global 材料不在没有对应实际读取资格的首版合成消费者中混入。
2. 新 `CognitiveContextCapsuleV1` 是不可变派生值，包含当前 Task/attempt/WorkingState 与配置版本、有序渲染、精确 Claim/source refs、选中/排除原因和计数信息。预算复用固定 renderer/60-25-15/必需项及最终重计数。纯输出不携带许可布尔、Grant 或可发送凭据；synthetic counter 只证明自身计数行为，不能冒充真实 Provider tokenizer。
3. 新持久 Context 入口与固定前向 schema5 保存 protected capsule/Decision，关联 RuntimeInput v1、当前 Task/WorkingState/精确来源和 cognition/policy/recovery 水位。原 v1 输入/模型请求字段含义保持。只有固定组合能原子记录胶囊与 Runtime 输入；结构化 read-set 与正文依赖同时提交，旧接口不能传入任意附加权限或数据库迁移。0001—0004 不改写。
4. 编译上下文仍不是模型已看到。Runtime 接线传入保存后的完整渲染和 input ref；实际模型边界先记录实际 context，再同步复验当前绑定、Task intent、epoch、到期与精确来源，才交给同一受控 Broker/接收端。记录实际模型请求与 capsule 的关系；禁止在该边界与实际接收之间 await。来源遗忘沿现有内容依赖撤销派生正文，发送和迟到结果都不能只相信先前的胶囊。
5. Coordinator 只在任务边界运行。DecisionInput 绑定同一 Task/attempt、WorkingState、合格材料、能力、未知项与预算；输出只允许 respond/clarify/retrieve/execute/wait/stop 的有界字段。最多初次加一次修复或补检索调用；第二次仍需检索/修复、无进展或字段/引用非法时明确终止。取消、继续、搜索和状态查询走确定性路由。DecisionRecord 保留动作、依据、必要摘要和调用数，不保存原始思维链。
6. 认知调用使用 Runtime-neutral consumer port，并复用受控 Broker；未证明 structuredDecision 的真实 profile 返回 unsupported，不用新 callback 直接接 Provider，也不建立第二套 Agent Loop。合成消费者只使用自己的临时安装和固定 scripted receiver；其真实接收记录证明该合成边界，不认证官方 CLI+一方扩展完整真实组合或产品能力。
7. 计划提交重验 read-set/CAS。澄清/等待保留明确阻塞条件与持久记录，后续已提交输入/信号才形成新边界，不循环询问模型。execute 交既有受控执行；respond/stop 不把模型文本写成 COMPLETED 或 Outcome。真实结果验证、Episode 与 Adoption 仍属 P1-07。

## 备选方案

把编译结果当作发送许可，会漏掉纠正与撤销；把 metadata/许可藏进 Prompt，会混淆输入与授权；另建模型循环会重复 Pi 的责任。均不采用。只存摘要不能对应实际请求，因此保存获准完整渲染及实际边界记录，未知 Provider 变换继续明确未观测。

## 后果与验证

Store 增加固定 schema5 与 Context 端口，Domain/Protocol 增加明确版本合同；恢复身份机械报告真实5，旧2/3/4格式与旧严格 opener 保持。新接口只由合成消费者调用，正常 Daemon 仍为诊断入口。

必要开发场景贯穿 Task/WorkingState/记忆→有界决定→预算胶囊→已提交快照→受控接收，验证必需超预算、隐藏材料不计数/不发送、最多两次及无进展、发送前纠正/撤销与最后请求后的迟到拒收。原完整 check、当前 HEAD 独立 R3、Runtime 来源与 Ready/live 门禁保持；Z14/Z15 产品验收 not_run。受限旧安全/备份实验不运行。

回滚关闭协调/长期记忆注入并回到既有无长期记忆受控 profile；代码经新受审 revert PR，保留任务/请求/记忆真源与最新控制日志。schema5 仅前向修复，不降级或回退遗忘。

## 前向补充提案：中间决定记录

状态：Accepted（仅设计补充）；[独立设计记录](https://github.com/ntygod/zhiwei-next/pull/122#issuecomment-6109350063)批准 Proposed 整文件 SHA256 `0088812aa8156f56ff7abe7d1a320126e6582d92f70fec8486d19702c2451b85`，不批准实现HEAD。不改变已接受的六动作、同一 Task/attempt、最多两次、正文保护和发送/结果复验合同。schema5 已进入分支并用于隔离临时数据库，继续实现时不重写它。另以固定前向0006追加 `cognitive_decision_v1`：每次合法模型提案和协调器明确终止保存独立不可变版本，记录 boundary、当前 capsule、调用数、动作、必要摘要和来源；不保存非法原始输出或思维链。首次 retrieve 保留记录但 boundary 仍 open，补检索/修复消耗同一 boundary 的第二次预约；最终响应、执行、澄清、等待或终止才写当前决定指针。最多两个模型提案及一次确定性终止；调用计数不随错误、重试、重启或新胶囊重置。

历史决定正文关联精确胶囊、已预约输入、已记录实际请求及前一决定，投影逐项验证且纳入既有正文依赖撤销。物理最新 Schema 随真实迁移报告为6，旧2/3/4/5严格入口与历史恢复格式保持，未知7拒绝；不运行备份/capture/restore实验。此补充需要独立设计审查，并仍由最终HEAD R3审查和原完整门禁约束。

## 首个合成实现的能力范围

固定 Session compiler profile 为 cognitive-context-v1；原 fixed-synthetic-input profile 继续用于既有无长期记忆执行。决定模型只接受同一 Broker 的 scripted receiver，未证明的真实 structuredDecision 返回 unsupported。clarify/wait 首版都绑定一个 user-input 问题/条件：内部 task.runtime/cognitive-wait 只消费 Store 已提交的决定，不伪造用户 Observation；task.respond 保存真实输入，精确问题匹配后建立下一 revision，task.continue 不能替代它。不提供任意订阅、期限调度或自动模型轮询。

执行仍由既有 Worker 完成。胶囊对应的 READY→RUNNING 只在 exact task.runtime/start、同 attempt/intent/owner 和原 READY binding 依赖证明成立时承接；其余 Task/WorkingState/配置/材料/epoch 变化都拒绝。实际请求与原胶囊的关联、完整请求计数和最终事件复验在现有同步事务/接收屏障中完成。首个 Runtime memory.search/inspect 只读该胶囊已选、当前仍合格材料，固定受控工具复用此端口；新增检索在协调边界完成，因此无需在执行中另建来源或模型循环。Unicode scalar 计数和协议 peer 都是合成开发证据，不能代表真实 Provider tokenizer 或官方 Pi 完整组合验收。
