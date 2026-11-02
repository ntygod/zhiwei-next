# Harness 宿主与 Runtime 合同

状态：SA1 设计。已核对固定源码及 npm 元数据，真实安装、类型、模型、插件清理与沙箱合同均未运行。选择由 [ADR 0030](../adr/0030-harness-host.md) 替代原 Pi 方案。

## 1. 当前选择

使用 **DeepSeek Harness 0.2.2-alpha.2** 作为应用宿主，Cordis 管理插件组合与生命周期，`dsh-agent-loop` 提供原生模型/工具执行循环。调查源码为 `ce7073d51254c26cd63b22a60835b8f948deb447`，npm `@deepseek-ai/dsh` 同版本的 integrity 已核对；不把源码阅读当作运行验收。

知微以独立仓库中的 TypeScript 插件/Bundle 扩展，产品通过固定 `dsh` 启动器加载专用 Profile。主要使用公开的插件侧 `ctx.agents` / `AgentHandle` / `Agent` API，不通过缺少单会话取消的 SDK JSON-RPC 路线承载核心控制。

这不要求 Fork 上游、不复制 Agent Loop，也不直接运行默认 `web`、`headless` 或 `sdk-minimal` 组合。默认组合的工具、持久化、日志上传与环境发现不能自动成为知微的权限或数据策略。

## 2. 接入面的区别

| 路线 | 能力与取舍 | SA1 处置 |
|---|---|---|
| Harness 原生插件 API | `create/resume`、`steer/followup/inject/cancel/whenIdle`、作用域与 effect；公开服务接口 | 默认，版本固定并做契约验收 |
| Harness SDK JSON-RPC | 进程外入队/事件/resume；当前无 cancel/session-close | 不用于核心 Worker 控制；该限制不能泛化为整个 Harness 无取消能力 |
| Pi SDK | 轻量嵌入与输入队列，但应用组合/生命周期主要由我们组织 | 保留替换参考，不同时启用第二套默认循环 |
| Codex App Server | Thread/Turn、steer/interrupt、事件与审批 | 可评估为特定执行后端，不伪装为已兼容插件 |

Harness 为开发预览，公开接口也可能破坏兼容。使用其服务定义、事件和 seam，避免引用包的私有类/文件；升级在独立候选制品中验证，不追随 master 自动更新。

## 3. Profile 与进程

- `zhiwei-control`：Router、Owner API、来源接收、任务/记忆/权限/学习/Attention 的知微插件。Router 仅有协调和合格读取工具。
- `zhiwei-worker`：隔离进程中的原生 Agent Loop、固定工具 executor、Model Gateway adapter、Task/Job 桥接插件。一个 active Assignment 对应一个受控 Agent。
- Execution Agent：在指定环境执行具体获准 Job，不承担全局认知。
- Supervisor：独立于前两者，监测与请求有限恢复，不具有任意管理插件的能力。

控制面与 Worker 之间需要知微自己的窄桥接协议。Worker 进程内的桥接插件调用公开 Agent API，向外暴露受认证的 start/input/cancel/events/close；不会因为插件内存在 cancel 方法就假设官方 SDK wire 自动拥有该方法。

桥接携带 Task/Assignment/epoch/输入 ID，验证真实传输身份。原生 AgentId、进程局部 initiator scope 和 `ctx.agents.isOwnedBy()` 仅是运行事实，不是跨进程授权。长期身份与权限由知微账本决定。

## 4. 可替换端口

以下为知微合同，不宣称是上游原生方法名：

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

宿主 start/enqueue 映射为已识别输入的 `agent.followup()`，steer 映射为 `agent.steer()`，interrupt 调用 `agent.cancel(cause)`，清理由拥有者的 `handle.dispose()` 执行；`agent.inject()` 只注入上下文而不唤醒。`whenIdle()` 只说明原生 Agent 暂时休止，不表示 Task/异步 Job/子任务已经完成。

在发送输入前订阅事件。适配器保存 inputId 与原生 messageId 的关联，区分 `agent/inbox/inserted`、claimed/discarded、真正进入模型请求和完成；claimed 不自动算 applied。无法证明应用关系时保持 delivered/unknown。取消清理原生 inbox 后，知微 durable Inbox 仍需为每条输入登记取消、取代或待恢复，不能静默丢掉已接纳请求。

RuntimeEvent 保留 native/host 身份、各流 sequence 和实际来源；不制造跨进程全序。旧绑定回执可作为历史效果事实核对，不能改写当前 Task。

## 5. 原生循环与异步工具

Router 的 task/start、prepare 等工具登记持久工作即返回。Worker 的长工具返回 JobHandle，进度与完成通过事件桥接进入其 inbox；通知完成时需 steer/followup 唤醒，单独 inject 不足以恢复工作。

原生 steer 的下一步骤接纳不等于任意时刻抢占。控制面撤权/停止先阻止 Gateway 新派发，再取消原生活动并核对外部 Job；已发出的请求不能通过取消 Promise 假装撤回。

上游 `jobs-local` 是进程内后端。知微持久 Job 由 Task/Action 账本与 Execution Agent 承担，通过知微 Job provider/桥接工具向原生会话呈现。稳定 canonicalJobId 属于 Task，暴露给当前 Agent 的原生句柄/别名属于当前绑定；重建后重新授权并登记映射，不把旧 SessionId 当作新 Agent 的控制权，也不重复创建底层工作。

原生工具并发与任务间资源冲突分开。上游 parallel-safe 分类不能替代跨 Task 的 ResourceClaim、quarantine 和最终资源侧条件写。Task 终态继续服从[待办屏障](domain.md)与[结果验证](execution.md)。

## 6. 插件角色与强制边界

| 角色 | 上游能力 | 知微承担 |
|---|---|---|
| Router / Worker | Agent、Agent Loop、输入队列与事件 | Task 归属、长期状态、预算和受众分区 |
| Tools | `ctx.tools`、固定 native executor、guard 与执行链 | 每 action 的 Grant、资源、版本、效果登记 |
| LLM | `ctx.llm` / provider adapter seam | 唯一允许的 Gateway provider、目的地和真实发送检查 |
| Memory / Learning | 依赖/作用域/effect 组合 | Markdown 内容、提交资格、来源、纠正、主动求证 |
| Sources / Attention | 服务与类型化事件 | 持久游标、候选、通知预算及外部投递 |

Profile 必须显式列出必需服务、允许的 executor/adapter、禁止项与配置摘要。上游允许非必需插件启动失败后继续，也允许自定义 executor 不使用共享执行链；知微不能只注册一个可选 hook 就宣称全路径强制。

知微 readiness gate 在任何声明式 Agent、公开业务 API 或派发开始前验证全部必需插件实际就绪。缺失、disabled、版本拒绝或 PENDING 均不开放业务。固定 executor 必须经过单调 guard 和 Action Gateway；所有主请求、压缩、标题、学习等模型调用只能经过受控 adapter。插件管理工具、动态代码插件、任意安装和生产 HMR 不对 Agent 开放。

Context 的作用域是能力组合机制，不是 OS 隔离。插件是受信宿主代码；工具和不可信代码执行在独立沙箱，模型没有直接文件/进程/网络或数据库凭据。用户内容不能修改 Profile、安装代码或切换 executor。

## 7. 会话与原始思维链

Harness 不挂载 session persistence backend 时，Session 留在内存。本项目采用这一方式保存易失 Runtime 历史；不挂载默认 JSONL 持久化、Session 上传、原始流日志、stdout reasoning exporter 或未经许可的遥测插件。

知微持久记录合格用户消息、输入关联、动作、回执、公开回答、紧凑摘要和精确引用；原始思维链不落盘、不出现在活动 API。不能将“先写完整 Session，再删敏感块”当成符合保留策略。

原生 stdout/stderr 和未处理异常也不是默认可持久日志。Worker 进程的原始流只能进入有界易失捕获，持久诊断仅输出白名单字段；部署不得让容器日志驱动直接归档这些原始流。未知错误对象不展开为全文日志，无法覆盖该输出路径时 profile 不启用。

官方 CLI 的 `reportStartupFailure` 还会绕过 Profile 日志插件，直接把完整 error/cause/隐藏属性写入 `$DSH_HOME/logs/startup-*.log`；写失败又把全文输出到 stderr。控制面与 Worker 均须在启动 dsh **之前**将该固定日志目录置于不可写挂载/ACL 下，宿主非特权运行，并接管原始 stdout/stderr 为有界易失管道。Profile 预置并只读挂载；其他必要 scratch 只用不收集、不备份的易失存储。readiness 插件启动后才禁日志已经太晚。

启动失败只能向用户/持久日志输出白名单错误类别、受控 ID 和退出状态；文件写入失败的 stderr 回落同样不能被容器日志、终端录制或 Supervisor 原样保存。若某平台无法在不破坏正常启动的情况下封锁直接诊断写入，则保持 unsupported，或对该具体行为采用单独登记、审查和验证的上游脱敏补丁；不得默默允许落盘。

重启以当前 CheckpointManifest、合格记忆和未决输入建立新的原生 Agent/Session，标记为宿主重建，而非逐 token 原生 resume。原生 in-memory inbox 不提供跨进程耐久性，知微 Inbox/Outbox/EffectFence 继续负责重放与核对。未知效果先核对，旧权限不随 Session 重建复活。

## 8. 清理与配置变化

注册、监听器、连接和 watcher 由 Cordis effect 拥有，但官方 CLI 收到 SIGTERM/SIGINT 后会立即开始 root disposal，并有 5 秒硬上限；原生 Agent 的拥有者/工厂还有自己的清理注册。知微的一个 disposer 不能保证这些上游清理都等待业务排空。

正常停机必须先经受认证的知微 drain 端口，在 root 仍 active 时执行：冻结派发 → 取消/排空必要工作 → 保存回执或 unknown/checkpoint → 显式 dispose AgentHandle → 确认业务 drain 结果。只有这一步结束后，Supervisor 才发送 SIGTERM 进入原生 root 清理并释放剩余连接。知微自有资源中必须串行的释放放在同一个 disposer，不能以多个插件的注册顺序代替。

未先 drain 的直接信号、重复信号、强杀、依赖突然卸载或业务 drain 超时都走异常停止路径。CLI 的退出码 0 不证明 Task 已完成或回执已持久；相关绑定进入 lost/unknown 并由 EffectFence、Inbox 和 Checkpoint 恢复核对。不得依赖 root disposal 获得完整的业务排空时间。

Gateway、账本和必要回执通道在收尾期间保持可用。依赖消失触发卸载时，也要保留 Task 的明确阻塞/未知状态。原生 root shutdown 存在最终 turn/end 可能未持久的已知边界，所以业务完成从不依赖该事件单独证明。

生产 Profile 固定版本且禁用 HMR。变更先预检最终组合和依赖，排空旧绑定，再启动新组合；失败拒绝 readiness，不宣称 Loader 的局部更新是原子切换。

## 9. 接入验收

R01—R09 / S11 覆盖精确制品和 peer 解析、无隐式资源、输入应用、取消、Gateway 所有调用路径、原始思维链零落盘、会话重建、缺依赖/卸载/桥接与生产组合预检。真实接入通过前只将这些列为设计要求；文档检查不是运行验证。
