# packages/AGENTS.md

适用范围：`packages/**`。所有包都是可组合库；`apps/*` 是组合根。

## 依赖方向

| 包 | 职责 | 允许依赖 |
|---|---|---|
| `domain` | 领域类型、值对象和基础不变量 | 无仓库内依赖 |
| `cognition-core` | 候选、Claim 和认知状态转换 | `domain` |
| `context-compiler` | 将已筛选认知编译为上下文胶囊 | `domain` |
| `memory-store` | 存储端口与持久化适配器 | `domain` |
| `protocol` | Runtime 中立的本地/事件协议 | `domain` |
| `pi-adapter` | Pi 事件与知微协议之间的防腐层 | `domain`、`protocol`、Pi SDK |
| `evals` | 用户场景和跨包验收 | 仅依赖被测包的公开入口 |

规则：

- 包不得依赖 `apps/*`。
- 不允许循环依赖。
- 除 `pi-adapter` 外，任何包不得导入 Pi SDK 类型。
- 生产包不得依赖 `evals`。
- Bootstrap 阶段跨包导入只指向对方 `src/index.ts`；不要穿透到内部文件。
- 包导出面应小而明确；内部便利函数不因测试需要自动升级为公共 API。

## 代码原则

- 领域和编译逻辑保持确定性；I/O 只存在于明确的 Adapter/Store 边界。
- 时间、ID、随机数、模型调用、文件系统、网络和进程能力由调用方注入。
- 数据结构优先只读和可序列化；避免隐藏全局状态与初始化副作用。
- 输入边界做解析和校验，内部函数使用已验证类型。
- 错误必须保留业务语义；不要把取消、失败、未支持和数据损坏都压成同一个字符串。
- 不通过新增抽象层掩盖尚未理解的 Runtime 或领域语义，先用 Spike 和测试证明。

## 测试

- 测试不变量和公开契约，不锁定无意义的内部调用顺序。
- 时间、ID 和外部事件使用显式 Fixture，避免依赖墙钟和随机值。
- 跨包行为放在 `evals` 或端到端场景中；包内测试保持快速、确定。
- 任何防止泄漏、越权、重复写入或错误晋升的回归测试都不得用较弱断言替代。

## 局部规则

进入以下目录时继续读取局部文件：

- `domain/AGENTS.md`
- `cognition-core/AGENTS.md`
- `context-compiler/AGENTS.md`
- `protocol/AGENTS.md`
- `pi-adapter/AGENTS.md`
- `memory-store/AGENTS.md`