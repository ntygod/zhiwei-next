# Main 分支服务端保护

## 状态

**必须由仓库所有者完成一次性配置。**

ChatGPT Codex Connector 当前安装权限包含仓库内容、工作流、Issue 和 Pull Request 写入，但不包含 repository administration / ruleset mutation，因此 AI 无法通过当前连接直接创建 GitHub Ruleset 或 Branch Protection Rule。

仓库内的 `Main Provenance` workflow 是检测、停机和恢复提案层，不是 pre-receive 屏障。直接写入者也可能在同一个提交里篡改 workflow；因此只有 GitHub 服务端规则能够真正阻止再次直写。

关联 Incident：[#9](https://github.com/ntygod/zhiwei-next/issues/9)

## 推荐：Branch Ruleset

在 GitHub 仓库页面执行：

```text
Settings
→ Rules
→ Rulesets
→ New ruleset
→ New branch ruleset
```

建议配置：

| 设置 | 值 |
|---|---|
| Ruleset name | `protect-main-ai-primary` |
| Enforcement status | `Active` |
| Target branch | `main` |
| Bypass list | 空；不要给 ChatGPT Codex Connector `Always allow` |
| Require a pull request before merging | 开启 |
| Required approvals | `0`；独立 AI 审查由 Harness 合同处理 |
| Require status checks | 开启，选择 CI 的 `check` Job |
| Require linear history | 开启 |
| Block force pushes | 开启 |
| Restrict deletions | 开启 |

如果确实需要给某个 App 设置 bypass，只允许 **For pull requests only**，不能允许直接 push。正常自动合并通过 GitHub Pull Request API 完成，不需要默认分支直写 bypass。

## 备选：Branch Protection Rule

若界面没有 Rulesets：

```text
Settings
→ Branches
→ Add branch protection rule
→ Branch name pattern: main
```

至少开启：

- Require a pull request before merging；
- Require status checks to pass before merging：`check`；
- Require linear history；
- Do not allow bypassing the above settings；
- 不允许 force push；
- 不允许删除 branch。

不要要求 GitHub 原生人工 Approval；本项目的 R2/R3 审查由当前 HEAD 绑定的机器可读 AI Review 记录完成。服务端规则只负责确保所有变更经过 PR 和 CI。

## 完成后的确认

配置后，在 Issue #9 留言：

```text
main protection configured
method: ruleset | branch-protection
require-pr: yes
required-check: check
force-push: blocked
delete: blocked
chatgpt-direct-push-bypass: no
```

AI 随后会：

1. 将 Incident Fixture 的 `serverProtection.status` 改为 `confirmed`；
2. 将 `harness.config.json` 的安全停机改为解除；
3. 用 R3 恢复 PR 完成独立审查；
4. 关闭 Issue #9；
5. 恢复产品功能开发。

## 不采用破坏性验证

不通过再次尝试向 `main` 创建测试文件来验证保护。所有者的配置确认、GitHub UI 规则状态和后续正常 PR 合并记录共同构成证据。若未来连接器获得只读 administration 权限，可增加非破坏性的 Ruleset API 检查。
