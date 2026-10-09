# G-3 原工作卡逐项验收

## 已核实交付（2026-10-09 回读）

PR #87 已于 2026-10-08T23:48:19Z 受保护合入 main `b5115d47a091f2c954e29a9963257c218bc11032`，单父 `41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415`、tree `8ec253c519cc85cd5ffcc012c7c716380ced6576` 与最终受审 HEAD `729e46d5bab48357a28b02945816f4b10eaaa062` 完全一致。[最终 R3](https://github.com/ntygod/zhiwei-next/pull/87#issuecomment-6071231663)、[Ready CI](https://github.com/ntygod/zhiwei-next/actions/runs/37861022790)、[SDK/Worker 与 live 来源](https://github.com/ntygod/zhiwei-next/actions/runs/37861022754)、[保护合并](https://github.com/ntygod/zhiwei-next/actions/runs/37861429039)、[Main Provenance](https://github.com/ntygod/zhiwei-next/actions/runs/37861447771) 与 [#86 完成记录](https://github.com/ntygod/zhiwei-next/issues/86) 分别留证。

原三条件现有完整有限证据：支持版本/CLI JSONL 方向由 D-07 与 ADR0011/0013 接受；147 项固定闭包、无凭据与实际消费者严格合同经 6 工具链组/59 strict roots/312 行为（含 123 CLI）及独立攻击检查验证；没有依赖升级，九项真实动态矩阵及 fresh Ready/live 来源、最终审查、受保护交付都已完成。root SDK 的 46 声明诊断仍不支持，不等于新生产 Host/Session 或 M0-4/5 已实现。

因此仅原 G-4 的 G-1/G-3 前置现已满足。G-5 仍需 G-2/G-4，M0-2 仍依赖 G-5。下面保留 PR #87 开发时的逐项表和未运行说明作为历史；不以旧候选批准后续代码，也不改冻结工作包或历史决议证据。

## 历史：PR #87 开发期验收

关联 [Issue #86](https://github.com/ntygod/zhiwei-next/issues/86) / [PR #87](https://github.com/ntygod/zhiwei-next/pull/87)。原工作卡事实源仍是冻结 [work-packages.json](work-packages.json) 的 G-3；本页只把原条件对应到真实证据，不修改条件或自动生成完成状态。

| 原完成条件 | 已有证据 | 仍需确认 |
|---|---|---|
| 决定 Node/TS/包管理器/Pi 支持版本。 | ADR 0011/0013 和 D-07 已由[实际有限独立审查](https://github.com/ntygod/zhiwei-next/pull/87#issuecomment-6070476496)接受：精确 Node 22.23.1 / TS 5.9.3 / npm 10.9.8 / @types/node 22.19.19 / Pi 0.84.1，选择官方 bin.pi CLI JSONL。 | 有限选择不等于后续新代码批准；最终完整 HEAD 仍需独立 R3。 |
| 固定闭包并测试无凭证环境。 | PR #83 已交付 147 项固定闭包/全部 strict 类型检查；[本轮历史复跑](d07-cli-evidence.md)重新执行实际正负例。新合同接到真实零 prompt 消费者，合成子进程验证环境/目录/协议/秘密与 cleanup。 | 本次没有重复安装；官方 Pi 的新启动参数与 EOF 成功边界仍需 fresh Artifact job。 |
| 变更依赖重新跑兼容矩阵，Workflow 修改按 R3。 | 本项未升级任何依赖，未改 lock；Workflow 仅追加 readonly bundle 资产与触发路径，保持全部旧检查及权限。 | 本地无 Docker；九项动态矩阵、当前 PR live 来源、fresh Ready CI、最终完整 HEAD R3、受保护合入及 main 回读以实际远端结果为准，当前不预记完成。 |

2026-10-08T22:53:12Z，本地精确 Node 22.23.1 / npm 10.9.8 的完整 `npm run check` 实际通过：6 个工具链测试、59 个 strict formal roots、312 个行为测试；新增 CLI 合同局部 123/123，包含在全仓 312 中，不相加。current-decisions 115/115、原 execution-plan 与当前决议 checker 均通过，无 failure/skip/TODO。未运行的动态/远端门仍按上表保留。

原失败路径“依赖漂移/缺 API/类型错误”和“读取宿主配置”继续由实际 compiler/工具链负例及新合同真实子进程负例覆盖，不借 ./client 类型面掩盖 root SDK 的 46 诊断，不把 snapshot fixture 当作 fresh capture。

G-3 完整交付需要上表剩余项闭环，不能仅由 D-07 Accepted 自动完成。G-4 按原 G-1/G-3 依赖等待完整 G-3 交付；M0-2 仍受 G-5 约束。M0-4/5、G-2 聚合和 #67 整体未完成。冻结工作包、原计划 checker、历史登记和 D-01/02/10 接受记录保持不变。
