# 有限执行决议层

关联 [Issue #80](https://github.com/ntygod/zhiwei-next/issues/80)，分支 `chore/80-current-decision-evidence`，起点 `main@9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d`。本项为 R3 架构决议/状态转换资料，不实现 Session、生产迁移、Host 或新权限，不修改 CI、Workflow、Harness 合并门或验收目标。长期技术方向由 AI 依据证据和现行独立审查定案，无须重复相同合成实验或等待没有必要的产品选择。

## 一个当前入口，两种时间语义

- [current-decisions.json](current-decisions.json) 是当前执行决议资料；[current-decisions.md](current-decisions.md) 是唯一生成的当前登记。ADR 是决策正文；JSON 对其正文摘要和状态作一致性绑定，不取代 ADR 权威。
- [decision-register.md](decision-register.md) 是原源提案及历史取证登记。历史分界之后保留原全文与摘要；其中 11 项 Proposed 不再作为当前状态读取。
- [work-packages.json](work-packages.json) 始终是原附件派生规划快照：来源 SHA-256、11 项 Proposed、60/57/51/6/3 计数、68 节点 DAG、24 场景/别名、阶段 unverified 不变。它不是第二套执行数据库。
- 原 [check-execution-plan.mjs](../../scripts/check-execution-plan.mjs) 逐字节保留，包括将源 D-01 改 Accepted 必须失败的原负例。新层不放松、调用替代或修改该 checker。

G-1 原卡的三项完成条件和重复 ID/缺 owner/Provider 关闭核心失败路径保持原样。D-01/02/10 的有限方向真正接受后，应按原卡单独验收 G-1 基线，再推进就绪的 G-2/G-3；不要求先交付未来 Session、真实 Pi、动态 Host、D-03/04/09 或整个 M0。但三项 Accepted 本身不等于 G-1 完成，更不等于 #67 整体或 M0 完成。当前层没有任何工作包/阶段完成字段或自动放行函数。

## 严格 v1 表示

顶层仅允许 schemaVersion、kind、source、decisions。source 引用固定 main、原派生 JSON/原附件/原 checker/原登记的摘要。恰好 11 个已知 ID，无缺失、重复或额外字段。v1 的取证范围只配置 D-01/02/10 的 ADR 和实验入口；其他项保留 Proposed。未来需要推进其他决策时，明确扩展 schema/checker/正反测试，不能靠填任意路径绕过。

每个决议包括 id、status、history、adrs、proposal、evidence、decisionReview、disposition：

- Proposed 不带当前决议或实验证据；历史源仍可说明建议。
- Evidence Ready 要求正式 ADR、有限 selection/scope、nonGuarantees、remainingGates，以及实际实验文件、SHA-256、40 位历史 Git HEAD、命令、精确 Node patch、观测时间和结果。ADR 仍为 Proposed；Evidence Ready 是准备程度，不是 ADR 接受状态。
- Accepted 还要求 purpose=decision-accepted 的逐项审查身份、同一新 primary PR/review URL、相等的 evidenceHead/reviewedHead、proposalSha256 和观测时间。PR77/79 等该项实验来源 PR 不能充当新的决策 primary PR。
- 合法路径为 Proposed → Evidence Ready → Accepted/Rejected/Superseded。Rejected/Superseded 的处置原因与替代关系也须先放入被审 Evidence Ready 的 disposition 并参与范围摘要；后者须不同且已接受的替代 ADR。v1 不允许终态直接重开或改写；已 Accepted 的后续替代须按既有 ADR 规则另行受审扩展表示。不允许倒退、跳步或无声重开。

proposalSha256 采用递归键排序 JSON，绑定 decision ID、有限文字、所有 ADR 正文摘要、实验身份/文件摘要/观测结果及处置原因/替代关系。不是只 hash 标签。ADR 摘要只归一化唯一的“- 状态：”行，其他任何正文变化均需新摘要和重审；没有任意可忽略的证据段或注释洞。

实验的 sourcePr 表示产生该实验的历史 PR；head 是本次复跑所使用的已存在完整源码快照，可能是包含该实验的 squash main，并非冒充原 PR head。本轮全部复跑于 main 9242e8c 的相同实验/产品源文件；ADR 和当前状态资料单独绑定本决议，不混入历史实验文件摘要。JSON 列明的测试代码、源模块和迁移文件始终校验其真实历史 Git blob。Evidence Ready 另要求当前候选文件与历史 blob、记录 hash 三方相等，漂移必须重新取证。Accepted/Rejected/Superseded 是历史决议终态，其历史证据不要求永远等于后续产品源码，也不因正常实现演进要求解锁终态。生成登记中的实验文件链接固定到 evidenceHead，避免用历史摘要指向已经变化的当前文件。清单不认证操作系统、Node 二进制、未列运行环境或全部未来依赖。

## 防止自引用和挪用审批

1. 同一 primary PR 先提交 Evidence Ready 和完整有限 ADR/决议文字，形成真实可审 HEAD。
2. 独立审查明确逐项审查 D-01、D-02、D-10 的范围与 proposalSha256，绑定该真实 HEAD。实验审查只能证明实验被审，不能代替决策接受。
3. 随后同一分支记录真实 review URL、purpose、decisionId、范围摘要与被审 HEAD，并只改变状态/历史/审查记录及 ADR 状态行、生成登记。checker 必须从该历史 HEAD 读取真实 current-decisions.json、原源文件和 ADR 正文；范围或 ADR 改文会失败，须重新审查。被审 Evidence Ready HEAD 中的真实实验文件还必须与历史证据 hash 匹配，不能只比对 JSON 自声明。一个 D-10 的对象复制给 D-01 会因 ID/digest/历史内容不符失败。
4. 记录审查的新完整 HEAD 再按旧有 R3 流程 cold review/CI/Ready/合并。最终 HEAD 批准是 PR 的真实事实，不需回填到被批准提交形成无限 hash 循环。不创建 no-op finalizer PR。

同一真实审查评论可以逐项覆盖多个决议，但每项必须有独立 ID/内容摘要/历史内容匹配；审核者仍须核实评论明确覆盖每项。合法 URL、JSON purpose 字符串及哈希并不能证明评论真实存在、审查者独立或批准内容正确。伪造这些自声明而不改变其他内容的攻击不能由离线 checker 认证性阻止；它只证明本地内部一致性，不是批准工具。

## 本地校验与远端事实分工

```bash
node scripts/check-current-decisions.mjs
node --test scripts/current-decisions.test.mjs
node scripts/check-execution-plan.mjs
npm run check
```

更新生成登记使用 `node scripts/check-current-decisions.mjs --write-view`；先校验其余数据再写视图，不写 ADR/源快照。新命令是严格 opt-in，未加入 npm scripts、CI 或合并门。

文件读取拒绝越界和符号链接；历史读取只允许 40 位小写 hex commit 与安全仓库相对路径，以 Git 参数数组调用，无 shell。命令、URL、路径都是资料，不 eval、不执行 JSON 中命令、不抓取 URL、不消费 token。测试里的合成 approval 仅在内存 mock 中，绝不写入仓库当前资料或 GitHub。

本地 checker 验证结构、合法路径、文件/历史 blob 摘要、逐项范围身份、原快照/旧 checker 保留及 ADR/生成 Markdown 一致性。终态校验只证明决议的历史证据一致性，不评估当前产品实现是否仍满足该决议；后续正常源码演进仍需其任务的当前测试及独立审查，不能继承历史决策批准，也不自动获得新 scope。它不执行实验，不认证记录中的 exitCode/pass，不在线验证 GitHub PR、review、CI、作者独立性或当前远端 HEAD。作者与独立审查必须实际复跑实验，读真实对象和评论，再用原有治理检查最终 HEAD；不能从“结构一致”推导批准或产品成功。缺 Git 历史时显式失败，先取得对应真实 commit，不能跳过 blob 检查。

## 本轮实测与回滚

Node 22.23.1 下独立重跑 D-01 50 项、D-02 35 项、D-10 45 项全部通过，无 fail/skip/TODO。D-10 内另核 30 个现有精确测试，不把这些数与全仓 138 相加。新层正反测试、原专项及全仓结果在 primary PR 的完整 HEAD 记录，不预填 CI/批准/合入。

撤回本层脚本/资料及对应 Proposed 文档即可回滚；原JSON、原 checker、生产代码、Schema/迁移、权限和真实用户数据未变化。已接受决议如需改变，遵守既有新增/supersede ADR 规则，不能因 checker 方便而重写已接受正文。
