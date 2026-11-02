# ADR 0028：Pi SDK 作为首选执行 Runtime

- 状态：Superseded by [ADR 0030](0030-harness-host.md)。下文保留原先基于 SDK 接入面的选择记录，不再作为当前选型；真实接入合同未运行。
- 日期：2026-11-02。
- 工作项：[#132](https://github.com/ntygod/zhiwei-next/issues/132)。
- 替代：旧 ADR 0001、0013、0019 的默认版本、CLI-only 接入方向及其与新架构冲突的部分。

## 背景

新系统需要执行中输入、独立取消、受控工具和模型边界，以及不保存原始思维链的会话策略。用户允许从 DeepSeek Harness、Pi、Codex CLI 选择，不自研 Agent Loop。

## 决策

选择 Pi Coding Agent SDK 1.4.0，运行在隔离 Worker Host，使用显式资源加载与 SessionManager.inMemory。宿主持久化合格的行动、结果、摘要和引用，重启重建新 Session，不宣称逐 token 原生恢复。

SDK prompt/steer/followUp/abort/events 与 custom tools/provider hooks 映射至知微协议。长工具外移为异步 Job，控制面取消不依赖模型队列。Runtime 适配层不持有长期认知或授权真源。

具体制品版本、npm integrity 与调研 commit 见[来源锁](../reference-lock.json)。源码与元数据核对不代替真实制品安装、类型和行为验收。

## 备选与取舍

DeepSeek Harness 与论文原型结合紧密，但当前公开 SDK 协议不提供单会话 cancel/session-close，且无协议版本协商承诺；直接使用其内部插件 API 会扩大绑定。Codex App Server 提供 thread/turn/steer/interrupt，具备备选价值，但仍需验证模型路由、工具约束、数据保留和权限合同。

选择 Pi 不是声称另外两者不能满足需求；它是当前已核对接入面与本项目 TypeScript/数据控制要求的折中。不存在自动 fallback 到另一 Runtime 的行为。

## 后果与验收

Pi 不自带 OS 访问隔离，必须由沙箱、Gateway、网络和凭据边界实现。原始思维链不落盘要求显式关闭原生持久化和自动资源发现。R01—R08 任一未通过，相应 profile 不启用；不得降低权限边界来“接通”。后续替换 Runtime 需新决策和同一场景对照。
