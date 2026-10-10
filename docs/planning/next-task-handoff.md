# 下一开发上下文交接

当前唯一实现是 [#114](https://github.com/ntygod/zhiwei-next/issues/114)，分支 `feat/114-controlled-pi-worker`，基于已保护 main `5d43a27d39406df9c73cb7d9276c8baf91156608`。P1-02 / PR113 已完整交付并关闭 #112。P1-03 代码提交 `d5ff61a9f000d9efdd0e79442ee9278ac7364da4` 已发布，正式工具链完整 check 669/669、严格类型120 roots；唯一 [PR115](https://github.com/ntygod/zhiwei-next/pull/115) 待最终完整 HEAD 独立 R3、Ready/live、保护合入与 main 回读。索引的 implemented 是代码证据，不是已合入或产品验收。完整交付后下一独立实现 P1-04，开工先从 main reconciliation，不能复用 #114/PR115。

## 先读

根/目标目录 AGENTS、[开发与验收分离](../harness/development-and-acceptance.md)、[执行索引](../harness/execution-mode.json)、原 P1-03 [任务合同](implementation-plan.md#p1-03--接通受控-pi-worker-与工具模型边界)、Pi/运行协调/安全/部署详设与 [ADR0019](../adr/0019-controlled-pi-broker-extension.md)。先区分技术实现依赖、产品验收和真实接入许可。

## 本次范围

官方 Pi0.84.1 `bin.pi` CLI JSONL 唯一路径；正式传输、监督生命周期与全部工具/模型 Broker。原状态探针不是生产实现，root SDK46 不支持声明不绕过。只由固定合成构造器消费；不增加诊断服务的执行 route，不使用诊断 token 授权数据。原 #90/preintegration-safety 及等价争议 Private/链接替换/注入/备份攻击实验不重跑或换路，相关验收保持 `not_run`。

不触真实模型账户、凭据、用户数据或生产部署。P0-01/02、D-04/D-08 与 G-2/G-5 的限制原样保留。PR99 closed unmerged、#98 原型暂停未交付，不恢复视觉打磨。

官方 Pi CLI 与新一方扩展的实际组合尚未运行；现有合成进程测试不认证 Pi 的真实 Agent Loop。旧 Runtime 来源仅证明原冻结合同，受限/产品验收均 `not_run`。源码/边界和未支持项见 [受控 Worker](../architecture/controlled-pi-worker.md)。

## 后续责任

- P1-04 真实 Session/Task/Attempt/输入事务及 WorkingState 存储；P1-06 是 WorkingState 消费者。
- P1-07 Outcome/Episode 基于 P1-04 精确历史接线，不能把当前 `unsupported` 持久入口当作完整交付。
- P1-09 只负责 Alpha 端到端验收，不负责上述存储实现。
- P1-02 raw synthetic opener 不机械强制 active generation 所有权；未来 launcher 必须通过 recovery coordinator 选中当前 store，不能直接打开非活跃世代。

## 交付门

正常类型、纯单元与受控合成进程生命周期、原完整 `npm run check`，最终完整 HEAD 新独立 R3、当前 PR 的原 SDK/Worker 来源、Ready/live、保护合入及 main 回读。不修改 Workflow/normalizer/接受条件，不把旧 PR 来源当当前来源。产品/受限攻防验收单独留待用户，不能凭组件测试记通过。
