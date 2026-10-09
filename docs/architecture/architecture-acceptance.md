# architecture-1 设计接受记录

工作项 [#96](https://github.com/ntygod/zhiwei-next/issues/96)，primary [PR #97](https://github.com/ntygod/zhiwei-next/pull/97)，基线 main `14398486e4009e70180fb5291d8b4ede62e8b664`。

## 设计接受

新的独立 AI 上下文 `review_architecture96` 冷读六份详设、ADR0018 与基线，先审 `2679e561bdbf98e94c143219cbef59e3b591bf86`，再复审 `2d371a416e73c735a4dfa4feafa09776a6570e51`。[实际接受记录](https://github.com/ntygod/zhiwei-next/pull/97#issuecomment-6080136287)明确接受 ADR0018 全部11项设计选择。

唯一阻塞项是无用户 Task 的 cognitive_job 无法合法进入原 attemptId 动作/预算链。修正后 ActionAttempt 绑定 executionUnitId，来源 Task/attempt 可空，认知作业仅 model.invoke；T03 不预留额度，T07/T08/T09 统一预留/派发/结算，任务/场景/B12 及结构负例同步。requestId 关联列中的旧 attempt 简称随后机械统一为 executionUnit/owner，不改变决策内容。

接受的是模块/数据/并发/接口/算法/部署方向，不是未来真实平台、存储、模型、加密或产品能力证明。ADR0018 状态登记之外，旧 Accepted ADR/冻结工作包/Runtime v1 与已应用迁移不改。

## 验证范围

作者在固定 Node22.23.1/npm10.9.8 隔离环境运行完整 npm run check：324行为、69类型入口、6工具链及全部既有检查通过。独立审查在固定源码归档上实跑两项设计检查与 diff；新架构14个负例、隔离内存SQLite的三表结构例通过。后者只证明该例的FK/唯一性/类型/rollback，不能代替正式Schema/WAL/真实恢复验收。

文档引用和章节锚点已核对；原计划/新计划的身份和阶段不变。当前 PR 的真实 Runtime 来源另见[续期记录](../spikes/pi-runtime-contract/README.md#2026-10-09-pr-97-当前来源续期)，比较器已恢复，来源校验条件不变。

## 最终交付边界

上述接受只绑定被审 HEAD。登记状态与记录后的最终完整 HEAD 仍需独立 R3、原真实 Ready/live CI 和受保护合入；最终批准记录在同一 PR，不能由这份文件预先宣称。代码实施从原 P0 就绪任务进入，未执行的产品场景保持未实现。
