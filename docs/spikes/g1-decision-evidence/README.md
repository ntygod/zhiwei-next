# G-1c：会话输入与 Schema 演进的决策实证

> 历史取证说明：下文状态、当前任务及接受条件保留原实验时点语义；唯一当前决议状态和有限范围见[当前执行决议](../../planning/current-decisions.md)。原实验批准不授权新的决策或 HEAD。

状态：独立 opt-in Spike，关联 [Issue #78](https://github.com/ntygod/zhiwei-next/issues/78)，分支 `spike/78-session-schema-evidence`，起点 `main@f1156747e94760e26f9ac3afdfc5accfbe52b98b`。D-01、D-02、D-10 和 ADR 0007—0010 均保持 Proposed；本轮不把实验存在、旧批准或文档合入视为决策接受。

## 一个有限结果，两条真实实验路径

- [D-01 合成输入重建](../session-reconstruction/README.md)：许可正文/内容地址引用、摘要、顺序、观测边界与不可变配置 revision；异常明确失败，未观察部分不宣称完整。没有真实 Pi 请求捕获，没有正式 SessionContract 或产品配置加载器。
- [D-02 包内 Schema 实验](../../../packages/memory-store/fixtures/schema-evolution/README.md)：正式 v1 公共入口种子库 → 原内部 migration runner → 原 manifest/row validator → 候选合成 v2 → 真实重开/故障/恢复。候选不是生产迁移；公开 Store 无 override。

两者都无需真实个人数据、模型服务或用户凭证，因此没有外部依赖阻止本次取证。它们验证候选边界，不决定 D-04 保留授权、D-09 所有权/并发、D-03 持久性/性能，也不交付 M0-2/M0-3 或放行 G-2…G-5。

## D-10 已合入的准确证据身份

[PR #77](https://github.com/ntygod/zhiwei-next/pull/77) 的独立 [R3 审查](https://github.com/ntygod/zhiwei-next/pull/77#issuecomment-6060307202) 绑定：

- evidence/review HEAD：`7e889dd9c490f061ed6e681890a64395a62686dd`
- tree：`98ba51dfe019b24daa631bfd00c21378b875fa61`
- 合入 main：`f1156747e94760e26f9ac3afdfc5accfbe52b98b`
- 45 项 opt-in 实验；其中目录独立引用 30 个既有测试；全仓 138 项，三种计数不相加

该批准覆盖有限 G-1b 实验及当时来源续期，明确不接受 D-10 或批准未来 HEAD。本轮重跑 [G-1b](../invariant-ownership/README.md) 可复核目录与固定组合，但不能将旧批准继承为当前 PR 的批准。已有证据适合评审“静态唯一 owner + 原公开入口多点 enforcement + 固定显式组合”方向，不支持动态 Provider Host、恶意同进程隔离或 sandbox。

## 可审查的后续状态表示方案（尚未实现）

当前 [work-packages.json](../../planning/work-packages.json) 是源合订本派生快照，11 项原始状态均 Proposed；[专项 checker](../../../scripts/check-execution-plan.mjs) 明确冻结这些状态。不能把源数据静默改成执行数据库，不能先删除断言再以绿色结果授权本任务的新产品入口。

后续若证据和独立审查支持有限接受，可在同一个 primary PR 分两阶段完成：先审实证树和有限接受范围，再提交真实审查所支持的状态资料；最终新完整 HEAD 重新独立 cold review。首次证据审查可以引用它确实读过的历史 HEAD，不能在当前提交里自造“当前 HEAD 已批准”的循环证明。

建议的受审表示是一个独立执行决议 overlay，而不是修改原 source snapshot：

1. 原 `work-packages.json` 的来源 hash、source 行号、11 项 Proposed、60/57/51/6/3 计数、68 节点无环图和阶段 gate `unverified` 全部保留。原 checker 的源快照负例继续拒绝把原 D-01 改为 Accepted。
2. 新资料明确标记自身是执行决议，引用源快照 hash/version；只允许 D-01…D-11 的已知 ID，区分 Proposed、Evidence Ready、Accepted、Rejected、Superseded。源快照与当前决议分别展示，不能让两个“当前状态”互相矛盾。
3. Evidence Ready 至少绑定实际实验路径、文件摘要、命令、Node patch、结果、精确适用范围/非保证。Accepted 另需正式 ADR、真实 primary PR、40 位 evidence HEAD、真实 review URL/被审 HEAD、有限决策文本和替代关系。记录何时/在哪一 HEAD 观察到事实，不填未来批准。
4. Markdown 登记、ADR 状态与 overlay 必须一致；接受范围只覆盖该决议内容，不机械把 G-1 或整个阶段 gate 标完成。若现专项 checker 要识别新的展示层，作为明确的 schema/checker/document 转换独立受审，保留所有现有计数、依赖、场景、source 和冻结断言，再增加 overlay 校验；不变更 npm/CI/merge gate。
5. 新负例至少覆盖：未知/重复决策 ID、非法跃迁、Accepted 缺 ADR/PR/完整 HEAD/实验/审查、review HEAD 与证据身份不符、Evidence Ready 空证据、ADR/登记漂移、源 hash 漂移、覆写原 Proposed、擅自改变阶段状态，以及用一个 D-10 批准覆盖 D-01/D-02。
6. 本地 checker 只能验证结构、文件一致性和摘要，不能凭 URL 语法认证 GitHub 批准。远端真实对象、审查内容、当前 PR HEAD、CI 与 merge 仍由现行治理和新的独立审查检查，不把 opt-in 规划索引变成放行工具。

此方案仅供评审；本轮没有新增 overlay schema、没有修改 checker 或原登记状态。证据不足时保持 Proposed，不能为“状态完成”牺牲实验真实性。尤其 D-02 目前原 manifest 明确覆盖 table/index/trigger，view 的观察结果和是否未来纳入范围单独记录，不能声称任意 SQLite 对象已被拒绝。

## 重现

```bash
node --experimental-strip-types --test docs/spikes/session-reconstruction/experiment.test.mjs
node --experimental-strip-types --test packages/memory-store/fixtures/schema-evolution/experiment.test.mjs
node --experimental-strip-types packages/memory-store/fixtures/schema-evolution/manifest-coverage-probe.mjs
node --experimental-strip-types --test docs/spikes/invariant-ownership/experiment.test.mjs
node --experimental-strip-types docs/spikes/invariant-ownership/render-catalog.mjs --check
node scripts/check-execution-plan.mjs
npm run check
git diff --check
```

以各实验 README、primary PR 的实际结果分别报告测试数和未覆盖边界。本文不预填当前 PR 的完整 HEAD、审查批准、Ready CI 或合入结论。

## 回滚

删除本轮合成实验和非公共内部 seam，撤回 Proposed 文档调整即可。没有新产品 Schema、生产迁移、Runtime v1、ProviderHost、Workflow、质量门或用户数据变化。已应用 migration 1 保持原样，未来真正数据迁移仍只允许前向修复或受验证恢复。
