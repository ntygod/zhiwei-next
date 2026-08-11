# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: active
updated: 2026-08-11
-->

## 当前定位

知微处于 **M0：能观察** 阶段。AI-primary Harness 已稳定运行；Pi Release Tag 源码基线与 npm registry Artifact 的最小 SDK/RPC 运行表面已经验证，下一步进入真实生命周期事件录制。

## 最近完成

- 新仓库初始化、产品蓝图、UI 方向和模块化骨架；
- 根目录与局部目录的渐进式 `AGENTS.md`；
- PR #1 建立 AI-primary Harness、R0–R3 风险模型、机器门禁和自动合并合同；
- PR #3 修复自动合并 metadata 解析并增加安全诊断；
- PR #4 完成自动 squash merge 的端到端验收；
- PR #6 固定 `earendil-works/pi` 的 `v0.84.1` Tag Commit、`@earendil-works/pi-coding-agent@0.84.1` source contract、SDK/RPC source-derived Fixture；
- Issue #7 / PR #8 建立隔离 npm Artifact 验证：Tarball digest、manifest、SDK 动态导入和无凭证 RPC 空 Session 均已通过；
- 动态验证的首轮宿主执行结果因隔离不足被拒绝；Docker noexec 失败被保留并在不放宽沙箱的前提下恢复。

## 当前能力

- Bootstrap TypeScript 代码可通过 Node.js 22 运行；
- 架构、AGENTS、Harness、Pi 基线、Runtime Fixture、PR 合同和基础测试均由 CI 检查；
- AI 可以按 Issue → Draft PR → 风险门禁 → 独立审查 → Ready CI → squash merge 自主推进；
- Pi 权威仓库、Release Tag、精确包版本、Node 要求和固定源码来源已机器化记录；
- npm registry integrity、shasum 与实际 Tarball 字节已经交叉核对；
- 发布 Artifact 的 package manifest 与固定源码公开表面一致；
- SDK root exports 可在 Node `22.23.1` 动态导入；
- RPC 可在无 Provider Credential、无 Prompt、`--no-session` 下完成 `get_state` 和 `get_messages`；
- 第三方 Artifact 在只读、非 root、零 capability、无宿主仓库挂载的 digest-pinned 容器中运行；
- `toolCallId` 已确认为 Tool Start/Update/End 的真实关联字段；
- `agent_end`、`agent_settled` 与 Shutdown 已明确为不同生命周期边界；
- RPC LF-only JSONL、请求响应 `id` 和 Bash Update 关联规则已有 source-derived Fixture；
- SQLite Observation Ledger 尚未实现；
- 记忆、Context 注入、Attention 和桌面端均未进入实现阶段。

## 下一步候选

1. 固定并录制 Extension 与 SDK 的真实生命周期 Fixture；
2. 验证正常 Prompt、自动重试、Follow-up、取消和并行工具事件顺序；
3. 验证 Compaction 与 Session Replacement 的订阅/回放语义；
4. 比较 SDK 与 RPC 对同一场景暴露的事件差异；
5. 根据 Runtime Fixture 修订 `NormalizedRuntimeEvent`；
6. 冻结 Observation Ledger Schema。

## 已知风险

- Bootstrap 仓库 Node 下限仍为 `>=22.0.0`，而固定 Pi 版本要求 `>=22.19.0`；正式引入依赖前必须统一工具链；
- 当前动态验证只覆盖公开 manifest、SDK root exports 和 RPC 空 Session，不等于完整供应链审计或真实 Agent 任务验证；
- Source-derived Fixture 不能替代 Prompt、Tool、Retry、Compaction 等真实 Runtime Capture；
- 第三方 Artifact 验证需要 npm 网络，但已与普通功能 PR 隔离；网络失败必须保持显式失败，不能静默沿用旧结论；
- 自动合并只能证明机器门禁和声明满足，独立 AI 审查质量仍需持续评估；
- 独立审查暂时通过同一仓库身份下的 fresh-context 评论协议完成，尚未连接单独认证的 Reviewer；
- GitHub 仓库设置尚未强制阻止直接写 `main`，主要依赖 Harness 规则和 PR 历史；
- `project-state.md` 只做轻量连续性快照，具体事实仍以 Issue、PR、Fixture 和 CI 为准。

## 阻塞

当前无必须由人类解决的阻塞。真实 Prompt 场景可能需要 Provider Credential，但下一步应优先使用上游测试 Harness、可注入的假模型或其他无凭证路径录制确定性生命周期 Fixture。
