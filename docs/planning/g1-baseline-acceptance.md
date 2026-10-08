# G-1 架构合同基线：候选逐项验收

日期：2026-10-08。关联 [Issue #80](https://github.com/ntygod/zhiwei-next/issues/80) / [primary PR #81](https://github.com/ntygod/zhiwei-next/pull/81)，分支 `chore/80-current-decision-evidence`。

结论：原 G-1 三项完成条件和两类失败路径已有逐项实质证据，本 PR 的有限架构基线候选满足这些条件。Accepted 状态登记后的新完整 HEAD 仍待全新独立 cold review、fresh Ready CI、受保护合入及来源回读；本记录不宣布候选已在 main 交付，也不代替独立审查或自动计算完成状态。

## 决策接受的真实历史依据

[正式逐项独立决策审查](https://github.com/ntygod/zhiwei-next/pull/81#issuecomment-6062783403)明确接受 D-01、D-02、D-10 各自有限选择：

- reviewed/evidence HEAD：`4eae854403dc6596a0db7297dcf756137c848ec7`
- 被审 tree：`72f53dc9c28faee03f46793dc0e4102210c655de`
- 本次评论回读观测时间：`2026-10-08T15:05:32Z`
- 三个逐项范围摘要、真实 review URL 与相同被审 HEAD 已分别记录在[当前执行决议](current-decisions.md)。ADR 0007/0008/0009/0010 仅状态行由 Proposed 改 Accepted；被审正文、proposal、实验与范围摘要不变。

该评论只批准上述历史 proposal HEAD 和三项有限决策，不批准记载它的新提交，不替代新完整 HEAD 的最终审查/CI/合入。PR #77/#79 的旧实验批准仍不作决策批准。以下是作者对原卡的逐项验收记录，并非作者自批。

## 对照原 G-1 卡

唯一验收目标仍是[原工程任务卡 G-1](engineering-execution.md#g-1--架构合同与不变量归属基线)。不修改原卡完成条件、源 JSON、依赖、计数或阶段门。

| 原条件 | 本候选的具体证据 | 实质验收与边界 |
|---|---|---|
| 分别记录核心边界/会话记录/包归属决策 | [ADR 0007](../adr/0007-hard-core-soft-shell-ownership.md)负责核心与组合；[ADR 0008](../adr/0008-session-record-reconstruction-boundary.md)负责无记忆会话/输入重建；[ADR 0010](../adr/0010-package-owned-invariant-catalog.md)负责唯一 owner。D-02 的[ADR 0009](../adr/0009-ledger-schema-evolution-boundary.md)另行限定同库 Schema 演进，不能替代包归属决策 | 三类分别记录且有限范围获真实新决策审查。D-01/D-02/D-10 三个前置决策均已按实际历史来源记 Accepted；不等于交付正式 Session、业务 Schema 或 Host |
| 建立不变量→所属包→调用入口→正反测试映射 | [唯一 catalog](../spikes/invariant-ownership/catalog.json)的13项 owner/公开入口/精确正反测试，生成[架构视图](../architecture/invariant-ownership-baseline.md)；[实验](../spikes/invariant-ownership/experiment.test.mjs)真实执行目录中30个不同具名测试/9文件，核验导出、方法、测试名称、结果及生成一致性 | 已建立且可执行核对。一个语义 owner 可有多个 enforcement 调用点；不是穷尽未来不变量、动态 registry 或安全 sandbox |
| harness.config.json 与产品配置分离 | ADR 0007 明确产品配置/revision 不消费 Harness 风险/批准；复核当前 [Daemon 入口](../../apps/daemon/src/index.ts)、[CLI 入口](../../apps/cli/src/index.ts)及现有包源码，无 harness.config.json 读取/引用。当前仅有 bootstrap 环境参数，没有正式产品配置加载器 | 当前边界明确且现有产品入口不消费 Harness。无需建未使用的产品配置空壳；未来加载器/权限收紧/owner-disposer 仍由其任务验证 |

## 原失败路径逐项取证

| 原失败路径 | 实际负例及观察 | 限定 |
|---|---|---|
| 重复 ID / 无 owner | G-1b 的 `catalog rejects duplicate invariant ID`、`missing owner field`、`empty owner list`、`multiple owner packages`、`duplicate same owner`，以及无效 owner/导出/方法/测试路径、生成漂移均明确拒绝 | 检查真实目录和现有公开入口；不把目录存在当作完整产品能力 |
| Provider 关闭核心校验 | 固定组合的 disabled/false/missing coreValidation、skipValidation、替换 validator、migrations override、unsafe 及重复 capability/provider 负例，均断言 Provider input.map 未调用、SQLite 文件未创建；有效声明下坏数据仍被原核心拒绝 | 拒绝发生在处理 Provider 输入/打开产品资源前，目录校验自身读取文件。不是恶意同进程隔离或通用 Host 保证 |

正常路径也实际执行 Adapter → protocol → 临时文件 Ledger，核 WAL/integrity、关闭重开与 exact replay。D-01 的50项和 D-02 的35项实验分别支撑已接受会话/Schema方向，不能相互替代；D-10 的45项与其内部另核30项、全仓138项分别计数，不相加。

## 状态登记与回归

本次 Accepted 资料通过现有严格 checker，从真实 `4eae854...` Git blob 读取被审 Evidence Ready 决议、完整 ADR 正文及当时实验文件，逐项验证范围摘要和历史身份。原100项层测试继续覆盖伪造/缺失审查、跨决策挪用、非法状态、旧源覆写、历史/候选文件漂移，以及安全生成的 symlink/hardlink/部分写入/写后校验负例；不为 Accepted 修改或放宽这些断言。

状态登记后的适用复跑命令：

```bash
node scripts/check-current-decisions.mjs --write-view
node scripts/check-current-decisions.mjs
node --test scripts/current-decisions.test.mjs
node scripts/check-execution-plan.mjs
node --experimental-strip-types --test docs/spikes/session-reconstruction/experiment.test.mjs
node --experimental-strip-types --test packages/memory-store/fixtures/schema-evolution/experiment.test.mjs
node --experimental-strip-types --test docs/spikes/invariant-ownership/experiment.test.mjs
node --experimental-strip-types docs/spikes/invariant-ownership/render-catalog.mjs --check
npm run check
git diff --check
```

本候选使用 Node 22.23.1；本地复跑结果与最终 exact HEAD 记录在同一 PR。上述本地验证与历史决策评论不预填未来 CI、最终批准或合入。

## 保留前置与下一步

- D-04/G-2：真实正文保留、删除/遗忘、日志/缓存/备份、工具/外发授权仍未接受。
- D-09/M0-2/3：owner/epoch、多进程并发与升级排他仍未验证。D-02 旧态 prevalidation 在 BEGIN IMMEDIATE 前；本记录不扩大该保证。
- D-03/G-5：性能/设备负载、断电/OS/存储故障保证仍待独立证据；view 当前不在 manifest 覆盖。
- D-07/G-3、M0-4/5/8：真实 Pi 路径、正式 Worker/Daemon 组合、生命周期和端到端仍待各自任务。
- #67 整体、M0 及后续阶段未完成。源快照的全部阶段 gate 仍为 unverified；本文件不是自动派工或放行字段。

只有本 PR 最终独立审查、CI、合入与回读完成后，才将 G-1 有限基线记为已交付，并按原依赖选择 G-2/G-3 的就绪工作。M0-2 仍需 G-5/D-09，不能从三个 Accepted 直接跳入受约束产品实现。
