# ADR 0022：结果验证、经历与记忆使用记录的提交

- 状态：Accepted（仅设计；实现及真实启用另需当前 HEAD 证据）
- 日期：2026-10-12
- 工作项：#123 / P1-07
- 被取代关系：细化 ADR0017 的 Outcome/使用记录、ADR0021 的结果屏障；不取代既有 Task、Runtime、内容生命周期或旧严格 Schema 入口。

独立审查：[PR124 设计记录](https://github.com/ntygod/zhiwei-next/pull/124#issuecomment-6116074002)批准 Proposed 提案提交 `e706596858673e77815cd429b4d0f0ebfc244ef0`、文本 SHA256 `de7bd245aaeef58471c89a989fb984dd81c52f9c1a9db3997202b6779c8c38ae`。记录只接受有限设计，不批准实现 HEAD、真实能力或合并。

## 背景

P1-06 已把精确来源的胶囊送入受控合成请求，但 Runtime settled 只进入 VERIFYING。纯 Outcome 归约尚无成功验证的持久消费者，Episode 入口仍拒绝通用调用。模型输入登记发生在接收前，不能据此声称已发送或采用。需要连接预声明标准、真实观测、纯判定和一次原子提交。

## 决策

1. 新 `OutcomeVerificationPlanV1` 在同一 Task/attempt/intent 的首次派发前持久绑定精确 criterion 定义和固定验证器 revision。计划不可修改，不能在看到结果后重写期望或用新标准验证旧 attempt；重试或修改目标建立新 attempt。已有标准/Task v1 含义不变。
2. Daemon 的固定验证 profile 读取其获准的临时产物、确定性检查及精确动作记录，记录实际观测后交给 cognition-core 纯归约。artifact 检查存在及具体内容；deterministic-test 检查实际测试/查询结果；tool-receipt 只支持精确动作；user-confirmation 只支持预先指定的主观 criterion；model-assisted 不能单独 pass。异常、未提供验证器、缺证据或结果关联不符保留 unknown 或明确拒绝，不接受用户提交任意 CriterionResult/权限布尔。
3. 原 `deriveOutcome` 仍是结果分类真源。首次验证终结 VERIFYING；已确认取消产生 cancelled Outcome。后续新证据追加同 Outcome ID 的新 revision，原 Task/attempt 终态及旧判定不改写，查询明确显示当前 Outcome 与原终态。旧 pass 过期或失去证据时，不作为新判定的有效 pass。
4. Verifier 在 I/O 前取得一致快照与 read-set；提交时重验安装/恢复身份、当前 scope/policy/cognition、owner、attempt/intent、原标准、观察与内容有效期。验证过程不持 SQLite 写事务。只承接已记录的同 attempt 正常执行/settled/关闭变化；没有证明的 Task/WorkingState 或来源变化拒绝。执行 lease 过期不能被刷新为旧输出的新许可；验证记录有自己的有界有效期，读取历史与发布当前结果分开。
5. T06 一次提交新 Task/WorkingState、Outcome、精确 criterion 观测、Episode、MemoryUse、结果事件及幂等回执。Episode 使用现有 v2 合同，精确绑定 Task/attempt 与 Outcome revision，保存真实行动/产物引用、上下文差异、失败/未知和待办；不生成模型反思。其独立连续版本不假定与历史 Outcome revision 相等。旧 schema 的中断 Outcome 保留历史，不虚构缺失的 Episode。
6. 固定前向 `0007` 保存不可变验证计划、实际接收观测及结果 bundle 的正文引用与必要索引。正文、期望、检查解释、Episode 和使用详情均进入现有受管内容及依赖系统，不能永久内嵌在不可清除元数据。新读写/打开路径完整核对 Schema、行/正文投影、版本关联和幂等；保留0001—0006及旧2/3/4/5/6严格校验，未知8拒绝。恢复元数据机械报告物理7，不运行 capture/restore 实验。
7. Exposure 独立于编译和采用。接收前登记只能为 uncertain；受控接收端实际消费完整请求后，同步登记精确接收观测才能为 sent。请求、胶囊成员、位置/原因及精确记忆版本必须相符；编译但未发送没有 exposure。接收与写入间失败保留 uncertain，不伪造成功。
8. Adoption 必须绑定实际请求及具体已观测步骤/动作。模型自报最多 claimed；固定 profile 能从精确参数/检查轨迹支持时才为 verified，否则 unknown。一个请求中的多个记忆分别记录，不因一项采用给其他项记功；失败、取消、未知和后续判定版本保留。首个合成 profile 没有收益对照，所以 benefit 为 unknown，不能把完成任务当成因果收益。
9. 既有 task.confirm-result 的正式消费者只接受实际配对主体对精确主观 criterion 的确认，产生 user-direct 原始观察。后续否定使用独立版本化反馈 DTO，绑定当前 Task 和精确 Outcome/criterion revision，追加失败或未知判定；不把点击等同全部目标成功，也不改变原 criterion 或增加授权。
10. 来源纠正/遗忘/撤销沿现有依赖屏障失效产物、Outcome/Episode 和使用正文。最后请求之后没有更多工具调用也必须在 T06 复验；旧 final 不发布 completed，遗忘后不重新物化派生正文。结构性历史和获准最小身份可以保留，但不以摘要兜底可用正文。
11. P1-07 只保存后续学习所需的结果/使用事件与明确未调度状态。P2 的模型归纳、学习作业执行、Procedure 试用/晋升仍不启用；失败的未来消费者不能撤销已提交任务结果。正常 Daemon 继续诊断入口，新能力仅从自有临时合成安装接线。

## 备选方案

直接让 Worker 宣告成功缺少 criterion 证据；只看文件存在不能验证内容；把 input snapshot 当 sent 会混淆崩溃窗口；把所有被检索记忆当 verified adoption 会虚构学习收益。分别归档 Task、Outcome、Episode 则可能出现部分提交。均不采用。

沿用已有纯分类、Task 历史、受管正文和单数据库事务，仅增加一个实际结果消费者及必要版本表。没有第二套 Agent loop、通用验证器插件框架或任意用户脚本。

## 后果与验证

新增有限 Domain/Protocol 合同、核心纯转换、Store schema7 和 Daemon Verifier。验证器与读者由组合根固定，不从模型文本、HTTP 路径或任意调用者参数构造；合成检查不认证真实 Provider、官方 Pi+新扩展完整组合或真实文件接入。

最少正常场景贯穿预绑定标准→实际产物/检查→纯结果→真实临时存储→结果/Episode/使用回读。覆盖工具成功但目标失败、错误内容、验证器异常/缺证据/模型-only、部分/取消/未知、后续否定、历史不改写、重放/重启，以及最后请求后来源变更。Exposure 与采用分开，多条曝光仅一条被证明采用，收益仍 unknown。

完整固定工具链 `npm run check`、当前 HEAD 独立 R3、当前 primary 的原 Runtime 来源、Ready/live、受保护合入及 main 回读保持。Z16/Z17 产品验收仍 not_run，implementation 与 acceptance 分开；UI 继续由所有者安排 Gemini。既有限制的安全/备份实验、真实个人数据、模型账户/凭据、外发和部署不运行。

## 回滚

停用新 Verifier 和学习消费者，保留已提交 Outcome/Episode/使用证据与最新独立控制 journal；修复后追加新判定。代码通过新的受审 revert PR，最终 HEAD 提供隔离代码正逆树证据。数据保留物理7，仅前向修复；不降级、删除历史或复活已遗忘正文。
