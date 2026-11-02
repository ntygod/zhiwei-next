# 2026-11-02 仓库重建记录

工作项：[#132](https://github.com/ntygod/zhiwei-next/issues/132)。工作分支：`docs/132-super-agent-reset`。

## 授权与边界

所有者明确要求继续 TypeScript、清空原代码仓、完成新的完整架构设计，以 DeepSeek Super-agent 为主，UI 暂不设计，默认云端，复用现成 Runtime，评估 Markdown 记忆。这个请求替代旧产品方向和阶段排期。

本次删除旧实现/测试是该整体重建的明确范围，不用于掩盖原实现的测试失败。没有运行旧产品数据迁移，没有读取/删除运行数据库、凭据或真实个人记忆，没有直接写 main 或重写历史。新设计不声明产品已实现。

## 保护与清理证据

- 已核对默认分支基线：`e95bf24fd61d0da9c1b59ef26f330ed40468111d`。
- 开工远端只有 main，无开放 PR/Incident，旧 developmentPause=false；已查相关 Issue 和最近评论。
- 在非默认分支清理 486 个旧 tracked 文件。
- 75 个未跟踪的用户原型/草稿文件先复制到仓库外，每个源文件与归档逐字节 SHA-256 相同，核对后才移出工作树。
- 原源码 `git archive` 和完整 Git bundle 已保存；`git bundle verify` 确认可用完整历史。`.git`、其他 worktree 和外部归档保留。
- bundle SHA-256：`ECFF13FE4893F394FA8EE358870E87CF309EF3DFA4CD11C91769BCB2556386CA`。
- 源码 tar SHA-256：`C520AC938903A0DEC6575B2E395AC07F041DF5EF52C6FA75F72B746F448639C6`。

本机归档路径和个人文件清单不提交到公开仓库；所有者交付记录提供本机入口。

## 旧验证的真实结果

重建前实际运行 `npm run check`，在工具链断言处失败：本机 Node 24.16.0/npm 11.13.0，旧仓库要求 Node 22.23.1/npm 10.9.8。下游旧类型、构建和产品测试未运行；不修改旧断言使其通过，也不以新检查替代该失败记录。

另行运行旧基线的以下检查，均通过：`check:agents`、`check:work-items`、`check:main-provenance`、`check:main-provenance-dispatch`、`check:harness`。日志保存在仓库外归档。这些结果仅说明重建前相应治理材料自洽，不认证新架构。

## 新验证与治理过渡

新的 `npm run check` 仅检查设计材料、接口/场景映射与链接，名称相同但范围已经明确改变。新 GitHub 工作流的状态名为 `Architecture validation`，**不冒充原服务端要求的 `check` observer**。

服务端 Ruleset 未修改，旧自动合并/来源证明路径不被绕过。重建 PR 在旧保护与当前适用审查/CI 过渡未完成时必须保持 Draft/未合并；不能仅凭新文档检查成功宣布可合入。R3 独立审查仍绑定真实当前 HEAD。

当前状态：完整设计已提交 [PR #133](https://github.com/ntygod/zhiwei-next/pull/133)，独立审查和 CI 以该 PR 精确 HEAD 的记录为准；ADR 合入前保持 Proposed。产品场景全部 not-run，未部署、未发布。旧 #129/#98 的 UI 验收不因删除代码而变成完成；#44/#67 的人类输入继续保留，不改写原文。

首轮独立审查指出异步 Job 终态屏障、备份后的外部效果遗漏和未决写资源释放三处阻塞，当前设计已分别增加等待屏障、独立 EffectFence 与资源 quarantine，并加入对应场景。修订必须由独立上下文复核后才能称设计审查通过。

## 回滚方法

通过新的受审 revert 恢复基线树，不 reset/force-push main。工作树恢复可从上述基线 commit 或 bundle 生成；未跟踪文件从仓库外归档按原相对路径恢复并核对 manifest。

交付前应使用独立临时 Git index 对最终 HEAD → 基线的反向补丁进行 `git apply --cached --check` 和 tree 相等验证；验证不会修改当前工作树。任何后续实际运行数据都有自己的备份/恢复合同，不能套用本次纯代码恢复方式。
