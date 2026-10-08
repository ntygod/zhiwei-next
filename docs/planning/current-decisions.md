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

当前状态：**Proposed**

状态路径：Proposed

正式决策审查：尚无；实验 PR 的批准不用于接受本决议。

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
