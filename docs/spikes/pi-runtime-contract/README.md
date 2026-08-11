# Pi Runtime 契约 Spike

状态：**source-and-runtime-verified**

关联工作：[#5](https://github.com/ntygod/zhiwei-next/issues/5)、[#7](https://github.com/ntygod/zhiwei-next/issues/7)

本 Spike 为 M0 建立可复现的 Pi 上游与发布 Artifact 契约证据。源码结论绑定 Release Tag Commit；动态结论绑定 npm registry digest、隔离 CI、脱敏 Fixture 和机器检查。它仍不修改正式 `NormalizedRuntimeEvent`，也不接入任何模型 Provider。

## 固定基线

| 项目 | 值 |
|---|---|
| 权威仓库 | `earendil-works/pi` |
| 历史重定向来源 | `badlogic/pi-mono` |
| Release Tag | `v0.84.1` |
| Tag Commit | `53fa77ccd8a279eb87e92294ef3687b03ff80112` |
| 正式包名 | `@earendil-works/pi-coding-agent` |
| 包版本 | `0.84.1` |
| Node 要求 | `>=22.19.0` |
| License | MIT |
| Registry integrity | `sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==` |
| Registry shasum | `e098cada629fdeeb9df6e77c6d480d43e1b2c553` |
| Runtime contract fingerprint | `8862439aa1c3744ec1465ec7336aca7494fa24b859568266e42203d15d84c6d3` |
| 验证日期 | 2026-08-11 |

机器真源：

- [`pi-upstream-baseline.json`](../../../packages/pi-adapter/fixtures/pi-upstream-baseline.json)：源码、版本与动态验证状态；
- [`pi-artifact-runtime.json`](../../../packages/pi-adapter/fixtures/pi-artifact-runtime.json)：脱敏后的 registry、Tarball、SDK、RPC 和隔离证据；
- [`sdk-event-surface.json`](../../../packages/pi-adapter/fixtures/sdk-event-surface.json)：source-derived SDK 事件表面；
- [`rpc-contract.jsonl`](../../../packages/pi-adapter/fixtures/rpc-contract.jsonl)：source-derived RPC framing 与关联样本。

## 源码证据

所有源码来源都绑定 `v0.84.1` 指向的完整 Commit SHA，不引用浮动 `main`。

| 证据 | 固定来源 |
|---|---|
| 包名、版本、exports、Node 要求 | [`packages/coding-agent/package.json`](https://github.com/earendil-works/pi/blob/53fa77ccd8a279eb87e92294ef3687b03ff80112/packages/coding-agent/package.json) |
| SDK 使用与 `AgentSession` 表面 | [`docs/sdk.md`](https://github.com/earendil-works/pi/blob/53fa77ccd8a279eb87e92294ef3687b03ff80112/packages/coding-agent/docs/sdk.md) |
| `AgentSessionEvent` | [`agent-session.ts`](https://github.com/earendil-works/pi/blob/53fa77ccd8a279eb87e92294ef3687b03ff80112/packages/coding-agent/src/core/agent-session.ts) |
| 核心 `AgentEvent` 与 `toolCallId` | [`packages/agent/src/types.ts`](https://github.com/earendil-works/pi/blob/53fa77ccd8a279eb87e92294ef3687b03ff80112/packages/agent/src/types.ts) |
| `agent_settled` 语义 | [`6363-agent-settled-event.test.ts`](https://github.com/earendil-works/pi/blob/53fa77ccd8a279eb87e92294ef3687b03ff80112/packages/coding-agent/test/suite/regressions/6363-agent-settled-event.test.ts) |
| RPC 文档 | [`docs/rpc.md`](https://github.com/earendil-works/pi/blob/53fa77ccd8a279eb87e92294ef3687b03ff80112/packages/coding-agent/docs/rpc.md) |
| RPC 命令与响应类型 | [`rpc-types.ts`](https://github.com/earendil-works/pi/blob/53fa77ccd8a279eb87e92294ef3687b03ff80112/packages/coding-agent/src/modes/rpc/rpc-types.ts) |
| LF-only JSONL 实现 | [`jsonl.ts`](https://github.com/earendil-works/pi/blob/53fa77ccd8a279eb87e92294ef3687b03ff80112/packages/coding-agent/src/modes/rpc/jsonl.ts) |
| JSONL 边界测试 | [`rpc-jsonl.test.ts`](https://github.com/earendil-works/pi/blob/53fa77ccd8a279eb87e92294ef3687b03ff80112/packages/coding-agent/test/rpc-jsonl.test.ts) |

每个来源的 Blob SHA 都记录在机器基线中。

## npm Artifact 动态验证

验证运行：[GitHub Actions run 31481982629](https://github.com/ntygod/zhiwei-next/actions/runs/31481982629)

隔离 Job 执行了以下链路：

```text
npm registry metadata
  → npm pack 精确版本
  → 独立计算 Tarball SHA-512 / SHA-1
  → 与 registry 和 npm pack 结果交叉比对
  → 读取 Tarball 内 package.json
  → 核对 name / version / engine / license / exports / bin
  → 禁用 install scripts 安装同一 Tarball
  → SDK root export 动态导入
  → RPC --no-session 启动
  → get_state + get_messages
  → 脱敏结果校验与 Artifact 上传
```

已确认：

- registry、`npm pack` 和本地字节计算得到相同 integrity 与 shasum；
- Tarball manifest 与 Release Tag 的公开包表面一致；
- SDK 可动态导入 `createAgentSession`、`createAgentSessionRuntime`、`SessionManager`、`ModelRuntime`；
- RPC 可在无 Provider Credential、无 Prompt、`--no-session` 下返回 `get_state` 和 `get_messages`；
- 空 Session 的 `isStreaming` 为 `false`，消息数为 `0`；
- 原始 `sessionId` 没有持久化，只记录其存在性；
- 没有生成项目 lockfile，也没有把 Pi 加入生产依赖。

这里验证的是发布 Artifact 的公开 manifest 与运行表面。它不等价于对 Tarball 中每一个源码字节与 Git Tag 工作树做完整可重现构建证明。

## R3 隔离边界

第三方 npm Artifact 不直接接触私有仓库 checkout。

动态执行位于 digest-pinned 容器：

```text
node:22.23.1-bookworm-slim
@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3
```

容器约束：

- GitHub Job 权限只有 `contents: read`；
- checkout 使用 `persist-credentials: false`；
- 不注入 `${{ secrets.* }}`、Provider Key、Token 或 Cookie；
- 宿主仓库不挂载进容器；
- 只挂载四个公开契约探针文件组成的 curated bundle，且为只读；
- 容器根文件系统只读；
- 使用非 root 用户；
- `--cap-drop=ALL`；
- `no-new-privileges`；
- 限制 PID、内存和 CPU；
- `/tmp` 为临时、`noexec` 语义下使用 Node 解释器加载 CLI；
- npm lifecycle/install scripts 被禁用；
- 只挂载一个空结果目录用于输出脱敏 JSON。

动态结果校验会拒绝：

- 原始 Session ID；
- Runner 绝对路径；
- 凭证样式字符串；
- 失败或缺失的 digest 检查；
- 非只读或挂载宿主仓库的安全声明；
- 任何 Prompt 或 Provider Credential 使用；
- 与提交 Fixture 不同的契约指纹。

## 恢复与失败证据

本任务保留了两个没有被包装成“成功”的中间结果。

### Run 31481031560：审查后拒绝

首轮 Host Probe 的业务检查通过，但冷读审查发现：

- 结果中残留 hosted-toolcache 绝对路径；
- 第三方包虽使用临时 HOME 和 cwd，仍能看到宿主私有 checkout。

该结果没有进入仓库，也没有升级 baseline。随后改为 Docker curated-bundle 隔离。

### Run 31481751198：noexec 预期失败

Docker 隔离生效后，RPC 直接执行临时目录中的 `.bin/pi` 被内核以 `EACCES` 拒绝。没有放宽 `/tmp` 或根文件系统权限，而是改为：

```text
只读根文件系统中的 Node
  → 加载已核对 Tarball 的 CLI JavaScript 入口
```

修复后 RPC 在同一隔离边界下通过。这证明失败、证据保留和恢复路径均实际运行过。

## 已确认：SDK 事件与关联

核心事件包括：

```text
agent_start / agent_end
turn_start / turn_end
message_start / message_update / message_end
tool_execution_start / tool_execution_update / tool_execution_end
```

三个 Tool 生命周期事件都携带真实 `toolCallId`。因此知微不得重新猜测或生成工具关联键。

并行工具模式下：

- `tool_execution_end` 可按实际完成顺序发出；
- Tool Result 消息稍后按 Assistant 原始调用顺序追加。

Observation Ledger 必须分别保存执行完成顺序和消息产物顺序。

## 已确认：`agent_end` 与 `agent_settled`

`AgentSessionEvent` 的 `agent_end` 带 `willRetry`，并另有：

```text
agent_settled
```

上游回归测试证明：

1. 自动重试期间可出现多个 `agent_end`；
2. Follow-up 可在 `agent_end` 后继续运行；
3. 所有重试与 Follow-up 完成、Session idle 后，才发出一次 `agent_settled`。

M0 必须区分：

```text
低层一次 Run 结束          agent_end
Session 本轮最终稳定        agent_settled
Extension / Worker 关闭     session_shutdown / process exit
```

## 已确认：RPC 与 LF-only JSONL

RPC 通过 stdin/stdout 使用严格 **LF-only** JSONL：

- 只按 `\n` 分隔记录；
- 输入可接受 `\r\n`；
- JSON 字符串内部 `U+2028` / `U+2029` 必须保留；
- 不能使用 Node `readline` 作为协议 reader；
- Command 可带 `id`，Response 返回同一 `id`；
- `bash_execution_update.id` 关联原 Bash Command；
- Prompt Response 成功只表示被接受或排队，不代表任务成功。

## 历史状态

PR #6 完成时，本 Spike 是 **source-verified / runtime-unverified**。该措辞继续保留在这里作为状态演化记录，而不是当前能力声明。

## 当前可以据此继续

- 使用 `earendil-works/pi` 和 `v0.84.1` 作为 M0 固定基线；
- 将精确 npm Artifact 作为后续动态 Fixture 的输入；
- 使用 `toolCallId` 关联 Tool 生命周期；
- 分开 `agent_end`、`agent_settled`、Shutdown 和 Process Exit；
- 为 RPC Worker 实现严格 LF-only parser；
- 在 Node/TypeScript 同进程集成与独立 Worker 集成之间进行下一阶段真实事件比较。

## 仍未验证

本次仍不能决定或声称：

- SDK、Extension 或 RPC 哪一个是最终唯一主集成面；
- 正常 Prompt、自动重试、Follow-up、取消、并行 Tool、Compaction 的完整真实事件序列；
- Extension lifecycle 与 SDK public event 的完整一一对应；
- Raw Payload 的持久化、截断和脱敏策略；
- 正式 `NormalizedRuntimeEvent` 字段；
- SQLite Observation Ledger Schema。

下一步应录制无真实用户数据的 Extension/SDK Runtime Fixtures，再修订正式协议。
