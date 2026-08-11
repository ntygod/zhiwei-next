# docs/harness/AGENTS.md

适用范围：`docs/harness/**` 和与 Harness 直接关联的治理文件。

## 定位

- Harness 是治理代码，不是建议性文档。
- 本目录只描述 AI 如何持续开发、验证、审查、合并和交接；产品与架构事实仍放在各自目录。
- `harness.config.json` 是机器可读配置，本文档体系解释其语义。

## 修改规则

- 任何 Harness 语义变化至少按 `R2` 处理。
- 修改自动合并、安全门禁、独立审查、默认分支写入或发布权限按 `R3` 处理。
- 当前治理任务仍受任务开始时的旧规则约束，不能依赖本次新规则获得通过。
- 修改文档时同步机器检查；修改机器检查时同步文档和回滚说明。
- 不复制根 `AGENTS.md` 的完整规则，只补充 Harness 局部语义。

## GitHub Connector 写入前置条件

对仓库文件、Tree、Commit 或 Ref 执行任何写入前，必须按顺序完成：

1. 读取默认分支当前 HEAD；
2. 创建或确认一个 **非默认分支**；
3. 在工作记录中保存目标分支名；
4. 每个 `create_file`、`update_file`、`delete_file`、Git Tree/Commit/Ref 写调用都显式传入该非默认分支或对应 Ref；
5. 写入后确认移动的是工作分支，不是 `main`；
6. 通过 PR 进入默认分支。

禁止把 `branch: main`、默认分支名或空 branch 参数传给仓库内容写工具。唯一例外是已经发生直接写入后，为消除正在暴露的有害内容所做的紧急恢复；恢复后必须立即创建 R3 Incident，并暂停普通开发。

行为约束不是充分屏障。服务端保护要求与配置步骤见 `main-protection.md`。

## Main Incident 安全停机

- 带 `zhiwei-main-incident` 开放标记的 Issue 存在时，暂停所有产品功能和普通维护工作。
- 只有 `main-incident-recovery: yes` 的 R3 治理/恢复 PR 可以进入自动合并评估。
- 恢复 PR 必须引用所有开放 Main Incident，提供回滚，并完成当前 HEAD 绑定的独立 AI 审查。
- Main Provenance workflow 可以创建 Draft 恢复 PR，但不得直接回写或重置 `main`。
- 服务端 Ruleset 未确认前，Incident 不得关闭。

## 验证

至少运行：

```bash
npm run check:agents
npm run check:harness
npm run check:main-provenance
npm run check
```

涉及 PR 合同或自动合并时，还要用代表性 PR metadata 和文件列表执行 `scripts/check-pr-contract.mjs` 的正反样例。

## 独立审查

R2/R3 Harness 变更必须由新的 AI 上下文审查当前 HEAD。审查者应只读取 PR、相关事实源和验证结果，不继承作者的未公开推理；批准记录必须包含当前 HEAD SHA。
