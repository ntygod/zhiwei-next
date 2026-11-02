# 云端部署、设备与恢复

状态：SA1 设计。默认云端；本地和混合部署使用同一领域、权限和协议，不维护三个产品分支。

## 1. 部署形态

| 形态 | 控制面与认知 | 执行位置 |
|---|---|---|
| 云端默认 | 云主机上的服务、PostgreSQL、私有对象存储、Secret Manager | 云端受控沙箱 |
| 本地 | 同一服务在个人设备，数据库与内容在用户选定目录/服务 | 本机受控执行环境 |
| 混合 | 云端保持 Router、状态、调度与获准记忆 | 云端 + 用户注册的一个或多个设备 |

本地模式不意味着降级为没有身份和授权的裸目录。默认 cloud placement 与 device placement 可按资料类别选择，任务选环境时必须同时满足位置、工具、资源和数据外发限制。

## 2. 计算、状态、环境分离

控制面与 Worker Host 不把持久状态放容器可写层。PostgreSQL 是控制事务真源，S3/文件对象适配器保存内容，Runtime Session 使用易失内存；容器替换后按当前状态重建。

执行环境包含用户未提交文件、私有服务与系统工具，不要求整体同步到云端。Execution Agent 只暴露获准能力与资源；云端请求精确内容/动作。设备离线时依赖它的任务进入 waiting-device，其他环境的独立任务继续。

未决动作的回执可以暂存设备受保护的本地 journal，内容为已登记 actionId、状态和必要结果引用，不是另一份全局认知数据库。重连后先上传/核对回执，再接受新工作。

## 3. 进程与网络

```text
公网 HTTPS
  -> 反向代理 / Owner 身份认证
  -> control-plane（API、Router 协调、Connector、Memory、队列）
     -> PostgreSQL / 内容对象 / Secret Manager
     -> worker-host pool（独立 Harness Profile；仅经 Gateways）
     -> execution-agent（受认证出站连接；具体 Job）
  supervisor（独立进程，只读监测与有限恢复命令）
```

内部 API 使用独立服务身份，连接同时验证安装 ID、Owner、设备与协议版本。外部请求不能选择任意 worker address 或数据库 schema。PostgreSQL、内容桶和内部 Gateway 不直接暴露公网。

服务镜像、Node、Harness/Cordis、知微 Bundle、连接器和数据库扩展固定精确版本/digest。制品构建与源代码调研分开；源码 HEAD 支持某接口，不等于发布制品已满足合同。两个 Harness Profile 使用各自隔离的 DSH_HOME、工作目录、环境和已核验组合；禁用隐式机器/home overlay、默认日志上传、原始会话持久化、非白名单 Provider/工具以及 Agent 可用的插件管理。进程启动前预置只读 Profile，并用不可写挂载/ACL 封锁 DSH_HOME/logs 的原始启动诊断文件；stdio 由易失管道捕获，不让容器日志驱动原样收集。该限制必须同时通过正常启动与含合成秘密的失败启动验证。

Profile 成员在生产中固定，不使用 HMR 热切换活跃执行。配置更新先冻结新接纳、排空或记录未决工作、切换组合并验证 readiness，再恢复；失败保留明确的不可用/回滚状态，不能把上游 Loader 的部分激活当成原子配置提交。所有调度器、监听器和注册由 Cordis effect 持有；需要先后顺序的停止、回执核对、Agent dispose 和连接释放必须放在同一个显式有序 disposer，不能假定不同异步 disposer 串行执行。

## 4. 启动与关闭

启动顺序：验证配置/身份 → 检查 schema 和独立控制 head → 恢复资格限制 → 核对旧租约/未知动作 → 建立受控 Gateway → 启用读取/API → 启用任务派发与 Sources。

未完成恢复之前不启动模型、Connector 写入或自动任务。业务 readiness 与进程 liveness 分开。

正常关闭先调用知微内部 drain 端口，而非直接发送 SIGTERM：拒绝新派发 → 保存队列/输入 → Worker/Job drain → 保存回执或 unknown → 显式 dispose AgentHandle → 确认业务 drain 结果。控制面的 Gateway、账本与回执通道保持可用，先排空 Worker，控制面最后排空。

知微业务 drain 的默认预算为 15 秒。之后 Supervisor 发送 SIGTERM，官方 CLI 的原生 root 清理预算固定为最多 5 秒；部署终止宽限须覆盖业务 drain、原生清理及通信余量，默认至少 25 秒。平台的 pre-stop/服务停止流程必须调用 drain 端口，不能只是把 SIGTERM 后的等待设为 15 秒并假定 CLI 会等待。

业务 drain 超时、直接 SIGTERM/SIGINT、第二次信号导致立即退出或强杀，都记录为未证明干净关闭。原生退出 0 不改变业务成功状态；保留或恢复 unknown、丢失绑定与资源 quarantine，再按 EffectFence/Checkpoint 核对。无法保存的最新状态如实标 incomplete，不假称关闭一定保存最终 turn/end。

## 5. 高可用与扩展

API 和 Worker Host 可扩容；同一 Router mailbox 分区与 Task Assignment 只有一个有效持有者。PostgreSQL 事务分配单调 fencing token；租约续期使用数据库时钟，节点墙钟不授予所有权。

旧节点网络分区后不能再领取新动作；恢复连接时必须取得新绑定，旧 token 永久无效。不可通过同时激活两个相同 Session 获得吞吐。

Router 先按事件批处理和订阅直通减压；达到可测瓶颈后按明确的 audience/workspace 分区扩展，同一用户的跨分区协调仍通过统一事实源。队列公平和限额优先于无限增加 Worker。

## 6. 故障恢复矩阵

| 故障窗口 | 处理 |
|---|---|
| Trigger 已保存但未路由 | 重领 Inbox，按原 input/event ID 去重 |
| Task 已领取、Worker 未启动 | 失效旧 lease，确认无派发后重新分配 |
| Runtime 崩溃，尚无外部动作 | 以当前 Manifest 重建新 Session，保留失败；必要异步 Job 未结束时继续等待 |
| Job 已运行，Worker 不在 | Execution Agent/Job Supervisor 继续报告；新 Worker 读取已知结果 |
| 写动作可能完成、回执丢失 | unknown → 查询回执/资源状态；不盲重发 |
| 消息已投递、Outbox 未确认 | 以目的系统幂等键核对；不支持时进入人工核对 |
| 对象上传成功、目录提交失败 | 不可见孤儿，按保留期限清理 |
| DB 可用、对象缺失/损坏 | 对应内容 unavailable，关联任务受阻 |
| 设备离线 | waiting-device；有限合并唤醒，不能伪装执行 |
| 控制库不可用 | 拒绝新授权/派发；只显示明确陈旧的无敏感状态 |
| Supervisor 崩溃 | 部署管理器重启；Worker 仍受 deadline/lease 硬限制 |
| 任务无有效进展 | 有界诊断，必要时暂停；不把正常等待当故障 |
| 旧写请求在途、lease 到期 | 保持资源 quarantine，直到效果最终性被证明；不让新 Task 抢占冲突写 |
| 恢复快照遗漏备份后的已确认动作 | 重放独立 EffectFence，补回效果/核对屏障，不能新建 actionId 重做 |

## 7. 备份与恢复

备份清单关联 PostgreSQL 一致快照/恢复位置、文档提交水位、被引用的不可变内容对象、配置版本、来源版本，以及同一数据库快照中的 appliedInvalidationHead 和 appliedEffectHead。两者是已完整、无缺口地投影进该快照的连续水位，绝不能用备份期间独立域的最新 head 代替。备份工具须证明表内容与水位来自同一一致快照。对象先落盘再提交目录，因此快照引用的对象必须存在；备份完成前核对清单，不能只复制数据库。

备份加密并限制恢复主体；普通内容备份不包含可直接使用的长期凭据。独立失效 head 与效果 head 均不随普通备份回滚，其可用性和最新性必须有单独恢复方案。普通上下文仍受实际备份 RPO 限制；失去上下文不允许重新执行已发生的动作。

恢复到隔离实例 → 验证备份及其 applied 水位与实际数据库一致 → 获取当前独立失效/效果 heads → 从各自 applied 水位后连续重放至当前上界 → 施加纠正/删除/撤销 → 补回效果与资源 quarantine → 创建 recoveryEpoch → 旧 Grant/审批/自动调度 inactive → 核对快照前仍 pending/unknown 及重放窗口内全部相关动作 → 分别解除已核对屏障 → 所有者重新授予必要权限 → 仅开放满足全部条件的业务。

如果任一当前独立 head 不可取得，恢复停留在隔离状态。重新授权不能解除效果核对屏障。不能为了可用性重新启用旧记忆或授权，也不能只检查旧快照里恰好标为 unknown 的动作。已删除正文的物理副本、密钥和外部备份处理分别报告。

## 8. 配置与升级

配置采用 desired/validated/committed/draining/disposed 生命周期。先验证能力、连接、资源与版本，再提交；失败保留 last-known-good 并报告未应用原因。权限收紧立即生效；工具/模型普通变更只影响新请求或新 Session。

数据库前向迁移有 schemaVersion 和恢复方案，不改写已应用迁移。软件回滚不回滚用户纠正、删除、授权和实际效果账本。升级先停止新派发并核对活跃任务，再切换制品；不能依赖 Runtime 内存作为唯一恢复状态。

## 9. 可观测性与运行初值

记录入队延迟、等待年龄、Router 批量大小、Worker 利用率、输入应用延迟、完成/失败/未知、预算、验证结果、候选准备收益、通知负担与恢复耗时。按受控 ID 关联；不记录原始思维链、秘密或默认全量正文。

控制命令接收 p95≤500ms；无模型状态查询 p95≤300ms；正常重启后 60 秒内进入可解释的 ready/waiting/reconciliation 状态。以上是验收目标，需要声明硬件与负载，不宣称保证所有外部服务时延。

每个队列有条数/字节/期限上限，stream delta 可合并，唯一终态与权限控制事件不得丢弃。外部遥测默认关闭；获准导出先生成脱敏清单。完整 D01—D09 故障与持续运行验收见[验收](acceptance.md)。
