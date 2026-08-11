# 长期验收标准

## 认知正确性

- 没有证据的候选不能成为 Claim；
- 用户明确纠正后旧 Claim 不再进入上下文；
- 冲突不能被静默隐藏或任意选边；
- FORGOTTEN 数据不会从任何检索投影返回。

## 隔离

- Workspace A 的 Claim 不会进入 Workspace B；
- Session Scope 不会自动升级为 Workspace 或 Global；
- Private 数据不会发送给远程模型；
- 跨 Agent Adapter 使用相同 Scope 语义。

## 主动性

- 每条 Attention 都有证据和“为什么现在”；
- Attention 默认不产生副作用；
- 冷却、去重和失效语义可测试；
- 用户可关闭单次、时间段或类别提醒。

## 执行安全

- 所有副作用操作经过 Policy Decision；
- Grant 具有 Agent、Workspace、工具、资源、动作、时间和预算边界；
- 用户可暂停、恢复和取消后台任务；
- 未授权和越权行动目标为零。

## 可解释性

- 本轮使用的 Claim 可查看来源；
- 权限决定可解释；
- 任务结果区分完成、部分完成、失败和取消；
- 不把模型原始思维链当作解释。

## 工程质量

- Domain 不依赖 Runtime；
- Pi 升级只需要修改 Adapter；
- 真源、投影和缓存职责明确；
- 后台链路失败不能静默；
- 行为场景优先于 Mock 数量和覆盖率数字。
