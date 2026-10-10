# 项目状态

<!-- zhiwei-project-state
milestone: P0
status: active
updated: 2026-10-10
-->

## 当前工作：P1-03 受控 Worker 与 Broker #114（2026-10-10）

canonical [#114](https://github.com/ntygod/zhiwei-next/issues/114)，唯一分支 `feat/114-controlled-pi-worker`，基于已保护 main `5d43a27d39406df9c73cb7d9276c8baf91156608`。开工 reconciliation 无开放 PR/Incident、远端仅 protected main；#44/#67 最新人类输入已读。P1-02 / PR113 已完成最终 R3、582 项完整 check、Ready/live、保护合入与 main 来源回读，#112 已关闭。实现依赖已就绪，产品验收仍 `not_run`。

当前开发正式 CLI JSONL Worker 传输、Daemon Supervisor 与工具/模型 Broker；真实入口默认关闭，仅固定合成材料/接收器。新一方扩展合同见 [ADR0019](../adr/0019-controlled-pi-broker-extension.md)，尚待独立决策接受；不把 unknown 边界的本地编译当上游 SDK 类型支持。root SDK46 诊断保留，精确工具链/官方入口不变。原 #90 及同等争议攻防动态实验不重跑，Z08/Z09 真实安全验收 `not_run`。

P1-04 承接真实 Session/Task/Attempt/输入及 WorkingState 存储，P1-06 消费 WorkingState；P1-07 基于 P1-04 精确历史完成 Outcome/Episode；P1-09 仅 Alpha 验收。本项不扩大 Task 存储范围或伪造持久授权。当前候选仍须完整原检查、最终独立 R3、本 PR Runtime 来源、Ready/live、保护合入与 main 回读。

以下段落保留原开发期快照，不代表当前 WIP。

## 历史工作：P1-02 正文生命周期与认知事务 #112（2026-10-10）

canonical [#112](https://github.com/ntygod/zhiwei-next/issues/112)，唯一 `feat/112-cognitive-persistence` / Draft [PR113](https://github.com/ntygod/zhiwei-next/pull/113)，从已保护 main `e996451f1c601b5d4859c07030bfeabb290f5371` 开始。开工已核实无开放 PR/Incident、远端仅 main；#44/#67 原人类输入保留。P1-01 / PR111 已通过最终 R3、499 项完整测试、Ready/live、保护合入与 main provenance，#110 已关闭；产品验收仍 `not_run`。

完整代码提交 `a763c8c257ed8b8a4fcba7f13bda6f6162033a11` 已实现独立 v2 固定迁移/manifest、正文 staging/发布/孤儿回收、Observation/Claim 与必要 P1 认知快照、Candidate+Claim 同事务接受/纠正、逻辑遗忘/当前受管副本和最小隔离恢复协调者。正式 Node22.23.1/npm10.9.8 完整 `npm run check` 原始 exit0，582/582 测试，严格类型110 roots。真实临时 SQLite 与实际 P1-01 core 输出的合成事务回归通过；受限恢复动作没有伪装为已运行测试。具体 supported/unsupported 与动态未验收范围见 [memory-store 交付边界](../../packages/memory-store/README.md)。

执行索引记录本 PR 已存在代码证据为 `implemented`，产品 Z05/Z06/Z07 验收仍 `not_run`。Episode/WorkingState 的生产持久消费者等待 Task 事务依赖；P1-05 通用 Claim 生命周期服务、P4 加密/跨安装/生产备份接线不提前。最小 synthetic source/catalog、独立当前 journal 重放、恢复世代/Outbox quarantine、atomic active selection 及受管恢复副本清理代码已具备，但 capture/restore/清理与故障窗口动态验收均 `not_run`。当前 raw synthetic opener 的调用者须遵守 coordinator 所有权合同，没有生产消费者或通用授权绕过开关。

本 PR 的 SDK 原来源为 `404427198a501998f9fd4ff17c3382812a66aa37` / run `38043223271`；Worker 原来源为 `0925e00732cd567924b82f999bc7dcaf9208ef3b` / run `38043701983`，两次原 job/ZIP/artifact/result 与完整对象相等、成对来源及 attempt1 后续字节回读均已核验。历史 failure-shape 来源仅在完整相等成功后使用既有临时 guard，不把预期捕获失败写成普通 CI 成功；比较器已恢复原 blob `fba36da923a94cd2b9ba024f020089e3ef313d90`。精确最终 HEAD 的独立 R3、Ready/live、完整 CI、受保护合入与 main 回读仍待完成，不能把候选状态当作已合入。

保留 0001/v1 原合同，不接真实用户数据、模型、凭据或生产入口。原 #90/preintegration-safety 及等价争议动态诊断不运行；D-04/D-08、G-2/G-5 与真实启用门不变。本 PR 保护合入并核验 main 后才开始下一独立 P1-03 实现；不宣称产品验收依赖通过。以下旧段落是开发期历史快照，不能覆盖本段真实状态。

## 历史工作：P1-01 正式认知与作用域合同 #110（2026-10-10）

canonical [#110](https://github.com/ntygod/zhiwei-next/issues/110)，唯一分支 `feat/110-cognitive-domain-contracts`，从已保护合入 main `009387778d2f473945e89239557bf2d16735d242` 开始。#108 / PR109 已完成开发/验收分离治理，最新 main 回读无开放 PR/Incident、远端仅 main；本项是独立产品合同实现，不修改新治理来让自身通过。

范围为 domain/cognition-core/protocol 的正式 Scope、正交隐私/信任/认识状态、认知版本与纯转换、Observation v2 和 Local API DTO。保留 Bootstrap/v1 Ledger、固定迁移、Runtime 与 P0-03 Task/Outcome；只有合成测试消费新入口，无生产接线、模型、真实个人数据、外发或凭据。实现状态由[执行索引](execution-mode.json)记录，产品验收仍 `not_run`；原 P0-01/02、D-04/D-08、G-2/G-5 及真实启用门保持，受限实验不执行。

唯一 Draft [PR111](https://github.com/ntygod/zhiwei-next/pull/111) 的实现提交 `0cc3d85c57f2b85d9bab16715b3d42b8c0e6cdd6` 已完成代码范围和开发验证：固定 Node22.23.1/npm10.9.8 完整 `npm run check` 原始 exit0，499/499 产品测试（新增71项）通过，严格类型94 roots。独立冷审发现并修复 Goal 结果跨标准伪造来源/控制证据重用，以及历史终态与新 Outcome revision 不能共存的兼容缺口；新增回归通过。正反补丁恢复基线精确 tree 后再正向恢复候选 tree 已验证。

执行索引的 `implemented` 只引用已存在的本 PR 代码提交与开发证据，候选仍待最终精确 HEAD 新独立 R3、真实 Ready/live、完整 CI、保护合入与 main 回读；不是预填未来 merge SHA、已合入或产品验收。当前 PR 的 SDK 来源 `7f83f60ea274e8da5da4d0fcfeb8eaa4ce67fbf8` / run `38040347283` 与 Worker 来源 `0112810f62390a633d2690f30d4e3127b983d7a1` / run `38040583324` 两 attempts 已严格核验原 ZIP、来源身份与完整对象；临时 guard 已恢复原 comparator blob `fba36da923a94cd2b9ba024f020089e3ef313d90`。最终当前 HEAD 仍须真实门禁，Draft 跳过不算通过。

只有本 PR 保护合入并核验 main 后，下一独立实现才按原 P1-02 做真实临时 SQLite 产品存储/事务合同；不得提前把本内存 CAS 或 DTO 当持久提交、安全授权或场景验收。

以下为历史工作快照，不是开放 WIP 或新选工入口。

## 当前工作：开发与验收分离 #108（2026-10-10）

唯一 canonical [#108](https://github.com/ntygod/zhiwei-next/issues/108)，分支 `chore/108-development-acceptance`，基于已保护 main `e7077df36fe794e296008c7db88c175fb588013f`。PR103/P0-03 与 PR107/P0-04 已真实合入，最新完整 check 428/428；开工时无开放 PR/Incident，PR99 closed unmerged、#98 暂停。

本独立 R3 治理仅定案[代码开发与产品验收分离](development-and-acceptance.md)。原任务/验收 DAG 保留；新增执行索引记录实现依赖与双状态，不复制任务内容。本治理仍走旧规则，保护合入后下一独立实现直接进入 P1-01，合成输入编写正式领域/协议代码；不再循环新增 P0 准备卡。P0-01/02、D-04/D-08、G-2/G-5 仍未验收，不执行受限实验、不授予真实数据/模型/外发/凭据/部署许可。最终 HEAD 批准/CI/合入均以实时 GitHub 为准。

当前 Draft [PR109](https://github.com/ntygod/zhiwei-next/pull/109) 已通过固定工具链 428 项原产品测试及 111 项执行模式/原 PR 分类回归。独立预审发现的新规则路径分类缺口已通过迁入现有 `docs/harness/` 保护范围修复；原分类器/Workflow 不改。明确获准后，Worker 当前 PR source `9b8b894421beb5992bdedc485eda0c41a73afabe` 的 run `38038329152` 已完成两次受控采集，原 ZIP 与完整对象校验通过；本候选恢复原 comparator blob `fba36da923a94cd2b9ba024f020089e3ef313d90`。最终完整 HEAD 独立 R3、真实 Ready/live provenance 与 CI 尚待实际通过。

以下为历史工作快照，不是开放 WIP 或新选工入口。

## 当前工作：P0-04 纯预算/选择组件 #106（2026-10-10）

canonical [#106](https://github.com/ntygod/zhiwei-next/issues/106)，唯一分支 `feat/106-context-budget-core`，基于已保护合入的 main `4d3d40926150b3fce122f8f20f6d7e8c50c735a8`。#104 / PR105 规划已经独立 R3、原 CI/来源和保护合入；本项独立实现其[完整预算合同](../planning/context-budget-preparation.md)，不修改刚生效的规则。唯一 [PR107](https://github.com/ntygod/zhiwei-next/pull/107) 已实现内部预算选择与35项独立测试（含全部4097预算配额和输入排列），固定工具链完整 check 428/428、原始退出码0。最终 HEAD 独立 R3/Ready 与受保护交付仍以实时 GitHub 记录为准，未提前宣称完成。

新增仅限 context-compiler 内部纯预算选择，无生产消费者；不认证材料资格或生成可发送 Capsule。旧 compileContext 与哨兵、P0-01/P0-02/D-04/D-08、正式 P1 安全/存储依赖均保持，不执行受限实验。原 Runtime 来源逐 PR 续期，不能复用前一 PR 的来源证明；最终独立 R3、Ready/live 来源、CI 与 main 回读仍需完成。

以下段落为已完成规划及历史快照，不是额外开放 WIP。

## 当前工作：P0-04 预算准备规划 #104（2026-10-10）

canonical [#104](https://github.com/ntygod/zhiwei-next/issues/104)，唯一分支 `docs/104-context-budget-plan`，基于 main `c32a13d65fbf484e099bca432502f03ba00a61e1`。PR103/#102 已交付 P0-03，69新增/393完整测试通过，无生产消费者。本项仅定案[P0-04 纯预算/选择准备](../planning/context-budget-preparation.md)及精确准备边界，不实现算法；最终 HEAD 旧规则独立 R3/CI/来源/保护合入前不得使用新规则。

P0-04 depends=[]；P1-01 在原 P0-02/P0-03 之外增加 P0-04 以满足旧完整阶段门，P1-06 保留 P1-05 并追加 P0-04 作为未来消费者。checker/Workflow、P0-01/P0-02、D-04/D-08 和受限实验约束不变；不运行受限实验、不恢复 PR99 或旧取消会话。预算结果不是可发送 Capsule/资格/Exposure，组件证据不认定 Z14/Z15 正式通过。实际 PR、HEAD、验收与合入以 GitHub 回读为准。

以下旧“当前工作”段落是历史快照，不是开放 WIP；准确下一步见[当前交接](../planning/next-task-handoff.md)。

## 当前工作：P0-03 纯 Task/Outcome 组件 #102（2026-10-10）

canonical [#102](https://github.com/ntygod/zhiwei-next/issues/102)，唯一分支 `feat/102-task-outcome-core`，基于已保护合入的 main `79f156b8abcb5110e62f89427a021c6e8384eaf4`。规划 #100 / PR101 已交付；本独立任务依生效的 [P0-03 准备边界](../planning/core-preparation-boundary.md)实现 domain/cognition-core 纯 Task/Attempt/Outcome 类型、规则及确定性测试，尚未完成验证与交付。实际 primary PR 和精确 HEAD 以 GitHub 为准。

仅合成内存输入，无生产调用方、I/O、模型、存储或 Runtime 接线。P0-01/P0-02、D-04/D-08 与全部正式接入门仍未完成；组件测试不认证 Z03/Z16 或 P1。没有重跑受限安全实验/旧漏洞诊断，也没有恢复已取消的旧本地验证会话。PR99 关闭未合并、#98 未交付保持；不恢复 UI 工作。规则、checker、Workflow 与门禁不变。

以下规划工作记录保留历史背景，不是并行 WIP。

## 当前工作：核心实现准备拆分 #100（2026-10-10）

canonical [#100](https://github.com/ntygod/zhiwei-next/issues/100)，分支 `docs/100-core-preparation-plan`，从 main `e08ef068f3c0075a11155be50a871f8d851ed24c` 创建。所有者明确停止视觉打磨并要求继续核心开发；本项只调整准备与正式接入顺序，新增 P0-03 纯 Task/Outcome 规则任务，不实现产品代码。P0-01/P0-02 原对象与全部门保持；P1-01 同时依赖 P0-02/P0-03。旧规则独立 R3、完整 check/CI/保护合入前，不启用新范围。

[PR99](https://github.com/ntygod/zhiwei-next/pull/99#issuecomment-6092387472)已关闭未合并，源码为 `dded6fd30d93a95deb9fe7724d153c19b02e295e`，保留 Draft 与未验收事实。#98 不标成功；原型真实浏览器验收未完成，不再推进视觉工作。现有 Branch Cleanup 可以按原规则回收 ref，PR/精确 commit 保留恢复证据。无开放 main incident，pause=false；不运行受限安全实验。

本项实际 PR、最终 HEAD 与独立审查以实时 GitHub 对象为准，不预填批准。下一独立实现范围见[准备边界](../planning/core-preparation-boundary.md)。以下 #94/#96 内容保留为历史设计交付背景，不是当前 WIP。

## 当前方向：完整认知 Agent / design-v2（2026-10-09）

### 当前人类输入：详细架构 #96

PR #95 已保护合入 main `14398486e4009e70180fb5291d8b4ede62e8b664`，Issue #94 已关闭，设计与计划完成。所有者随后要求“需要详细的架构设计”；本轮 canonical 为 [#96](https://github.com/ntygod/zhiwei-next/issues/96)，分支 `docs/96-detailed-architecture`，从该 main 起点补充[实施级架构](../architecture/detailed-design.md)。范围为模块/端口、进程/状态/时序、逻辑 Schema、事务/恢复、API/事件、认知算法与部署；不开始产品实现，不改变 P0 阶段或旧门禁。原 31+5 任务、32 场景和 60 项映射保持，任务合同导航增加详设引用。

新增 ADR0018 已依据 [PR97 独立设计接受](https://github.com/ntygod/zhiwei-next/pull/97#issuecomment-6080136287)定案，审查 HEAD 为 `2d371a416e73c735a4dfa4feafa09776a6570e51`；后台认知动作/预算身份的阻塞已关闭，18组件/10端口/14事务/12边界映射与14负例一致。设计 Schema 示例只在隔离数据库验证结构约束，不充当生产迁移/安全/性能验收。登记后的最终 HEAD 仍需独立 R3/真实Ready来源/CI/合入，实际结果以 [PR #97](https://github.com/ntygod/zhiwei-next/pull/97) 为准。以下 #94 内容是已合入设计的连续性背景，不再表示活跃分支。

所有者明确要求整体调整项目、定案完整设计并给后续 AI/人可执行计划。本次 canonical 为 [#94](https://github.com/ntygod/zhiwei-next/issues/94)，分支 `docs/94-cognitive-agent-design`，起点 main `1872955c8d5fffc7c2477f62343fc38224b4f0da`；PR #91/#93 已合入，无开放 Incident 或其他 primary PR。#67/#44/#15 保留。

新的[设计入口](../planning/design-baseline.md)、[P0—P5 路线](../planning/roadmap.md)与[完整任务卡](../planning/implementation-plan.md)在本 PR 经独立审查合入后替代旧 M0—M7 排期。当前仍只有 Bootstrap/有限实验实现，本次不实现产品代码、不接真实数据/模型、不宣称新场景已通过。31 个必需任务、5 个条件扩展、32 个新场景与旧 60 包映射由 development-plan.json 管理；阶段导航改为 P0，风险/批准/CI/来源门均保持原规则。

新 ADR0016/0017 已依据 [PR95 独立设计接受](https://github.com/ntygod/zhiwei-next/pull/95#issuecomment-6078063023)登记 Accepted，审查 HEAD 为 `a590da1510577f3c7dd8efef720db13f6108debb`。旧备份授权不复活、迟到结果提交屏障及 P4 范围三个审查项已关闭。D-04/D-08 的旧有限登记与原 G-2 验收仍是 P0-01，原 G-5 基线由 P0-02 承接；设计方向明确，生产能力仍须接线验收。登记后的最终 HEAD 仍需独立 R3、Ready/live 与保护合入，实际结果以 [PR #95](https://github.com/ntygod/zhiwei-next/pull/95) 回读为准，不预填成功。

以下旧“当前”段落为有日期的历史与机器锚点，不再是活跃队列。真实下一步见[交接](../planning/next-task-handoff.md)；本次保留旧冻结计划、已接受决议与测试，不依赖新设计降低自身门禁。

## 历史工作：D-04 / D-08 决议登记结构准备

canonical 为 [Issue #92](https://github.com/ntygod/zhiwei-next/issues/92)，唯一分支 `chore/92-decision-registration-preparation`，primary 为 [PR #93](https://github.com/ntygod/zhiwei-next/pull/93)。起点 `main@b7478fa9c7267e8c512a40bba33b8d67c320bf0d` 已含 PR #91，#90 已关闭。2026-10-09 开工回读无开放 Incident、pause=false，无其他开放 primary；#67/#44/#15 保留。

本项为[当前决议层](../planning/decision-execution-layer.md#d-04--d-08-登记准备)补齐 D-04/ADR0014、D-08/ADR0015 的精确归属、Proposed 正文摘要与共用实验入口约束，添加内存结构正反例。没有执行安全合成实验、没有登记实验证据或新的决策接受；proposal/evidence/review 仍为空，两个 ADR 保持 Proposed。当前完整 HEAD 的正常测试、独立 R3、CI/来源及受保护交付以本 primary PR 的实际结果为准。

PR #91 的实验交付不接受 D-04/D-08；本项结构测试同样不替代实际实验证据或其审查。既有作者与独立审查实际复跑实验的要求保持原文，不新增豁免，不声称平台限制已经解除。G-2 仍待决议与原卡验收，G-5 继续等待 G-2，M0-2 继续等待 G-5。不接入真实数据/凭据或模型，不改生产代码、Workflow 或质量门。

当前 PR #93 已按[Runtime 来源续期记录](../spikes/pi-runtime-contract/README.md#2026-10-09-pr-93-当前来源续期)保存并核对本 PR 的成功 SDK 原 ZIP 与 Worker 两个 attempts 的原 ZIP、唯一 JSON、严格 Checker 和完整对象相等。Worker 两次均在真实完整比较成功后由明确三行 guard 产生受控 CLI failure；CLI 已恢复原 blob，来源元数据不改变 frozen content、validator 或任何接受谓词。最终完整 HEAD 的独立 R3、fresh Ready/live 来源及受保护交付仍须实际完成。

以下 PR #91 开发期文字为历史快照；其中 Draft/待审仅描述当时状态，不是当前 WIP，也不批准本项新 HEAD。

## 历史工作：G-2 接入前安全与保留实证

canonical 为 [Issue #90](https://github.com/ntygod/zhiwei-next/issues/90)，唯一分支 `spike/90-preintegration-safety`，primary 为 [PR #91](https://github.com/ntygod/zhiwei-next/pull/91)，起点 `main@ab6052efbb84abe6f87bc6758bfd7e8143b73964`。2026-10-09 本地从 `0d89f786326b51dff36b1f06f8958f2e746565a1` 接手，已回读无开放 Incident、pause=false，唯一开放 primary 是 #91；#67/#44/#15 保留。ADR0014/D-04 与 ADR0015/D-08 仍 Proposed。当前[接入前实证](../planning/g2-preintegration-evidence.md)补齐重建/恢复记录的可信绑定，修复后的 90 项合成测试通过；Private 等拒绝仍为接收器零连接/请求/字节，旧 inline 备份仍可直接回读，因此清除只报告 partial。PR 保持 Draft，新完整 HEAD 的独立 R3、当前 PR 来源与其余交付门均待实际结果；本地结果不表示远端平台限制已经解除。

范围为真实临时文件读取、来源/Private 外发拒绝、本地可观察接收器、公开 protocol/Ledger 元数据和既有 D-01 重建器的保留/不可用证据；不改生产 Schema，不实现 Host/Session/M0-4/M5，不接入真实正文/凭据。现有严格决议层禁止实验来源 PR 同时作为新决议 primary PR，因此本任务仅交付实验和 Proposed 合同；受保护合入后在新的实质决议任务接受 D-04/D-08 并按原 G-2 卡验收。不伪造来源、不放宽 validator。

当前 PR 的既有 SDK/Worker 原 ZIP、完整内容及来源身份已按[PR #91 取证记录](../spikes/pi-runtime-contract/README.md#2026-10-09-pr-91-当前来源整合)重新核对并写入 Manifest；没有修改 Runtime 内容、比较器或来源校验条件。这与安全实验的 90 项验证分别记录，不替代最终独立审查或 Ready/live gate。

G-4 已由 [PR #89](https://github.com/ntygod/zhiwei-next/pull/89)于 2026-10-09T01:23:47Z 受保护交付。main `ab6052efbb84abe6f87bc6758bfd7e8143b73964` 单父 `b5115d47a091f2c954e29a9963257c218bc11032`，tree `096e87c035d022b85e4a950ef146ed04ef3e004a` 与最终受审 HEAD `ce80dcb5e69ae678c2eb67a65bffc9143a9e20e6` 一致；[最终 R3](https://github.com/ntygod/zhiwei-next/pull/89#issuecomment-6072285575)、[Ready CI](https://github.com/ntygod/zhiwei-next/actions/runs/37869203320)、[保护合并](https://github.com/ntygod/zhiwei-next/actions/runs/37869555453)和 [main 来源](https://github.com/ntygod/zhiwei-next/actions/runs/37869569146)均完成，#88 已关闭、旧分支已回收。三场景 PARTIAL/21 not-run 的边界保持；旧批准不批准本次安全实验。

G-1/G-3/G-4 原有限条件已交付，G-2 的保留/文件/外发/工具合同与 D-04/D-08 仍待完成；G-5 继续等待 G-2，M0-2 等待 G-5。下面保留 G-4 与更早开发期的状态及机器锚点，不能作为当前 WIP 或新候选批准。

## 历史工作：G-4 可执行场景与证据运行器

canonical 为 [Issue #88](https://github.com/ntygod/zhiwei-next/issues/88)，唯一分支 `feat/88-executable-scenario-evidence`；从 `main@b5115d47a091f2c954e29a9963257c218bc11032` 开始。原 [G-4 工作卡](../planning/engineering-execution.md#g-4--可执行场景与证据运行器基线)要求 clock/ID/model/I/O 可注入、失败/跳过/未运行分开、证据绑定 HEAD/环境/场景版本和拒绝伪通过的运行器自测。当前只运行已实现 Ledger 的组件场景；不能把 E0-02/03/04 局部覆盖、合成模型或运行器自测算作完整 M0 产品链路。其余原场景未实现时保持未运行，24 场景及历史 S 别名、原工作包快照和 checker 不变。

[G-4 有限场景证据与用法](../planning/g4-scenario-evidence.md)说明实际 public Ledger 调用、四端口注入、超时进程清理和来源绑定；默认测试覆盖真实合成 I/O 与拒绝伪通过。新候选仍待最终完整 HEAD 验证、独立审查和受保护交付。

G-3 已由 PR #83/#87 完成原三条件并受保护交付，逐项边界见 [G-3 验收](../planning/g3-baseline-acceptance.md)。PR #87 的 [最终完整 HEAD 独立 R3](https://github.com/ntygod/zhiwei-next/pull/87#issuecomment-6071231663)、[fresh Ready CI](https://github.com/ntygod/zhiwei-next/actions/runs/37861022790)、[SDK/Worker live 来源](https://github.com/ntygod/zhiwei-next/actions/runs/37861022754)、[保护合并](https://github.com/ntygod/zhiwei-next/actions/runs/37861429039)和 [main 来源核验](https://github.com/ntygod/zhiwei-next/actions/runs/37861447771)均已完成。合入 main `b5115d47a091f2c954e29a9963257c218bc11032` 单父为 `41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415`，tree `8ec253c519cc85cd5ffcc012c7c716380ced6576` 精确等于受审 HEAD `729e46d5bab48357a28b02945816f4b10eaaa062`。#86 已完成关闭，旧工作分支已回收；此历史批准不批准 G-4 新代码。

G-4 按原 G-1/G-3 依赖就绪；G-2 的文件/Private 外发/工具信任/保留与 D-04/D-08 仍未完成，G-5 继续等待 G-2/G-4，M0-2 仍受 G-5 约束。root SDK 的 46 声明诊断、生产 Host/Session 与 M0-4/5 均未由 G-3 消除或实现。新候选仍要完整检查、最终 HEAD 新独立审查、适用动态/来源门及受保护交付，未预记完成。

当前 PR #89 已按[Runtime 来源记录](../spikes/pi-runtime-contract/README.md#2026-10-09-pr-89-当前来源续期)保存并核对本 PR 成功 SDK 与 Worker 两个 attempts 的原 ZIP、唯一 JSON、严格 Checker 和完整对象相等。Worker 两次均在完整比较成功后由明确三行 guard 产生受控 CLI failure，非 Runtime 故障；原 CLI blob 已在 `d18f8b6cdac6d8ec9788123036e9a400e21fa71b` 精确恢复。来源更新不改变冻结内容、Phase A 或 D-07/ADR 已接受决策；最终完整 HEAD 仍须新独立 R3、fresh Ready CI 与真实 live provenance 成功。

以下 G-3b 与更早段落是历史工作快照，保留原机器锚点和当时待验证状态，不代表当前 WIP 或本候选批准。

## 历史工作：G-3b CLI JSONL 路径与启动合同

canonical 为 [Issue #86](https://github.com/ntygod/zhiwei-next/issues/86)，唯一分支 `feat/86-pi-cli-runtime-contract`。本项从 `main@41b1f8a4f2bb710ec6d94a0df95e9dc4c2e0e415` 开始，唯一 Draft primary 为 [PR #87](https://github.com/ntygod/zhiwei-next/pull/87)，最终实现、决策/代码审查与交付都在该 PR 完成。

G-2a 已由 PR #85 受保护交付：[最终独立 R3](https://github.com/ntygod/zhiwei-next/pull/85#issuecomment-6069591715)、[Ready CI](https://github.com/ntygod/zhiwei-next/actions/runs/37849349835)、[受保护合并](https://github.com/ntygod/zhiwei-next/actions/runs/37849815421)、[来源核验](https://github.com/ntygod/zhiwei-next/actions/runs/37849835830)及[回读](https://github.com/ntygod/zhiwei-next/actions/runs/37849866325)分别记录。ADR 0012 Accepted 只覆盖现有诊断；D-04/D-08 聚合和 G-2 其他边界仍未完成，诊断凭据不授权未来数据/工具接口。

D-07 及 ADR 0011/0013 已由[实际有限决策审查](https://github.com/ntygod/zhiwei-next/pull/87#issuecomment-6070476496)接受，绑定 HEAD `37c6228ef9187b932a9648d472319bce31a4aef5` / proposalSha256 `b13ccee54ba167fc7553d517ad60154ebf7a0a88c2df8e1f87082d1c19d9d764`；2026-10-08T22:39:59Z 完整回读。[当前执行决议](../planning/current-decisions.md)保留历史摘要，两 ADR 只改唯一状态行。[证据说明](../planning/d07-cli-evidence.md)区分来源与 main41b1f8a 新复跑，被审候选保持全部 115 个历史文件原字节。接受后才实现[内部严格 CLI 合同](../architecture/pi-cli-state-contract.md)并接入现有零 prompt Artifact probe；固定启动/环境/目录、严格 JSONL、EOF+自然 close 成功边界与无秘密错误，不新增生产 Host/Session 或 M0-4/5 框架。[G-3 原卡逐项验收](../planning/g3-baseline-acceptance.md)保留尚待远端验证的条目。最终新完整 HEAD 仍需独立 R3、完整 check、fresh 动态/Ready/live 来源、受保护合入与回读，不继承决策批准。

当前 PR #87 已按[Runtime 来源记录](../spikes/pi-runtime-contract/README.md#2026-10-08-pr-87-当前来源续期)保存并核对本 PR 成功 SDK 与 Worker 两个 attempts 的原 ZIP、唯一 JSON、严格 Checker 和完整对象相等。Worker 两次均在完整比较成功后由明确 guard 产生受控 CLI failure，非 Runtime 故障；原 CLI blob 已在 `ac9616a2153a83a48489567e613b468b908066d9` 精确恢复。来源更新不改变冻结内容或 D-07/ADR 已接受决策；最终完整 HEAD 仍须新独立 R3、fresh Ready CI 与真实 live provenance 成功。

以下 G-2a 及更早段落是历史工作快照，保留原机器锚点和当时状态，不代表当前 WIP 或新候选批准。

## 历史工作：G-2a 受保护本地诊断

canonical 为 [Issue #84](https://github.com/ntygod/zhiwei-next/issues/84)，唯一分支 `feat/84-protected-local-diagnostics`，primary 为 [PR #85](https://github.com/ntygod/zhiwei-next/pull/85)。起点 `main@830e14626aca89100a8b33d775ccf39c7781c828` 已交付 G-3a：PR #83 [最终独立 R3](https://github.com/ntygod/zhiwei-next/pull/83#issuecomment-6067745177)、[Ready CI](https://github.com/ntygod/zhiwei-next/actions/runs/37834461723)、[受保护合并](https://github.com/ntygod/zhiwei-next/actions/runs/37835170413)、[来源核验](https://github.com/ntygod/zhiwei-next/actions/runs/37835207070)与[回读](https://github.com/ntygod/zhiwei-next/actions/runs/37835227793)分别记录，不批准新候选。

本项只保护现有 Daemon health/meta 与 CLI doctor：literal loopback、明确客户端凭据、Host/Origin/方法/原始路径、有限超时/字节、闭合 health DTO 与不反射秘密的错误类别。[使用与测试](../architecture/local-diagnostics.md)和 [Accepted ADR 0012](../adr/0012-protected-local-diagnostics.md)给出兼容变化及可信进程边界。Bearer 不能认证服务端，抢占端口/读环境内存/改文件的同机能力不在保证内；凭据不授权未来数据/工具接口。

Node 22.23.1 真实隔离 HTTP 先复现旧入口风险，新增负例验证拒绝；本地无 Docker，动态矩阵由原 CI 执行。ADR 0012 已由[真实有限决策审查](https://github.com/ntygod/zhiwei-next/pull/85#issuecomment-6069198884)接受，绑定被审 HEAD `3a6dbbd36a4cd553f7d33079c6bdadfcaa065b82`、tree `7109c15d2a62899925f8a5c3e48386805440b64c` 和 Proposed 完整文件 SHA-256 `be596b07d4daa68ba9ed90785f39a61621a22adffe755082caa7855e7db0139a`；评论发表于 2026-10-08T21:15:48Z。本次 ADR 只改变唯一状态行，正文与有限保证不变。记录接受后的新完整 HEAD 仍需全新独立 R3、fresh Ready CI、受保护交付及来源回读。D-04/D-08、G-2 整体以及文件路径/工具注入/Private 外发/正文与 Claim/cache/backup 保留未完成，不解锁 M0-3/4/5/7 或 #67。

当前 PR #85 已按[Runtime 来源记录](../spikes/pi-runtime-contract/README.md#2026-10-08-pr-85-当前来源续期)核对本 PR 成功 SDK 与 Worker 两个 attempts 的原 ZIP、唯一 JSON、严格 Checker 及完整对象相等。Worker 两次在完整比较成功后由明确 guard 产生受控 CLI failure，并非 Runtime 故障；原 CLI blob 已在 `2b70d98c71534519bda1c373206075691f2bb8bf` 恢复。来源 metadata 更新不改变内容指纹、既有 G-1 决议或本项 ADR 状态；最终完整 HEAD 仍须新独立 R3、fresh Ready CI 与真实 live provenance 成功。

以下 G-3a、G-1 与更早段落保留为历史工作快照，包含当时的 Proposed/待审状态和机器锚点，不表示当前 WIP 或批准。

## 历史工作：G-3a 固定工具链与完整类型检查

canonical 为 [Issue #82](https://github.com/ntygod/zhiwei-next/issues/82)，唯一分支 `chore/82-formal-toolchain`，primary 为 [PR #83](https://github.com/ntygod/zhiwei-next/pull/83)。起点 `main@4a565f0f26ba747275d4a024e0f1211b24f65acf` 已交付 G-1 有限基线：PR #81 [最终独立审查](https://github.com/ntygod/zhiwei-next/pull/81#issuecomment-6063364919)、[Ready CI](https://github.com/ntygod/zhiwei-next/actions/runs/37801655818)、[受保护合并](https://github.com/ntygod/zhiwei-next/actions/runs/37802221249)、[来源核验](https://github.com/ntygod/zhiwei-next/actions/runs/37802251253)及[回读](https://github.com/ntygod/zhiwei-next/actions/runs/37802274027)分开保存，不作为新候选的批准。

本项固定版本/完整 strict 编译/官方 Pi client 类型面/安装隔离与负例，详见[工具链边界](../architecture/formal-toolchain.md)与 Proposed ADR 0011。root SDK 官方声明仍有 46 个诊断，不把 client 子路径通过写成 root SDK 兼容。D-07 整体仍 Proposed，不实现 Session、WorkerSupervisor、Daemon 或 M0-4；当前完整 HEAD 的独立 R3、fresh Ready CI、全部动态矩阵及受保护交付尚待 PR 实证。

当前PR已按[Runtime来源记录](../spikes/pi-runtime-contract/README.md)核对本PR成功SDK及Worker两attempt的原ZIP、内容身份和完整对象相等。Worker两次均在完整比较成功后由临时guard产生受控CLI失败，非Runtime故障；CLI已恢复原blob。来源metadata与内容指纹分开记录；实现HEAD `2d70ea8fe05277b9cad241b4238ed88d9744fbe1` 的Draft动态CI已成功，最终完整HEAD仍待独立R3与真实Ready live gate；本次续期不改变G-1历史决议或D-07状态。

以下 G-1 与更早开发记录是历史快照，保留全部被审身份、原始状态与机器锚点。它们不表示本项 WIP，不继承批准。

## 当前工作：G-1 有限执行决议

2026-10-08 本项起点为 `main@9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d`，已含 PR #77/#79 的静态包归属、合成输入和真实临时 SQLite 演进实证。canonical execution 为 [Issue #80](https://github.com/ntygod/zhiwei-next/issues/80)，唯一分支 `chore/80-current-decision-evidence`，primary 为 [PR #81](https://github.com/ntygod/zhiwei-next/pull/81)；新完整 HEAD、CI 和最终独立审查以实时对象为准。

[当前执行决议](../planning/current-decisions.md)是单一执行状态入口，原源登记及 JSON 是历史 Proposed 快照；[状态层说明](../planning/decision-execution-layer.md)记录严格 opt-in 校验、有限范围和审查身份。D-01/02/10 已依据 [PR #81 的真实逐项决策审查](https://github.com/ntygod/zhiwei-next/pull/81#issuecomment-6062783403)记 Accepted，reviewed HEAD 为 `4eae854403dc6596a0db7297dcf756137c848ec7`，回读观测为 `2026-10-08T15:05:32Z`。ADR 0007—0010 仅状态行改变，被审正文/范围/实验摘要不变。该评论只批准历史 proposal；PR #77/#79 仍仅属实验批准。状态登记后的新完整 HEAD 待全新独立 cold review、fresh Ready CI、受保护合入与来源回读，不继承未来批准。

[G-1 原卡逐项验收记录](../planning/g1-baseline-acceptance.md)已分别核对三项完成条件和两类失败路径，本 PR 候选实质条件满足；尚不宣称已合入 main 交付，不从三个 Accepted 自动算完成，也不要求先交付未来产品能力。待本 PR 最终审查/CI/合入回读完成后，按原依赖选择 G-2/G-3 就绪工作；D-04/G-2 保留授权、D-09 owner/升级并发、D-03/G-5 性能与硬件持久性仍约束相关产品实施。D-02 只覆盖 table/index/trigger/xinfo，view 未覆盖且旧态验证在 BEGIN IMMEDIATE 前。本项不实现 Session、生产迁移、Host 或新权限，不改原质量门。#67 整体、M0 与正式会话链仍未完成。

以下 PR #71/#73/#69/#75 开发期间的文字及机器锚点是**历史快照**，保留供现有测试与审计定位；其中“当前”“未合并”“review-required”只描述当时，不表示本次 WIP 或对新 HEAD 的批准。不开展完整 G-6a 历史重构，不删除/放宽 Ledger 历史锚点测试。project-state 更新命中既有 Runtime 来源路径时，按现行合同取证，不为减少重采成本省略应有状态或修改门禁。

## 历史开发起点（PR #71 期间）

本次整理对应 Issue #70 / PR #71。执行顺序以 [M0—M7 执行计划](../planning/execution-plan.md) 为准，当前仍是 [M0：能观察](../planning/milestone-m0.md)，没有进入记忆或完整 UI 阶段。计划随 PR #71 合入 main 后生效，其中的 Proposed 决策仍须分别取证、形成 ADR 并审查。

2026-10-08 对账时，main 为 `843c09569360184592f3d5cecb3b1b165eba6af7`；PR #66 已合并，Issue #49 已关闭。正式 `NormalizedRuntimeEvent v1`、Pi 事件映射和契约 Fixture 已进入主分支；SQLite Ledger、正式 Worker/Daemon 链路和 CLI 查询回放尚未交付。本文件此前将 #66 记为待完成的状态已在本次整理中纠正，README 同步提供当前入口。

本文件保存有日期的交接快照。开工时仍须实时核对 Incident、人类新输入、PR HEAD、CI 和分支，不能把下方历史 Fixture/审查身份当成当前候选批准。

## 历史产品 WIP：Issue #56 / PR #69（现已合入）

| 项目 | 对账结果 |
|---|---|
| 工作包 | M0-1：SQLite append-only Observation Ledger v1 收口 |
| canonical Issue / primary PR | Issue #56 / PR #69 |
| 状态 | open / Draft / 未合并 |
| 唯一 active 产品分支 | `feat/56-sqlite-observation-ledger-v1` |
| 候选 HEAD | `f4b94886020ea5c67c302f6eac2db518ac6bde27` |
| 基线 | `main@843c09569360184592f3d5cecb3b1b165eba6af7` |
| 待完成 | 当前 HEAD 的全新独立 R2 cold review、Ready CI、受保护合并和合入回读 |

旧 HEAD `ba04fca042f3495b3fc4886da992cbb727b7cd0b` 的 `CHANGES_REQUESTED` 和 6 项 blocker 不代表当前 HEAD 已获批准。当前候选已有修复及历史 Draft CI 证据，但本规划整理不替代产品审查、不移动产品分支、不将候选代码计入 main。下一轮从 #69 的当前真实完整身份继续，不新建替代 Ledger PR；如需适配新的 main，仍在 #69 完成并重新审查最终 HEAD。

## 历史 Ledger 候选继续记录（保留测试锚点）

<!-- zhiwei-active-primary
work-item: #56
primary-pr: #69
branch: feat/56-sqlite-observation-ledger-v1
status: review-required
-->

当前等待独立 R2 cold review。#69 原候选 `f4b94886020ea5c67c302f6eac2db518ac6bde27` 的独立复核发现：Schema 对象过滤将 LIKE 的 `_` 当通配符，遗漏 `sqlitex_*` 用户表/trigger；新库初始化锁冲突被归为 migration 而非稳定 `sqlite` 错误。该候选的 55 项 Ledger/129 项全仓检查通过不代表上述负例通过或已获批准。

本轮仍在同一 #56/#69 修正两处边界并加入真实临时 SQLite 回归。提前独立复核进一步覆盖安装时真实 SQLITE_FULL 及 metadata/history I/O 错误；这些 operational cause 同样交给公开 sqlite 错误边界，SQL/constraint/history 语义失败仍保持 migration 分类。从 `main@dea55a9780ba8ad0ae22494d2664396c02dbcbb3` 保留已合入规划、Runtime 来源和精确清理记录，合并冲突只在本文件对齐。实际最终 HEAD、修复验证与审查结论以 PR 为准，旧审查不继承到新 HEAD；本文件不宣称 Ledger 已合入。

## 历史工作队列与仓库对账（PR #71/#69 期间）

1. 完成 M0-1（#56 / #69）；
2. 依次选择 G-1 → G-2 → G-3 → G-4 → G-5 中前置已满足的实质目标；
3. 再按计划推进 M0-2…M0-8，整体 M0 阶段门通过后进入 M1。

Issue #67 保留架构父项；Issue #44 保留后台进度的 owner-input 原文和开放状态，由 M0-7、M5-6、M6-4 分阶段承接。Issue #15 复用为低优先级 G-6b，不阻塞产品主线。不批量创建远期工作包 Issue；本次入口和事实同步不宣称 G-1 或完整 G-6 已交付。

旧 PR #68 已关闭、未合并，由 #69 supersede。旧分支 `feat/m0-sqlite-observation-ledger-v1` 当前为 `5d5aef1dd7bfd7b6b7812a9b0d4975dbd7963af0`，已不同于 2026-08-12 的冻结快照。核验结果：其产品父提交 `9126ca35e4afbc2c137cfa8978e0eae7bd97529f` 已由 #69 保留，唯一额外提交只加入废弃的 `.github/workflows/issue56-ledger-bootstrap.yml`。

本次在[现有精确身份清理记录](reconciliation/2026-08-12-work-item-cleanup.json)追加该旧 HEAD，保留原快照登记作为历史，不改清理策略、Workflow 或检查器。仅在 PR #71 经 R3 审查合入后，由既有 Repository Hygiene 重查默认分支、protection、开放 PR 和完整 HEAD 再回收；HEAD 移动或重新获得开放 PR 时必须保留。实际删除结果以该 Workflow 回读为准。

回收前已制作完整历史 Git bundle，并在独立临时裸仓库恢复验证：HEAD 为 `5d5aef1dd7bfd7b6b7812a9b0d4975dbd7963af0`，tree 为 `b7534e3eafb564287defc2194720ef76b8599439`。恢复时先通过受审查 PR 撤销本次精确清理登记，再从保存的完整 SHA/bundle 重建分支；不得 reset main 或覆盖 #69。文档可 revert，已登记 Issue、PR 和审计记录保留。

## 治理状态

知微处于 **M0：能观察**，AI-primary 自主开发模式为：

```text
public-free-ruleset
```

仓库为 **Public + GitHub Free**。Ruleset `20776157` 处于 active；owner/admin live readback 已确认无 bypass。普通临时 `GITHUB_TOKEN`不能读取 `bypass_actors` 与 `security_and_analysis`；仓库不保存 PAT或其他长期管理员 Secret。历史 `best-effort-private-free` 只作为连续性证据。

`developmentPause.active=false`，Issue #9 已关闭。

## 已进入 main 的 Runtime 基线

- PR #60已合并；
- Issue #61 已完成 Public Ruleset 与 required evidence 闭环；
- Issue #32 已由 PR #64 完成，其合并基线为 `374a27505c4a150cbcb63c1b8f6c1afb3bfb4448`；
- Issue #49 已由 PR #66 完成，协议合并基线为 `843c09569360184592f3d5cecb3b1b165eba6af7`；
- Pi SDK / Extension、RPC、Host、Tool、Retry、Queue、Cancel、Compaction、Session Replacement 与 Process Boundary 的脱敏 Fixture 已进入 main。

## SDK / RPC verified Fixture 连续性

本 SDK 连续性表按现行 Harness 与 SDK manifest 同步至 PR #113；既往来源保留在 Runtime 历史记录。Worker 当前 PR 双 attempt 来源已按原 failure-shape 合同完成；最终 HEAD 的真实 Ready/live provenance 仍待实际运行。SDK / RPC parity当前 `verified` Fixture身份：

```text
source state                 verified
capture head                 404427198a501998f9fd4ff17c3382812a66aa37
capture workflow             38043223271
capture artifact             11666279525
capture artifact digest      sha256:9f13deb7e2c2191e602b702253dc3679a5dbd430bc0e0bcf0ecdb1a14d9d7121
```

PR #71 历史取证：2026-10-08 的 Ready 检查发现旧公开 Artifact 返回 404。本次重新绑定 SDK/RPC 的成功 Draft Capture，以及 RPC Worker run `37748698280` 在 `44336fbaa512ef6351ef39d01380323ad6562b78` 的 attempts 2/3；两份 Worker `result.json` 各 72,731 bytes、逐字节一致，且与完整 committed Fixture 相等。正式协议、Payload、Normalizer、内容哈希、Workflow 和检查器保持不变；临时 recapture-only guard 已从最终候选恢复。公开 Artifact 有保留期限，续期和单作业重跑的核验方式见 [Runtime 取证记录](../spikes/pi-runtime-contract/README.md)。

## 已合入协议的 Fixture 与历史证据

`NormalizedRuntimeEvent v1` 的协议、Pi Adapter、74-event Fixture、文档身份门禁与 Compaction start lineage 已通过 PR #66 合入。以下保留该 PR 的取证连续性，不再表示它是当前 WIP，也不能用于批准 #69：

- 历史 SDK/RPC parity Manifest 绑定 PR #66 的成功 Draft Capture run `32088804546` 与 Artifact `9307625961`；
- 历史 RPC Worker v2 来源绑定 PR #66 Draft 中同一 run `32090005181` 的 attempts 1/2；两次 Capture、Fresh validation、committed Fixture validation 和 Artifact upload 均成功，只有在完整对象相等后设置的受控 compare 步骤失败；
- 两个 RPC Worker Artifact 的唯一 `result.json` 逐字节一致，均为 72,731 bytes，SHA-256 `87cde96b6e52166bff1f50478ab80721cdf322017d4babfdc09f0fe35ecc75aa`；
- 临时 recapture 代码与 source-export workflow 未进入最终候选；合入代码使用正式完整对象比较路径。

Contract Fixture 当前为 **74-event**，固定 canonical hash：

```text
b6630cff347af84e43eca74e2d76c1b786cbe8fab71b9eab4e76df10c8110d2b
```

Issue #56 使用已合入 main 的正式协议，不消费历史 Draft HEAD。

## 历史 R2 审查连续性锚点

旧审查 `d77c66abff429219c0ac95ba405c57057e56b929` 的 verdict 为 `CHANGES_REQUESTED`；后续提交已经分别关闭 `willRetry=unavailable`、`retry.lifecycle/completed` 与 Tool Result Message 相关 blocker。该历史结论只用于机械连续性，不授权当前新 HEAD。

## committed Runtime 连续性锚点

以下句子由历史 Checker 机械读取，项目状态压缩不得删除：

- **自动重试恢复成功 Fixture**：公共`agent_end.willRetry=[true,false]`；Extension没有 `auto_retry_start/end`，失败Message仍从事件流持久化。
- **Follow-up队列 Fixture**：一个公共 Agent Run包含两个 Turn；Extension没有 `queue_update`；初始 `session.prompt()`会等到 Follow-up完成、Queue排空和Session idle后返回。
- 已验证用户取消、`abortRetry()`和 retry exhaustion；**取消、abortRetry与 Retry exhaustion Fixture**中，部分 Assistant消息以 `stopReason=aborted`保留，存在willRetry=true 但没有后续 Agent Run，Retry exhaustion最终保留最后一次失败 Assistant。
- **并行 Tool ordering Fixture**：完成顺序为 `beta → gamma → alpha`，消息顺序恢复为 `alpha → beta → gamma`。
- **Compaction 与 Session Replacement Fixture**：模型Context为`compactionSummary → assistant`；Session对象为`session-object-1 → session-object-2 → session-object-3`；旧 Public Listener不会自动迁移。验证 Compaction与 Session Replacement后，原始Entry、派生Summary、Session Object与Listener Rebind仍保持不同来源。
- **RPC真实 Prompt**：Command Response、Runtime Event、State / Messages、Extension Shutdown与Process Boundary分别保存。
- Main Provenance Dispatch可能遭遇 GitHub API瞬时故障；当前由即时dispatch与reconciler闭环，不能通过降低来源校验解决。

## Harness 与 Work Item 治理

- Issue #61 已完成 Public Ruleset、required evidence 聚合与 post-merge provenance 闭环；
- **Issue #57** 已完成仓库级 `work-item lifecycle` 治理；
- **Issue #45** 是已完成的 SDK / RPC parity canonical execution Issue；
- Issue #44 保持 owner-input；Issue #56 的协议前置已完成，当前产品候选见上方 PR #69；
- 每个 primary PR 在 pre-merge 阶段验证 work item 对象类型、开放状态、分支编号、owner-input 来源与 supersedes 关系；
- 一个 execution Issue 最多一个 active branch 和一个开放 primary PR；
- R2/R3 要求当前最终 HEAD 绑定的独立 AI cold review，作者自审不能替代。

## Runtime 合同连续性

后续协议和 Ledger 必须保留 SDK、Extension、RPC 与 Host Surface；Prompt、Agent Run、Turn、Message、Tool Call、Retry attempt、Session Object、Runtime Session、Worker Instance、Host Action、Extension Shutdown、Process exit/close 与 Compaction lineage。不得从 Prompt success、Queue 清空、最终 Messages、Agent settled 或 Process exit code 单独推断任务成功。

## 历史连续性锚点

```text
PR #12 final CI                 31498003965
PR #12 Autonomous Merge         31498045898
PR #12 Provenance Dispatch      31498045864
PR #12 Provenance Receiver      31498068302
PR #13 final CI                 31499190699
PR #13 Autonomous Merge         31499233718
PR #13 Provenance Dispatch      31499233680
PR #13 Provenance Receiver      31499253092
PR #13 merge commit             10c963ef8bee978543dccf73047d3bd2d18baae5
```

机器证明：

```text
docs/harness/provenance-proofs/2026-08-11-pr-12.json
docs/harness/provenance-proofs/2026-08-11-pr-13.json
```

历史机械锚点继续保留在本文件，完整的状态/历史分离留给 G-6a；本次不修改依赖这些锚点的机器检查。

## 历史 PR #69 Ready 来源回读与续期

a1f9cd4 的产品冷审、138项测试与Draft CI通过后，Ready live provenance拒绝了继承PR71的来源，因为现行冻结合同要求RPC Worker来源关联当前PR。现按PR69本身的真实来源记录续期：SDK成功run37760933918；RPC run37763595121的attempts1/2均完成capture、fresh/committed校验和完整对象相等，之后才由显式recapture-only guard额外制造CLI失败。它不是Runtime失败，也不是正常完整比较失败。

两份Worker Artifact重新公开下载仍可读，72731字节result.json逐字节相同且与完整committed对象深相等。临时guard已恢复为原CLI blob fba36da923a94cd2b9ba024f020089e3ef313d90，协议、normalizer、Workflow、validator、内容指纹和接受谓词无净变化。本轮最终交付风险升R3；原产品R2批准不授权新的来源HEAD，当前仍等待新最终完整HEAD的独立R3冷审、Ready全CI与受保护合入。

## 历史 PR #75 来源闭环状态

G-1a文档切片在83df4e09获独立R2，但Ready因当前PR来源关联被拒。现按[真实采集记录](../spikes/pi-runtime-contract/README.md)续期SDK与RPC来源，两Worker attempts的完整相等后受控CLI失败已明确记录，临时guard已恢复原blob。当前交付升R3，等待新最终完整HEAD的独立审查和fresh Ready CI；不复用83df批准，也不把来源更新视为新增产品能力。

## 历史 PR #77 来源闭环状态

G-1b当前PR77已按[真实Runtime取证记录](../spikes/pi-runtime-contract/README.md)准备本PR成功SDK来源与Worker两attempt来源。完整比较成功后才制造受控CLI失败，最终CLI已恢复原blob；不改内容指纹与接受谓词。冷审修复文件包装器/空suite误计与入口键序重复后，实验45项、目录精确运行30项与全仓138项分别验证；来源续期使最终风险为R3，等待最终完整HEAD新独立审查与fresh Ready CI，不复用PR75审查或宣布D-10接受。

## 历史 PR #79 来源闭环状态

G-1c当前PR79已按[真实Runtime取证记录](../spikes/pi-runtime-contract/README.md)核对本PR成功SDK与Worker两attempt；完整比较成功后受控CLI失败的原日志/原ZIP均保留，CLI现已恢复原blob。D01 50项、D02 35项、既有G1b45项与全仓138项各自验证，不合加。仍等待新最终完整HEAD独立R3/fresh ReadyCI；不改变原11项Proposed，不宣称真实模型输入/生产升级/任意SQLite对象覆盖。

## 历史 PR #81 来源取证状态（正式决议审查前）

本PR已按[真实Runtime记录](../spikes/pi-runtime-contract/README.md)核齐当前PR成功SDK及Worker两attempt来源，原CLI已恢复。取证时执行层仍是3项Evidence Ready、8项Proposed、零Accepted；当时需先有真实逐项决议审查，才能登记状态，并对新最终完整HEAD独立R3/fresh Ready，不拿来源或旧实验批准代替接受。
