// Exact planning identifiers and text. Partial overlap is not scenario equivalence.
export const SCENARIOS = [
  {
    "id": "E0-01",
    "given": "合成正常会话，实际 Worker 执行受限工具",
    "observe": "接受、Run/Turn、Tool、Result、回答、settled、关闭各有来源",
    "owner": "M0-4/5/8"
  },
  {
    "id": "E0-02",
    "given": "提交记录后关闭并重启",
    "observe": "已提交事件可查，身份和回放顺序正确",
    "owner": "M0-1/2/6"
  },
  {
    "id": "E0-03",
    "given": "交付已有前缀和新后缀",
    "observe": "前缀幂等，新后缀只提交一次",
    "owner": "M0-1/6"
  },
  {
    "id": "E0-04",
    "given": "同 ID/Key 不同正文或倒序 source slot",
    "observe": "明确冲突；批次新行和 cursor 不部分提交",
    "owner": "M0-1/6"
  },
  {
    "id": "E0-05",
    "given": "运行中取消、Retry 未继续",
    "observe": "不伪造成功或必然存在后续 Run",
    "owner": "M0-4/5"
  },
  {
    "id": "E0-06",
    "given": "Worker 异常退出，宿主在确认前后中断",
    "observe": "已提交数据保留；不确定结果不盲目重试副作用",
    "owner": "M0-5/6"
  },
  {
    "id": "E0-07",
    "given": "Compaction 与同/异 Instance 会话替换",
    "observe": "原事实保留，lineage 和 listener rebind 正确",
    "owner": "M0-4/6/8"
  },
  {
    "id": "E0-08",
    "given": "Workspace A/B 与旧 owner 并发请求",
    "observe": "查询、归属和恢复不串域",
    "owner": "M0-2/5/7"
  },
  {
    "id": "E0-09",
    "given": "模型输入引用缺失或 Runtime 变换未观测",
    "observe": "重建完整性降为明确未证明或拒绝，绝不虚构正文",
    "owner": "M0-3/4/8"
  },
  {
    "id": "E0-10",
    "given": "慢订阅者、断线重连、消息缺口",
    "observe": "背压/节流/去重与 gap 可见，不额外轮询模型",
    "owner": "M0-6/7"
  },
  {
    "id": "E0-11",
    "given": "迁移漂移、损坏、锁争用、磁盘满",
    "observe": "稳定错误；不静默修复或丢事件",
    "owner": "M0-1/G-5"
  },
  {
    "id": "E0-12",
    "given": "1千/1万/10万合成事件",
    "observe": "记录延迟、吞吐、内存和重启曲线，接受明确运行预算",
    "owner": "G-5/M0-8"
  },
  {
    "id": "E1-01",
    "given": "创建带证据候选、接受、重启",
    "observe": "候选与 Claim/版本/证据完整可查",
    "owner": "M1-1/2"
  },
  {
    "id": "E1-02",
    "given": "无证据或越域证据接受",
    "observe": "拒绝，不产生孤立 Claim",
    "owner": "M1-2/3"
  },
  {
    "id": "E1-03",
    "given": "两个 Workspace 相同关键词",
    "observe": "先过滤，绝不返回另一个域认知",
    "owner": "M1-3/6"
  },
  {
    "id": "E1-04",
    "given": "Session/Private 认知尝试升级或外发",
    "observe": "显式限制，不自动升级或发送",
    "owner": "M1-3"
  },
  {
    "id": "E1-05",
    "given": "用户纠正旧结论",
    "observe": "原子 supersede；旧版不在 active 结果",
    "owner": "M1-4"
  },
  {
    "id": "E1-06",
    "given": "两方纠正同 revision",
    "observe": "一方成功或明确冲突，不丢失更新",
    "owner": "M1-4"
  },
  {
    "id": "E1-07",
    "given": "相互冲突或到期的认知",
    "observe": "disputed/expired 资格一致，不任意选边",
    "owner": "M1-4/6"
  },
  {
    "id": "E1-08",
    "given": "逻辑遗忘后重新搜索与重建",
    "observe": "不再返回，失效水位一致",
    "owner": "M1-5/6"
  },
  {
    "id": "E1-09",
    "given": "清除中断、恢复旧备份、旧消息迟到",
    "observe": "不恢复为可使用认知，部分完成可见",
    "owner": "M1-5"
  },
  {
    "id": "E1-10",
    "given": "中文、代码标识符、术语与否定陈述",
    "observe": "固定语料基线，可解释排序",
    "owner": "M1-6"
  },
  {
    "id": "E1-11",
    "given": "重复 API 请求、未授权命令、空结果",
    "observe": "幂等或明确错误，不伪造成功",
    "owner": "M1-7"
  },
  {
    "id": "E1-12",
    "given": "恶意工具内容提出记忆/权限指令",
    "observe": "保留来源可信度；不变成用户授权",
    "owner": "M1-2/3/7"
  }
] as const;

export const SCENARIO_ALIASES = [
  {
    "id": "S0-01",
    "summary": "正常有工具会话：输入、工具调用、工具结果、最终回答、settled 与关闭各自有来源和正确关联",
    "scenarios": [
      "E0-01"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S0-02",
    "summary": "用户取消：取消不记录为业务成功，不编造 Assistant Outcome",
    "scenarios": [
      "E0-05"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S0-03",
    "summary": "接受后 Provider 失败：Prompt 接受与实际结果分开，无伪造成功响应",
    "scenarios": [
      "E0-01"
    ],
    "limitation": "仅部分重叠：另保留 M0-4 的 Prompt 接受后 Provider 失败负例；E0-01 正常场景不能替代它。"
  },
  {
    "id": "S0-04",
    "summary": "Worker 崩溃：已提交记录保留，未确定区间显式标记，不假装完整",
    "scenarios": [
      "E0-06"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S0-05",
    "summary": "摄取提交前后宿主崩溃：确认点、重复恢复和缺口分类符合合同",
    "scenarios": [
      "E0-06"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S0-06",
    "summary": "幂等前缀加新后缀：重复不增行，后续冲突使该批新记录原子回滚",
    "scenarios": [
      "E0-03",
      "E0-04"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S0-07",
    "summary": "来源乱序与缺失：仅同完整来源域比较顺序，无虚构跨域总序",
    "scenarios": [
      "E0-04"
    ],
    "limitation": "另保留 M0-6 来源缺失负例；E0-04 侧重冲突/乱序，不能代表缺口验证。"
  },
  {
    "id": "S0-08",
    "summary": "Compaction：派生内容和被替代上下文有 lineage，原始事实仍存在",
    "scenarios": [
      "E0-07"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S0-09",
    "summary": "Session Replacement：Session Object、Runtime Session、Worker Instance 和 listener rebind 不混同",
    "scenarios": [
      "E0-07"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S0-10",
    "summary": "慢订阅者与重连：有界队列、背压、cursor、去重和可见缺口，不用模型轮询",
    "scenarios": [
      "E0-10"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S0-11",
    "summary": "Scope 与输入记录：越域访问被拒绝；缺失记录或引用不冒充输入可重建",
    "scenarios": [
      "E0-08",
      "E0-09"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S0-12",
    "summary": "文件库恢复与规模：迁移、损坏、权限、锁竞争及规模边界有真实文件证据",
    "scenarios": [
      "E0-02",
      "E0-11",
      "E0-12"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S1-01",
    "summary": "明确记忆跨重启：正文、版本、有效时间、Scope 与证据一致保留",
    "scenarios": [
      "E1-01"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S1-02",
    "summary": "接受无证据候选：被拒绝，confidence 再高也不能绕过",
    "scenarios": [
      "E1-02"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S1-03",
    "summary": "重复接受或重复命令：幂等或明确冲突，不产生多份矛盾事实",
    "scenarios": [
      "E1-11"
    ],
    "limitation": "另保留 M1-2 重复接受负例；API 幂等不自动证明接受事务幂等。"
  },
  {
    "id": "S1-04",
    "summary": "Workspace 隔离：搜索、ID 查询、证据关联均不能跨域泄漏",
    "scenarios": [
      "E1-02",
      "E1-03"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S1-05",
    "summary": "Scope 升级：Session/Task 不自动升级为 Workspace/Global",
    "scenarios": [
      "E1-04"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S1-06",
    "summary": "Private 外发：在实际执行边界阻断，不只依赖 UI 提示",
    "scenarios": [
      "E1-04"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S1-07",
    "summary": "原子纠正：新版生效与旧版 supersede 同时发生，重启无部分状态",
    "scenarios": [
      "E1-05"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S1-08",
    "summary": "并发纠正：expected revision 冲突可解释，不静默覆盖另一个修改",
    "scenarios": [
      "E1-06"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S1-09",
    "summary": "争议、过期和证据撤回：状态与有效时间被查询和后续消费者遵守",
    "scenarios": [
      "E1-07"
    ],
    "limitation": "另保留 M1-4 证据撤回规则；过期/冲突场景不能代替撤回证据。"
  },
  {
    "id": "S1-10",
    "summary": "遗忘中断：可恢复、结果准确，未完成字节清除不宣称已物理删除",
    "scenarios": [
      "E1-09"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S1-11",
    "summary": "重建、旧缓存与旧备份：不复活遗忘或已纠正认知，恢复策略边界明确",
    "scenarios": [
      "E1-08",
      "E1-09"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  },
  {
    "id": "S1-12",
    "summary": "中文检索与外部指令：检索范围及语料基线有效，外部指令不能成为授权",
    "scenarios": [
      "E1-10",
      "E1-12"
    ],
    "limitation": "重组映射；完整覆盖仍以原场景及任务卡为准。"
  }
] as const;

export type ScenarioId = (typeof SCENARIOS)[number]["id"];
export const SCENARIO_VERSION = "g4-ledger-component-v1";
export const LEDGER_SCENARIOS: readonly ScenarioId[] = ["E0-02", "E0-03", "E0-04"];
