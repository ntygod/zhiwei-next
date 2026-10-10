# P0-04 纯上下文预算与选择准备合同

当前执行排期以[开发与验收分离](development-and-acceptance.md)为准；本文预算组件合同及非保证保持。第7节保留 #104 的历史排期解释，原完整阶段依赖继续管产品验收/真实启用，不再阻止满足技术依赖的正式合成开发。


状态：#104 独立规划；本次不实现。按旧规则完成最终 HEAD 独立 R3、CI 与保护合入后，仅供下一独立 P0-04 实现任务使用。已接受 C05/C06 责任和预算总纲不变，来源为[详细架构](../architecture/detailed-design.md)、[认知流水线 §4–5](../architecture/cognitive-pipelines.md)及[上下文总纲](../architecture/cognitive-loop.md#上下文构成与预算)。

## 1. 用户结果与精确边界

在没有真实接入能力时先验证：显式必需内容是否放得下，哪些已取得的材料按稳定次序入选，标题/引用的实际成本是否仍在预算内。未来消费者是 P1-06 的 C06：C05 在外围完成 Scope/privacy/lifecycle/time/source-block/dependency 资格检查、检索、hydrate 和精确版本复验后调用，随后原 T03 保存快照与派发复验仍须实现。

当前只接受合成内存值，不收原始 MemoryClaim 集合以替代资格判定；不引入 `authorized=true`、`qualified=true` 等许可开关。调用前提不是系统认证。输出名为预算选择结果，不导出为 `ContextCapsule`，不生成可发送请求、RequestSnapshot、持久 read-set、Grant、Exposure 或 fence。预算通过不证明 Provider 隐藏变换后的真实请求合格。

只在 context-compiler 增加内部计算阶段，必要的最小共享值类型才放 domain。保留旧 `compileContext` 导出、实现与零泄漏/不可变哨兵；新阶段无 apps、存储、Runtime 或其他生产消费者，无 I/O、环境、墙钟、随机数或模型。不是通用上下文插件框架，也不实现 C05、资格零泄漏或发送复验。

## 2. 输入、身份与排序

- 基础区块显式给齐：安全/任务约束、当前用户请求、验收标准、required WorkingState。固定顺序与区块标签属于版本化 renderer；缺少任何必需区块身份是 `invalid_input`，空正文是否允许由对应区块合同明确，不自动补造内容。
- 每项材料给出非空稳定 ID、正安全整数 version、非空精确 source refs（来源 ID/version/片段选择器），正文、三类之一的 category、required、调用方确定的非负安全整数 priorityOrdinal。序号越小优先级越高；同序号按 ID 的逐 UTF-16 code-unit 次序、数值 version 及规范化 source-ref 元组次序破平局，不用 localeCompare。排序只是落实给定顺序，不能推断材料有效、已确认、相关或获准。
- 三类按顺序为 current（当前认知与约束）、experience（Episode/Procedure）、open（未决项/矛盾）。调用方可给 conflictGroupId 和完整成员 refs；每成员须存在且归同类别，每项最多归一组，分组冲突/不完整/类别混合拒绝。一成员 required 则整组 required；组 priority 为最高优先成员的键，平局用规范化完整成员 refs。组内部仍用上述稳定次序，永不拆组计费、选取或删除。
- 精确材料身份是 `(id, version)`，source refs 也是内容合同的一部分。完全相同重复项去重一次；同身份的正文、source refs、category、required、priority 或组归属任一不同则 `invalid_input`，不能按输入先后覆盖。相同 ID 不同 version 不自动合并或挑新版本；由外围决定是否同时给出，纯层保持精确身份。
- contextLimit、reservedOutput、mandatoryProtocolOverhead 均为非负安全整数；差额小于零为 `budget_conflict`，非法数值或中间算术非安全整数为 `invalid_input`。百分比分配使用整数商/余数或等价无溢出算法，禁止浮点乘法溢出后截断。
- 注入同步、确定、精确 TokenCounter，带非空 counter ID/version、明确 exact 模式，以及 compiler/renderer revision。只数传入字符串，不读取 Profile 全局状态。本准备版不支持估算；缺失或非 exact 模式为 `invalid_input`，不能虚构安全余量或把字符计数当真实模型 token。

## 3. 固定渲染与计费单位

固定区块顺序沿用 C06：Task contract、Working state、Current knowledge、Experience/procedure、Open questions、Evidence references。基础文本和材料正文作为数据保持原值，不截断、摘要、润色或解释为指令。renderer 明确转义文本边界，标题、分隔符、required/争议标签、精确材料及 source refs 全部包含在计数文本中；同一材料只输出一次。

计数分两层：基础固定框架（含固定空区标题）整体为 baseTokens；每一独立材料或不可拆冲突组以独立、完整、确定的带引用片段计数为 unitCost。独立成本加总用于保守、可解释的初选，不假设 tokenizer 对拼接可加。最终必须分别对完整记忆区串和完整基础+记忆串重新精确计数；不能只数正文、相信片段加总或漏掉最终引用区。所有固定标签的成本要么归基础框架、要么归唯一片段，不重复归账。具体文本边界：baseText 是带固定空槽/区标题的完整基础框架；fullText 是在这些槽内插入选中材料片段及来源片段后的全文；memoryText 按与 fullText 相同的区域顺序拼接所有插入片段，保留每个插入片段自己的分隔/标签/引用，但不再次包含 baseText 的固定区标题。无选中材料时 memoryText 必须为精确空串，fullText=baseText；counter 对空串须返回0，否则 token_count_error。Evidence references 的固定标题归 baseText，材料的精确来源行与相邻分隔归 memoryText；基础本身的引用仍归 baseText。不得用 tokens(fullText)-tokens(baseText) 代替 memoryText 的独立计数。Provider 原生协议变换不在渲染范围内，调用方显式 mandatoryProtocolOverhead 不得伪装成已观测的原生开销。

实现时必须把 renderer 格式与版本固定在组件测试中，不能让调用方注入任意模板以绕过重计数。合成 exact counter 只证明该 counter 的组件行为，不声称获得真实 ModelProfile 计数能力。

## 4. 确定预算算法

1. `availableInput = contextLimit - reservedOutput - mandatoryProtocolOverhead`。计数固定基础；`baseTokens > availableInput` 立即 `budget_conflict`。
2. `memoryBudget = min(4096, floor(availableInput / 4), availableInput - baseTokens)`。空记忆的可变片段成本为零。所有 required 单元先计费；其 unitCost 安全加总超过 memoryBudget 即失败，不能挤掉基础项或截断 required。最终完整渲染仍有第二道必需溢出检查。
3. 对完整 memoryBudget 按 60/25/15 求三类整数初始配额：分别取乘百分比再除100的整数商，剩余 token 按小数余数从大到小逐个补齐；余数平局按 current、experience、open 顺序。配额和必须精确等于 memoryBudget（例如预算3分成2/1/0）。
4. required 占所属类别配额，不能作为配额以外的免费内容。required 高于所属配额时，先记三类 required 成本，再将超额类按 current、experience、open 顺序补齐；从其他类尚未被 required 占用的配额按 open、experience、current 顺序转出。required 总和已通过步骤2，因此必能完成；最终类别配额非负、和不变且各自覆盖 required。该转移不把某类别的 optional 升级为 required。
5. 空类别仅指规范化输入中完全没有该类别单元，不能把“候选太大”“全部未选”伪装为空。将其全部剩余配额收为共享借用池；多个空类合并一次。非空类别先各按稳定顺序扫描 optional，加入单元须同时满足类别剩余额与全局剩余额；放不下就记录 category_budget 或 memory_budget 并继续扫描后续较小候选，不因大项停止、不背包重排。
6. 若有空类别借用池，将步骤5未选 optional 按全局稳定顺序再扫描一次。候选可使用自己类别剩余额，加不足部分从共享池借用；成功时先消耗本类余额再消耗共享池，归账到实际接收类别。仍放不下就跳过继续。非空类别未使用配额不进入借用池；不循环重试或搬迁已选项。相同输入排列得到相同结果与理由。
7. 按固定区域顺序渲染全部选中值，分别计数完整记忆串和完整基础+记忆串。二者须满足 memoryBudget 和 availableInput；最终重计数而非片段总和是最终硬门。超限时删除全局最低优先 optional 单元，平局按稳定键逆序，每次整组删除并重渲染/重计数；required 不删除，删除后不回填候选。即使反常计数器导致删除后 token 不降，单元数仍严格减少；至多初选 optional 数量次删除后终止。required-only 仍超限则 `budget_conflict`，不得返回部分成功。
8. counter 抛错或返回负数、非安全整数、NaN/Infinity，或者同一次调用中相同文本出现不同计数，均 `token_count_error`，立即结束且不返回成功片段。可缓存已计数字符串；计数器的跨调用确定性属于显式注入合同，不能声称有限抽样证明任意恶意函数可靠。不同文本 token 数不保证单调，不能把该现象误判为真实 tokenizer 错误或依赖单调性证明终止。

所有失败的优先顺序固定为：结构/身份/输入数值校验→基础预算→required/初选→最终重计数。排序和记录均不依赖输入排列；计数异常只能报告固定原因，不回显任意异常消息中的正文或隐藏信息。

## 5. 输出与不变性

成功结果包含有序选中单元和精确 refs、固定渲染文本、逐项选中/排除原因、初始/required 转移/空类借用后的类别配额、片段初选成本、最终记忆/整体精确计数、输入预算及 counter/compiler/renderer 版本。每个规范化身份/组必须只有一个最终状态与最终原因；先排除后借用成功时最终标 selected_by_borrow，旧排除只留在单独的阶段轨迹，不能同时出现在最终排除表。最终删除原因独立标记 final_budget，不能沿用初选成功描述。配额转移与借用账明确标记为初选历史：最终删除不重新分配或回填，另列 retainedInitialCost、removedInitialCost、finalExactTokens，保留逐单元原始借用归账以解释历史，不把已删除成本写成最终使用量。类别配额是预算上限，不是对非可加最终 token 的类别精确分摊；最终硬门只以完整 memoryText/fullText 的精确计数成立。返回深拷贝并深冻结的只读值，嵌套 refs/组成员无输入别名；调用方后续改动输入不改变结果，计算不修改输入或调用方计数器对象。

错误分类为 invalid_input、budget_conflict、token_count_error；不制造可发送 Capsule 或“已授权”状态。预算选择不登记 Exposure，不能称已经注入真实模型。最终 metadata 为解释计算，不是 T03 请求快照、可重建性或发送凭据。

## 6. 独立实现任务的验收

- 零预算、负差额、NaN/Infinity/非安全整数、溢出；基础和 required 分别超限/恰好边界；4096、25% 与剩余额三种控制分支。
- 60/25/15 整数余数与平局；required 超类别份额但总额可用、总额不可用；空类别借用和非空但放不下不得借出；大候选跳过后可选较小项。
- 重复项、同身份异正文/来源/标记拒绝；不同版本保持精确 refs；平局与输入排列置换等价；冲突组缺员、跨类、required 传播、不可拆预算/移除。
- 空材料/零 memoryBudget 的 base-only、固定标题与材料来源区归账、先排除后借用/删除后的单一最终状态与历史账；标题、分隔符、标签和 source refs 的成本；片段成本非可加时最终重计数捕获超额；只能删除最低 optional 整组；非单调 counter 仍有限终止；required-only 超额失败。
- counter 缺失/估算拒绝，抛错/非法返回/同文本不一致；空材料；输入深层不变、输出深不可变与无别名；无系统时间/随机/环境/Node/模型/网络/存储依赖；原哨兵保持。

这些只能标为 Z14 的预算/选择组件证据，不修改 Z14/Z15 正式场景定义，不认证资格零泄漏、请求快照对应真实发送、撤销或结果屏障，不放行 P0-01/P0-02/D-04/D-08。实现任务须另行 npm run check、最终 HEAD 独立 R2 或更高实际风险审查和原 CI/来源门。

## 7. DAG、治理与回滚

P0-04 depends=[]，与已完成 P0-03 无计算依赖。旧 design-plan checker 要求每一 P1 任务经所有 P0 必需任务：因此 P1-01 在原 P0-02/P0-03 之外追加 P0-04，仅作为完整阶段入口；P1-06 保留 P1-05 并显式追加 P0-04 体现消费者。不能为叙述计算独立删除安全门或修改 checker。

本规划只精确增加这一准备切片，不授权任意纯函数提前，不改任何质量接受条件。回滚通过新的受审 PR revert 规划/纯组件；无生产消费者、迁移或持久数据。若未来已消费，先停相关入口并核对依赖，按正式恢复合同处理。
