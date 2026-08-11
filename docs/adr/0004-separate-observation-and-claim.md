# ADR 0004：Observation 与 MemoryClaim 分离

- 状态：Accepted
- 日期：2026-08-11

## 问题

聊天文本、工具结果、模型推断和用户确认具有完全不同的真实性。把它们直接写进同一个“记忆库”会产生错误事实、冲突和无法遗忘的问题。

## 决策

- Observation 是不可变证据；
- 自动理解先形成 MemoryCandidate；
- 只有通过来源和质量规则后才形成 MemoryClaim；
- Claim 保存作用域、版本、生命周期和证据引用；
- 用户纠正创建新 Claim 并 supersede 旧 Claim。

## 后果

数据模型比简单向量库更复杂，但认知可以被纠正、解释、隔离和治理。LLM 不拥有长期真相的直接写权限。
