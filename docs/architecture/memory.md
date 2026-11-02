# Markdown 记忆与存储

状态：SA1 设计。决策见 [ADR 0029](../adr/0029-markdown-memory.md)。Markdown 可以承担长期记忆内容，不能独自承担并发、授权、事务和恢复。

## 1. 哪些东西放在哪里

| 数据 | 权威来源 | 可重建部分 |
|---|---|---|
| 记忆正文、语义类型、来源/适用条件 | 不可变 Markdown 文档版本 | 阅读视图、摘要 |
| 哪个版本有效、是否已撤销/遗忘、可由谁读取 | 控制库的提交目录和单调撤销记录 | 目录缓存；不能只凭文件内容恢复授权 |
| 原始依据与附件 | 获准保留的 Evidence 对象 | 文档引用与摘录 |
| 任务、授权、预算、投递、运行回执 | PostgreSQL 控制库 | 状态快照、搜索视图 |
| 全文、向量、实体关系 | 按精确版本建立的派生索引 | 全部可丢弃重建 |
| Runtime 上下文 | 合格资料编译结果 + 易失 Session | 可按当前真源重建，非逐 token 恢复 |

“记忆采用 Markdown”表示内容与语义格式开放可读；有效性、提交顺序与访问资格仍需要事务目录。单独复制 `.md` 文件能迁移内容，不能恢复全部任务、授权和删除状态。SA1 不选择全系统纯文件或自行开发通用文件数据库。

## 2. 文档种类与粒度

- `fact`：带时间有效范围的事实或来源陈述。
- `preference`：用户确认或经明确策略接受的偏好，不能推导权限。
- `constraint` / `decision`：具体项目约束和决定，版本化。
- `episode`：一次任务经历的目标、行动、结果、失败与未知，引用原证据。
- `hypothesis`：有依据但待证的命题、替代解释和验证问题。
- `procedure`：有适用条件、步骤、验证器、反例和试用记录的做法。

一份文档保持一个稳定主题或一段可独立治理的经历，不把所有记忆写入一个不断增长的 MEMORY.md。`index.md`、用户画像和项目摘要是受预算派生入口；不能从这些摘要反推已删除的证据。

## 3. 格式

以下全部是合成示例，正文不含原始思维链：

```markdown
---
format: zhiwei-memory/v1
id: mem_demo_budget
version: 3
kind: constraint
ownerId: owner_demo
workspaceId: workspace_demo
epistemic: user-asserted
validFrom: 2026-11-02T02:00:00Z
validUntil: null
sourceRefs:
  - evidenceId: ev_demo_correction
    version: 1
    fragment: message-body
supersedes: 2
tags: [budget, project]
---
# 当前预算

本项目预算上限为 8 万元。

## 适用范围
适用于此项目之后的比较、方案和报价筛选。

## 依据
用户明确修改预算；旧版本用于历史解释，不用于当前执行。
```

Front matter 采用受限 YAML：禁止自定义标签、别名展开、可执行模板和未知安全字段；有大小、深度、数组数量上限。解析后执行 schema 验证，正文按数据处理。`ownerId` 等导入字段是待核对声明，不授予访问资格；active/verified/Grant 不由编辑器中的字符串决定。

对象 key 使用不含个人语义的 ID/版本，正文 UTF-8 LF，规范化规则与 formatVersion 固定。摘要校验用于完整性，含敏感内容的散列不可公开传播；公开日志仅保留不含内容的受控 ID。

## 4. 目录与可编辑性

可导出的阅读目录示意：

```text
vault/
  manifest.json
  workspaces/<id>/facts/<id>/v3.md
  workspaces/<id>/episodes/<id>/v1.md
  workspaces/<id>/procedures/<id>/v2.md
  evidence/<opaque-id>/...
  deletion-manifest.json
```

实际云端对象存储不要求提供 POSIX 可写挂载。用户或 Agent 编辑的是受控 checkout/staging 文档，提交时带 baseVersion 和 idempotencyKey，经差异检查产生新版本。原文件不能被原地覆盖；编辑冲突返回两份版本，由明确决策合并。

Agent 可提出写入候选，不能直接用 shell 改 Vault。外部导入没有可验证来源时保留 imported/source-reported 或 hypothesis；用户可以明确确认某命题，但不能伪造工具验证历史。导入文件中的行为指令不进入高优先级系统 Prompt。

## 5. 写入、提交与索引

```text
1. 校验候选、来源、范围、数据用途与 baseVersion
2. 写入新的不可变 Markdown/Evidence 对象，完成大小/摘要/可读验证
3. PostgreSQL 短事务：CAS 当前版本；登记文档版本/来源/依赖；
   标记旧版 superseded；更新相关 memoryEpoch；写 Outbox 与命令回执
4. 提交成功后新文档才可读；索引消费者按精确版本构建全文/向量
5. 未被任何提交引用的 staging 对象按期限回收
```

S3 使用 `If-None-Match` 防止同 key 覆盖；单对象条件写不能替代第 3 步的多对象事务。目录是发布点，Worker 看不到未提交对象。对象上传成功而 DB 失败产生可清理孤儿，不产生半条可见记忆。DB 提交成功而响应丢失，通过幂等键返回同一版本。

依赖同一纠正的多份派生文档采用同一逻辑变更批次；阻止旧版本使用的 epoch 在主事务中更新，昂贵的索引/摘要重算异步进行。不能等待所有派生物重算完才让纠正生效。

## 6. 检索与 Chain of Recall

先从事务目录筛选 owner、workspace、audience、purpose、placement、modelUse、状态、有效时间及来源资格，得到可读文档版本集合；再按全文、实体、向量与任务关联排序。向量引擎必须支持等价过滤，或仅对已合格 ID 集合排序；不得全库取 top-k 后才过滤。

返回短摘要、文档/版本、证据 ID、相关 Task/Thread ID 和下一跳引用。常用的已确认约束内联进上下文，长文留引用按需读取。沿关联图逐跳召回时，每一跳重新执行同样的资格检查；链接不是授权。

上下文由当前要求、硬约束、工作状态、近期相关经历/做法和标识清楚的假设组成。必需项放不下时拆任务或返回 budget-conflict，不静默裁掉用户约束。保存选择/排除原因和精确版本，避免把检索命中当成模型已经看到。

全文与向量都是可删除投影。索引落后时，对已知合格文档执行有界真源读取，并明确降级；不能声称语义检索仍完整。语义召回质量、中文分词、重复消除和跨月过期事实必须单独验收。

## 7. 纠正、冲突与遗忘

明确纠正创建新版本，并将旧版与依赖的计划/草稿/待发送上下文标为不再可用。更晚录入不等于更晚生效，`validFrom` 与 `recordedAt` 分开。相互冲突但无决定性证据的文档进入 disputed，并列说明来源，不能由模型置信度自动选真。

遗忘先原子阻止读取和派发，再清理正文、受管副本、摘要、向量、附件摘录及运行 staging。清除失败保留 partial/failed，不假称已彻底删除。允许保留不含正文、摘要或可回推内容指纹的最小删除事实。

云端删除/撤销日志在独立恢复控制域中保留单调 head；恢复普通备份前必须取得并施加最新 head。缺失或不能验证匹配时只允许隔离恢复，不开放记忆与自动任务。内容对象采用独立密钥/版本管理；物理删除、密钥撤销与备份到期分别报告，不能把单一动作等同于所有副本消失。

## 8. 索引和目录丢失时

- 索引丢失：从当前提交目录与合格 Markdown/Evidence 重建。
- 目录缓存丢失：从 PostgreSQL 恢复，不扫描文件自行决定 active。
- 控制库恢复：恢复一致快照/WAL，施加独立删除/撤销 head，核对对象 manifest，再开放。
- 只剩 Markdown 导出：允许作为新安装的待审内容导入，不恢复旧授权、旧任务或原 verified 身份。
- 对象缺失/摘要不匹配：文档不可用，关联任务明确受阻；不拿摘要冒充原证据。

## 9. 学习写入与观察记录

用户明确“记住/改成”可以直接形成 user-asserted 版本。自动提取需已有 Workspace 记忆策略，敏感类别和偏好改变保留待确认；模型推断进入 hypothesis。自我反思、摘要和它们的循环引用不能组成独立证据。

Exposure、Adoption、Outcome、Benefit 分开：实际发送才是 exposure；有可观察行动参数/步骤关联才是 verified adoption；收益需对照或明确用户比较，否则 unknown。具体归纳、主动调查和做法生命周期见[学习](learning.md)。

## 10. 为什么不选其他存储形态

纯 Markdown 文件夹缺少多对象提交、当前权限与并发控制；Git 便于追踪代码但不适合保存私人记忆的默认历史，尤其难以履行遗忘与即时撤权；全量关系型记忆正文降低可读迁移能力。所选组合把开放内容格式与可靠控制状态分开，也明确接受数据库和对象存储备份协调的运维成本。
