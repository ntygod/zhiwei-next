# P1-04 持久任务、会话与事件恢复

工作项 [#116](https://github.com/ntygod/zhiwei-next/issues/116)，唯一 [PR117](https://github.com/ntygod/zhiwei-next/pull/117)。消费原 P1-04 和 ADR0018/0019，不扩大 Accepted 范围。代码实施与 Z10/Z11/Z12 产品验收分开，真实入口保持关闭。

## 唯一持久真源

`createSyntheticTaskSessionHarness` 只创建自己拥有的新临时安装；不接收任意 data-root、application、模型地址、凭据、历史快照或授权布尔开关。固定两组 principal/Workspace 和无工具合成 profile，仅固定 Prompt 可进入第一方内存模型接收器。普通 Daemon 仍只有诊断端点。

启动通过 recovery coordinator 选择并验证 active generation，消费其 Store，不猜测世代路径。一个 `product.sqlite`，固定新增 `0003_task_session_v1.sql`；0001、0002、v1 parser 和原 Ledger 不改。Schema manifest、迁移历史、连接 PRAGMA、完整行验证和读取 snapshot 继续 fail closed。

`store.tasks` 保存 Session/Task/输入/WorkingState/receipt；`store.executions` 保存精确 spec/binding、真实来源事件/checkpoint/输入。Store 不依赖 cognition-core；Daemon 注入固定纯 reducer。HTTP 不能传历史 Task、Outcome、ownerEpoch 或内部 runtime 命令。Store 独立验证当前锁定行、CAS、逐版历史前缀、attempt、声明操作与真实依赖。

## 事务和历史

- 命令 Observation、每个连续 Task revision、WorkingState、产品 Outbox、receipt 同事务；CREATED→READY 等中间版本保留。
- reducer 可提供与各 Task revision 一一对应的完整 WorkingState，必须匹配 Task/attempt/intent/真实 evidence 和正文依赖。默认仅保存当前步骤，不伪造认知循环。
- 同主体/类型/幂等键和相同语义输入返回原 receipt；commandId 仅相关标识，不使相同语义重新执行。不同语义冲突。响应丢失、通知异常不回滚已提交真源。
- 请求、标准、Outcome 解释、SessionContract、输入、Runtime envelope 和比较正文走受控 ContentRef 生命周期。最小 opaque receipt 定位键不当作匿名化，也不放入外部日志；正文失效后不重新执行。
- 明确 retry/continue 生成新 attempt，旧 attempt/Outcome 不覆盖。中断仅产生 unknown/unverifiable；settled 只进入 VERIFYING。结果验证/Episode 属于 P1-07。
- 重启提高 ownerEpoch，旧绑定不能继续写；recoveryEpoch 来自独立控制真源，不由 Worker 随机生成。普通重启与备份恢复不同，均不能凭原 lease 宣称 checkpoint resume。

## 进程与输入边界

1. 从已提交 Task/Session 和当前 epoch 构造任务身份。
2. 先持久 runtime_input，以其真实 ContentRef 构造固定 spec。
3. 精确 spec、ALLOCATED binding、owner/lease 落库后才 spawn。
4. 实际 READY、Runtime Session 和来源映射保存后，才提交 dispatch 边界并调用 Worker。
5. Daemon 从固定 profile 选择 binding/adapter/package/version 的精确命名空间映射并冻结在执行记录。Store 不包含 Pi vendor 特判，不改 v1 原始来源。
6. 动态 Host/RPC/Extension 映射必须单调扩展，BUSY→DRAINING 保存真实状态。来源序列按原 source domain 严格递增；跨 surface 共享计数器的数值空洞不能冒充丢包证据，也不得重编号。重复/冲突槽位继续拒绝。
7. 实际 envelope、checkpoint、进度和 settled→VERIFYING 同事务。Broker 在第一方接收器之前同步提交实际 projected model_request，失败阻止接收。runtime_input 不等于 model_request，后者也不是生产 Exposure 证明。
8. 取消先提交 CANCELLING；真实关闭证据或事务证明无执行绑定后才 CANCELLED。abort acknowledgement 不阻塞 dispose，忙碌进程仍能结束。
9. 所有直接/自动执行共用串行接纳队列；异步准备后重检 Task/attempt/生命周期。restart/close 串行，关闭替换后的 API，不遗留进程。

官方 Pi CLI+新扩展完整组合仍 `not_run`。加载真实扩展的合成协议进程不冒充官方 Agent Loop；工具/真实模型 Grant/action/预算生产接线不由该无工具 profile 认证。

## 数据 API 与 CLI

独立 loopback 数据 API 使用短期一次性配对码。Host 固定；浏览器写入严格校验 Origin、HttpOnly/SameSite=Strict Cookie 与独立 CSRF。浏览器 GET/SSE 若带 Origin 必须精确匹配；未带 Origin 时仅接受浏览器控制的 `Sec-Fetch-Site: same-origin`、`Sec-Fetch-Mode: cors|same-origin`、`Sec-Fetch-Dest: empty` 三项，缺失、跨站或导航请求拒绝。该读策略适配 [Fetch 的 Origin 规则](https://fetch.spec.whatwg.org/#append-a-request-origin-header)，不是放宽写入验证。CLI 独立 Bearer；诊断 token 与模型凭据不互用。所有读取和事件发布前校验 Scope。

外部 cursor 用平台 AES-256-GCM，绑定 installation/principal/scope/recovery/projection/purpose/expiry。内存密钥丢失要求新快照，不丢失 Task/receipt。task/session 是独立产品 projection，不冒称认知 Outbox 的统一序号；快照和水位同 SQLite 读取事务。HTTP 快照每页至多 50 个 Session/Task summary，并维持 1 MiB 字节及结构预算；`nextCursor` 专用加密命名空间绑定相同 Scope、世代、提交水位和偏移。续页重新授权，水位变化返回 410 `snapshot_required`，绝不拼接不同时刻视图。CLI 完成所有页后才交付完整快照；`snapshotPages()` 允许有界逐页处理，完整内存聚合另限 16 MiB、每类 65536 项和 100 万结构节点，超过时明确失败，不限制持久创建数量。分页期间的页是暂存视图，失败须丢弃；完成后从首个 `asOfCursor` 接 SSE，所有页的该 token 均表示同一内部水位。当前服务每次续页仍读取完整 Store 快照；这是读取成本限制，不将 100 个资源冒充损坏。

SSE 在成功提交后唤醒并从持久 Outbox 回放；空闲心跳不查模型或轮询 Store。有界队列、慢消费者关闭、重复 eventId 和断线/cursor 重连明确处理。CLI 只经 API 查询/回放，不直读数据库。

`task.respond` 的 pending-question 消费和 `task.confirm-result` 的可信验证仍 unsupported；客户端文本/evidenceRef 不能认证成功。P1-06 接完整认知协调，P1-07 接验证/Episode，P1-08 接界面。

## 验证和回滚

完整代码曾在临时工作区通过组件测试，但随后该工作区不可访问。本候选重新构建；旧测试数字不作为新 HEAD 证据，必须重新执行完整检查、独立 R3 和交付门。可恢复源码仅在逐字/hash 核实后标记，不能因行为相似称同一旧 tree。

仅正常类型、纯 reducer、隔离 SQLite、合成进程、HTTP/CLI/SSE 开发验证；旧 #90/preintegration-safety、Private/链接替换/备份攻击或等价争议动态诊断不执行。真实个人数据、账户/模型凭据、外发、部署、新持续权限不启用。Windows、硬件断电、生产备份/恢复和真实体验未验收。

回滚先停止接纳、关闭 API、排空/停止 Worker，保留已提交历史。代码经新受审 revert PR 回退；已应用 0003 不做破坏性 down migration，采用前向修复或既有控制状态恢复。恢复游标/重新配对不删除 durable receipt。
