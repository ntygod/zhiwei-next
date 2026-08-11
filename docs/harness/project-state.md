# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: active
updated: 2026-08-11
-->

## 当前定位

知微处于 **M0：能观察** 的 Bootstrap 阶段。当前仓库已经完成产品蓝图、UI 方向、模块化骨架和渐进式 `AGENTS.md` 设计。

## 最近完成

- 新仓库初始化和 CI 基线；
- 产品愿景、领域模型、系统架构和 M0 计划；
- 十屏低保真交互原型；
- 根目录与局部目录的渐进式 `AGENTS.md`；
- AI-primary 自主开发 Harness、风险模型和自动合并合同。

## 当前能力

- Bootstrap TypeScript 代码可通过 Node.js 22 运行；
- 架构边界和 7 个基础测试已建立；
- Pi 仍使用占位事件合同，尚未固定真实 SDK/Commit；
- SQLite Observation Ledger 尚未实现；
- 记忆、Context 注入、Attention 和桌面端均未进入实现阶段。

## 下一步候选

1. 完成并合并自主 Harness；
2. 创建 M0 的 Pi Runtime Spike Issue；
3. 固定真实 Pi 版本并录制生命周期事件 Fixture；
4. 根据真实事件修订 `NormalizedRuntimeEvent`；
5. 冻结 Observation Ledger Schema。

## 已知风险

- 当前 Bootstrap 类型和运行方式不是最终工具链；
- 自动合并只能证明机器门禁和声明满足，独立 AI 审查质量仍需后续评估；
- GitHub 仓库设置尚未强制阻止直接写 `main`，主要依赖 Harness 规则；
- `project-state.md` 可能快速过期，只有状态实质变化时才更新。

## 阻塞

当前无必须由人类解决的阻塞。真实 Pi Spike 可能需要模型 Provider 凭证；缺少时应先完成不依赖凭证的 SDK、事件和本地协议验证。
