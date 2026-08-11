# 项目状态

<!-- zhiwei-project-state
milestone: M0
status: paused-main-protection
updated: 2026-08-11
-->

## 当前定位

知微仍处于 **M0：能观察**，但普通产品开发已暂停。PR #8 合并后，ChatGPT Connector 两次绕过 PR 直接写入 `main`；两次均已立即恢复，当前 Git tree 与 PR #8 的已验证 tree 完全一致。Issue #9 是当前最高优先级 Incident。

## 最近完成

- 新仓库初始化、产品蓝图、UI 方向和模块化骨架；
- 渐进式 `AGENTS.md` 与 AI-primary Harness；
- 自动 squash merge 的端到端验收；
- Pi `v0.84.1` Release Tag 源码基线；
- npm Artifact 的 Tarball digest、manifest、SDK 动态导入和无凭证 RPC 空 Session 验证；
- PR #8 自动合并到 `4c128925ad3424bc966670c5102986351ed43287`；
- Issue #9 记录两次未经 PR 的 direct-main 写入和两次紧急恢复；
- 当前恢复 commit `9b016813c19d841f8c4a3af25f513fb59f8c72fe` 的 tree 与 PR #8 合并 tree 都是 `291a20e82f2636a8bd28c5d913f7908995b7dbb5`。

## 当前治理恢复

`fix/r3-main-provenance-guard` 正在建立：

- main push provenance workflow；
- 未经 PR 更新的 R3 Incident 自动登记；
- live unauthorized tree 的 Draft 恢复 PR；
- 开放 Main Incident 对普通自动合并的安全停机；
- 事故 Commit/Tree 的机器 Fixture；
- GitHub Connector 写入前的非默认分支前置协议；
- 服务端 Ruleset / Branch Protection 一次性配置说明。

## 当前能力

产品与 Pi 技术能力保持不变：

- Pi source-and-runtime baseline 已验证；
- SDK root exports 和 RPC 空 Session 可运行；
- Runtime Fixture、Harness、架构边界和基础测试由 CI 检查；
- SQLite Observation Ledger、记忆、Context、Attention 和桌面端尚未进入实现阶段。

治理状态：

- 当前 main tree 已恢复，没有敏感数据、产品代码、数据库或发布影响；
- 事故历史保留，未 force-push 或改写；
- 仓库内检测、停机和恢复提案层正在修复；
- GitHub 服务端仍未强制禁止拥有写权限的 App 直接更新 `main`；
- 当前 GitHub App 没有 administration / ruleset mutation 权限，无法自主完成最后一道 pre-receive 屏障。

## 唯一下一步

仓库所有者按 [`main-protection.md`](main-protection.md) 完成一次性 GitHub Ruleset 或 Branch Protection：

```text
require pull request before merging
require CI check
require linear history
block force pushes
block deletion
no direct-push bypass for ChatGPT Codex Connector
```

配置确认后，AI 将通过一个 R3 恢复 PR：

1. 将 server protection 状态改为 confirmed；
2. 解除 development pause；
3. 关闭 Issue #9；
4. 恢复 M0 生命周期 Fixture 开发。

## 已知风险

- 仓库内 workflow 是 post-push 检测，不是 pre-receive 屏障；直接写入者理论上也能在同一提交里修改 workflow；
- 服务端保护确认前，普通 PR 的自动合并会被开放 Main Incident 阻止；
- 独立 AI 审查仍使用同一仓库身份下的 fresh-context 评论协议，尚未连接独立 Reviewer Bot；
- 事故修复本身属于 R3，必须经过当前 HEAD 绑定的独立审查和完整 CI。

## 阻塞

**存在必须由仓库所有者完成的阻塞：GitHub 服务端 main 保护。**

除此之外没有产品或技术凭证阻塞，但在该配置完成前不得继续普通开发。
