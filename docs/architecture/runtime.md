# Runtime 选择与适配合同

状态：源码/官方文档已核对，真实安装、模型请求、沙箱与故障合同尚未运行。选择依据与固定来源见[来源登记](references.md)。

## 1. 决策

SA1 默认使用 **`@earendil-works/pi-coding-agent` 1.4.0 的 TypeScript SDK**，在隔离 Worker Host 进程中创建 AgentSession。调查源码为 `c9f4c7b9fcd0f3e6b5bbc35c7c9b6cda35580eb8`；npm 的 1.4.0 元数据与 integrity 已取得，但本次未下载/执行制品。

选择原因：有受支持的 prompt/steer/followUp/abort、事件订阅、in-memory SessionManager、自定义 ResourceLoader 和工具/模型边界。知微需要完全控制长期数据、输入归属和工具能力；这些接入点比包装交互式终端输出更合适。它不提供操作系统权限隔离，必须由本系统补齐。

不使用 `createAgentSession()` 的默认环境发现：默认会加载工作目录资源、设置、凭据和工具。宿主显式提供 cwd、模型路由、内存设置、SessionManager、ResourceLoader、工具集合和唯一受信扩展；不能由用户材料中的路径、插件名或 `AGENTS.md` 自动获得执行权。

## 2. 三个候选的边界

| 能力 | Pi SDK：本版选择 | DeepSeek Harness SDK | Codex App Server |
|---|---|---|---|
| 接入 | TypeScript AgentSession | TypeScript SDK / stdio JSON-RPC | `codex app-server` JSON-RPC |
| 执行中输入 | steer / followUp，明确队列行为 | session/prompt 快速入队，event/status 订阅 | turn/steer，绑定 expectedTurnId |
| 取消 | abort；再监督 Job 与子进程 | 当前公开协议无 cancel/session-close，关闭 runtime 进程退出 | turn/interrupt，完成通知带 interrupted |
| 会话恢复 | SessionManager；本项目采用宿主重建 | session/resume；问题等待句柄为进程局部 | thread/resume，按协议恢复 |
| 工具与模型约束 | 自定义工具、资源与 provider hooks | composition/plugin 提供，SDK 不是完整权限系统 | sandbox/审批/MCP 等接口，需逐项能力验证 |
| 已知代价 | 无内置 OS 沙箱；宿主需 Gateway 与隔离 | alpha 协议无版本协商承诺，单会话取消缺口 | Runtime 与模型/认证生态约束，动态工具部分接口为实验性 |

这些是当前公开接入面的差异，不是三个项目质量排名。DeepSeek 的原型直接使用 Harness 内部服务，不可把原型能调用的方法当成其 SDK 已承诺的跨进程方法。Codex 适配若启用，应使用 App Server 而非解析 TUI 或单次 `exec` 输出。

SA1 只要求 Pi 适配器实际通过验收；其他候选保留明确的替换决策依据，不创建返回假成功的空适配器。替换需要相同黑盒场景及能力矩阵，不能热切换正在执行的原生 Session 身份。

## 3. 宿主端口

以下为知微自有接口，不宣称是 Pi/Codex/DSH 的原生 API：

```typescript
interface RuntimeAdapter {
  inspectProfile(): Promise<RuntimeCapabilities>;
  create(spec: SessionSpec): Promise<RuntimeBinding>;
  start(binding: RuntimeBinding, input: RuntimeInput): Promise<InputAccepted>;
  steer(binding: RuntimeBinding, input: RuntimeInput): Promise<InputAccepted>;
  enqueue(binding: RuntimeBinding, input: RuntimeInput): Promise<InputAccepted>;
  interrupt(binding: RuntimeBinding, reason: StopReason): Promise<StopRequested>;
  events(binding: RuntimeBinding): AsyncIterable<RuntimeEvent>;
  dispose(binding: RuntimeBinding): Promise<CloseEvidence>;
}
```

`start` 返回宿主受控入队回执，不等待 `session.prompt()` 的最终 Promise；适配器持有该 Promise 并将成功、异常和 settled 转为事件，保证没有未处理 rejection。订阅在 prompt 前建立。每个输入携带 inputId、taskId、assignmentEpoch、intentRevision、用途和内容版本。

RuntimeEvent 区分输入已观察、消息完成、工具生命周期、重试、压缩、settled、异常和进程关闭。保留 sourceSurface、native IDs、host IDs 和各流 sequence，不从文本猜测事件。

## 4. 全双工的具体实现

Router 使用 Pi Session，但只挂载任务/记忆/关联/准备/答复提案工具。`task.start` 等工具登记作业即返回；不等待另一个 Worker 完成。Router 能在后台任务运行时处理新的用户输入。

Worker 的耗时工具返回 JobHandle，Job 进展和完成通过订阅注入其 input queue。只有用户明确“做完当前任务再处理”时使用 followUp；普通兼容补充使用 steer；撤权、删除和不兼容修改先由宿主冻结旧版本，再决定 abort/rebuild。

Pi 的 steer 不是任意时刻的原地抢占：当前 assistant turn 和工具调用仍可能先完成。因此必须有外部 Action Gateway 的撤销检查，不能把“已经发送 steer”当作旧动作已经停止。

## 5. Role profile

| 角色 | 模型任务 | 允许的工具 |
|---|---|---|
| Router | 理解意图、关联任务、组织回复 | scoped recall、task propose/control、reference lookup、delivery propose |
| Worker | 完成明确任务 | 获准 read、job start/read/stop、artifact stage、question、report |
| Learner | 归纳/比较/生成候选 | 合格材料读取、受控调查提案、candidate propose |
| Assessor | 主动价值或停滞诊断 | 限定快照，默认无执行工具 |
| Verifier assistant | 对主观质量提供建议 | 只读精确产物；不能授予安全通过 |

模型可以按角色配置，选择由版本化 ModelProfile 决定。模型不可用时保留状态并显式暂停，未经预先声明不切换模型或泄露到新 Provider。工具集合变化只影响新请求快照；每次真正执行仍通过 Gateway。

## 6. 会话持久化与原始思维链

使用 `SessionManager.inMemory()`，禁用默认 file-backed 设置、原生会话文件、调试 Prompt 日志和非受信扩展。模型的临时推理内容只允许停留在 Runtime 的必要易失内存中；不得写入消息账本、遥测、异常正文、crash dump 或对象存储。

知微持久化用户消息、批准过的上下文引用、可观察动作、工具回执、公开回答和紧凑的工作摘要。压缩摘要是可重建派生材料，不成为新证据。每次正常休止保存 CheckpointManifest：任务版本、仍有效的引用、已完成动作、未决输入与未知副作用。

进程重启时从 Manifest 和当前资格重新建立一个新的 Pi Session。这是 **宿主重建**，不是逐 token 原生续跑；新 runtimeSessionId 必须可见于审计。已发生动作先核对，旧权限和已失效内容不会随历史恢复。不能为“完整重放”而存储原始思维链。

## 7. 模型与工具边界

模型网络只可访问受控 Model Gateway；Provider 长期密钥在 Gateway/Vault 中，工具执行环境拿不到。Provider 请求前检查内容来源、目的地许可、预算和 epoch；实际发送有观察回执，准备好请求不等于已经发送。

关闭默认 built-in shell/read/write 和动态发现，只注册通过 Action Gateway 的具体工具。工具进程运行在另一执行沙箱；不能因为 Pi 扩展可信就让任意模型调用获得 Worker Host 的 OS 权限。

Pi 扩展和 SDK 都是高权限宿主代码，纳入供应链固定与完整性验证。Hooks 是观察和约束的接入点，不单独充当 OS 安全边界。任一绕过 Gateway 的模型/工具路径未被证实时，该 profile 不能启用。

## 8. 接入验收

R01—R08 覆盖：精确版本与包完整性、没有宿主自动发现、streaming 时 steer/followUp、abort 与外部 Job 区别、工具所有路径经过 Gateway、模型 payload/目的地检查、无原始思维链落盘、Session 重建与监听重新绑定。SDK 编译通过不代替这些真实契约场景。
