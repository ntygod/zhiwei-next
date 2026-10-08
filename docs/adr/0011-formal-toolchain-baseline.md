# ADR 0011：G-3a 正式 TypeScript 工具链基线

- 状态：Proposed
- 日期：2026-10-08
- 计划决策：D-07
- 范围：[Issue #82](https://github.com/ntygod/zhiwei-next/issues/82)，G-3 / D-07 的有限工具链切片
- 被取代关系：不取代任何 Accepted ADR；与 ADR 0013 共同承载 D-07 的有限版本与执行路径选择

## 背景

原仓库只通过 Node strip-types 执行 TypeScript，不能发现静态类型错误，也没有根依赖锁。G-1 已由 PR #81 合入；工具链闭包与正式 Worker/Session/Daemon 接入须分别取证。

## 提案

固定 Node 22.23.1、npm 10.9.8、TypeScript 5.9.3、@types/node 22.19.19 和 Pi 0.84.1。Node/npm 沿用已验证的 Pi 隔离 Runtime 版本；Node 声明与实际版本一致，满足 Pi 的 >=22.19.0。Node 类型沿用 Pi 发布 shrinkwrap 的 22.x 类型；TypeScript 对齐 Pi 固定上游声明的开发依赖版本 5.9.3；不声称上游构建命令等同于本仓库的 tsc/Compiler API。

根 package-lock.json 使用官方 npm registry 的精确版本与 integrity；不运行依赖 lifecycle scripts。保留官方 Pi 全部 143 个子条目；官方缺失 integrity 的六个内部包由同版本 registry tarball 摘要补齐，原 shrinkwrap 字节不变。Pi 仅用于 Adapter 内的编译合同，未据此建立生产执行路径。既有经过 tarball/shrinkwrap 校验、无凭证隔离的 Runtime probes 保留，由真实 CI 重跑；不重新实现宿主。

真实 TypeScript program 以 apps/packages 下全部 TypeScript 源与测试作为 roots，包含 fixture 与导入声明，strict/noEmit、NodeNext、erasableSyntaxOnly 和 skipLibCheck=false。类型检查是根 check 的前置步骤；Node 行为测试仍独立执行。

支持的官方类型面为 `@earendil-works/pi-coding-agent/client` 及其完整传递声明图。root SDK 声明仍有 46 个实际诊断（JSON import attribute、Anthropic undici 路径、Google optional MCP peer），明确不支持；没有借子路径绿宣称 root SDK 兼容，也没有排除任何既有正式源码。具体复现、安装隔离、闭包增强及未覆盖项见[工具链说明](../architecture/formal-toolchain.md)。

## 备选方案

- 继续 strip-types：不能检出类型或 SDK API 漂移，拒绝。
- 浮动最新 Pi/TS/Node：无法复用已验证兼容矩阵，拒绝。
- 手抄 Pi 声明、关闭依赖声明检查或排除出错测试：掩盖真实不兼容，拒绝。

## 后果与边界

安装需要访问官方 registry（或事先完整的校验缓存）；缺失、版本漂移和错误 API 必须失败。仅固定并验证当前工具链，不保证其他 Node/npm/TypeScript/Pi 版本。

G-3a 已由 PR #83 交付的代码与本 ADR 的正式接受分别记录。版本/闭包由本 ADR 提案定义；官方 CLI JSONL Worker 路径由 [ADR 0013](0013-pi-cli-jsonl-worker.md)提案定义。两份 ADR 在同一 D-07 有限决策的真实独立审查前保持 Proposed，当前执行状态见[当前执行决议](../planning/current-decisions.md)。接受只覆盖版本和路径方向，不批准后续合同实现，不自动完成 G-3 或 M0-4。

`./client` 是 RemoteSession/CBOR 的公共类型面，不能据此推断 stdio RpcClient 可用。Pi 根 SDK 的 46 个声明诊断保持未支持边界；CLI Worker 使用发布 manifest 的 `bin.pi` 与明确 Node executable，无须消费根 SDK 类型。包安装与编译不是对第三方代码的安全沙箱；Runtime 仍按已有隔离 probes 验证，不请求真实模型、凭证或用户数据。

## 回滚

可整体 revert 工具链、类型修复与最小 CI 接入；本切片无生产数据库变更或不可逆副作用。历史 ADR、来源快照、既有 Runtime fixtures 与所有质量门保留。
