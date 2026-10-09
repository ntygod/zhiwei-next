# G-2 接入前实证与原工作卡映射

本页关联 [Issue #90](https://github.com/ntygod/zhiwei-next/issues/90) / [PR #91](https://github.com/ntygod/zhiwei-next/pull/91)。它记录原 [G-2 工作卡](engineering-execution.md#g-2--数据策略威胁模型和接入前安全)的有限证据，不改变原条件，不自动放行 G-2/G-5，也不把实验接线写成产品接线。

## 实质消费者

[合成接入前实验](../spikes/preintegration-safety/README.md)将实际文件读取、发送边界和保留状态串接到受控消费者：

- 路径读取器返回真实临时普通文件的受限字节；非法路径、链接与可检测替换不能返回正文。
- 合成可信调用上下文与正文分离；已授权 Public fixture 经固定传输到真实 loopback HTTP 接收器，Private/未知分类/跨 Workspace/伪造授权在调用传输前拒绝，观察请求、连接和字节数。
- 现有公开 protocol 与 SQLite Ledger 保存最小合成事件，正文独立放在受控临时文件；既有 D-01 重建器实际使用许可引用。
- 遗忘后实际读取、陈旧缓存、发送、重建与旧备份恢复都不能返回被撤回正文。物理 unlink 只证明列名文件不可再读，保留的旧 inline Ledger 备份仍可由直接可信底层 API 回读，因此结果只能是 partial。

这些是有实际 I/O 的接入前合同实证。它们不是 Daemon/Pi Worker/生产模型或真实用户文件入口；正式库调用本身仍是受信任能力，不是路径沙箱。实验代码不应被产品包导入。

## 原卡逐项对应

| 原 G-2 条件 | 证据与当前边界 | 仍需满足 |
|---|---|---|
| 描述可信进程、同机进程、文件修改能力与不保证情形 | Accepted ADR0012 覆盖诊断；Proposed ADR0015 明确受信任代码/工具链/调用上下文与不可信客户端/正文，同 UID 恶意竞争/源码或内存篡改不在保证内 | D-08 的新逐项独立接受，不继承实验批准 |
| 最小本地 API、路径、模型外发限制可用合成数据测试 | G-2a 真实 daemon/doctor 测试；本项真实临时路径、受控 Public 正例与 Private/混合/未知/伪造授权零流量负例 | 本 PR 最终完整 HEAD 独立 R3、适用 CI/来源、受保护交付 |
| 事件元数据、正文、Claim、缓存、备份保留明确 | Proposed ADR0014 的分层矩阵；实际元数据/正文分离、不可用重建、缓存撤回、旧备份拒绝及 partial 清除 | D-04 新独立接受；正式产品 Claim/删除/恢复未实现 |

| 原失败路径 | 有限执行证明 |
|---|---|
| 未授权客户端、路径越界 | 既有 G-2a 请求/响应完整边界；本项绝对/父目录/Windows/编码别名、前缀伪根、root/父链/leaf 链接、硬链接和检测到的替换 |
| Private 外发、工具返回指令 | 实际接收器 Private/混合/未知/跨 Workspace 零连接/请求/字节；工具文本中自报 authority/用户批准不能成为 opaque 可信调用能力 |
| 凭证标记进入日志 | 固定错误/审计投影；原生 Ledger 路径和嵌套 cause、工具/缓存/参数中的虚构标记均不得进入报告，未声称能检测任意未知秘密 |

## 验证入口与计数

使用已固定的 Node 22.23.1/npm 10.9.8 和隔离工具链环境：

```sh
node --experimental-strip-types --test docs/spikes/preintegration-safety/experiment.test.mjs
node --experimental-strip-types docs/spikes/preintegration-safety/experiment.mjs
npm run check
node scripts/check-current-decisions.mjs
node --test scripts/current-decisions.test.mjs
node scripts/check-execution-plan.mjs
```

2026-10-09 作者在干净环境精确 Node 22.23.1 下执行 80 项新实验，0 fail/skip/TODO；固定 CLI 和非法参数路径通过。这是工作树结果，最终完整 HEAD 仍须重新验证。

新增实验为显式 opt-in；不属于默认 apps/packages 测试发现。实验测试、全仓行为测试、当前决议层测试必须分别计数，不能相加宣传覆盖。执行命令、完整 HEAD、真实结果和原始来源证明在 primary PR 记录，未运行项不计成功。新增实验不改变旧 CI、validator、源规划或历史 Accepted 证据。

## 决议顺序与剩余门

当前严格决议层要求实验 sourcePr 与新的决议 primaryPr 分离。本 PR 只提供实质证据和 Proposed ADR0014/0015；受保护交付后，以真实已合入历史文件/HEAD/实测结果在新的决议任务形成 Evidence Ready，再由新的独立上下文逐项审查有限范围及 proposalSha256。新的决议任务仍要最终完整 HEAD R3 和原交付门。不能伪造 sourcePr、修改 validator 获得自我豁免，或仅因实验通过就登记 Accepted。

G-2 的有限原卡验收应在其决议与交付链齐全后另行核定。G-5 仍等待 G-2；M0-2 仍等待 G-5。未来真实数据接入、M0-3 内容合同、M0-4 Worker、M1-5 删除传播/副本清除、D-06 并发、M2-4 模型边界和 M5 Delegation 保留各自实现验收；本项不要求提前实现它们，也不替代它们。

## 回滚

本项只有合成文件与未发布实验，没有生产 Schema、用户正文、真实外发或凭据变化。实验 disposer 清理自己创建的临时根；失败状态明确报告。撤回实验与 Proposed 文档/导航即可回滚，不回退 G-2a 保护或重写旧 Ledger/Accepted 历史。未来真实物理清除不可由代码 revert 撤销，旧备份恢复也不得撤销已生效遗忘。
