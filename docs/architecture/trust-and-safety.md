# 信任、安全与边界

## 当前有限实现

[本地诊断 G-2a](local-diagnostics.md)保护现有 health/meta 与 doctor 的客户端认证、loopback/来源限制和安全错误输出，有限决策见 [ADR 0012](../adr/0012-protected-local-diagnostics.md)。Bearer 不认证服务端，不抵御可窃取凭据、抢占端口或改代码/文件的同机进程；不等同 OS/文件沙箱。以下 Policy、模型外发与长期数据规则仍是目标边界，不能从诊断实现推断已接入。D-04/D-08 和 G-2 整体未完成。

## G-2 剩余接入前合同候选

[Issue #90](https://github.com/ntygod/zhiwei-next/issues/90) 提出 [D-04 保留合同](../adr/0014-data-retention-boundary.md)与 [D-08 文件/来源/外发边界](../adr/0015-preintegration-safety-boundary.md)。两者仍为 Proposed。[可执行合成实验](../spikes/preintegration-safety/README.md)已串接真实临时文件、公开 Ledger、既有 D-01 重建器和实际 loopback 接收器；80 项作者测试覆盖路径/授权/Private/保留/错误边界。当前只验证接入前合同，未完成独立决策接受或最终交付，不宣称 G-2 完成；原卡逐项映射见[实证说明](../planning/g2-preintegration-evidence.md)。

正式 Ledger v1 仍内嵌完整 canonical event/body，append-only 并无正文 purge API；“逻辑遗忘”不能冒充其中的物理清除。新实验不得据此放行真实个人正文，不能把直接可信 library API 称为路径沙箱。真实接入、正式保留/删除/恢复、Host/Session 和 M0-4/M5 仍须各自实现验收。

## 核心原则

主动性、权限和执行是三件不同的事：

```text
Signal → Attention → 用户选择处理 → Delegation → Policy → Action
```

不能从“系统觉得值得关注”直接跳到外部操作。

## Policy Decision

```text
ALLOW  在明确 Grant 范围内执行
ASK    向用户说明具体范围后确认
DENY   明确禁止并解释原因
```

最终决策依据包括 Agent、Delegation、工具、动作、文件路径、网络域名、敏感级别、可撤销性、预算和授权有效期。

## Grant 不是“始终允许”

授权必须回答：

- 哪个 Agent；
- 在哪个 Workspace；
- 使用什么工具；
- 访问什么资源；
- 执行哪些动作；
- 持续多久；
- 最多多少次、多少成本。

不提供全局“完全自主”开关。

## 数据与模型边界

每条 Claim 未来必须标记是否允许发送给远程模型。Private Scope 永远不能离开本地。日志和测试禁止包含真实记忆、密钥或模型原始思维链。

## 主动等级

- L0 观察；
- L1 建议；
- L2 准备材料但不产生副作用；
- L3 用户确认后执行；
- L4 在具体 Grant 内自动执行。

等级提升来自长期结果和明确授权，不由系统自行扩大。
