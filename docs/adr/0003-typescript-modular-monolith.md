# ADR 0003：TypeScript 模块化单体

- 状态：Accepted
- 日期：2026-08-11

## 决策

新知微采用 TypeScript Monorepo 和模块化单体。Daemon 是主要进程，Pi Worker 可以独立进程运行；不拆业务微服务。

## 原因

Pi SDK 和 Extension 使用 TypeScript。统一语言可以减少旧版 Java 服务与 Node Runtime 之间的进程、协议和版本复杂度。

## 约束

领域包不依赖 Pi；应用层只做组合；SQLite 事务保持在明确边界；未来如拆进程，先稳定协议而不是移动类文件。
