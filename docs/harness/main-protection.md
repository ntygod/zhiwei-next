# Main 分支保护与残余风险

## 当前状态

本仓库运行于 **Public + GitHub Free**，当前模式为：

```text
public-free-ruleset
```

GitHub Ruleset `20776157`（`Protect main (public-free)`）已对默认分支启用。下表结合了两类证据：普通临时 `GITHUB_TOKEN`可持续回读的字段，以及 2026-08-13 仓库所有者 / 管理员权限 API live readback后写入版本库的管理员字段。

| 设置 | 当前值 |
|---|---|
| Target | `~DEFAULT_BRANCH`（当前为 `main`） |
| Enforcement | `active` |
| Bypass actors | 空；2026-08-13 owner/admin live readback版本化证据 |
| Pull Request | 必须；只允许 `squash` |
| Required approvals | `0`；独立 AI 审查由 Harness 单独验证 |
| Review threads | 必须全部解决 |
| Required status | GitHub Actions App `15368` 的早注册 observer Job `check` |
| Latest base | 必须基于最新 `main` |
| Branch creation | Required Check在创建时同样强制（`do_not_enforce_on_create=false`） |
| Linear history | 必须 |
| Force push | 禁止 |
| Branch deletion | 禁止 |
| Repository merge methods | 只启用 `squash`；全仓关闭 merge commit与 rebase merge |

普通 `GITHUB_TOKEN`看不到 Ruleset `bypass_actors`和 Repository `security_and_analysis`。因此“无 bypass”“Secret Scanning / Push Protection为 enabled”仍是被 Checker精确锁定的当前机器记录，但不是 Repository Hygiene每次运行都能在线重读的字段。

机器事实源：

```text
docs/harness/rulesets/2026-08-13-main-public-free.json
docs/harness/risk-acceptance/2026-08-13-public-free.json
```

此前 Private + Free 下的风险接受记录保留为历史，不再描述当前模式：

```text
docs/harness/risk-acceptance/2026-08-11-private-free.json
```

## 分层保护

当前默认分支链路为：

```text
非默认分支写入协议
        ↓
Pull Request + CI + Work Item / 风险合同
        ↓
R2/R3 当前 HEAD 冷读审查
        ↓
GitHub active Ruleset（无 bypass）
        ↓
自主 squash merge
        ↓
push / repository_dispatch 双路径 Main Provenance
        ↓
Branch Cleanup + Repository Hygiene
```

Ruleset 是服务端 pre-receive 屏障；Main Provenance、Incident 和恢复链路仍然保留。前者阻止不合规更新，后者证明实际进入 `main` 的提交来自哪一个已验证 PR，并在异常时 fail closed。

## Ruleset 能保证什么

- 没有 Pull Request 的普通或管理员 direct push 不满足规则；
- observer `check` 不成功、来源 App不匹配或 base 已过期时不能更新 `main`；
- merge commit、rebase merge、force push和删除默认分支不满足规则；
- Ruleset没有任何 bypass actor，Connector、Actions和仓库管理员都没有登记的直写例外；
- 未解决的 Review Thread 会阻止合并。

独立 AI审查不伪装成 GitHub Human Approval：服务端 approval数保持 `0`，而 Autonomous Merge继续读取绑定当前 HEAD的机器评论记录。这样既保持 AI-primary交付，也不会通过伪造人工 Review满足门禁。

## Required Check 聚合边界

PR #62 的最终 CI Run `31663188980`暴露了一个真实门禁缺口：当时名为 `check`的 Job只执行静态合同，并于动态 Probe之前成功；五个由同一 CI按改动门控的 Probe Job不在 Ruleset required context的依赖链中。该次运行中旧 `check`先完成，五个 CI内 Probe随后也全部成功，PR最终由等待整个 CI Workflow完成的 Autonomous Merge合并；与此同时，路径相关的 standalone SDK / RPC parity Workflow失败却不在该 CI Workflow或 required context的等待范围内，因而没有阻止合并。这是 #61 follow-up必须同时闭合的实际缺口。

当前 `.github/workflows/ci.yml`把旧静态 Job改名为`static-contracts` / `Static contracts`，使它不再占用 required context。动态证据由内部`ci-required-evidence` / `CI required evidence`汇总，Ruleset要求的唯一`check`则是无`needs`、在Workflow启动时即可注册的只读observer。两层职责为：

1. **内部evidence Job**：`ci-required-evidence`以`if: always()`直接`needs`依赖`static-contracts`和CI内五个动态 Probe Job，先执行下列fail-closed真值表；随后按路径gate轮询三套standalone run。该Job具有`actions: read`、不需要额外源码checkout，timeout为35分钟；
2. **Required observer**：`check`没有`needs`和`if: always()`，只持有`actions: read`且不checkout源码；它用`${{ github.run_id }}`和`${{ github.run_attempt }}`查询当前Workflow run attempt内唯一名为`CI required evidence`的Job。只接受同一run、同一attempt中该Job的`completed/success`，其他完成结论、重复target、target误解析为observer、异常状态、缺失或70分钟deadline超时都fail closed。observer每60秒查询一次，Job timeout为75分钟。

这种结构让required context在Workflow早期注册为pending，避免服务器在有依赖的`check`尚未创建时把旧成功context误认成当前结果；真正的证据仍全部封装在内部evidence Job中。

CI内 `needs`聚合真值表为：

| 门控值 | Job结果 | 聚合结果 |
|---|---|---|
| `true` | `success` | 允许 |
| `false` | `skipped` | 允许 |
| 其他任意组合，包括 `failure`、`cancelled`、要求执行却 `skipped`、未要求却 `success` | 任意 | 拒绝 |

`static-contracts`本身必须是`success`。Artifact gate只约束`pi-artifact-probe`；Lifecycle gate同时约束 normal、retry、follow-up、cancel/retry-exhaustion四个 Lifecycle Job。

内部evidence的standalone轮询只接受事件为`pull_request`，且 Workflow ID、路径、名称以及当前 PR的 head repository、ref、SHA全部匹配后的最新 run（先按`created_at`、再按run ID降序）。每套 Workflow还发布唯一prefix的机器`run-name`，其完整`display_title`精确编码PR number、action、事件原始`updated_at`和head SHA，因此不能跨PR或跨事件复用。轮询先等待10秒，之后每60秒查询，脚本deadline为32分钟。发现`completed/success`后记录其run ID并开始60秒quiet window；窗口内若latest ID变化就以新候选重置计时，只有同一success ID稳定60秒才接受。该窗口只确认最新候选已稳定，不承担身份认证；身份仍由机器标题和Workflow/HEAD字段决定。失败或取消等其他结论立即失败，运行中、缺失或quiet window未完成则继续等待直至timeout。

observer禁止复用先前attempt的evidence。若只选择“Re-run failed jobs”，新attempt可能只有observer而没有`CI required evidence`，此时必须缺失并fail closed或timeout；恢复方式是“Re-run all jobs”，让当前attempt重新产生完整evidence。这是有意的安全/可用性边界，不能通过读取旧attempt绕过。

CI本身也发布机器`run-name`，逐字编码event、PR number、action、事件`updated_at`、Draft/Ready、tested base、head和run ID。Autonomous Merge只接受`ready=true`且仍与实时PR的number、`updated_at`、base和head完全一致的成功CI，因此Draft成功后立刻转Ready、或Ready成功后又编辑PR，都不能让旧CI触发合并。Autonomous Merge自己的机器标题再绑定来源CI run ID、attempt和HEAD；`pulls.merge`返回成功后，同一Job必须确认真实merged PR、merge SHA、来源HEAD/base和单一squash parent，随后立即发送现有`main-provenance` payload。`after`是重放/Incident身份；任何post-merge确认或dispatch错误都按该SHA fail closed，而不是让Workflow表面成功。

`Main Provenance Dispatch`现在是 Autonomous Merge完成后的reconciler，不再和合并Job同时消费CI完成事件，也不再用90秒窗口猜测排队中的合并。它先从Autonomous Merge机器标题读取精确来源CI run/attempt/head，并用`actions: read`最多三次重取该attempt；若非成功Autonomous Merge始终无法读回来源，则以source CI HEAD同时作为before/after登记`reconciler-source-ci-undetermined`持久Incident并停机，成功主路径则保持可见失败供重试。来源可读后，非PR、非success或fork是正常no-op，候选Ready same-repository才继续严格核验。reconciler短时重试PR的merge可见性：只有最后连续至少三次可信读回都未合并才no-op；API始终失败或最终状态不确定会用来源HEAD作为稳定fallback键登记持久Incident，而不把一次旧读回当结论。已确认同源merge时，无论Autonomous Merge最终是success、failure还是cancelled，reconciler都复验head/base和单一parent，并以相同`before`/`after`/PR/source payload幂等补发。这允许正常路径产生相同`after`的安全重复事件，也覆盖merge后失败、取消和响应丢失。receiver仍按`after`串行重新查询真实PR与commit；dispatch payload不是恢复tree的可信来源。

## 仍然存在的残余风险

- 仓库管理员仍可修改或删除 Ruleset；Repository Hygiene只能持续检查其 Token可读子集，管理员字段依靠版本化 owner/admin读回、风险重评触发器和必要时的新读回；
- 仓库不保存 PAT或其他长期管理员 Secret来扩大持续监控权限。这减少了高权限凭证泄露面，但 bypass actor、Secret Scanning或 Push Protection漂移可能要到下一次 owner/admin读回或其他治理信号才会被发现；
- Required Check名称或 GitHub Actions App身份漂移会安全阻塞全部合并，需要 R3治理修复；
- observer、内部evidence依赖列表、路径门控、standalone触发数组、run身份过滤或超时参数漂移可能让 required context漏掉动态证据；普通 CI静态精确锁定这两层合同；
- 合规 PR仍可能修改 Workflow或治理代码，所以 R3独立审查、可信默认分支读取和最小 Token权限不能删除；
- Public意味着源码、Issue、PR历史和有意上传的脱敏 Artifact公开可读；真实记忆、凭证、私有仓库内容、数据库和原始思维链仍禁止进入仓库或 Artifact；
- 公开化审计观察到 `610` 条历史 Actions Artifact API记录，但没有逐字节审计全部历史 Archive；现行 Workflow必须继续在上传前通过脱敏 Checker并使用明确的短期保留，不得把该数量误写成“全部已审计”；
- GitHub服务或 API故障可能阻塞自动合并；不能通过创建 bypass解决可用性问题。

## Fork 与 Token 边界

- `pull_request`只运行最小只读权限，不注入仓库 Secret；
- 仓库只允许运行 GitHub-owned Action，所有 Action引用必须固定完整 Commit SHA；
- 2026-08-13 owner/admin live readback确认 GitHub Secret Scanning与 Push Protection已启用；Validity Checks因可能向凭证签发方发起有效性查询而保持关闭，若要启用需单独风险重评；
- 所有 external contributor的 fork PR必须先由维护者批准运行，默认 Workflow Token保持 read-only且不能批准 PR；
- external fork PR只允许进入批准后的只读 CI，不进入 Autonomous Merge；写权限 `workflow_run` Job在调度层要求 same-repository source，并在可信脚本内再次核对 PR head repo；
- 运行 PR-controlled脚本的 Job不得获得写 Token；
- SDK/RPC live provenance仅在 same-repository PR创建 token-bearing Job；fork由无 Token、无 checkout的聚合 Gate明确拒绝；
- `workflow_run`写权限 Workflow只执行默认分支中的可信脚本，不 checkout或执行 fork内容；
- 若维护者人工合并 external fork，same-repository Provenance Dispatch不会运行，真实 `push main`路径仍必须完成来源审计；
- Public不改变数据红线；所有 Probe Artifact只在 Capture与脱敏 Checker成功后上传，失败 JSON不得作为公开 Evidence上传。

## 验证与漂移检测

- Ruleset创建前回读为 `rulesets=[]`、`main.protected=false`；2026-08-13 owner/admin回读确认创建后为 `active`、`bypass_actors=[]`、`main.protected=true`；
- 2026-08-13 owner/admin回读确认 Secret Scanning和 Push Protection为 enabled；该 dated事实与 `bypass_actors=[]`一起保存在版本化 Ruleset记录中，并由普通 CI静态精确验证；
- Repository Hygiene使用临时 `GITHUB_TOKEN`持续回读 `visibility`、默认分支、merge methods、`main.protected`以及 Ruleset身份、enforcement、conditions和 rules参数；它不声称在线验证 `bypass_actors`或 `security_and_analysis`；
- `GET /repos/ntygod/zhiwei-next/rules/branches/main`返回五条活动规则，与机器记录完整一致；
- 普通 CI静态验证机器记录、Workflow Token边界、历史风险事实源、内部`CI required evidence`对五个动态 Probe Job的精确`needs`/真值表与三套standalone轮询合同，以及无`needs` observer只接受当前run evidence成功的合同；
- 不为填补管理员字段的持续可见性而把 PAT或长期管理员 Secret存入 Actions；相关配置、权限或安全信号变化时，必须重新执行 owner/admin live readback并更新版本化证据；
- 不通过向 `main`写测试提交验证保护能力。服务端规则的只读 API、规则应用回读和真实合规 PR合并共同提供证据。

## 回滚

若精确 Ruleset误阻断所有合规恢复路径：

1. 保存失败 PR、Check与 Ruleset API回读；
2. 只修改 Ruleset `20776157`，优先修正错误参数；
3. 无法修正时可临时设为 `disabled`；
4. 只有禁用仍无法恢复时才删除该精确 Ruleset；
5. 在任何降级后创建或更新 R3治理 Incident，并暂停普通产品合并；
6. 不删除 Main Provenance、CI、独立审查或非默认分支协议来换取绿色。

## 何时必须重新评估

- 仓库重新转为 Private、迁移 Owner或默认分支变化；
- GitHub方案变化；
- Ruleset被禁用、删除、出现 bypass或规则实质变化；
- Ruleset、安全设置、权限或治理发生可能影响管理员字段的变化，但 owner/admin读回尚未刷新；
- 提议为持续监控引入 PAT或其他长期管理员凭证；
- Secret Scanning或 Push Protection被禁用或无法由 owner/admin重新确认；
- 开始保存真实用户记忆、生产凭证或生产数据；
- 多于一名人类协作者获得写权限；
- 引入生产发布、签名或部署 Workflow；
- 在 active Ruleset下仍发生未经授权的 direct-main更新。
