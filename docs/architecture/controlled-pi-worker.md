# P1-03 受控 Pi Worker 与合成 Broker

工作项 [#114](https://github.com/ntygod/zhiwei-next/issues/114)，唯一 [PR115](https://github.com/ntygod/zhiwei-next/pull/115)。[ADR0019](../adr/0019-controlled-pi-broker-extension.md)补充一方运行时扩展边界；官方 CLI 方向仍由 ADR0013 决定。本页描述新代码的开发接线，不代表 Z08/Z09、安全接入或官方新组合已验收。

## 消费路径与责任

```text
createSyntheticControlledWorkerSupervisor
  → RuntimePort / ExecutionSpec v1
  → createControlledPiWorkerClient
  → verified official bin.pi --mode rpc
  → fixed first-party controlled-broker-extension
  → inherited fd3 connection
  → createSyntheticControlledBroker
  → fixed in-process synthetic receiver / generated file / memory / isolated draft
```

- protocol 定义独立 v1 port、ExecutionFence/能力证据/绑定/源流 DTO，严格冻结解析；原 NormalizedRuntimeEvent v1 不改语义。
- pi-adapter 只做精确启动、传输、未知边界校验、原事件归一化、能力握手与进程观测，不写认知库，不发放授权。
- Daemon Supervisor 组合公开 package 入口，持有实际连接、单 binding、生成的合成 spec 和 Broker 生命周期。`start` 握手至 READY；`dispatch` 才发送固定合成 prompt。`events` 是有界订阅，不靠额外模型调用查询进度。
- Broker 只拥有新生成的合成文件、固定 memory 示例和自己的临时草稿目录。没有真实 Provider URL、用户路径、任意 memory 内容、凭据、Grant 或可写生产开关。

现有 health/meta/doctor 服务器完全不调用这条路径。诊断 token 不扩权。生产模式 unsupported；纯 DTO、synthetic spec 与 requestSnapshotRef 都不证明真实 Task/Grant/输入已经持久提交。P1-04 接线真实 Session/Task/Attempt/输入事务前，不得以本实现伪造持久恢复/授权。

## 启动、能力与来源

精确 Node22.23.1 与 Pi0.84.1，校验公开 `bin.pi=dist/cli.js`，显式 Node、空私有 cwd/state 与最小环境。仅固定一方扩展路径可加载。关闭自动发现、context files、skills、模板、主题、重试、压缩与遥测；`--offline` 抑制上游启动刷新，固定 system prompt，禁止任意 RPC 与 prompt 的 slash/shell shortcuts。

发布包名称/版本检查不是供应链认证；受信 launcher/安装制品认证仍是外层前置。目录与环境不是 OS 沙箱，不能防御恶意同用户进程改程序或读内存。Linux 合成开发不认证 Windows。官方隐含加载的 llama.cpp extension 事实保留，不声称字面上的零扩展。

READY 必须匹配实际 fd3 一方握手、真实 session identity、精确 Provider/model、active/registered tools 及协议 revision，并与 get_state/get_messages 的 idle/空消息观测一致。缺失/漂移/重复/未知能力在 prompt 前失败，不换 Provider 或入口。structuredDecision、resume、nativeCompaction 不支持；其余能力最多 limited，证据明确只到合成边界。

扩展入口使用严格 TypeScript 的 unknown 运行时校验，不导入、复制或伪造 root ExtensionAPI 声明。native Provider 的两种 stream 入口都只访问 fd3；每次最多一个 Broker 请求并产生唯一终态，Pi 自己消费工具调用、继续循环。`before_provider_request` 等可能吞异常的 hook 不充当授权闸门。

## 模型/工具与进度事实

模型请求在固定接收器前记录实际 system prompt、消息 text/toolCall/toolResult 与工具 schema 的受限投影；未知、图片、思维链等不支持载荷拒绝，不暗中丢失后声称完整重建。工具/模型请求的资源和身份来自连接绑定；正文中新增角色/Workspace/授权字段不会成为权限。

stdout RPC、fd3 extension lifecycle 与 Host actions 独立序列域；没有跨域全序。Actual Runtime Session 与 product Session、Worker instance 与 PID、command ID 与模型 request ID 分开。不伪造 Run/Turn/Message ID。未知事件只留固定安全诊断，失败不保存未知敏感正文或思维链 hash。

每 binding 最多256条/1MiB未消费结构事件，超限明确失败，不悄悄丢终态。实际请求接受、agent_settled、工具成功、abort acknowledgement、EOF、exit 和 close 都是不同证据；Supervisor 始终报告 Task Outcome 尚未评估。P1-07 才消费真实 Task/Outcome 进行验证。

## 开发验证与未验证项

可执行普通开发检查包括：正式 strict/noEmit；纯 DTO/字节/响应关联；固定合成子进程握手、接受/settled/关闭、取消/超时清理、队列上限；固定合成 Broker 请求捕获与普通 file/memory/draft 生命周期。具体运行结果绑定 PR 当前提交记录，不能从本文推导通过。

未执行：新官方 CLI+一方扩展组合真实兼容矩阵、真实模型账户/网络/用户材料、durable Grant/action/fence 当前状态校验、受限 Private/注入/路径链接替换/备份攻击、Windows 支持和 Z08/Z09 完整产品验收。旧 #90 及等价争议动态诊断不重跑、不委派或换环境绕过。原 CI 的 SDK/Worker Artifact 来源证明原冻结合同，不认证新扩展组合。

## 回滚与后续

关闭新合成 profile、停止接纳新派发、排空/停止 Worker、关闭 Broker 自建资源，保留已提交历史证据。无 Schema 迁移或真实权限激活，原诊断通道不受影响。

P1-04 提供持久 Session/Task/Attempt/输入与 WorkingState；P1-06 消费 WorkingState；P1-07 基于 P1-04 精确历史接线 Outcome/Episode。P1-09 是 Alpha 验收，不是这些持久消费者的实现责任。
