# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: active
updated: 2026-08-11
-->

## 当前定位

知微处于 **M0：能观察** 的 Bootstrap 阶段。AI-primary Harness 已稳定运行，M0 已进入真实 Pi Runtime 契约验证；当前完成的是固定源码证据基线，动态发布包和真实事件序列仍待复验。

## 最近完成

- 新仓库初始化、产品蓝图、UI 方向和模块化骨架；
- 根目录与局部目录的渐进式 `AGENTS.md`；
- PR #1 建立 AI-primary Harness、R0–R3 风险模型、机器门禁和自动合并合同；
- PR #3 修复自动合并 metadata 解析并增加安全诊断；
- PR #4 完成自动 squash merge 的端到端验收；
- Issue #5 固定 `earendil-works/pi` 的 `v0.84.1` Tag Commit 与 `@earendil-works/pi-coding-agent@0.84.1` source contract，建立 SDK/RPC Fixture 和复验探针。

## 当前能力

- Bootstrap TypeScript 代码可通过 Node.js 22 运行；
- 架构、AGENTS、Harness、PR 合同和基础测试均由 CI 检查；
- AI 可以按 Issue → Draft PR → 风险门禁 → 独立审查 → Ready CI → squash merge 自主推进；
- Pi SDK/RPC 的权威仓库、Release Tag、精确包版本、Node 要求和固定源码来源已经机器化记录；
- `toolCallId` 已确认为 Tool Start/Update/End 的真实关联字段；
- `agent_end`、`agent_settled` 与 Shutdown 已明确为不同生命周期边界；
- RPC LF-only JSONL、请求响应 `id` 和 Bash Update 关联规则已有 source-derived Fixture；
- 当前环境低于 Pi 的 Node `>=22.19.0` 要求且无外部 DNS，发布包动态安装和启动仍为 runtime-unverified；
- SQLite Observation Ledger 尚未实现；
- 记忆、Context 注入、Attention 和桌面端均未进入实现阶段。

## 下一步候选

1. 在 Node `>=22.19.0` 且可访问 npm 的环境运行 SDK 与 RPC 无凭证探针；
2. 固定并录制 Extension 生命周期的真实事件 Fixture；
3. 验证正常、自动重试、Follow-up、取消和并行工具事件顺序；
4. 验证 Compaction 与 Session Replacement 的订阅/回放语义；
5. 根据动态证据修订 `NormalizedRuntimeEvent`；
6. 冻结 Observation Ledger Schema。

## 已知风险

- 当前 Bootstrap 仓库 Node 下限仍为 `>=22.0.0`，而候选 Pi 版本要求 `>=22.19.0`；在正式引入依赖前必须统一工具链决策；
- Source-derived Fixture 只能约束已公开类型和测试语义，不能替代真实 Runtime Capture；
- 自动合并只能证明机器门禁和声明满足，独立 AI 审查质量仍需持续评估；
- 独立审查暂时通过同一仓库身份下的 fresh-context 评论协议完成，尚未连接单独认证的 Reviewer；
- GitHub 仓库设置尚未强制阻止直接写 `main`，主要依赖 Harness 规则和 PR 历史；
- `project-state.md` 可能快速过期，只有状态实质变化时才更新。

## 阻塞

动态 Pi 探针需要 Node.js `>=22.19.0` 和 npm registry 访问。当前执行环境不满足，但不阻塞继续完成 Extension 源码契约分析、协议设计准备和其他无网络 M0 工作。
