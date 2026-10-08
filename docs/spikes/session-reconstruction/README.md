# D-01 合成输入重建实验

> 历史取证说明：下文状态、当前任务及接受条件保留原实验时点语义；唯一当前决议状态和有限范围见[当前执行决议](../../planning/current-decisions.md)。原实验批准不授权新的决策或 HEAD。

状态：独立 opt-in 决策实验；[D-01](../../planning/decision-register.md#d-01--会话合同模型输入重建及-m0m2-分工)与 [ADR 0008](../../adr/0008-session-record-reconstruction-boundary.md)仍为 Proposed。关联 [Issue #78](https://github.com/ntygod/zhiwei-next/issues/78)，分支 `spike/78-session-schema-evidence`。本目录只验证合成假设，不是 SessionContract、产品 API、真实模型请求采集器或 E0-09 正式 Runtime 端到端完成证据。实验起始基线为 `main@f1156747e94760e26f9ac3afdfc5accfbe52b98b`。

## 目标、范围与回滚

目标：实际组装一个无记忆、许可合成正文构成的有序请求，再从记录中的正文/不可变引用重建同一个请求；用负例证明内容不足、边界未知和配置失败不能静默成为成功。

- 此 D-01 子实验的修改范围只有本目录的 `experiment.mjs`、`experiment.test.mjs` 和本说明；没有新依赖，不注册 `npm run check` 或 CI，不修改协议、Schema、产品配置、规划状态或既有 validator。
- 风险按 R2 决策证据处理。实验代码本身只在当前 Node 进程的内存中操作合成数据；CLI 不接收输入文件、凭证、网络地址或外部模型参数。
- 不做真实 Pi 调用、Provider 请求、工具调用、长期记忆注入、原始模型转储或原始思维链保存。示例 assistant 内容是人工写定的合成可见回答。
- 回滚为移除本目录；没有迁移、持久化数据、外部副作用或产品接口需要恢复。最终 PR/完整 HEAD、独立审查和决策接受另行记录，本说明不预填批准。

## 可执行模型

`experiment.mjs` 运行本地确定性组装函数，产生一个真实存在于本进程的合成请求对象。`synthetic-assembly-output` 只标识该函数输出边界，不能解释为已经捕获 Pi 或 Provider 输入。

| 内容 | 实验行为 | 有限保证 |
|---|---|---|
| 配置 revision | 完整验证 `synthetic-only`、无记忆模式、固定模型候选、参数和指令；深拷贝、冻结并附摘要 | 是实验夹具形状，不是正式会话合同字段决定 |
| 请求关联 | `beginRequest` 固定当时 revision ID 和摘要；历史 revision 保留 | 解释旧请求不依赖当前配置，不证明 D-09 owner/epoch 或多进程并发 |
| 有序组成 | config instruction 在第 0 位；每个合成消息保留 ordinal、role、origin 和正文载荷 | 重复正文不会去重消息；不排序修复缺口或乱序 |
| 内嵌正文 | 保存完整字符串与正文 SHA-256 | 空格、换行、Unicode 和空消息均保持原样；不是仅保留摘要 |
| 不可变引用 | `synthetic:sha256:<digest>` 指向内存 Map 中不可变字符串 | 相同内容可复用地址；解析后仍须核对正文 SHA-256，不做文件/网络解析 |
| 整体请求摘要 | 对 model、parameters、有序 messages 使用公开 `canonicalJsonV1` 和 SHA-256 | 数组顺序参与摘要；不是 Provider wire bytes、隐藏提示或输出复现的摘要 |
| 配置发布 | 验证全部字段并在独立 Map 中暂存，然后单次同步替换状态；发布前注入故障 | 失败时 revision 与 active pointer 均未发布；是单进程内存演示，不是持久化事务/崩溃恢复证明 |

跨包 import 只从 `packages/protocol/src/index.ts` 使用现有公开 canonical JSON 与 SHA-256 实现；不复制 Lossless JSON、Runtime event 或 Ledger validator。实验自有字段检查仅限制这个未发布的夹具格式。测试另用 Node `crypto.createHash("sha256")` 交叉核对正文与整体请求摘要。

### 完整性用语

- `observedBoundaryComplete: true`：仅说明上述本地组装输出已按保存记录完整恢复。
- `completeWithinDeclaredFixture: true`：仅当固定合成夹具声明 Runtime/Provider 均不存在后续步骤时成立；`absent-in-fixture` 是实验拓扑声明，不是采集器自动发现的事实，更不能由此证明真实 Provider 没有隐藏步骤。
- Runtime 或 Provider 为 `unknown` / `unobserved` 时，可以返回已验证的局部输入与逐项 `unproven`；请求完整夹具结果时抛出 `DOWNSTREAM_UNPROVEN`。缺状态或未知状态值直接失败。
- `realModelInputProven` 与 `outputReproductionProven` 始终为 `false`。任何成功结果都不证明真实远端完整输入、相同输出复现、已获真实数据保留授权或采集器可信。

hash-only、引用缺失、正文/引用摘要漂移、错误位置、缺消息和整体摘要漂移均失败；不从 hash、摘要文本或当前配置猜测正文。缺引用测试通过 resolver 返回 `undefined` 模拟不可用内容，不是物理删除、备份清除或遗忘政策实验。SHA-256 是一致性检查，不是来源认证；可同时改写正文和摘要的主体不在这个实验的安全保证内。未对采集器、同进程恶意代码或任意注入 resolver 作安全保证。

## 重现与本轮证据

从仓库根目录使用项目要求的 Node 22（本轮为 22.23.1）：

```bash
node --experimental-strip-types docs/spikes/session-reconstruction/experiment.mjs
node --experimental-strip-types --test docs/spikes/session-reconstruction/experiment.test.mjs
npm run check
git diff --check
```

首个命令只打印合成边界、组成数量、SHA-256 和证明范围，不打印正文。第二个命令是独立 opt-in 测试；本目录测试不属于根 `npm run check` 的测试发现范围，两项必须分别运行、分别计数。

2026-10-08，Node 22.23.1 工作树运行：50 个实验测试通过，0 fail / skip / TODO；完整 `npm run check` 独立通过，末尾全仓测试为 138 项；`git diff --check` 与新增文件的 `git diff --no-index --check /dev/null <file>` 均通过。50 项实验与 138 项全仓分别计数。该记录不替代整合后的最终 exact-head 复跑。

| 场景组 | 已执行的正反证据 |
|---|---|
| 重建与引用 | 混合正文/引用、Unicode/空白/空字符串、重复引用仍保留消息、JSON 往返、原生 SHA-256 交叉校验 |
| 内容不足与漂移 | hash-only、缺正文、缺引用/解析器、错误正文、非 SHA 摘要、引用地址漂移、未知 encoding、外部引用在调用 resolver 前拒绝 |
| 组成与关联 | 乱序、重复位置、内部/尾部缺失、重新编号的乱序、role 漂移、整体摘要漂移、边界/版本漂移、配置指令与 revision 不符 |
| 观测边界 | Runtime/Provider 各自 unknown/unobserved；缺省 unknown；未知状态失败；实际施加合成后续变换后，其请求摘要与恢复边界不同 |
| 配置失败 | 8 类缺失/无效/未知配置均不污染后续请求；有效候选暂存后注入失败不发布；随后相同新 ID 可成功发布 |
| 历史解释 | 发布新 revision 后旧在途 pin/旧记录保持原值；拒绝覆盖 ID、别名写入、缺历史版本和摘要不符；对象键序不改变 revision 摘要 |

## 对决策的有限意义

结果支持 ADR 0008 中“可重建必须有完整获准正文或可解析不可变引用，配置完整验证后才发布，完整性不得越过已知边界”的合成假设。M0 仍是无记忆会话；Claim 版本、认知水位、Compiler revision、胶囊及选择依据仍延期到 M2。

接受 D-01 仍需正式决策流程与明确有限范围；M0-3 的正式合同和写读能力、M0-4/8 的真实 Runtime 路径、D-04/G-2 的保留/删除授权、D-09 的会话所有权与并发各有独立证据门。这个内存实验不替代任意一项，也不把 D-01 或 G-1 标为完成。
