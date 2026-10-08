# ADR 0013：Pi 官方 CLI JSONL Worker 路径

- 状态：Accepted
- 日期：2026-10-08
- 计划决策：D-07
- 范围：[Issue #86](https://github.com/ntygod/zhiwei-next/issues/86)，G-3 / D-07 的版本与单一路径选择
- 被取代关系：不取代任何 Accepted ADR；与 [ADR 0011](0011-formal-toolchain-baseline.md)配对，不修改 ADR 0005/0006 的历史合同

## 背景

正式执行方向必须区分三种不同的上游表面：Pi 根 SDK 的 AgentSession；`./client` 的 RemoteSession/CBOR；发布包 `bin.pi` 的 CLI stdio JSONL RPC。G-3a 的 `./client` strict 编译通过仅证明该公共类型面，不是 stdio RpcClient 的验证。固定 Pi 0.84.1 的根 SDK 声明仍有 46 个诊断，不能用手抄声明、关闭依赖检查或 JS 绕过掩盖。

PR #60 的 SDK/RPC 同任务、PR #64 的 Worker 生命周期已经在官方包上取证。现有 Artifact 消费者 `scripts/probes/pi-rpc-state.mjs` 用 CLI 发送 `get_state` / `get_messages`，没有 prompt；其可配置 executable/prefix、继承环境、宽松 framing 和错误原文反射尚需同一 #86 中的后续实现。现有生命周期实验使用合成 Provider / 受限工具，不能外推真实网络或用户数据授权。

## 有限决策提案

选择官方 CLI 的 stdio JSONL Worker 为 M0 正式 Adapter 后续实现的唯一 Pi 执行方向。版本采用 ADR 0011 的精确 Node 22.23.1、npm 10.9.8、TypeScript 5.9.3、@types/node 22.19.19、Pi 0.84.1 和已固定依赖闭包。

入口从该精确安装包的公开 `package.json` 的 `bin.pi` 取得，当前值为 `dist/cli.js`；必须校验 package name/version、bin 与包内真实入口，再由明确选择的 Node executable 启动 `--mode rpc`。不从 PATH 猜测 Pi，不改用另一公共但未经同等矩阵验证的 `./rpc-entry`，不导入根 SDK 的不支持声明。`./client` 的 RemoteSession/CBOR 保留为独立编译证据，不成为第二执行路径。

合同将落在 pi-adapter 内部、严格编译的有限 fixture，并由既有零 prompt Artifact probe 实际消费；不新增生产 Host/Session API 或公共 barrel，不实现通用 Agent Loop。工作目录、状态目录、固定零 prompt 参数和子进程环境须显式给出；输入从 unknown 校验，严格有界 UTF-8/LF JSONL、完整尾片和 request ID/command 关联、重复/缺失响应、提前退出、deadline/cleanup 及固定无秘密错误均须在后续实现中以真实合成子进程验证。

## 备选与权衡

| 维度 | 根 SDK 进程内 | 官方 CLI JSONL Worker（选择） |
|---|---|---|
| 隔离 | 与宿主共用进程、环境及异常域 | 可显式提供 cwd/env/stdio 并区分进程退出；操作系统隔离仍须外层容器 |
| 观察 | Public SDK 与 Extension 事件可以各自观察 | Command/Response、Runtime Event、Snapshot、Host Action、Process Boundary 必须分别保留；不能把同名事件或两种序列拼为全序 |
| 恢复 | Session dispose/rebind 由同一宿主编排 | 已有 Worker EOF/signal/exit/restart/session 恢复实证；正式监督、重连及 SessionContract 仍属 M0-3/4/5 |
| 部署与 Package | 依赖根声明图，目前 strict NodeNext 不通过 | 需要精确官方发布包及 Node；公开 bin 已有运行矩阵，启动器不得任意执行前缀 |
| 协议责任 | 不需要 JSONL framing，但 SDK 对象仍须防腐校验 | 必须拒绝坏 UTF-8、CRLF、空行、越界、EOF 尾片与错关联；独立进程不消除协议责任 |

继续同时保留两条生产方向会扩大未完成合同；本提案拒绝。改用 `./client` 或 `./rpc-entry` 不能仅凭名字或类型检查推断与当前 stdio JSONL 行为等价；本提案不选择。升级 Pi 或修补第三方声明超出本项。

## 证据身份与保证边界

[当前执行决议](../planning/current-decisions.md)绑定实际文件哈希、命令、结果和观测时间；[本次历史复跑说明](../planning/d07-cli-evidence.md)解释实验来源及计数。工具链实验源于 PR #83，SDK/RPC 源于 PR #60，Worker 生命周期源于 PR #64。本次在包含这些既有实验的 `main@41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415` 独立 checkout 上重新运行，是新的历史快照复跑，绝不冒称 PR #83 原始运行。

同任务 parity 只覆盖一个确定的无工具任务，不证明工具、queue、cancel/retry、compaction 的全面跨路径等价。Worker 干净 EOF、idle signal 和 session reopen 不证明 in-flight crash、SIGKILL/OOM、机器故障、Windows 信号、exactly-once 或无损持久交付；恢复的 session identity 与新 Worker instance 分开。

正式接受只固定这些版本及官方 CLI JSONL 方向。它不批准尚未实现的启动合同，不认证后续候选源码，不完成 G-3 三条验收或 M0-4 接线。被审 Evidence Ready 候选中的每个列名历史文件必须与真实历史 Git blob 及登记哈希一致；决策独立接受前不得先改这些文件，再把新实现冒作旧实验。接受之后的实现仍需当前完整 HEAD 的独立 R3 与真实 CI。

环境 allowlist、`--offline`、`--no-tools` 和 `--approve` 均不是 OS sandbox 或对任意工具的 blanket approval。固定容器、制品/来源校验和受限工具 profile 保持必要；恶意同 UID、内存/环境读取、文件写入者或 Node/包被替换不在该有限合同保证内。无真实凭据配置或模型请求。D-04/D-08 与 G-2 的文件/工具/Private 外发/保留仍未完成；诊断 token 不授予数据或工具权限。

## 后果、接受与回滚

两份 ADR 及 D-07 在真实独立决策审查前分别保持 Proposed / Evidence Ready。接受记录必须绑定本 primary PR 中真实被审 HEAD 与 proposalSha256，且 sourcePr 不能等于该 primary；历史实验批准不是这次决策批准。后续合同与来源续期仍在同一实质 PR 内完成，不拆成状态/finalizer PR。

版本或入口变化必须显式重新评估并重跑既有兼容矩阵，Workflow 变化按 R3。新合同可 revert，既有历史证据与冻结工作包不变；若将来改变已接受选择，须新增或 supersede ADR，不语义重写 Accepted 正文。没有数据库迁移、用户数据或持久凭据变更。
