# ADR 0001：Pi 作为默认 Agent Runtime

- 状态：Accepted
- 日期：2026-08-11

## 背景

旧知微同时维护模型适配、Agent Loop、工具、会话、压缩、记忆和主动智能，范围超过单人项目可持续验证的边界。

## 决策

使用 Pi 作为默认 Agent Runtime。优先通过 SDK、Extension 和 RPC 集成，不维护深度 Fork。

只有 `packages/pi-adapter` 可以依赖 Pi 类型。认知内核使用自有协议和领域模型。

## 后果

正面：减少执行层维护；保持多模型能力；可以聚焦记忆、治理、主动性和权限。

代价：需要跟踪 Pi 的事件契约；安全和长期数据仍由知微自行实现；必须维护严格 Adapter Contract Tests。
