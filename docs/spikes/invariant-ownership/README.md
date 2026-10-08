# G-1b 不变量归属合成实验

状态：独立 opt-in Spike，D-10 / ADR 0007、0010 仍为 Proposed，不是产品入口、质量门或 G-1 完成证明。对应 [Issue #76](https://github.com/ntygod/zhiwei-next/issues/76)，分支 `spike/76-invariant-ownership-evidence`，基线 `main@e2dfa854585cb8365c17ffea6b95a491ad8e8636`。

## 结果与边界

目标是让已经存在的 owner→公开入口→正反测试映射可执行复核，并比较显式组合与 registry 的最小需求。本实验不引入新产品包、不复制 protocol/Ledger validator、不启动真实 Pi Worker、不实现 Session、Provider Host、动态插件、产品配置 revision 或 sandbox。

- `catalog.json`：原 G-1a 13 项不变量的唯一映射源，保留正式 v1 与 bootstrap 哨兵的差别及限制；不是穷举清单。
- `catalog-check.mjs`：固定 import 六个已有包的公开 `src/index.ts`，核对真实函数/类自身方法；不会按目录字符串动态加载模块。测试文件存在只是结构检查，精确测试名由 `verifyEvidence` 在实际 Node 子进程中运行，必须是该文件的实际具名 test，恰好一次通过且不是 skip/TODO；对应的带 file 子进程 summary 的实际 tests/passed 数也必须与请求名称数相等。全局 summary、runner 文件包装器或 suite pass 都不算具名测试。
- `render-catalog.mjs`：生成[架构基线](../../architecture/invariant-ownership-baseline.md)中的表格，测试做逐字节比较；不能手工维护第二份表。
- `composition.mjs`：只支持固定 synthetic-pi-input 声明。先拒绝无效声明，再处理合成输入和打开临时文件 Ledger；通过已有 Adapter 调用 protocol、Ledger 调用 protocol parser，没有第二套 payload 校验。
- `experiment.test.mjs`：真实正负实验，文件数据库用 `node:sqlite`，结束后清理。

目录 ID、synthetic capability ID、协议 eventId 与 Ledger row identity 各有自己的含义；一次目录重复测试不覆盖其他重复语义。目录仅证明引用存在、命名测试实际通过、生成内容一致；语义 owner、测试正/反角色及充分性仍需审查。尤其 I-EVIDENCE 没有专属置信度越界负例，既有代码与测试缺口照实保留，不在本任务扩大产品矩阵。

## 重现

使用项目要求的 Node 22（本地已运行 22.23.1）；从仓库根执行：

```bash
node --experimental-strip-types --test docs/spikes/invariant-ownership/experiment.test.mjs
node --experimental-strip-types docs/spikes/invariant-ownership/render-catalog.mjs --check
node scripts/check-execution-plan.mjs
npm run check
git diff --check
```

修改目录后只从事实源再生表格：

```bash
node --experimental-strip-types docs/spikes/invariant-ownership/render-catalog.mjs --write
```

实验不注册到现有 `npm run check` 或 CI；完整检查和 opt-in 命令分别运行、分别记录。没有把实验结果用于跳过既有门禁。最终 PR/完整 HEAD、独立审查、CI 和来源身份以 primary PR 为准，本说明不预填批准。

## 本轮可证明的结果

2026-10-08，Node 22.23.1 的工作树实验：45 个实验测试通过；目录引用的 30 个不同测试在 9 个实际测试文件中恰好一次通过，没有 skip/TODO。其中另以真实子进程验证启动 ENOENT、非零退出与超时拒绝，并对 skip/TODO/重复/failed reporter 记录做 fail-closed 检查。新回归还覆盖真实 Node 零匹配文件包装器、空 suite 和含子测试 suite 的误计，以及导出/方法引用键顺序变化造成的重复；真实测试恰好以绝对文件路径命名仍可通过。完整 `npm run check` 独立通过，末尾全仓测试为 138 项；45 项实验、30 项映射执行与 138 项全仓不能相加为一个全仓测试数。该运行记录不替代最终 exact-head 复跑。

| 场景 | 实际验证 | 不可外推 |
|---|---|---|
| 目录正例 | 13 项、六个现存公开包、实际导出/方法、真实精确测试执行、生成视图一致 | 不穷举全部不变量，不证明人工归属/证据角色天然正确 |
| 重复 ID、缺/多 owner | mutation 明确失败；同一 owner 重复也失败 | 不等于协议事件/Observation 重复语义 |
| 无效包/入口/测试 | 非存在包、错误现存包、非公开/非存在 export、非存在/继承方法、缺文件、假测试名、真实名称子串、零匹配文件包装器和 suite 均失败；重复入口按 export/method 二元组判定，忽略对象键序 | 不做 AST/调用图证明，不验证任意未来包或动态入口 |
| Provider 拒绝 | 重复 provider/capability、disabled/false/missing core、skipValidation、validator/migrations/unsafe、未知 provider/capability 全部失败；输入未读取、DB 未创建 | 只拒绝本合成声明，不阻止恶意同进程代码另调 I/O 或改源码 |
| 固定正路径 | 合成 RPC 输入→已有 Adapter→protocol→文件 Ledger；WAL、integrity ok、关闭重开、exact replay 同 row 且不重插 | 不是实际 Worker、Daemon、Session 或第二 Provider 替换证明 |
| 有效声明但坏输入 | sourceSequence=0 被已有核心拒绝，DB 不创建 | 不新增或替代 protocol 全部负例 |

目录引用检查会读取仓库文件，不能将“Provider 输入/SQLite 打开前拒绝”描述为整个工具零 I/O。静态 imports 只引用现存代码；本实验不承诺阻止有权限的源码修改或恶意 Provider。

## 决策建议与后续

证据支持显式组合加单一目录的有限方向，不支持引入通用 registry/DI/Host。ADR 0007 持有核心/外壳和组合边界，ADR 0010 独立持有包归属；两者保持 Proposed。接受 D-10 还需正式 PR/完整 HEAD 的新独立 R2 审查、决策登记和机器投影一致，以及明确的有限接受范围；不得先放宽冻结检查，再借本次新规则授权正式入口。D-01/D-02、#67 三份核心 ADR 接受与完整 G-1 仍未完成。

回滚只需回退实验、生成表及 Proposed 文档调整；没有迁移、产品 API 或持久化数据变化。相邻缺口（完整依赖图、置信度矩阵、真实 Provider 生命周期）仅保留在目录限制/既有计划中，不扩展本 PR。

## PR #77 独立审查修正

在 `96f458f4b4140f963ce281c99119a5b4c915a0ea` 复现：把 I-CORRECTION 的测试名换成其绝对文件路径后，旧 reporter 丢失来源/type/summary，错误接受 Node 22 的文件包装器 pass；旧入口去重也错误接受对象键序不同的同一 export/method。两条拒绝回归在旧实现均失败。

修正保留具名结果的类型与文件/行/列，核对带 file 的子进程 summary；它统计零匹配为 0，而无 file 的全局 summary 可能把包装器统计为 1。真实 suite（空或含子测试）不能代替具体 test。引用去重改用稳定 export/method 二元组。上述命令在修正候选重跑；Runtime 来源、原 CLI、Workflow、质量门与产品包保持不变，最终 HEAD 仍需新的独立审查。
