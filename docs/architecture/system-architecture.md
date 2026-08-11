# 系统架构

## 总体结构

```text
Desktop / Web / CLI / Pi Package
               │
               ▼
        ZhiWei Local Daemon
        ├─ Workspace Service
        ├─ Cognition Core
        ├─ Context Compiler
        ├─ Attention Engine       (M4)
        ├─ Delegation Manager     (M5)
        ├─ Policy Engine          (M5)
        ├─ Audit & Explanation
        └─ Connector Runtime      (M6+)
               │
       ┌───────┴────────┐
       ▼                ▼
  SQLite Truth       Pi Workers
  Source             via Pi Adapter
```

## 进程职责

### zhiwei-daemon

唯一认知真源。持有 Workspace、Observation Ledger、MemoryClaim、Goal、Procedure、Attention、Delegation、Grant 和 Audit 数据。

### Pi Worker

负责模型调用、Agent Loop、工具调用、会话和上下文压缩。Worker 崩溃不得破坏认知数据。

### 客户端

桌面端、Web 和 CLI 只通过本地协议访问 Daemon，不直接访问数据库或持有长期真相。

## 模块依赖规则

```text
domain
  ↑
cognition-core  memory-store  context-compiler  protocol
  ↑                 ↑               ↑               ↑
  └──────────────── application composition ────────┘
                                      ↑
                                  pi-adapter
```

- `domain` 是最内层；
- Pi 依赖只能存在于 `pi-adapter`；
- Runtime 事件进入知微前必须规范化；
- 领域事件离开知微前必须通过协议 DTO；
- 索引、缓存和模型生成物均为派生数据。

## 数据策略

最终使用 SQLite + WAL 作为结构化真源，FTS5 是第一检索投影。向量和图关系只有在场景评估证明必要后才增加，并且必须可从真源重建。

## 设计原则

- 模块化单体优先，拒绝早期微服务；
- 显式事务和 Durable Outbox；
- 时间、随机数和模型调用从边界注入；
- 后台任务可暂停、恢复、取消和审计；
- 升级 Pi 只影响 Adapter Contract Tests。
