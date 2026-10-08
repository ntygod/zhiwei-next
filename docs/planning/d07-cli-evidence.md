# D-07：官方 CLI 路径的历史证据复跑

关联 [Issue #86](https://github.com/ntygod/zhiwei-next/issues/86)，候选 [ADR 0011](../adr/0011-formal-toolchain-baseline.md) / [ADR 0013](../adr/0013-pi-cli-jsonl-worker.md)。以下记录是被审 HEAD `37c6228ef9187b932a9648d472319bce31a4aef5` 的 Evidence Ready 历史说明。之后两份 ADR 与 D-07 已由[真实有限决策审查](https://github.com/ntygod/zhiwei-next/pull/87#issuecomment-6070476496)接受，评论 22:39:40Z 发布、22:39:59Z 完整回读；[当前执行决议](current-decisions.md)保留 proposalSha256 与原历史证据，后续实现仍需新完整 HEAD 的 R3。

## 真实身份与复跑方法

本次是 2026-10-08 对固定 `main@41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415` 的新历史快照复跑，不是 PR #83 的原始运行。执行使用独立 detached checkout，复用已经校验的依赖，不重装。Node 22.23.1 / npm 10.9.8 用明确工具链路径，进程启动前清除继承环境，使用临时 HOME、空 npm 配置和受控 PATH。命令输出与记录均来自实际运行，不预填时间或测试数。

| 实验来源 | 历史引入的 squash commit | 本轮证据 |
|---|---|---|
| [PR #83](https://github.com/ntygod/zhiwei-next/pull/83) 工具链 | `830e14626aca89100a8b33d775ccf39c7781c828` | 83 文件；两条成功命令 |
| [PR #60](https://github.com/ntygod/zhiwei-next/pull/60) SDK/RPC 同任务 | `e71f44fce5022a520a1cc3c081659cb7819cb77d` | 28 文件；committed fixture 检查 |
| [PR #64](https://github.com/ntygod/zhiwei-next/pull/64) Worker 生命周期 | `374a27505c4a150cbcb63c1b8f6c1afb3bfb4448` | 33 文件；三条 assertion-script 测试及完整 fixture 检查 |

sourcePr 表示真正的实验来源。复跑 HEAD 包含之后的类型修复、共享 checker 演进及 PR #85 来源续期；不假定每个文件都在原来源 PR 首次出现，也不冒称该 snapshot 是原来源 PR head。115 个唯一历史文件逐个核对真实 Git blob、历史 checkout 与当前候选字节。工具链组覆盖真实 compiler 的 57 formal roots 及 6 个仓库内导入文件、checker/environment/shell/锁/版本和现有 Artifact 启动上下文。运行时组覆盖活动 parts、manifest、实际读取或动态重定位的 loader/checker/normalizer、capture 与启动来源。未列依赖或 OS 不由文件清单认证。

## 实际命令与结果

下列命令均由明确的 Node 22.23.1 执行；表中省略共同前缀 `node --experimental-strip-types`。

| 命令尾部 | 开始 / 完成（UTC，2026-10-08） | exit；TAP tests/pass |
|---|---|---|
| `--test scripts/toolchain.test.mjs` | 22:17:57 / 22:18:45 | 0；6/6 |
| `--test scripts/typecheck.mjs` | 22:18:45 / 22:18:56 | 0；1/1 |
| `scripts/pi-sdk-rpc-parity-fixture.mjs --check` | 22:18:56 / 22:18:56 | 0；0/0（无 TAP harness） |
| `--test packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-jsonl-reader.test.mjs` | 22:18:56 / 22:18:56 | 0；1/1 |
| `--test packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-normalizer.test.mjs` | 22:18:56 / 22:18:56 | 0；1/1 |
| `--test packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provenance.test.mjs` | 22:18:56 / 22:18:56 | 0；1/1 |
| `--test packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-fixture.mjs` | 22:19:25 / 22:19:26 | 0；1/1 |

所有成功命令 fail/skip/TODO 均为 0。compiler 原输出为 `TypeScript 5.9.3: strict noEmit OK (57 formal source/test roots; dependency declarations checked)`；这里是一个过程级 Node test，不是 57 个行为测试。Worker 的 assertion scripts 同样各算一个文件级 wrapper，不把内部 mutation/assertion 数虚构为 TAP tests。

另在相同基线独立运行 `node scripts/diagnose-pi-root-types.mjs`，完成于 22:21:27Z，exit 1、46 diagnostics，未过滤。它是明确保留的不支持 root SDK 诊断，不冒作成功 Evidence Ready run，也不因 `./client` 编译通过而隐去。

## 这些结果能证明什么

- 固定闭包、缺包/依赖漂移、错误 API/类型、收窄 roots/弱化 compiler 及合成宿主 npm/Pi/credential/preload 污染负例继续成立。
- committed SDK/RPC 完整内容和 Worker strict reader、normalization、provenance mutation、完整 v2 fixture 仍满足历史合同。相同任务的 RPC prompt success 是接受请求，不是执行完成；来源表面和序列域继续分离。
- 公开包 `bin.pi=dist/cli.js` 是现有 CLI 路径；`./client` 是 RemoteSession/CBOR，root SDK 声明仍不支持。`./rpc-entry` 不是本次选择。

本地没有 Docker，没有运行九项 fresh 动态 Runtime capture、真实 Provider、当前 PR 的 live provenance 或新启动合同。这些旧实验的本地复验不证明尚未改造的 probe 已具有环境/协议/日志边界；也不能将历史 artifact metadata 当作新 PR 的有效来源。后续容器矩阵、同 PR 来源续期和最终 R3 仍单独完成。

## 接受与下一阶段

D-07 只接受精确版本与官方 CLI JSONL 方向。决策审查必须读取当前完整候选，绑定实际 proposalSha256 与两份 ADR，确认 sourcePr 不等于本 primary。审查前列名历史文件保持字节不变；接受后可以演进当前消费者，但终态仍验证历史证据及被审候选，旧批准不覆盖新实现。

之后仍在 #86 同一实质 PR 实现内部严格编译 CLI 合同、真实子进程负例、现有 Artifact probe 消费，并按原 G-3 三条件逐项验收。原 work-packages JSON、check-execution-plan 及历史登记正文不变；D-01/02/10 的实际 Accepted 记录不变。D-04/D-08/G-2 与 M0-4/5 未完成，不从本决策生成阶段完成状态。
