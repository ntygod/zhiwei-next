# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: active
updated: 2026-08-11
-->

## 当前定位

知微处于 **M0：能观察** 的 Bootstrap 阶段。产品蓝图、UI 方向、模块化骨架和 AI-primary 自主开发 Harness 已建立，后续工作进入真实 Pi Runtime 契约验证。

## 最近完成

- 新仓库初始化和 CI 基线；
- 产品愿景、领域模型、系统架构和 M0 计划；
- 十屏低保真交互原型；
- 根目录与局部目录的渐进式 `AGENTS.md`；
- PR #1 合并 AI-primary 自主开发 Harness、R0–R3 风险模型、机器门禁和自动合并合同。

## 当前能力

- Bootstrap TypeScript 代码可通过 Node.js 22 运行；
- 架构边界和 7 个基础测试已建立；
- AI 可以按 Issue → Draft PR → 风险门禁 → 独立审查 → Ready CI → squash merge 的流程自主推进；
- CI 会检查架构、AGENTS、Harness、PR 合同和测试；
- 自动合并工作流已经部署到默认分支，后续符合合同的 PR 可由它处理；
- Pi 仍使用占位事件合同，尚未固定真实 SDK/Commit；
- SQLite Observation Ledger 尚未实现；
- 记忆、Context 注入、Attention 和桌面端均未进入实现阶段。

## 下一步候选

1. 创建 M0 的 Pi Runtime Spike Issue；
2. 固定真实 Pi 版本并录制生命周期事件 Fixture；
3. 比较 SDK、Extension 和 RPC 三种嵌入方式；
4. 根据真实事件修订 `NormalizedRuntimeEvent`；
5. 冻结 Observation Ledger Schema。

## 已知风险

- 当前 Bootstrap 类型和运行方式不是最终工具链；
- 自动合并只能证明机器门禁和声明满足，独立 AI 审查质量仍需持续评估；
- 独立审查暂时通过同一仓库身份下的 fresh-context 评论协议完成，尚未连接单独认证的 Reviewer；
- GitHub 仓库设置尚未强制阻止直接写 `main`，主要依赖 Harness 规则和 PR 历史；
- 自动合并工作流刚部署，应通过后续真实 PR 持续观察边界行为；
- `project-state.md` 可能快速过期，只有状态实质变化时才更新。

## 阻塞

当前无必须由人类解决的阻塞。真实 Pi Spike 可能需要模型 Provider 凭证；缺少时应先完成不依赖凭证的 SDK、事件和本地协议验证。
