# design-v2 设计接受与验证记录

工作项 [#94](https://github.com/ntygod/zhiwei-next/issues/94)，primary [PR #95](https://github.com/ntygod/zhiwei-next/pull/95)。本页记录设计选择的接受，不表示未来产品能力已实现或阶段已完成。

## 独立接受

新的独立 AI 上下文 `review_design94` 审查初稿 `4efd0ab7a447f2e05588679df61e918153ff8050`，并复审修正后的完整 HEAD `a590da1510577f3c7dd8efef720db13f6108debb`。

[真实审查记录](https://github.com/ntygod/zhiwei-next/pull/95#issuecomment-6078063023)分别接受 ADR0016 与 ADR0017 的设计选择，确认以下问题已关闭：

- 旧备份恢复不得复活已撤销授权：新的 recoveryEpoch、旧 Grant/会话/自动任务失效、重新授权先于派发。
- 在途请求的迟到结果必须重新校验：接收、物化、Artifact/Outcome/Episode/UI 发布均有版本屏障，遗忘正文不回写或参与学习。
- P4 只验 Z01—Z31，Z32 留给 P5；贯穿场景使用首批已规划 Connector，而非隐含邮件等新能力。

因此登记两份 ADR 为 Accepted；ADR0016 的状态流程句同步明确为“独立设计审查前保持 Proposed”，不改变产品决策。原 Accepted ADR 正文与旧 D-04/D-08 状态不变。

## 实际检查与范围

固定 Node 22.23.1 / npm 10.9.8 的隔离环境中，全仓 `npm run check` 通过：69 个严格类型入口、324 个行为测试、6 个工具链测试与全部原门禁。新规划校验覆盖 36 任务、32 场景、60 旧映射、无环依赖、阶段前置与 10 个负例。旧执行计划/当前决议结构检查保持通过；相对链接与 diff 已核对。

独立审查实际运行规划/历史检查并核对全量日志。Runtime 当前 PR 来源使用真实 SDK 成功采集与 Worker 两 attempts 原 ZIP，细节见[来源记录](../spikes/pi-runtime-contract/README.md#2026-10-09-pr-95-当前来源续期)。临时 guard 已恢复原比较器 blob，frozen content、normalizer、Workflow 与旧接受条件无净变化。

未运行：尚未实现的 P1—P5 产品场景、真实用户数据/模型/外部写、安装/升级/长期使用评估。本次没有生产迁移或权限启用，设计检查不能替代这些验收。

## 最终交付边界

此设计接受只绑定上述被审 HEAD。记录 Accepted 后的新完整 HEAD 必须再完成独立 R3、真实 Ready/live 来源和受保护合入；最终结果存于同一 PR，不在被批准提交内回填它自己的 HEAD 形成循环。后续任务从 P0-01 开始，按当前交接与任务卡执行。
