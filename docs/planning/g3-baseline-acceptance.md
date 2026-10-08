# G-3 原工作卡逐项验收

关联 [Issue #86](https://github.com/ntygod/zhiwei-next/issues/86) / [PR #87](https://github.com/ntygod/zhiwei-next/pull/87)。原工作卡事实源仍是冻结 [work-packages.json](work-packages.json) 的 G-3；本页只把原条件对应到真实证据，不修改条件或自动生成完成状态。

| 原完成条件 | 已有证据 | 仍需确认 |
|---|---|---|
| 决定 Node/TS/包管理器/Pi 支持版本。 | ADR 0011/0013 和 D-07 已由[实际有限独立审查](https://github.com/ntygod/zhiwei-next/pull/87#issuecomment-6070476496)接受：精确 Node 22.23.1 / TS 5.9.3 / npm 10.9.8 / @types/node 22.19.19 / Pi 0.84.1，选择官方 bin.pi CLI JSONL。 | 有限选择不等于后续新代码批准；最终完整 HEAD 仍需独立 R3。 |
| 固定闭包并测试无凭证环境。 | PR #83 已交付 147 项固定闭包/全部 strict 类型检查；[本轮历史复跑](d07-cli-evidence.md)重新执行实际正负例。新合同接到真实零 prompt 消费者，合成子进程验证环境/目录/协议/秘密与 cleanup。 | 本次没有重复安装；官方 Pi 的新启动参数与 EOF 成功边界仍需 fresh Artifact job。 |
| 变更依赖重新跑兼容矩阵，Workflow 修改按 R3。 | 本项未升级任何依赖，未改 lock；Workflow 仅追加 readonly bundle 资产与触发路径，保持全部旧检查及权限。 | 本地无 Docker；九项动态矩阵、当前 PR live 来源、fresh Ready CI、最终完整 HEAD R3、受保护合入及 main 回读以实际远端结果为准，当前不预记完成。 |

2026-10-08T22:53:12Z，本地精确 Node 22.23.1 / npm 10.9.8 的完整 `npm run check` 实际通过：6 个工具链测试、59 个 strict formal roots、312 个行为测试；新增 CLI 合同局部 123/123，包含在全仓 312 中，不相加。current-decisions 115/115、原 execution-plan 与当前决议 checker 均通过，无 failure/skip/TODO。未运行的动态/远端门仍按上表保留。

原失败路径“依赖漂移/缺 API/类型错误”和“读取宿主配置”继续由实际 compiler/工具链负例及新合同真实子进程负例覆盖，不借 ./client 类型面掩盖 root SDK 的 46 诊断，不把 snapshot fixture 当作 fresh capture。

G-3 完整交付需要上表剩余项闭环，不能仅由 D-07 Accepted 自动完成。G-4 按原 G-1/G-3 依赖等待完整 G-3 交付；M0-2 仍受 G-5 约束。M0-4/5、G-2 聚合和 #67 整体未完成。冻结工作包、原计划 checker、历史登记和 D-01/02/10 接受记录保持不变。
