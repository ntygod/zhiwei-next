# docs/harness/AGENTS.md

适用范围：`docs/harness/**` 和与 Harness 直接关联的治理文件。

## 定位

- Harness 是治理代码，不是建议性文档。
- 本目录只描述 AI 如何持续开发、验证、审查、合并和交接；产品与架构事实仍放在各自目录。
- `harness.config.json` 是机器可读配置，本文档体系解释其语义。
- 当前仓库运行在 `best-effort-private-free` 模式：有检测、停机和恢复提案，但没有 GitHub 服务端 pre-receive 硬保护。

## 修改规则

- 任何 Harness 语义变化至少按 `R2` 处理。
- 修改自动合并、安全门禁、独立审查、默认分支写入、Issue/PR 生命周期、自动分支删除或发布权限按 `R3` 处理。
- 当前治理任务仍受任务开始时的旧规则约束，不能依赖本次新规则获得通过。
- 修改文档时同步机器检查；修改机器检查时同步文档和回滚说明。
- 不复制根 `AGENTS.md` 的完整规则，只补充 Harness 局部语义。
- 不得把最佳努力模式描述成“硬保护”“无法直写”或“服务端已阻止”。

## Work Item 与人类输入

- GitHub 工作开始前先读取 `work-item-lifecycle.md`，执行 Repository Reconciliation，再选择任务。
- 所有者直接创建的想法 Issue 是 `owner-input`：不改写正文、不因未排期而关闭、不接收无关 CI 或 Runtime 诊断。
- Issue 与 PR 共用编号；评论、关闭或写入 metadata 前必须验证对象类型、标题、关联 work item，PR 还要验证当前 HEAD。
- 一个 execution Issue 最多一个 active branch 和一个开放 primary PR；分支名必须包含 Issue 编号。
- Review、Finalize、Integrate 在同一 primary branch / PR 完成；禁止 `retire branch`、no-op、capability-test、integrator、finalizer 或 reviewer PR。
- 普通开发禁止 `ai/`、`automation/` 和无租约 helper branch；无法证明安全的孤立分支 fail closed。
- 不得在真实仓库创建 no-op Issue、PR 或 Branch 测试 Connector 能力。

## GitHub Connector 写入前置条件

对仓库文件、Tree、Commit 或 Ref 执行任何写入前，必须按顺序完成：

1. 读取默认分支当前 HEAD；
2. 创建或确认一个 **非默认分支**，并关联 canonical Issue；
3. 在工作记录中保存目标分支名；
4. 每个 `create_file`、`update_file`、`delete_file`、Git Tree/Commit/Ref 写调用都显式传入该非默认分支或对应 Ref；
5. 写入后确认移动的是工作分支，不是 `main`；
6. 第一个实质性提交后创建 Draft primary PR；
7. 通过该 PR 进入默认分支。

禁止把 `branch: main`、默认分支名或空 branch 参数传给仓库内容写工具。唯一例外是已经发生直接写入后，为消除正在暴露的敏感或持续有害内容所做的最小紧急恢复；恢复后必须立即创建 R3 Incident，并暂停普通开发。

残余风险和补偿控制见 `main-protection.md` 与 `risk-acceptance/2026-08-11-private-free.json`。

## Main Incident 安全停机

- 带 `zhiwei-main-incident` 开放标记的 Issue 存在时，暂停所有产品功能和普通维护工作。
- 可信 `harness.config.json` 中的 `developmentPause.active` 也可以独立维持停机，即使 Incident Issue 被误关。
- 只有 `main-incident-recovery: yes` 的 R3 治理/恢复 PR 可以进入自动合并评估。
- 恢复 PR 必须引用所有要求的 Incident，提供回滚，并完成当前 HEAD 绑定的独立 AI 审查。
- Main Provenance 可以创建 Draft 恢复 PR，但不得直接回写、重置或 force-push `main`。
- 只有真实 push 事件可提供恢复 tree；`repository_dispatch` payload 不得用来构造恢复提交。
- 当前 Incident #9 只有在 live provenance proof 完成、暂停解除且风险接受记录保持有效后才可关闭。

## 验证

至少运行：

```bash
npm run check:agents
npm run check:work-items
npm run check:main-provenance
npm run check:main-provenance-dispatch
npm run check:harness
npm run check
```

涉及 PR 合同或自动合并时，还要用代表性 PR metadata、GitHub Event Payload 和文件列表执行 `scripts/check-pr-contract.mjs` 的正反样例。

## 独立审查

R2/R3 Harness 变更必须由新的 AI 上下文审查当前 HEAD。审查者应只读取 PR、相关事实源和验证结果，不继承作者的未公开推理；批准记录必须包含当前 HEAD SHA。
