# G-4 有限场景执行与证据

状态：Issue #88 的实现候选。本文不是完整产品场景通过、工作包自动完成或最终 HEAD 审查批准。

## 范围与使用

沿用原 [G-4 卡](engineering-execution.md#g-4--可执行场景与证据运行器基线)、[工作包快照](work-packages.json)及已有 `packages/evals` / `scripts` 边界；不新增产品抽象或 ADR，不改 Accepted 历史、原快照与 checker。

使用[正式工具链](../architecture/formal-toolchain.md)完成安装验证并提交工作区后运行：

```sh
npm run eval:scenarios
npm run eval:scenarios -- E0-02 E0-03 E0-04
# 如需纯 JSON 文件，将输出放到仓库外，避免制造未跟踪文件：
node --experimental-strip-types scripts/run-scenarios.mjs > /tmp/zhiwei-g4-report.json
npm run test
npm run check
```

CLI 拒绝 dirty 工作区（包含未跟踪源文件）、未知/重复 ID、S 别名及不匹配的正式工具链；退出码为 2。S 只作历史映射，不作为等价场景展开。执行失败退出 1；没有失败退出 0，但 0 不意味着产品场景完成，也不意味着所有条目被执行。指定 ID 后，其余仍逐项列为 `not-run`；显式选择尚无实现的场景也只得到 `not-run`。

`runScenarioSuite` 是可注入的有限测试入口；可传 `select`、带原因的 `skip`、1–60,000ms 的单场景预算（默认 5,000ms）、合成 Fixture 与执行适配器。自测来源使用 `source.kind=fixture` / `environment.isolation=injected-test`，这些虚构身份不是 Git 执行证明。CLI 没有覆盖 HEAD、环境或 Fixture 的参数，只读取真实工作区。调用方自行实现的适配器必须自行停止并清理其 I/O；正式 CLI 始终使用下面的专属进程适配器。

## 实际执行与覆盖边界

| 原场景 | 当前执行内容 | 当前证据 | 未完成的原产品责任 |
|---|---|---|---|
| E0-02 | 公开 Ledger API 提交三条合成事件，关闭文件库并重开 | event ID、idempotency key、fingerprint、顺序和 row cursor 前后一致，integrity=ok | M0-2/6 正式会话/宿主重启及摄取链路；本例不是完整进程恢复测试 |
| E0-03 | 先提交前缀，再批量交付前缀+新后缀，重复整个批次 | 插入数 1/2/0、回放数 0/1/3、重开后仍仅三行 | M0-6 真实交付、确认点与重复恢复 |
| E0-04 | 已有前缀后插入新行再制造 source-slot 正文冲突；另一批倒序 source sequence | 明确 conflict/sequence；两次失败后行及 cursor 不变；后续新行使用连续 cursor，重开结果一致 | M0-6 正式摄取 cursor/确认点事务 |

以上仅 `productCoverage=PARTIAL` 的 Ledger 组件断言。执行状态为 `passed` 也不升级到完整产品场景。其余 21 个原 E 场景保持 `not-run` / `NONE`，不以内存哨兵、模型 Mock、场景目录存在或覆盖率替代行为。24 个原 E ID 的给定/动作、必须观察和归属，以及 24 个历史 S 别名的原摘要、映射和限制均逐字保留，默认测试与[原场景映射](scenario-id-map.md)及 M0/M1 矩阵比对。

`passed` 要求完整证据通过独立确定性 oracle；`failed` 包括超时、执行/清理失败、协议输出异常或证据不符；`skipped` 仅指当前可执行场景被显式带原因跳过；`not-run` 指未选择或产品能力尚不存在。证据缺字段、空结果、错误 fingerprint/行/计数、伪造 `status: passed` 不能通过。

## 注入、超时与清理

场景以公开 `domain/src/index.ts`、`protocol/src/index.ts` 和 `memory-store/src/index.ts` 为跨包入口；不提升私有测试函数为公开 API。clock、ID、model、I/O 四个端口都在实际 Ledger 例中消费，并由自测替换后再验证。model 只返回合成命令字符串，不调用 Provider、不读取凭据、不验证模型能力。

正式适配器为每条场景创建独立临时目录和 Node 子进程，使用当前 Node executable、固定启动参数、空环境及单条 IPC 输出。它只运行受信任仓库内的合成评测代码，不是任意代码安全沙箱或生产 WorkerSupervisor。专属子进程没有产生子进程的业务逻辑，也不访问真实用户库。

deadline 到达时发送 SIGKILL，等待进程 `close`（包括管道关闭），之后才递归清理父进程拥有的临时目录并返回。这样不会仅用 `Promise.race` 抛超时而留下后台 SQLite 写入；强制终止可中断同步原生阻塞。收到了证据但进程未自然成功退出，也不能提前通过。额外 IPC、stdout/stderr、缺输出和失败退出均拒绝；错误只输出固定分类，不反射原始 stderr、路径或模型文本。自测使用真实临时 SQLite 和原生 `Atomics.wait` 阻塞，证明 timeout 后进程已消失、目录已清理且不会出现晚写。无法删除时报告 `cleanup` 失败，不假装清理成功。OS/文件系统本身不响应的极端故障不承诺严格墙钟完成时间。

## 来源与可比性

报告包含 schemaVersion、scenarioVersion、完整目录 SHA-256、固定合成 Fixture、每条结果与证据，以及：

- 实际 Git HEAD、tree 和 clean=true；除 status 外逐项将所有 tracked 普通文件的实际字节/模式与 HEAD Git blob 核对，assume-unchanged/skip-worktree 不能藏住漂移。对运行器和直接被测模块的源目录另要求每个文件均已在 HEAD 中，避免 ignored 新源文件偷渡。symlink/submodule 来源尚不支持，拒绝而不猜测。执行前后重新回读身份，dirty/改变即拒绝发布报告。
- 真实 Node、SQLite、platform、arch；实际 npm 版本和已安装 TypeScript、Node types、Pi 版本；先运行现有完整工具链检查。
- 来源只含白名单字段；不转储环境、主机名、用户路径、Git remote、凭据或数据库文件。

同一 HEAD/环境/场景版本/Fixture 的 JSON 证据可直接比较。其他身份不同必须作为不同实验，不允许把 fixture HEAD 冒充观测 HEAD，也不能让历史证据批准新 HEAD。本项报告不替代 Runtime 动态来源、CI、独立审查或受保护合入证据。

## 验收与回滚

四个 `.test.ts` 自动进入现有默认测试与 strict noEmit：目录连续性、真实 Ledger 组件、四端口注入、可重复证据、故意错误、缺证据、未知 ID、显式跳过、原生阻塞超时、错误输出/退出、clean/dirty/untracked/改变 HEAD。完整检查和最终 HEAD 的 R3 独立审查、真实 CI/适用来源及合入后回读仍须在唯一 primary PR 分别留证。

本项不做生产 Schema/数据迁移，不引入依赖、外发、真实模型或未来能力。未发布数据前回退本项代码和脚本即可；临时合成库按每次执行清理，不将它们提交或当成交付数据。
