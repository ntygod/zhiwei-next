# Main 分支保护与残余风险

## 当前状态

本仓库保持 **Private + GitHub Free**。在这一组合下，GitHub 不向当前仓库提供可强制执行的私有仓库 Ruleset / Protected Branch pre-receive 屏障。

项目所有者已经明确决定：

- 保持仓库私有；
- 不升级 GitHub 方案；
- 删除刚才创建但当前套餐下不可生效的 Ruleset；
- 接受缺少服务端硬保护的残余风险；
- 允许 AI 以 `best-effort-private-free` 模式继续自主开发。

机器可读决策见：

```text
docs/harness/risk-acceptance/2026-08-11-private-free.json
```

关联 Incident：[#9](https://github.com/ntygod/zhiwei-next/issues/9)

## 这意味着什么

当前模式能做到：

```text
非默认分支写入前置检查
        ↓
Pull Request + CI + 风险合同
        ↓
R2/R3 当前 HEAD 冷读审查
        ↓
自主 squash merge
        ↓
push / repository_dispatch 双路径 Main Provenance
        ↓
未验证 main 更新触发 R3 Incident 和普通合并停机
        ↓
可信 push 场景仅生成 Draft 恢复 PR
```

当前模式**不能**做到：

- 在 GitHub 接收提交之前绝对拒绝拥有 `contents: write` 的主体直写 `main`；
- 阻止一个恶意或错误的 direct writer 在同一提交中尝试修改仓库内检测 Workflow；
- 等价替代 GitHub 服务端 Ruleset / Branch Protection。

因此文档、PR 和状态汇报中必须使用“最佳努力检测与恢复”，不能使用“硬保护”“无法直写”或类似表述。

## 强制补偿控制

即使没有服务端硬保护，以下规则仍是仓库合同：

1. 正常内容写入必须显式指定非默认分支；不得省略 `branch` 并依赖默认值。
2. 正常变更必须通过 Pull Request 进入 `main`。
3. `R2/R3` 必须有绑定当前 HEAD 的独立 cold-read AI 审查。
4. Main Provenance 同时审计外部 `push` 和由自动合并触发的 `repository_dispatch`。
5. 未验证的 `main` 更新必须创建 R3 Incident 并暂停普通自动合并。
6. 自动恢复只能来自可信的真实 push 事件，并且只创建 Draft PR；不得直接 reset、force-push 或更新 `main`。
7. 事故历史不得重写，恢复必须可审计。

## 何时必须重新评估

出现以下任一条件时，AI 必须创建 R3 治理 Issue，并重新评估 GitHub 方案、仓库可见性或迁移到具有 Team/Enterprise 能力的组织：

- 仓库准备公开；
- GitHub 方案发生变化；
- 开始保存真实用户记忆、生产凭证或生产数据；
- 多于一名人类协作者获得写权限；
- 引入生产发布、签名或部署 Workflow；
- 再次发生未经授权的 direct-main Incident。

## 将来可用时的推荐硬保护

若未来仓库公开、升级方案或迁移到支持私有仓库 Ruleset 的组织，推荐配置：

| 设置 | 值 |
|---|---|
| Target branch | 默认分支 `main` |
| Bypass list | 空；ChatGPT Codex Connector 不得拥有 direct-push bypass |
| Require a pull request before merging | 开启 |
| Required approvals | `0`；AI Review 由 Harness 处理 |
| Require status checks | `check` |
| Require linear history | 开启 |
| Block force pushes | 开启 |
| Restrict deletions | 开启 |

服务端规则一旦可用，应作为第四层屏障加入，但不得删除现有 provenance、Incident 和恢复机制。

## 验证原则

- 不通过再次向 `main` 写测试文件来验证任何保护能力。
- 当前最佳努力模式通过真实 PR 合并、Workflow 结果、Commit/PR 关联和机器 Fixture 验证。
- 若将来服务端规则可用，优先通过只读 Ruleset API 或 GitHub UI 配置证据验证，而不是破坏性 push。
