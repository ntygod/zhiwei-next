# 当前执行决议

由 current-decisions.json 生成；运行 node scripts/check-current-decisions.mjs --write-view 更新。原提案见 [历史源登记](decision-register.md)，表示合同见 [执行状态层说明](decision-execution-layer.md)。

Evidence Ready 只表示有限证据待决策审查；Accepted 只覆盖该项文字范围。这里不计算 G-1、任何工作包或阶段完成，不授予产品入口权限。Evidence Ready 校验当前候选文件；终态只保留历史证据一致性，不评估当前产品适用性。GitHub URL 与本地摘要不是批准认证；最终完整 HEAD 的独立审查、CI 与合并仍遵守既有治理。

冻结源：docs/planning/work-packages.json，SHA-256 `3f5bb54e33fa4c31420df04cf9a167142dac78fd5cd57481222dbdf01afd8ec5`。

## D-01

当前状态：**Accepted**

状态路径：Proposed → Evidence Ready → Accepted

- ADR：[docs/adr/0008-session-record-reconstruction-boundary.md](../../docs/adr/0008-session-record-reconstruction-boundary.md)；正文摘要（仅归一化状态行）：`1fe3c356afad6cfa81dd27c78dd21b011a9ddbb1165da1f549a2862b6a763380`

有限选择：选择 M0 无记忆会话的分层输入记录合同：获准正文或不可变可解析引用、有序组成、实际观测边界和不可变 revision；认知上下文扩展留给 M2。

决议范围摘要：`8db7ad2c3c26e7270d653ba88058487855b706a418647a7508797165277e4b7f`

### 适用范围

- 请求绑定当时完整验证并发布的合同/产品配置 revision；变更产生新 revision，不从当前配置倒推历史。
- 内容必须有获准正文或经摘要校验的不可变可解析引用；摘要不是内容。保留有序组成和来源，缺失、漂移、乱序明确失败。
- 完整性只到实际观测并保存完整的边界；Runtime/Provider 未观测变换明确未证明。事件回放、输入重建和输出复现分开。
- M0 不注入长期记忆；M2-3/4 再扩展 Claim 版本、认知水位、Compiler revision、Context Capsule 和选择依据。禁止保存原始思维链。

### 非保证

- 不冻结实验字段、Map 或 synthetic reference 为产品协议，不改变 v1。
- 没有真实 Pi/Provider 输入采集、隐藏提示/后续变换重建或相同输出复现保证。
- 不授权真实正文保留，不证明持久化 revision 事务、跨进程 owner 或并发。

### 保留前置

- D-04/G-2：正文/引用、删除/遗忘、日志/缓存/备份保留和不可重建结果；真实数据前授权。
- D-09/M0-2/3：逻辑/Runtime Session 与 Instance 关联、字段/版本、owner/epoch/并发与持久事务。
- M0-3：正式合同、写读/重启和历史 revision 产品测试；D-07/G-3、M0-4/8：真实支持版本、选定 Pi 路径及 E0-09。
- D-05/M0-6：摄取确认、提交、投影、模型成功和 gap/incomplete 独立；M2-3/4：认知扩展另行验证。

### 实验身份与观测

- 实验来源：[https://github.com/ntygod/zhiwei-next/pull/79](https://github.com/ntygod/zhiwei-next/pull/79)；完整 HEAD `9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d`；观测 2026-10-08T14:00:53Z；Node 22.23.1
  - [docs/spikes/session-reconstruction/experiment.mjs](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/docs/spikes/session-reconstruction/experiment.mjs)（历史快照）：`b9be5d24401d1e07a51b2c4ea0f7c0739aaaaa7555c4b6b550c636994628d620`
  - [docs/spikes/session-reconstruction/experiment.test.mjs](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/docs/spikes/session-reconstruction/experiment.test.mjs)（历史快照）：`1c0d00515c3cba61f7748ffc35107a3bad2f47ff957c46d432421e389ec067f3`
  - [packages/domain/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/domain/src/index.ts)（历史快照）：`ea6dd01fcf985d7493ffc6640010be0c74434a4621d7189165b543bbd7c1fdd0`
  - [packages/protocol/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/index.ts)（历史快照）：`f79cf69248c6594284bb1f4c33ba8d15faf1a2e2d5b3e917c37c809acb2e27be`
  - [packages/protocol/src/lossless-json.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/lossless-json.ts)（历史快照）：`4095a4d6e3e0560b9e25e5c0ebcb894ac45fe4057989255bb35fb14b0174c59a`
  - [packages/protocol/src/runtime-event-payload-v1-core.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-payload-v1-core.ts)（历史快照）：`8739d8cf87e0b23f9c2ca2dcf0bca16adfa44c19c69953810d514a2849f3d9e8`
  - [packages/protocol/src/runtime-event-payload-v1.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-payload-v1.ts)（历史快照）：`af4271fb8bc2b14a171a1b67c76f144bed973e1f9a5896e8eb6596f434a43688`
  - [packages/protocol/src/runtime-event-r2-review-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-r2-review-v1.test.ts)（历史快照）：`69cfd0c42564ee70581ee382e0df844b2decb5b02c00fc80de6d8755e073c4fd`
  - [packages/protocol/src/runtime-event-retry-correlation-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-retry-correlation-v1.test.ts)（历史快照）：`5bdd1658471ee0b6a3478ececff057a48a3e559982d5db124f211a89081ee74a`
  - [packages/protocol/src/runtime-event-session-replacement-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-session-replacement-v1.test.ts)（历史快照）：`13cecdeede6afe8ed99f238b5a775fe41bcd78f12c848497b03dc477180ed656`
  - [packages/protocol/src/runtime-event-stream-v1-core.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-stream-v1-core.ts)（历史快照）：`c50785012323df52b004267c2ca2b3c7abaa05a389e415b93e3a9cc839ce514e`
  - [packages/protocol/src/runtime-event-stream-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-stream-v1.test.ts)（历史快照）：`c90d96fca8619275ee05b96d75961be79eeeb37c4b932d168eddf9bfa99ff28f`
  - [packages/protocol/src/runtime-event-stream-v1.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-stream-v1.ts)（历史快照）：`76056a9ce8d1e687905248c6bf8b52a8773da9f93da556d672d2f428d124ee9e`
  - [packages/protocol/src/runtime-event-v1-core.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-v1-core.ts)（历史快照）：`04a4c2b9c41ff473ba149245cf8b25efaf68052886abcf911aba3d8e6c132244`
  - [packages/protocol/src/runtime-event-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-v1.test.ts)（历史快照）：`f5a9bb39268199e30d409826c9a6357d50c1b95e208f62fdc91040b31f802755`
  - [packages/protocol/src/runtime-event-v1.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-v1.ts)（历史快照）：`41d03bdfeacd85c86264968e26534de9b00232c9c6ca17a473daca0fb20ba918`
  - [packages/protocol/src/sha256.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/sha256.ts)（历史快照）：`d3543537fa3d15f394fcdae0c06889b4f2181ad1d4ed1ec671b7f658707870a0`
- 命令：`node --experimental-strip-types --test docs/spikes/session-reconstruction/experiment.test.mjs`；exit 0，tests/pass 50/50，fail/skip/todo 0/0/0

决策审查记录：[decision-accepted](https://github.com/ntygod/zhiwei-next/pull/81#issuecomment-6062783403)；被审 HEAD `4eae854403dc6596a0db7297dcf756137c848ec7`；绑定 D-01 / `8db7ad2c3c26e7270d653ba88058487855b706a418647a7508797165277e4b7f`；记录观测 2026-10-08T15:05:32Z。其真实性/完整范围须查远端原文；该历史记录不批准后续完整 HEAD。

## D-02

当前状态：**Accepted**

状态路径：Proposed → Evidence Ready → Accepted

- ADR：[docs/adr/0009-ledger-schema-evolution-boundary.md](../../docs/adr/0009-ledger-schema-evolution-boundary.md)；正文摘要（仅归一化状态行）：`abf9d2edd70c0611b7b6201fb5bb6b73325cb6ff86e6e9dccd15fa90cc1a4a4d`

有限选择：选择同一 SQLite 真源内的模块私有前向迁移与版本化 reference manifest，当前完整对象域明确为 table/index/trigger；当前不选分库。

决议范围摘要：`ee6c3bbb0390d1c942356b08df8434c1ea6d61a45255f0a146fd9484177faa6c`

### 适用范围

- 已应用 migration/version/name/checksum/history 不改写；先验旧 Schema/canonical rows，pending DDL/history/user_version/最终验证在单一事务提交。失败恢复旧态；COMMIT 后错误须读回确认。
- 合法新增对象进入相应版本 manifest；table/index/trigger、quoted SQL signature、STRICT、table_xinfo/index_xinfo 范围内的未知、额外或弱化对象 fail closed。
- 公开 API 不提供 migrations/manifest override 或关闭验证；旧程序遇新库拒绝，代码 revert 不是数据库降级。
- view 不在当前覆盖，不新增 view 支持或承诺拒绝任意 SQLite 对象。未来使用/保护 view 先明确覆盖并补正反测试。
- 未来如以真实需求改选分库，须新决议明确每库真源、跨库提交/Outbox/对账/恢复，不能绕过 manifest。

### 非保证

- 合成 v2 不是生产迁移、Workspace/Session 表或公开升级 API。
- 原 runner 旧态 prevalidation 在 BEGIN IMMEDIATE 之前；单 owner 实验不证明跨连接排他、无竞态或多 owner 升级协调。
- 进程退出不是断电/OS crash/设备故障证明；闭库合成备份不证明在线备份、并发恢复或已实现生产前向修复。
- 不保证 view 或任意 SQLite 对象全拒绝；不提供性能预算。

### 保留前置

- D-09/M0-2：升级排他、旧 owner 复活、新旧进程同时打开/写入及 prevalidation 时间窗。
- M0-2/M1-1：实际领域 Schema、全行验证、正式版本选择/升级、兼容/失败/重开/旧程序拒绝与恢复证据。
- D-03/G-5：设备/负载预算、锁竞争、磁盘满/权限/损坏/恢复失败及持久性；不得放宽 manifest。
- 使用 view 或声称全对象防漂移前扩展明确覆盖；在线备份/并发恢复进入产品范围时单独验收。

### 实验身份与观测

- 实验来源：[https://github.com/ntygod/zhiwei-next/pull/79](https://github.com/ntygod/zhiwei-next/pull/79)；完整 HEAD `9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d`；观测 2026-10-08T14:00:54Z；Node 22.23.1
  - [packages/domain/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/domain/src/index.ts)（历史快照）：`ea6dd01fcf985d7493ffc6640010be0c74434a4621d7189165b543bbd7c1fdd0`
  - [packages/memory-store/fixtures/schema-evolution/candidate.mjs](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/fixtures/schema-evolution/candidate.mjs)（历史快照）：`090f86450531aeb8dfb1c1b825b6c3820c80a006ae6035fefb97254beb6dfe6c`
  - [packages/memory-store/fixtures/schema-evolution/crash-worker.mjs](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/fixtures/schema-evolution/crash-worker.mjs)（历史快照）：`6b93233890703bfc8e55e99c84f763608a94fd00bb4f3ef8fe5946e475a5d062`
  - [packages/memory-store/fixtures/schema-evolution/experiment.test.mjs](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/fixtures/schema-evolution/experiment.test.mjs)（历史快照）：`4652841f8a025eeb0e4b2d2dccd729748bf6f5a79bd5099eae552d916da36922`
  - [packages/memory-store/fixtures/schema-evolution/manifest-coverage-probe.mjs](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/fixtures/schema-evolution/manifest-coverage-probe.mjs)（历史快照）：`001013c766d301d71792f2873c1fa745a1220d1a0324d44146f004fe358d9052`
  - [packages/memory-store/migrations/0001_normalized_runtime_event_v1.sql](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/migrations/0001_normalized_runtime_event_v1.sql)（历史快照）：`e0afaf4aec1f4fb91d4fabef94f0c4ca1bb7a32e97f1f2b61d6df6333d36e31c`
  - [packages/memory-store/src/index.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/index.test.ts)（历史快照）：`491ff7f57fe6118108dd6430c95167d54d0dde63dbaff89c2607e789cfecfc67`
  - [packages/memory-store/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/index.ts)（历史快照）：`07e2a1e891faedb2c9c3deac79d38fcb0be88c1beb9aff72337e2824c9451ad5`
  - [packages/memory-store/src/migrations.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/migrations.ts)（历史快照）：`e5c0822bf9cdb1168c7764844e18b80ee407dc63fd35532520c5f33e6ca919bd`
  - [packages/memory-store/src/sqlite-observation-ledger-r2-fifth.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/sqlite-observation-ledger-r2-fifth.test.ts)（历史快照）：`7c8fab36cffe94887f4fc3991c29a360c13edba672fe7d861301f5bf7bc931a0`
  - [packages/memory-store/src/sqlite-observation-ledger-r2-third.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/sqlite-observation-ledger-r2-third.test.ts)（历史快照）：`2b2689f7dc07ac316881df848bec9a58c1d00a04826797ac71e4527636b88866`
  - [packages/memory-store/src/sqlite-observation-ledger.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/sqlite-observation-ledger.test.ts)（历史快照）：`2b2511b73e6b81b736ffadd0b2eca7baefd6d37c422839dbbf27de3c6228e2d8`
  - [packages/memory-store/src/sqlite-observation-ledger.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/sqlite-observation-ledger.ts)（历史快照）：`11cfab3aa2fa861ef40a7e9e14a01e7a3c27e7e12801393c0f8ed461c801551b`
  - [packages/memory-store/src/sqlite-schema-sql.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/sqlite-schema-sql.ts)（历史快照）：`1247cb17435915fa54a454263f51586f6cc158b702ff377f175cfcc892179622`
  - [packages/protocol/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/index.ts)（历史快照）：`f79cf69248c6594284bb1f4c33ba8d15faf1a2e2d5b3e917c37c809acb2e27be`
  - [packages/protocol/src/lossless-json.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/lossless-json.ts)（历史快照）：`4095a4d6e3e0560b9e25e5c0ebcb894ac45fe4057989255bb35fb14b0174c59a`
  - [packages/protocol/src/runtime-event-payload-v1-core.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-payload-v1-core.ts)（历史快照）：`8739d8cf87e0b23f9c2ca2dcf0bca16adfa44c19c69953810d514a2849f3d9e8`
  - [packages/protocol/src/runtime-event-payload-v1.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-payload-v1.ts)（历史快照）：`af4271fb8bc2b14a171a1b67c76f144bed973e1f9a5896e8eb6596f434a43688`
  - [packages/protocol/src/runtime-event-r2-review-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-r2-review-v1.test.ts)（历史快照）：`69cfd0c42564ee70581ee382e0df844b2decb5b02c00fc80de6d8755e073c4fd`
  - [packages/protocol/src/runtime-event-retry-correlation-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-retry-correlation-v1.test.ts)（历史快照）：`5bdd1658471ee0b6a3478ececff057a48a3e559982d5db124f211a89081ee74a`
  - [packages/protocol/src/runtime-event-session-replacement-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-session-replacement-v1.test.ts)（历史快照）：`13cecdeede6afe8ed99f238b5a775fe41bcd78f12c848497b03dc477180ed656`
  - [packages/protocol/src/runtime-event-stream-v1-core.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-stream-v1-core.ts)（历史快照）：`c50785012323df52b004267c2ca2b3c7abaa05a389e415b93e3a9cc839ce514e`
  - [packages/protocol/src/runtime-event-stream-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-stream-v1.test.ts)（历史快照）：`c90d96fca8619275ee05b96d75961be79eeeb37c4b932d168eddf9bfa99ff28f`
  - [packages/protocol/src/runtime-event-stream-v1.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-stream-v1.ts)（历史快照）：`76056a9ce8d1e687905248c6bf8b52a8773da9f93da556d672d2f428d124ee9e`
  - [packages/protocol/src/runtime-event-v1-core.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-v1-core.ts)（历史快照）：`04a4c2b9c41ff473ba149245cf8b25efaf68052886abcf911aba3d8e6c132244`
  - [packages/protocol/src/runtime-event-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-v1.test.ts)（历史快照）：`f5a9bb39268199e30d409826c9a6357d50c1b95e208f62fdc91040b31f802755`
  - [packages/protocol/src/runtime-event-v1.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-v1.ts)（历史快照）：`41d03bdfeacd85c86264968e26534de9b00232c9c6ca17a473daca0fb20ba918`
  - [packages/protocol/src/sha256.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/sha256.ts)（历史快照）：`d3543537fa3d15f394fcdae0c06889b4f2181ad1d4ed1ec671b7f658707870a0`
- 命令：`node --experimental-strip-types --test packages/memory-store/fixtures/schema-evolution/experiment.test.mjs`；exit 0，tests/pass 35/35，fail/skip/todo 0/0/0

决策审查记录：[decision-accepted](https://github.com/ntygod/zhiwei-next/pull/81#issuecomment-6062783403)；被审 HEAD `4eae854403dc6596a0db7297dcf756137c848ec7`；绑定 D-02 / `ee6c3bbb0390d1c942356b08df8434c1ea6d61a45255f0a146fd9484177faa6c`；记录观测 2026-10-08T15:05:32Z。其真实性/完整范围须查远端原文；该历史记录不批准后续完整 HEAD。

## D-03

当前状态：**Proposed**

状态路径：Proposed

正式决策审查：尚无；实验 PR 的批准不用于接受本决议。

## D-04

当前状态：**Proposed**

状态路径：Proposed

正式决策审查：尚无；实验 PR 的批准不用于接受本决议。

## D-05

当前状态：**Proposed**

状态路径：Proposed

正式决策审查：尚无；实验 PR 的批准不用于接受本决议。

## D-06

当前状态：**Proposed**

状态路径：Proposed

正式决策审查：尚无；实验 PR 的批准不用于接受本决议。

## D-07

当前状态：**Accepted**

状态路径：Proposed → Evidence Ready → Accepted

- ADR：[docs/adr/0011-formal-toolchain-baseline.md](../../docs/adr/0011-formal-toolchain-baseline.md)；正文摘要（仅归一化状态行）：`59fb32eb0886b9507282c5919ce52c4860c1265d2a7c4bdde8c5bcf0ca224c4c`
- ADR：[docs/adr/0013-pi-cli-jsonl-worker.md](../../docs/adr/0013-pi-cli-jsonl-worker.md)；正文摘要（仅归一化状态行）：`bc73c1c77d2af32df103b3d81659e24ef466d0713ed28213cb09343c58a34c20`

有限选择：固定 ADR 0011 精确工具链；选择 Pi 0.84.1 官方公开 bin.pi → dist/cli.js、明确 Node executable 与 --mode rpc 的 stdio JSONL Worker，作为 M0 后续正式 Adapter 的单一执行方向。

决议范围摘要：`b13ccee54ba167fc7553d517ad60154ebf7a0a88c2df8e1f87082d1c19d9d764`

### 适用范围

- Node 22.23.1 / npm 10.9.8 / TypeScript 5.9.3 / @types/node 22.19.19 / Pi 0.84.1；147 项固定依赖闭包、完整 strict 源码及声明检查沿用 PR #83 的实证。
- ./client 是 RemoteSession/CBOR 类型面；它不证明 stdio RpcClient 可用。根 SDK 46 个声明诊断仍不支持，不切换 ./rpc-entry 或第二生产路径。
- 沿用 PR #60 SDK/RPC 与 PR #64 Worker 的来源表面、framing、恢复及部署实证；本轮仅在 main41b1f8a 历史快照复跑现有检查，未重复采集生命周期。
- 后续在同一 #86 primary 把内部严格编译的有限启动/JSONL 合同接到现有 pi-rpc-state 零 prompt 消费者；该实现不属于本次有限决策批准。

### 非保证

- 不把历史快照复跑称为 PR #83 原始运行；sourcePr 为实验真正来源，当前 evidence.head 为包含这些实验的后来 main。
- 不批准新实现或声明 G-3/M0-4/M0 完成；完整编译中的 57 source roots 不是 TAP 57 tests，过程 wrapper 计数按实际输出。
- 无 Docker 的本地运行只复验 committed fixture 与合成负例，不是 fresh Runtime capture 或当前 PR 的 live provenance，不外推真实 Provider/网络/用户数据。
- 环境 allowlist 和 --offline/--no-tools/--approve 不是 OS sandbox 或 blanket approval；恶意同 UID、文件/内存写读者和不可信初始 Node/包不在保证范围。
- D-04/D-08、G-2 文件/工具/Private 外发/保留与 M0-3/4/5 仍待各自验收；本地诊断 token 不授予数据或工具权限。

### 保留前置

- 同一 primary 的独立 D-07 决策审查必须绑定真实 Evidence Ready HEAD、两份 ADR 正文与 proposalSha256；sourcePr 不得等于新 primary；不得借实验批准接受决策。
- 独立接受前所有列名证据保持历史 blob/当前候选/hash 三方一致；接受后才修改 probe 并由真实子进程负例验证启动、环境、strict JSONL、关联、退出/deadline/cleanup 和秘密不出日志。
- 后续新完整 HEAD 需要独立 R3、完整 npm check、原计划/current-decision 正反测试、fresh 既有 CI 矩阵与当前 PR 来源验证，受保护合入及 main 回读。
- 按原 G-3 三完成条件逐项验收版本、无凭据固定闭包及兼容矩阵；不自动完成工作包，不修改冻结源 JSON/checker/历史登记或验收标准。

### 实验身份与观测

- 实验来源：[https://github.com/ntygod/zhiwei-next/pull/83](https://github.com/ntygod/zhiwei-next/pull/83)；完整 HEAD `41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415`；观测 2026-10-08T22:18:56Z；Node 22.23.1
  - [.github/workflows/ci.yml](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/.github/workflows/ci.yml)（历史快照）：`540cb091f44e9882c929e285c4111b832f87a08d06d44b91ff85a530a8313406`
  - [.node-version](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/.node-version)（历史快照）：`7d2df647f25529bd87500319c41564e032e2be642e565350fa6136d7a1ec4d10`
  - [.npmrc](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/.npmrc)（历史快照）：`b4ea99f73d68c12f437fc4853b2fec3db413ae8141c6f7ceab5fa35bbffd1456`
  - [apps/cli/src/doctor.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/apps/cli/src/doctor.ts)（历史快照）：`4563d1a5bc5d0c4b85a914b4d71cd2015921ceb3082a2e69e622617199d5826f`
  - [apps/cli/src/index.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/apps/cli/src/index.test.ts)（历史快照）：`00ca60c4885e96bcf650dfb479476736f9268de2b837af16039a87c02899380c`
  - [apps/cli/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/apps/cli/src/index.ts)（历史快照）：`eb1fd6fe33269c70f77b95d10a16aeec6cf92be0a006784730019003fcb08a37`
  - [apps/daemon/src/index.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/apps/daemon/src/index.test.ts)（历史快照）：`f73820a4ee7bf6bbe69d2627319e54af9a0f64cfbd44aac9369966bdee9e1f53`
  - [apps/daemon/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/apps/daemon/src/index.ts)（历史快照）：`a76e6aee924bbfe5affe19693a185db29f7cc1c33c869f0a3614804dfbc3f27b`
  - [apps/daemon/src/local-api-security.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/apps/daemon/src/local-api-security.ts)（历史快照）：`c6b2d478685481ff34086316e8e0f2fb6a5488a974b2f152c0af0f40d0b558f8`
  - [package-lock.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/package-lock.json)（历史快照）：`34c8f81503afaf21f3e86f7340315f7e7199462b21d27fdb5c78637093fbd2a1`
  - [package.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/package.json)（历史快照）：`a1092dab5112bf2b6ee8d58b8152a5b1348d95420b888257c86b83ff3e45cba9`
  - [packages/cognition-core/src/index.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/cognition-core/src/index.test.ts)（历史快照）：`5d5bc3436a793464ee76ce1938778c074ba4a86ff163532756054c1bf6c3a071`
  - [packages/cognition-core/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/cognition-core/src/index.ts)（历史快照）：`218c065e7f034afd095d71174186e6fead411e76288ae81551961d0de24b5b9a`
  - [packages/context-compiler/src/index.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/context-compiler/src/index.test.ts)（历史快照）：`b0cf6ef41c3c2e14489744eb2071f9864f78bad0e295a9888501752b1061d602`
  - [packages/context-compiler/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/context-compiler/src/index.ts)（历史快照）：`c816620445cdef644b674c57c65636a7d06e128082a0c92c7ad0886e0dd76499`
  - [packages/domain/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/domain/src/index.ts)（历史快照）：`ea6dd01fcf985d7493ffc6640010be0c74434a4621d7189165b543bbd7c1fdd0`
  - [packages/evals/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/evals/src/index.ts)（历史快照）：`afaa7655d2fc5a040904818057755b969106924fd8beb5df3999b3ad5f173cf5`
  - [packages/memory-store/src/index.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/memory-store/src/index.test.ts)（历史快照）：`491ff7f57fe6118108dd6430c95167d54d0dde63dbaff89c2607e789cfecfc67`
  - [packages/memory-store/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/memory-store/src/index.ts)（历史快照）：`07e2a1e891faedb2c9c3deac79d38fcb0be88c1beb9aff72337e2824c9451ad5`
  - [packages/memory-store/src/migrations.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/memory-store/src/migrations.ts)（历史快照）：`e5c0822bf9cdb1168c7764844e18b80ee407dc63fd35532520c5f33e6ca919bd`
  - [packages/memory-store/src/sqlite-observation-ledger-r2-fifth.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/memory-store/src/sqlite-observation-ledger-r2-fifth.test.ts)（历史快照）：`0ffa74fdbc176059f5d812dee71eec4be35002af047440aa8e25b50833d71f03`
  - [packages/memory-store/src/sqlite-observation-ledger-r2-third.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/memory-store/src/sqlite-observation-ledger-r2-third.test.ts)（历史快照）：`0d274e2d2a3f0feba2ed5572f6f31a0ac39d3716742e7bf36de4572e17f3f848`
  - [packages/memory-store/src/sqlite-observation-ledger.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/memory-store/src/sqlite-observation-ledger.test.ts)（历史快照）：`80df79aa911d85ed1dd191d5b743d8383b927ed5c52b786fe0c69efe1940d067`
  - [packages/memory-store/src/sqlite-observation-ledger.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/memory-store/src/sqlite-observation-ledger.ts)（历史快照）：`b962702d7bab19b88fc3ca861eaeb97948a8d2fd0fcfee458e01ec041ec1ffe0`
  - [packages/memory-store/src/sqlite-schema-sql.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/memory-store/src/sqlite-schema-sql.ts)（历史快照）：`1247cb17435915fa54a454263f51586f6cc158b702ff377f175cfcc892179622`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/pi-sdk-rpc-parity-fixture.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/pi-sdk-rpc-parity-fixture.mjs)（历史快照）：`b10a8c677ca86e75463f1cb672e56b5d6282512684ee7daf042c651b26ae6f13`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture.mjs)（历史快照）：`e5c8b5146f4a6e6e24437601e1ea23118468ed40cd9c8c411d716e20d4da6144`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provenance.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provenance.mjs)（历史快照）：`476dbbfe2ff176ad120e1b6803d886bbff9955aca7e2e4f24d932525cfcf0153`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-sdk-provenance-base.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-sdk-provenance-base.mjs)（历史快照）：`db918649416601aad1b6a92b3415a139bf4230cdf32cb6b7c0d16c45000ad1d5`
  - [packages/pi-adapter/fixtures/pi-upstream-baseline.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-upstream-baseline.json)（历史快照）：`a57684f71ed53a95e717e27d93b158492bba1cc9b0f808de4469cba98c09d76e`
  - [packages/pi-adapter/src/index.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/src/index.test.ts)（历史快照）：`4094b209beb9eedfdba92e7bbd3e5ce5329e76a4ec510f58d468954aca046c4f`
  - [packages/pi-adapter/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/src/index.ts)（历史快照）：`eb416dd607953a55244993657799bf523445e27b17740bd4b58c46b145bee638`
  - [packages/pi-adapter/src/normalized-runtime-event-r2-review-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/src/normalized-runtime-event-r2-review-v1.test.ts)（历史快照）：`45d8c74f25feb335df1bc8c0ac4019960bddfc42b85d6d9f0f28b4dd4cb8a55f`
  - [packages/pi-adapter/src/normalized-runtime-event-retry-correlation-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/src/normalized-runtime-event-retry-correlation-v1.test.ts)（历史快照）：`fc55025aafd18dbfa3189b1bc67c45d49d1e9d14886941fef5a53e7f79c236a9`
  - [packages/pi-adapter/src/normalized-runtime-event-session-replacement-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/src/normalized-runtime-event-session-replacement-v1.test.ts)（历史快照）：`6928827621367515f9832b77c8b2cc065191d686bad270025660fa47637659eb`
  - [packages/pi-adapter/src/normalized-runtime-event-v1-core.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/src/normalized-runtime-event-v1-core.ts)（历史快照）：`3edb127b0eaec312f64b8f7593fbfba446ce7f6771c7b62ddc12daf4c038a519`
  - [packages/pi-adapter/src/normalized-runtime-event-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/src/normalized-runtime-event-v1.test.ts)（历史快照）：`0f0621146b67267c02cf36b715f29455fc8243875e902761d610a76a675c8338`
  - [packages/pi-adapter/src/normalized-runtime-event-v1.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/src/normalized-runtime-event-v1.ts)（历史快照）：`0d1613366e6db77e06fa998e7de34ea105727f08a61fe5286a5f13f03438192d`
  - [packages/pi-adapter/src/pi-client-types.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/src/pi-client-types.test.ts)（历史快照）：`7d2bb108b52c55fdc815aac06a3c623d07347444c31b08123e4e7b509d61d9c7`
  - [packages/protocol/fixtures/normalized-runtime-event-v1.fixture-context.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/fixtures/normalized-runtime-event-v1.fixture-context.ts)（历史快照）：`b328c223a5b04086f380c8f0d15b5a1031eae379381656bf6f9971ddd0d2068d`
  - [packages/protocol/fixtures/normalized-runtime-event-v1.fixture-failure-cancel.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/fixtures/normalized-runtime-event-v1.fixture-failure-cancel.ts)（历史快照）：`e69c97708587531dee6532e560d3c90a6a2d0fdceb5744e7a480032dae1fff84`
  - [packages/protocol/fixtures/normalized-runtime-event-v1.fixture-failure-exhausted.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/fixtures/normalized-runtime-event-v1.fixture-failure-exhausted.ts)（历史快照）：`35f588c458656de30e51eb5caa6d520be75d5a47c5dfd03486f4ba60d9e55ce4`
  - [packages/protocol/fixtures/normalized-runtime-event-v1.fixture-failure-preflight.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/fixtures/normalized-runtime-event-v1.fixture-failure-preflight.ts)（历史快照）：`909ada3891020e164c6e1a83d29f57da6907caa3e4f4345b3851a93b6fe4aeb7`
  - [packages/protocol/fixtures/normalized-runtime-event-v1.fixture-failure.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/fixtures/normalized-runtime-event-v1.fixture-failure.ts)（历史快照）：`9d01400faa6d4b3043730d50d1e5f547e9540da19a3628edbc2a9a5dbe80c07f`
  - [packages/protocol/fixtures/normalized-runtime-event-v1.fixture-primary-command.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/fixtures/normalized-runtime-event-v1.fixture-primary-command.ts)（历史快照）：`d4d4b77e14e470545c707785998d801cc6ccb38ef3fa08d45aced5277141cfff`
  - [packages/protocol/fixtures/normalized-runtime-event-v1.fixture-primary-tail.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/fixtures/normalized-runtime-event-v1.fixture-primary-tail.ts)（历史快照）：`0fea6b869bfa40a59e211d02d2408c43d12983fac32e7ce12b835e5b87fa7827`
  - [packages/protocol/fixtures/normalized-runtime-event-v1.fixture-primary-tools.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/fixtures/normalized-runtime-event-v1.fixture-primary-tools.ts)（历史快照）：`53cc9c2a874722e4c9a4e8405261be5781b52807257657f64c029107fa787a6d`
  - [packages/protocol/fixtures/normalized-runtime-event-v1.fixture-primary.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/fixtures/normalized-runtime-event-v1.fixture-primary.ts)（历史快照）：`6577fa3d4007a9763085cbce5387e1dd56957dc3b47f9c7028f1e8d20cb74758`
  - [packages/protocol/fixtures/normalized-runtime-event-v1.fixture-replacement.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/fixtures/normalized-runtime-event-v1.fixture-replacement.ts)（历史快照）：`1b3fa4a7ac823a6352a0372b3e262e9f606bba379c8d6972cb7ccf91c3fbc755`
  - [packages/protocol/fixtures/normalized-runtime-event-v1.fixture-retry-success.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/fixtures/normalized-runtime-event-v1.fixture-retry-success.ts)（历史快照）：`eba9e7149de8c17f71cdda1f85a71d27bf55f7e0f65923945674a4926f5f87c5`
  - [packages/protocol/fixtures/normalized-runtime-event-v1.fixture.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/fixtures/normalized-runtime-event-v1.fixture.ts)（历史快照）：`4fd5bf0869e39e9be8a947e73c7db8f1a590d3640335263de12a65e60532e17c`
  - [packages/protocol/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/index.ts)（历史快照）：`b88e8691e3ec8f55c88cb336277ece394de0767fc3611f015fbc65ac79bc4cfd`
  - [packages/protocol/src/local-diagnostics-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/local-diagnostics-v1.test.ts)（历史快照）：`f5bac7c9a7c918671e189c2736af3950785caeb0c59cdee7a518f7fb777e78ce`
  - [packages/protocol/src/local-diagnostics-v1.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/local-diagnostics-v1.ts)（历史快照）：`b3f307b2c9ad9fa6782eb015135ed04374cfe5c6736bda25d01ba6dfacd05488`
  - [packages/protocol/src/lossless-json.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/lossless-json.ts)（历史快照）：`1f8ef0d811d8ff497fb6dc96f7e118f0ac93fc372a4d258c6ccd660cd8f459bb`
  - [packages/protocol/src/runtime-event-payload-v1-core.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/runtime-event-payload-v1-core.ts)（历史快照）：`2a9fe9496e682d45a28db3e91d4354f0bfbd309e7c4d667d082e8cd0256e76db`
  - [packages/protocol/src/runtime-event-payload-v1.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/runtime-event-payload-v1.ts)（历史快照）：`af4271fb8bc2b14a171a1b67c76f144bed973e1f9a5896e8eb6596f434a43688`
  - [packages/protocol/src/runtime-event-r2-review-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/runtime-event-r2-review-v1.test.ts)（历史快照）：`32ad7db80dbe6137fb9565ad5566fdd555c7f469ab60c9f44dfc0d7176a7e652`
  - [packages/protocol/src/runtime-event-retry-correlation-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/runtime-event-retry-correlation-v1.test.ts)（历史快照）：`5bdd1658471ee0b6a3478ececff057a48a3e559982d5db124f211a89081ee74a`
  - [packages/protocol/src/runtime-event-session-replacement-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/runtime-event-session-replacement-v1.test.ts)（历史快照）：`13cecdeede6afe8ed99f238b5a775fe41bcd78f12c848497b03dc477180ed656`
  - [packages/protocol/src/runtime-event-stream-v1-core.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/runtime-event-stream-v1-core.ts)（历史快照）：`4e652e93e6e3f5c6fb586fe321481d1cc195be3c96f814a2c94903fcc371090e`
  - [packages/protocol/src/runtime-event-stream-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/runtime-event-stream-v1.test.ts)（历史快照）：`c90d96fca8619275ee05b96d75961be79eeeb37c4b932d168eddf9bfa99ff28f`
  - [packages/protocol/src/runtime-event-stream-v1.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/runtime-event-stream-v1.ts)（历史快照）：`b925a3c460c8f79a7d24801cc9d51f520faac7e75f9b6996fa29c642826cbf70`
  - [packages/protocol/src/runtime-event-v1-core.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/runtime-event-v1-core.ts)（历史快照）：`32dc21b167336159a369bc154037041395005bcb7bd6ef5e5346372997834ccb`
  - [packages/protocol/src/runtime-event-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/runtime-event-v1.test.ts)（历史快照）：`f67bf9299334ce9ea729800bb7768667321ec05f57825b6ab08c9144cc8cfd72`
  - [packages/protocol/src/runtime-event-v1.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/runtime-event-v1.ts)（历史快照）：`41d03bdfeacd85c86264968e26534de9b00232c9c6ca17a473daca0fb20ba918`
  - [packages/protocol/src/sha256.ts](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/protocol/src/sha256.ts)（历史快照）：`d3543537fa3d15f394fcdae0c06889b4f2181ad1d4ed1ec671b7f658707870a0`
  - [scripts/check-architecture.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/check-architecture.mjs)（历史快照）：`3d1bd91d9e5e66f807686b314a5ccab34be7a89433dbe39a1dc1f763046130c0`
  - [scripts/check-pi-artifact-result.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/check-pi-artifact-result.mjs)（历史快照）：`ab60d57eb5c52ef89366e90c96536ab53546a6a7c1cf38cadc3d34d046a663ea`
  - [scripts/check-pi-sdk-rpc-parity-provenance.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/check-pi-sdk-rpc-parity-provenance.mjs)（历史快照）：`d5809a65f59c0038df105538ed87e796a327d365d50b7244467c523a4dcb742c`
  - [scripts/check-toolchain.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/check-toolchain.mjs)（历史快照）：`a013020ea830ba8be465f1bf28f8f2b30af3107b6be37c086b005b50cddced76`
  - [scripts/diagnose-pi-root-types.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/diagnose-pi-root-types.mjs)（历史快照）：`e0ba64ce3391eab97815f97656cee1104f47bfcdc3493f01fa335a62de2a0c23`
  - [scripts/formal-toolchain.sh](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/formal-toolchain.sh)（历史快照）：`7cda36222e92f0218149bea8a7e49e1471e8fa711a9a27b5a4d9501b2a917d2c`
  - [scripts/install-toolchain.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/install-toolchain.mjs)（历史快照）：`a0f85bcaf2814df846444bff62883300678430f7c8bfbff36582da88485ebcd6`
  - [scripts/pi-sdk-rpc-parity-fixture.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/pi-sdk-rpc-parity-fixture.mjs)（历史快照）：`15ecd0332fdb439b04ef4560de4a3aa250dad915ee03cb8aca61c0280a394f23`
  - [scripts/probes/pi-artifact-ci.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/probes/pi-artifact-ci.mjs)（历史快照）：`b8c1f47c6e317584218b6ec34c3e99935ae2e576e45710bcb5e6dad15824e6da`
  - [scripts/probes/pi-rpc-state.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/probes/pi-rpc-state.mjs)（历史快照）：`52b988febc7ad3e443249cc0c47a3f994ca33e95df942b1a1f1c58e103363e1d`
  - [scripts/probes/pi-sdk-surface.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/probes/pi-sdk-surface.mjs)（历史快照）：`2651d0309f4415faeaa518cc9c3e15b9b927a1906160a1aebfc57970db1dd846`
  - [scripts/toolchain-environment.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/toolchain-environment.mjs)（历史快照）：`bf350f80809866d2fe8e4fdc631d22f6def64894a51faee57f10978d03350c9a`
  - [scripts/toolchain.test.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/toolchain.test.mjs)（历史快照）：`efc11ae99de30014c1c2807a176a20bf45ef006cdeb577a413fc663104967565`
  - [scripts/typecheck.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/typecheck.mjs)（历史快照）：`0c5c2b53ff061da335d548a6826a67368ec2bb23babf22b0defcc174bbf2b44b`
  - [toolchain.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/toolchain.json)（历史快照）：`423b03d6f239f0a6bf001ed824d0eff0285cfc7e00b6d83f0d808a046a5bca05`
  - [tsconfig.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/tsconfig.json)（历史快照）：`b94f728f7a26ceb5a6a3467d7aed82dc6f106bc005fbd3155ac280da4ee31a3d`
- 命令：`node --experimental-strip-types --test scripts/toolchain.test.mjs`；exit 0，tests/pass 6/6，fail/skip/todo 0/0/0
- 命令：`node --experimental-strip-types --test scripts/typecheck.mjs`；exit 0，tests/pass 1/1，fail/skip/todo 0/0/0
- 实验来源：[https://github.com/ntygod/zhiwei-next/pull/60](https://github.com/ntygod/zhiwei-next/pull/60)；完整 HEAD `41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415`；观测 2026-10-08T22:18:56Z；Node 22.23.1
  - [.github/workflows/pi-sdk-rpc-parity.yml](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/.github/workflows/pi-sdk-rpc-parity.yml)（历史快照）：`0f5a570c6a695f90904359be71d45500cf37ff7b50638c2683bced5debf7b07a`
  - [.node-version](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/.node-version)（历史快照）：`7d2df647f25529bd87500319c41564e032e2be642e565350fa6136d7a1ec4d10`
  - [.npmrc](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/.npmrc)（历史快照）：`b4ea99f73d68c12f437fc4853b2fec3db413ae8141c6f7ceab5fa35bbffd1456`
  - [package-lock.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/package-lock.json)（历史快照）：`34c8f81503afaf21f3e86f7340315f7e7199462b21d27fdb5c78637093fbd2a1`
  - [package.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/package.json)（历史快照）：`a1092dab5112bf2b6ee8d58b8152a5b1348d95420b888257c86b83ff3e45cba9`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json)（历史快照）：`cee143ea7e71a70b48b0c8048839bb00b6f08c2c052652d6fb8100877bf2ab33`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-00-443405699ddd4616c78c6aff8be6c368917cbcb1295fedb862eec98e41e82225.b64](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-00-443405699ddd4616c78c6aff8be6c368917cbcb1295fedb862eec98e41e82225.b64)（历史快照）：`443405699ddd4616c78c6aff8be6c368917cbcb1295fedb862eec98e41e82225`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-01-1c6d75c4a7e2ed1958aa729037fc7c4e9d785c3739d28d92a11cf3bf20db3a64.b64](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-01-1c6d75c4a7e2ed1958aa729037fc7c4e9d785c3739d28d92a11cf3bf20db3a64.b64)（历史快照）：`1c6d75c4a7e2ed1958aa729037fc7c4e9d785c3739d28d92a11cf3bf20db3a64`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-02-b1212b1afa8989ef3a8da5e528b70fd160f5ed8382ad3171874f920390e7081f.b64](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-02-b1212b1afa8989ef3a8da5e528b70fd160f5ed8382ad3171874f920390e7081f.b64)（历史快照）：`b1212b1afa8989ef3a8da5e528b70fd160f5ed8382ad3171874f920390e7081f`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-03-b6da21595679dc47deed3bb2330294d164387f502c5ce75d515bd658114e6060.b64](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-03-b6da21595679dc47deed3bb2330294d164387f502c5ce75d515bd658114e6060.b64)（历史快照）：`b6da21595679dc47deed3bb2330294d164387f502c5ce75d515bd658114e6060`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-04-e8a50d04ce2b2252e6c2fba4db603f7977ed2855826e4bb008ef33a20a37a12e.b64](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-04-e8a50d04ce2b2252e6c2fba4db603f7977ed2855826e4bb008ef33a20a37a12e.b64)（历史快照）：`e8a50d04ce2b2252e6c2fba4db603f7977ed2855826e4bb008ef33a20a37a12e`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-05-30bc6c8157c81bbfc5da609f13431fffac9d445a082ea4e0af46c30d13b1d9e5.b64](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/part-05-30bc6c8157c81bbfc5da609f13431fffac9d445a082ea4e0af46c30d13b1d9e5.b64)（历史快照）：`30bc6c8157c81bbfc5da609f13431fffac9d445a082ea4e0af46c30d13b1d9e5`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/pi-sdk-rpc-parity-contract.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/pi-sdk-rpc-parity-contract.mjs)（历史快照）：`00c7bf5ec561aeccbc484695eef3a67a4554e623c9ff8e64da9942e52b1d5519`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-capture-base.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-capture-base.mjs)（历史快照）：`ea6cb1f52ad610bc404a9bae810bcea537f89a943d5185e4c752de546db56edf`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-jsonl-reader.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-jsonl-reader.mjs)（历史快照）：`3c31a55ff71dd32f2c88f7bbccbd274c2a30b2161edec2508af2c5a65376f5c9`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-legacy-checker-base.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-legacy-checker-base.mjs)（历史快照）：`1692a58b33079639fa0ab5c7ebd83ff6e0672855e7b57e681fc386a0694116c5`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-legacy-checker.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-legacy-checker.mjs)（历史快照）：`063da4f298fcf409c819ea00eb7e84d4504b0a0a0c8159afe2ad0327cc8eff27`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalized-checker-base.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalized-checker-base.mjs)（历史快照）：`8e60d677c93c49419b365f244108102dc4a9806b026c60a6eea181b46391580c`
  - [packages/pi-adapter/fixtures/pi-upstream-baseline.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-upstream-baseline.json)（历史快照）：`a57684f71ed53a95e717e27d93b158492bba1cc9b0f808de4469cba98c09d76e`
  - [scripts/check-pi-sdk-rpc-client-messages-result.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/check-pi-sdk-rpc-client-messages-result.mjs)（历史快照）：`05db9c7c5d60f2d3d519e535996a758c432093b84ca6af603089f944bf3a03df`
  - [scripts/check-pi-sdk-rpc-parity-result.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/check-pi-sdk-rpc-parity-result.mjs)（历史快照）：`ce6375d2000f1ab51413d280875a723135b9aa5e1b5ae209e2a5bc01cbd15443`
  - [scripts/pi-sdk-rpc-parity-fixture.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/pi-sdk-rpc-parity-fixture.mjs)（历史快照）：`15ecd0332fdb439b04ef4560de4a3aa250dad915ee03cb8aca61c0280a394f23`
  - [scripts/probes/pi-lifecycle-ci.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/probes/pi-lifecycle-ci.mjs)（历史快照）：`db5c2546005cbf8429afc359d562b8138b729a26e1df1da81a2861e5e9e3aa43`
  - [scripts/probes/pi-sdk-rpc-parity-capture.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/probes/pi-sdk-rpc-parity-capture.mjs)（历史快照）：`1c0168e05aefc993be6f61b8d317c468000f0b8961fe5e3089aa6d6f8a9a43d3`
  - [scripts/probes/pi-sdk-rpc-parity-composite-capture.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/probes/pi-sdk-rpc-parity-composite-capture.mjs)（历史快照）：`00e399abffb1403356298e8ddbb7129d501bb6900e981708e54fbf6a86a810e9`
  - [scripts/probes/pi-sdk-rpc-parity-contract.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/probes/pi-sdk-rpc-parity-contract.mjs)（历史快照）：`37bc50080d4b549645da203e71dc6ebb482d31ee563e0575b1c933fb992fa13b`
  - [scripts/probes/pi-sdk-rpc-parity-faux-extension.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/probes/pi-sdk-rpc-parity-faux-extension.mjs)（历史快照）：`80a4a3f62d47e14557b84b595243d3d574bdddb92bf9733bd448df00061a6862`
  - [toolchain.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/toolchain.json)（历史快照）：`423b03d6f239f0a6bf001ed824d0eff0285cfc7e00b6d83f0d808a046a5bca05`
- 命令：`node --experimental-strip-types scripts/pi-sdk-rpc-parity-fixture.mjs --check`；exit 0，tests/pass 0/0，fail/skip/todo 0/0/0
- 实验来源：[https://github.com/ntygod/zhiwei-next/pull/64](https://github.com/ntygod/zhiwei-next/pull/64)；完整 HEAD `41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415`；观测 2026-10-08T22:19:26Z；Node 22.23.1
  - [.github/workflows/pi-sdk-rpc-parity.yml](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/.github/workflows/pi-sdk-rpc-parity.yml)（历史快照）：`0f5a570c6a695f90904359be71d45500cf37ff7b50638c2683bced5debf7b07a`
  - [.node-version](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/.node-version)（历史快照）：`7d2df647f25529bd87500319c41564e032e2be642e565350fa6136d7a1ec4d10`
  - [.npmrc](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/.npmrc)（历史快照）：`b4ea99f73d68c12f437fc4853b2fec3db413ae8141c6f7ceab5fa35bbffd1456`
  - [package-lock.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/package-lock.json)（历史快照）：`34c8f81503afaf21f3e86f7340315f7e7199462b21d27fdb5c78637093fbd2a1`
  - [package.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/package.json)（历史快照）：`a1092dab5112bf2b6ee8d58b8152a5b1348d95420b888257c86b83ff3e45cba9`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/pi-sdk-rpc-parity-contract.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/pi-sdk-rpc-parity-contract.mjs)（历史快照）：`00c7bf5ec561aeccbc484695eef3a67a4554e623c9ff8e64da9942e52b1d5519`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/pi-sdk-rpc-parity-fixture.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/pi-sdk-rpc-parity-fixture.mjs)（历史快照）：`b10a8c677ca86e75463f1cb672e56b5d6282512684ee7daf042c651b26ae6f13`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-base-fixture.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-base-fixture.mjs)（历史快照）：`9114567d466b8e0796e5f4a8fec8e46eff041c1cf2db4070509d156dcf408f05`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-capture-base.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-capture-base.mjs)（历史快照）：`ea6cb1f52ad610bc404a9bae810bcea537f89a943d5185e4c752de546db56edf`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture-base.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture-base.mjs)（历史快照）：`18c158afc4caf09664e06c1ec9ea4eac87215ce528f8a63aacad80cb681cc8d3`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture.mjs)（历史快照）：`e5c8b5146f4a6e6e24437601e1ea23118468ed40cd9c8c411d716e20d4da6144`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-jsonl-reader.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-jsonl-reader.mjs)（历史快照）：`3c31a55ff71dd32f2c88f7bbccbd274c2a30b2161edec2508af2c5a65376f5c9`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-jsonl-reader.test.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-jsonl-reader.test.mjs)（历史快照）：`4063e0ddbcf9ed0d531b98963b10aabc948e1cc8e9508b5e2f40f51bf5177aee`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-legacy-checker-base.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-legacy-checker-base.mjs)（历史快照）：`1692a58b33079639fa0ab5c7ebd83ff6e0672855e7b57e681fc386a0694116c5`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-legacy-checker.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-legacy-checker.mjs)（历史快照）：`063da4f298fcf409c819ea00eb7e84d4504b0a0a0c8159afe2ad0327cc8eff27`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest-v2.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest-v2.json)（历史快照）：`cd5ec01ad09c2b3ea123e7dca5a3e10e6ce519bb498758519a4e7fb45c112a66`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest.json)（历史快照）：`2cb4d4289668836e877ce54e2324f8c94250d0a22a8555bffff74d316f5c29b0`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalized-capture.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalized-capture.mjs)（历史快照）：`9c70359e3da22740a29d2bcfa62ac02a32c7077a1ade52d569e22ebb4451f40b`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalized-checker-base.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalized-checker-base.mjs)（历史快照）：`8e60d677c93c49419b365f244108102dc4a9806b026c60a6eea181b46391580c`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalizer.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalizer.mjs)（历史快照）：`e9d04943c4c721b4ca0bcfd0ef5c5a205a8aa3c6e14e7ca584731c209e174f8c`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalizer.test.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalizer.test.mjs)（历史快照）：`a567ec3b1428df93fab0fc8b12b7317471e7e522c056723521623a4c4dda7e15`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-part-00-bfcc1561e9cc08585e2675ecce0a2ccea0b2a14900a63a242f9884ab3286300f.b64](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-part-00-bfcc1561e9cc08585e2675ecce0a2ccea0b2a14900a63a242f9884ab3286300f.b64)（历史快照）：`bfcc1561e9cc08585e2675ecce0a2ccea0b2a14900a63a242f9884ab3286300f`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provenance.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provenance.mjs)（历史快照）：`476dbbfe2ff176ad120e1b6803d886bbff9955aca7e2e4f24d932525cfcf0153`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provenance.test.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provenance.test.mjs)（历史快照）：`f370fb97b6a9270cf3c417418088a28ad18534a179fd615a516bfa58603d08fd`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provider-error-replacement.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provider-error-replacement.json)（历史快照）：`a5505b9c86b86af3a78068eb8440158361866600f41f922fb39d5ece840b3811`
  - [packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-sdk-provenance-base.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-sdk-provenance-base.mjs)（历史快照）：`db918649416601aad1b6a92b3415a139bf4230cdf32cb6b7c0d16c45000ad1d5`
  - [packages/pi-adapter/fixtures/pi-upstream-baseline.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/packages/pi-adapter/fixtures/pi-upstream-baseline.json)（历史快照）：`a57684f71ed53a95e717e27d93b158492bba1cc9b0f808de4469cba98c09d76e`
  - [scripts/check-pi-sdk-rpc-client-messages-result.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/check-pi-sdk-rpc-client-messages-result.mjs)（历史快照）：`05db9c7c5d60f2d3d519e535996a758c432093b84ca6af603089f944bf3a03df`
  - [scripts/pi-sdk-rpc-parity-fixture.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/pi-sdk-rpc-parity-fixture.mjs)（历史快照）：`15ecd0332fdb439b04ef4560de4a3aa250dad915ee03cb8aca61c0280a394f23`
  - [scripts/probes/pi-lifecycle-ci.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/probes/pi-lifecycle-ci.mjs)（历史快照）：`db5c2546005cbf8429afc359d562b8138b729a26e1df1da81a2861e5e9e3aa43`
  - [scripts/probes/pi-sdk-rpc-parity-contract.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/probes/pi-sdk-rpc-parity-contract.mjs)（历史快照）：`37bc50080d4b549645da203e71dc6ebb482d31ee563e0575b1c933fb992fa13b`
  - [scripts/probes/pi-sdk-rpc-parity-faux-extension.mjs](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/scripts/probes/pi-sdk-rpc-parity-faux-extension.mjs)（历史快照）：`80a4a3f62d47e14557b84b595243d3d574bdddb92bf9733bd448df00061a6862`
  - [toolchain.json](https://github.com/ntygod/zhiwei-next/blob/41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415/toolchain.json)（历史快照）：`423b03d6f239f0a6bf001ed824d0eff0285cfc7e00b6d83f0d808a046a5bca05`
- 命令：`node --experimental-strip-types --test packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-jsonl-reader.test.mjs`；exit 0，tests/pass 1/1，fail/skip/todo 0/0/0
- 命令：`node --experimental-strip-types --test packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalizer.test.mjs`；exit 0，tests/pass 1/1，fail/skip/todo 0/0/0
- 命令：`node --experimental-strip-types --test packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provenance.test.mjs`；exit 0，tests/pass 1/1，fail/skip/todo 0/0/0
- 命令：`node --experimental-strip-types --test packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture.mjs`；exit 0，tests/pass 1/1，fail/skip/todo 0/0/0

决策审查记录：[decision-accepted](https://github.com/ntygod/zhiwei-next/pull/87#issuecomment-6070476496)；被审 HEAD `37c6228ef9187b932a9648d472319bce31a4aef5`；绑定 D-07 / `b13ccee54ba167fc7553d517ad60154ebf7a0a88c2df8e1f87082d1c19d9d764`；记录观测 2026-10-08T22:39:59Z。其真实性/完整范围须查远端原文；该历史记录不批准后续完整 HEAD。

## D-08

当前状态：**Proposed**

状态路径：Proposed

正式决策审查：尚无；实验 PR 的批准不用于接受本决议。

## D-09

当前状态：**Proposed**

状态路径：Proposed

正式决策审查：尚无；实验 PR 的批准不用于接受本决议。

## D-10

当前状态：**Accepted**

状态路径：Proposed → Evidence Ready → Accepted

- ADR：[docs/adr/0007-hard-core-soft-shell-ownership.md](../../docs/adr/0007-hard-core-soft-shell-ownership.md)；正文摘要（仅归一化状态行）：`27e4a3db3d044cc041a443e5fb84f731d068f3bb6308e37a6cea4672f0cf4b6c`
- ADR：[docs/adr/0010-package-owned-invariant-catalog.md](../../docs/adr/0010-package-owned-invariant-catalog.md)；正文摘要（仅归一化状态行）：`c2246b0a7568dc6375628de60566d6d8ae26efb3a4352649f75e54d28b2e193a`

有限选择：采用唯一语义 owner、多个公开 enforcement 调用点、单一静态证据目录与固定显式函数/对象组合；产品配置及 revision 与 Harness 分离。

决议范围摘要：`b45b2fb82d261522b712966966ae8d18de6ed2dc930f3aea08d432b4a194f243`

### 适用范围

- domain/cognition-core/context-compiler/protocol/memory-store/pi-adapter 各持已有语义，apps 是组合根；跨包复用公开入口，不复制核心 validator。
- Adapter create 与 Store parse 复用 protocol；单事件与完整 Trace 分别维护。Hard Core 的身份/Scope/证据状态/协议/持久化/解释/权限审计不能由 Provider 或配置关闭。
- 单目录维护现有 owner→公开入口→精确正反测试并生成视图；目录是证据索引，不是运行权限或动态 registry。
- 固定组合在处理 Provider 输入或打开产品资源之前拒绝重复 ID、缺 owner、关闭/替换核心校验；目录校验本身读取文件。
- 产品配置与 harness.config.json 独立，风险/CI/批准不成为产品运行权限。当前不建通用 DI、动态 Host 或 sandbox。

### 非保证

- 不可关闭是设计/API 合同及现有公开入口要求，不是恶意同进程隔离、源码篡改防御或 sandbox 证明。
- 固定实验不证明 Daemon/真实 Worker 已组合、动态 Provider 任意替换或生命周期已实现。
- 目录 13 项不是穷尽覆盖；架构 checker 不是完整 AST/import graph/动态加载证明。

### 保留前置

- G-3/M0-4/5：正式组合、每个入口及启动/取消/异常/排空/释放。
- 第二 Provider、动态装载、资源 owner/disposer、权限撤销、配置对账和 sandbox 有真实需求后分别决策/验收。
- M1/M2：置信度、同 Scope/可信来源、原子纠正、Context 状态/预算/去重等既有缺口逐项补齐。

### 实验身份与观测

- 实验来源：[https://github.com/ntygod/zhiwei-next/pull/77](https://github.com/ntygod/zhiwei-next/pull/77)；完整 HEAD `9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d`；观测 2026-10-08T14:00:58Z；Node 22.23.1
  - [docs/spikes/invariant-ownership/catalog-check.mjs](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/docs/spikes/invariant-ownership/catalog-check.mjs)（历史快照）：`3f4561b0aa61561790b812fdd221204dd489098ddc31eccdd19274e34f747145`
  - [docs/spikes/invariant-ownership/catalog.json](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/docs/spikes/invariant-ownership/catalog.json)（历史快照）：`3bd1a07145c3918ab2f7b6a33822aab71d6c7a0cde7ce6f7cff498af2df3b26e`
  - [docs/spikes/invariant-ownership/composition.mjs](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/docs/spikes/invariant-ownership/composition.mjs)（历史快照）：`0e72ab4cc682d94bacd5fea3c9b2951796b5737aa797c8f04db732bc8d8f4881`
  - [docs/spikes/invariant-ownership/evidence-reporter.mjs](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/docs/spikes/invariant-ownership/evidence-reporter.mjs)（历史快照）：`669ea560cb5c53ecd1eed323bce45274e88ba2bd14bbb9d340118d057776c372`
  - [docs/spikes/invariant-ownership/experiment.test.mjs](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/docs/spikes/invariant-ownership/experiment.test.mjs)（历史快照）：`9f81747075b205153a5c433cc2ca0fa43f67a67913272eeea24a043f730e5c3b`
  - [docs/spikes/invariant-ownership/render-catalog.mjs](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/docs/spikes/invariant-ownership/render-catalog.mjs)（历史快照）：`8a2dca6a3fe437ef69255cc4cb3999951e85e2ab88dc790eb2718422d1241b07`
  - [packages/cognition-core/src/index.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/cognition-core/src/index.test.ts)（历史快照）：`5d5bc3436a793464ee76ce1938778c074ba4a86ff163532756054c1bf6c3a071`
  - [packages/cognition-core/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/cognition-core/src/index.ts)（历史快照）：`218c065e7f034afd095d71174186e6fead411e76288ae81551961d0de24b5b9a`
  - [packages/context-compiler/src/index.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/context-compiler/src/index.test.ts)（历史快照）：`b0cf6ef41c3c2e14489744eb2071f9864f78bad0e295a9888501752b1061d602`
  - [packages/context-compiler/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/context-compiler/src/index.ts)（历史快照）：`c816620445cdef644b674c57c65636a7d06e128082a0c92c7ad0886e0dd76499`
  - [packages/domain/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/domain/src/index.ts)（历史快照）：`ea6dd01fcf985d7493ffc6640010be0c74434a4621d7189165b543bbd7c1fdd0`
  - [packages/memory-store/migrations/0001_normalized_runtime_event_v1.sql](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/migrations/0001_normalized_runtime_event_v1.sql)（历史快照）：`e0afaf4aec1f4fb91d4fabef94f0c4ca1bb7a32e97f1f2b61d6df6333d36e31c`
  - [packages/memory-store/src/index.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/index.test.ts)（历史快照）：`491ff7f57fe6118108dd6430c95167d54d0dde63dbaff89c2607e789cfecfc67`
  - [packages/memory-store/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/index.ts)（历史快照）：`07e2a1e891faedb2c9c3deac79d38fcb0be88c1beb9aff72337e2824c9451ad5`
  - [packages/memory-store/src/migrations.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/migrations.ts)（历史快照）：`e5c0822bf9cdb1168c7764844e18b80ee407dc63fd35532520c5f33e6ca919bd`
  - [packages/memory-store/src/sqlite-observation-ledger-r2-fifth.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/sqlite-observation-ledger-r2-fifth.test.ts)（历史快照）：`7c8fab36cffe94887f4fc3991c29a360c13edba672fe7d861301f5bf7bc931a0`
  - [packages/memory-store/src/sqlite-observation-ledger-r2-third.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/sqlite-observation-ledger-r2-third.test.ts)（历史快照）：`2b2689f7dc07ac316881df848bec9a58c1d00a04826797ac71e4527636b88866`
  - [packages/memory-store/src/sqlite-observation-ledger.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/sqlite-observation-ledger.test.ts)（历史快照）：`2b2511b73e6b81b736ffadd0b2eca7baefd6d37c422839dbbf27de3c6228e2d8`
  - [packages/memory-store/src/sqlite-observation-ledger.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/sqlite-observation-ledger.ts)（历史快照）：`11cfab3aa2fa861ef40a7e9e14a01e7a3c27e7e12801393c0f8ed461c801551b`
  - [packages/memory-store/src/sqlite-schema-sql.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/memory-store/src/sqlite-schema-sql.ts)（历史快照）：`1247cb17435915fa54a454263f51586f6cc158b702ff377f175cfcc892179622`
  - [packages/pi-adapter/src/index.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/pi-adapter/src/index.test.ts)（历史快照）：`781b66fac7fdf9a3b5bc02f1e03dd70a99636ec99af2178097a58c2da8defc1e`
  - [packages/pi-adapter/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/pi-adapter/src/index.ts)（历史快照）：`eb416dd607953a55244993657799bf523445e27b17740bd4b58c46b145bee638`
  - [packages/pi-adapter/src/normalized-runtime-event-r2-review-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/pi-adapter/src/normalized-runtime-event-r2-review-v1.test.ts)（历史快照）：`45d8c74f25feb335df1bc8c0ac4019960bddfc42b85d6d9f0f28b4dd4cb8a55f`
  - [packages/pi-adapter/src/normalized-runtime-event-retry-correlation-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/pi-adapter/src/normalized-runtime-event-retry-correlation-v1.test.ts)（历史快照）：`fc55025aafd18dbfa3189b1bc67c45d49d1e9d14886941fef5a53e7f79c236a9`
  - [packages/pi-adapter/src/normalized-runtime-event-session-replacement-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/pi-adapter/src/normalized-runtime-event-session-replacement-v1.test.ts)（历史快照）：`6928827621367515f9832b77c8b2cc065191d686bad270025660fa47637659eb`
  - [packages/pi-adapter/src/normalized-runtime-event-v1-core.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/pi-adapter/src/normalized-runtime-event-v1-core.ts)（历史快照）：`e68c53e537e76be973a4584c7e1a610efcaf917ac83711b8da9cb5f74ddd5ef1`
  - [packages/pi-adapter/src/normalized-runtime-event-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/pi-adapter/src/normalized-runtime-event-v1.test.ts)（历史快照）：`76006940cbf9c820a39028653855953a77d70aec141e85be0fe96cfc9e6fed37`
  - [packages/pi-adapter/src/normalized-runtime-event-v1.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/pi-adapter/src/normalized-runtime-event-v1.ts)（历史快照）：`c67b6de32cc7fb56de5980cd9058441cd58266188a763033608f30c2c5280594`
  - [packages/protocol/src/index.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/index.ts)（历史快照）：`f79cf69248c6594284bb1f4c33ba8d15faf1a2e2d5b3e917c37c809acb2e27be`
  - [packages/protocol/src/lossless-json.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/lossless-json.ts)（历史快照）：`4095a4d6e3e0560b9e25e5c0ebcb894ac45fe4057989255bb35fb14b0174c59a`
  - [packages/protocol/src/runtime-event-payload-v1-core.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-payload-v1-core.ts)（历史快照）：`8739d8cf87e0b23f9c2ca2dcf0bca16adfa44c19c69953810d514a2849f3d9e8`
  - [packages/protocol/src/runtime-event-payload-v1.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-payload-v1.ts)（历史快照）：`af4271fb8bc2b14a171a1b67c76f144bed973e1f9a5896e8eb6596f434a43688`
  - [packages/protocol/src/runtime-event-r2-review-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-r2-review-v1.test.ts)（历史快照）：`69cfd0c42564ee70581ee382e0df844b2decb5b02c00fc80de6d8755e073c4fd`
  - [packages/protocol/src/runtime-event-retry-correlation-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-retry-correlation-v1.test.ts)（历史快照）：`5bdd1658471ee0b6a3478ececff057a48a3e559982d5db124f211a89081ee74a`
  - [packages/protocol/src/runtime-event-session-replacement-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-session-replacement-v1.test.ts)（历史快照）：`13cecdeede6afe8ed99f238b5a775fe41bcd78f12c848497b03dc477180ed656`
  - [packages/protocol/src/runtime-event-stream-v1-core.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-stream-v1-core.ts)（历史快照）：`c50785012323df52b004267c2ca2b3c7abaa05a389e415b93e3a9cc839ce514e`
  - [packages/protocol/src/runtime-event-stream-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-stream-v1.test.ts)（历史快照）：`c90d96fca8619275ee05b96d75961be79eeeb37c4b932d168eddf9bfa99ff28f`
  - [packages/protocol/src/runtime-event-stream-v1.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-stream-v1.ts)（历史快照）：`76056a9ce8d1e687905248c6bf8b52a8773da9f93da556d672d2f428d124ee9e`
  - [packages/protocol/src/runtime-event-v1-core.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-v1-core.ts)（历史快照）：`04a4c2b9c41ff473ba149245cf8b25efaf68052886abcf911aba3d8e6c132244`
  - [packages/protocol/src/runtime-event-v1.test.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-v1.test.ts)（历史快照）：`f5a9bb39268199e30d409826c9a6357d50c1b95e208f62fdc91040b31f802755`
  - [packages/protocol/src/runtime-event-v1.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/runtime-event-v1.ts)（历史快照）：`41d03bdfeacd85c86264968e26534de9b00232c9c6ca17a473daca0fb20ba918`
  - [packages/protocol/src/sha256.ts](https://github.com/ntygod/zhiwei-next/blob/9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d/packages/protocol/src/sha256.ts)（历史快照）：`d3543537fa3d15f394fcdae0c06889b4f2181ad1d4ed1ec671b7f658707870a0`
- 命令：`node --experimental-strip-types --test docs/spikes/invariant-ownership/experiment.test.mjs`；exit 0，tests/pass 45/45，fail/skip/todo 0/0/0

决策审查记录：[decision-accepted](https://github.com/ntygod/zhiwei-next/pull/81#issuecomment-6062783403)；被审 HEAD `4eae854403dc6596a0db7297dcf756137c848ec7`；绑定 D-10 / `b45b2fb82d261522b712966966ae8d18de6ed2dc930f3aea08d432b4a194f243`；记录观测 2026-10-08T15:05:32Z。其真实性/完整范围须查远端原文；该历史记录不批准后续完整 HEAD。

## D-11

当前状态：**Proposed**

状态路径：Proposed

正式决策审查：尚无；实验 PR 的批准不用于接受本决议。
