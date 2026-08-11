# 领域模型

## 核心对象

| 对象 | 含义 |
|---|---|
| Workspace | 长期项目或生活领域，首要隔离边界 |
| Session | 一次交互或后台执行 |
| Observation | 不可变的原始证据 |
| MemoryCandidate | 可能值得长期保存、尚未成为事实的候选 |
| MemoryClaim | 带证据、作用域、版本和生命周期的长期认知 |
| Goal | 有状态、期限和完成条件的目标 |
| Procedure | 经多次真实执行验证的可复用做法 |
| AttentionItem | 值得用户关注的候选事项 |
| Delegation | 用户授权 Agent 执行的任务契约 |
| PolicyGrant | 对工具、资源、时间和预算的具体授权 |
| Outcome | 行动的真实结果 |
| Artifact | 文件、报告、代码变更等产物 |

## 证据链

```text
Observation
   ↓ 支持
MemoryCandidate
   ↓ 接受 / 验证
MemoryClaim
   ↓ 影响
Context / Attention / Delegation
   ↓ 产生
Outcome
   ↓ 更新
Goal / Procedure / Claim Confidence
```

## MemoryClaim 生命周期

```text
ACTIVE
├─ 新版本替代 → SUPERSEDED
├─ 可靠冲突   → DISPUTED
├─ 到达有效期 → EXPIRED
└─ 用户遗忘   → FORGOTTEN
```

`FORGOTTEN` 必须立即从所有可检索投影中移除。物理清除范围由用户的数据策略决定。

## 作用域

- Global：稳定身份和通用偏好；
- Workspace：项目决定、约束、目标和经验；
- Task：未来长期委托中的局部上下文；
- Session：短期连续性；
- Private：仅本地规则使用，不发送给模型。

任何读取必须先过滤作用域，再做相关性排序。

## 关键不变量

1. Claim 必须有至少一条 Observation 证据。
2. Agent 推断默认只能生成 Candidate。
3. 用户明确纠正创建新 Claim，并将旧 Claim 置为 SUPERSEDED。
4. SUPERSEDED、EXPIRED、FORGOTTEN 不得进入 Context Capsule。
5. 同一轮 Context Capsule 创建后保持不可变。
6. 失败任务不能产生成功 Procedure。
7. AttentionItem 本身不能产生外部副作用。
