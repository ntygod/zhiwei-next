# 下一开发上下文交接

当前唯一实现是 [#118](https://github.com/ntygod/zhiwei-next/issues/118) / `feat/118-memory-service`：原 P1-05 可纠正记忆与检索。基线 protected main `163d658c632ae8887a032a3a787c81300126cc35` 已含 P1-04 / [PR117](https://github.com/ntygod/zhiwei-next/pull/117)，#116 完成交付关闭；最终 R3、1080 项原完整 CI、Ready/live、合入树和 main provenance 均已回读。

## 本项任务

先读根与目标目录 AGENTS、[开发与验收分离](../harness/development-and-acceptance.md)、[执行索引](../harness/execution-mode.json)与原 [P1-05 合同](implementation-plan.md#p1-05--交付可纠正记忆与检索)。领域、认知流水线和持久化仍为原事实源；不从本摘要推导额外权限。

已编写完整显式输入/记忆/纠正/争议/遗忘/历史/解释和配对 API，纯资格选择先于请求内 FTS5 排序。新的九项正常开发场景含迁移、journal前/后中断续接及既有 P1-02 合法候选操作；eb156c2 的独立审查两项阻塞已修复并回归，修复 HEAD 尚须新冷审。ADR0020 已独立设计审查，最终完整检查/当前 HEAD R3/Ready/live/保护合入仍须完成。初始 Draft119 因原分支命名门禁关闭未合入，同一 #118 的唯一 primary120 继续。最终前端布局和视觉由所有者安排 Gemini；不新增自动抽取、向量或通用 Provider。

每个行为用最少足够的正常合成开发检查验证，复用已通过的相同源码证据；不重复无改动全量验证，不做假想攻防矩阵。最终完整 check、当前 HEAD 独立 R3、当前 PR 原 Runtime 来源、Ready/live 与受保护合入继续执行。

## 保持边界

真实入口关闭，只使用虚构临时材料。Z04/Z06/Z13 产品验收保持 not_run；官方 Pi+新扩展完整组合与 P0-01/02、D-04/D-08、G-2/G-5 不由本项认证。旧 #90/preintegration-safety、Private/链接替换/备份攻击及等价争议动态诊断禁跑，具体拒绝不得换路绕过。

不接实际模型账户、凭据、个人数据、外发或部署；v1、已应用迁移和旧 Accepted 范围保持。记忆纠正须保留旧版本并同步失效，遗忘不能随回滚复活。已交付 P1-04 的完整 OS 失去 custody/跨世代 orphan 回收仍 unsupported，不将这些实现偷偷加入记忆 PR。

## 后续

本项完成保护交付与 reconciliation 后才进入 P1-06 认知协调与 Context 编译；P1-07 接验证/Episode，P1-08 接功能界面，P1-09 做 Alpha 产品验收。各项保留独立 canonical Issue/primary PR。
