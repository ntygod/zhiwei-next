# ADR 0023：浏览器工作台 API 与交互接线

- 状态：Proposed
- 日期：2026-10-12
- 工作项：#125，P1-08 的 API/交互切片；UI 布局仍由 Gemini 提供
- 被取代关系：补充 ADR0017/0018、0020/0022，不取代既有协议、诊断、Schema、Runtime 或接入许可

## 背景

现有受控 Daemon 已有 Session/Task、记忆、结果 API 和配对身份，浏览器消费者尚未接线。现有 POST /v1/pair 拒绝 Cookie；后端重启或会话失效后，浏览器仍可能自动发送原 HttpOnly Cookie，无法经该首次入口重新配对。使用 credentials=omit 也会忽略响应中的新 Cookie，不能作为修复；依据 [Fetch credentials mode](https://fetch.spec.whatwg.org/#concept-request-credentials-mode)。

既有 ProductEvent v1 只包含 Session/Task 事件，记忆变更不能被客户端当作已有事件。客户端还需要把已确认状态、断线、权限失效、迟到响应和写提交未知分别表示，不能复制认知规则或创建长期浏览器真源。

## 决策

1. apps/web 提供无布局的同源浏览器 API 客户端及有限交互状态，只依赖 protocol 公开入口；生产模块无 Node API、SQLite 或后端凭据。实际浏览器 origin 与当前 Workspace 由入口显式给定，不从 Cookie/cursor 推断权限；未知能力明确 unavailable/unsupported。React/Vite 页面和真实入口启用不在本切片。
2. 新增独立 POST /v1/browser-pair，消费既有 SessionPairRequestV1，限定 clientKind=browser。固定 Host/Origin、头部/体积与一次性短期 bootstrapCode 均先验证；Authorization/CLI 凭据不能进入该路由。原 /v1/pair 及其 Cookie 拒绝行为保持。
3. 新入口中的原 Cookie 仅是撤销本浏览器旧会话的提示，不授予身份/Scope。只有新 bootstrap ticket 决定主体。验证、容量、时间、随机源和新凭据生成全部完成后，同步消费 ticket、登记新会话并撤销已识别的旧浏览器会话；失败不撤销旧会话或消耗有效 ticket。响应仍只暴露 browser CSRF/期限与 HttpOnly/SameSite=Strict Cookie，不暴露 Cookie 值或 CLI Bearer。
4. bootstrapCode、CSRF、请求正文仅短时留在内存；fragment 在配对 I/O 前清除，配置/错误不回显秘密，不写浏览器持久存储。配对或 Workspace 切换提升客户端代次并终止旧读流，迟到读响应不得更新新代次；失去身份后清除获准数据。传输使用 same-origin credentials/mode、no-store、固定相对路由与禁止跟随 redirect。
5. 协议只补充当前响应的严格解析，复用已有不可变 DTO/parser。写操作只有在精确匹配已发送 commandId/目标的 committed receipt 通过后才可显示已确认；HTTP 5xx、断线、取消中的已发送写、redirect 或损坏成功响应为提交 unknown，不盲重试。显式重试只允许同一代次中原封不动的 commandId/idempotencyKey/正文；重新配对后不能假定旧主体相同并恢复该写许可。后端当前查询仍决定界面业务状态。
6. 快照分页完成后才发布整份视图，保留原页面/组装限制并有总读取期限；循环 cursor、未知字段/版本、超大或不完整数据失败。SSE 校验范围/格式、重复及 revision 缺口，缺口重新取获准快照；cursor 只由确认的事件/完整快照推进，记忆用途 cursor 或命令 receipt 不用于跳过未消费事件。进度无总量不生成百分比，不调用模型查进度。
7. 具有 memory capability 的 SSE 组合必须提供真实 readFence(context)：授权后读取 global 与所选 Workspace 的 cognition/policy/body 水位及 recoveryEpoch，禁止读取其他 Workspace。准备及每次发送/心跳前复验；发生变化时用已有 stream.error/snapshot_required 终止流，不伪造新的 ProductEvent v1 或永久缓存。缺少该读者明确 unsupported，普通启动不接线。
8. 临时合成组合从当前 Store 取得 fence，记忆实际提交后唤醒现有订阅。通知不是数据真源；客户端收到失效/断线后清除已加载正文，保留标明时间的最后确认任务摘要，重新获准查询后才显示正文。权限失效清除整个受保护视图，后台恢复不能把旧 Cookie、旧正文或本地缓存当作新授权。
9. 正常/空/加载/错误/权限/降级/断线及未知提交由有限状态供 Gemini 界面消费，不在客户端推导 Outcome、Scope 或记忆有效性。时间、nonce、I/O 与用户操作从边界注入；所有生产调用默认仍关闭，仅自有临时合成安装验证。P1-08 整体 in_progress、Z18 not_run 保持。

## 备选方案

- 放宽原 /v1/pair 的 Cookie 合同：改变已有入口；采用独立浏览器路由。
- 忽略 Set-Cookie 或持久保存 Bearer/CSRF：不能完成可信 Cookie 配对，也扩大凭据暴露；不采用。
- 新增通用客户端 Agent Loop、状态库或事件 v2 框架：本切片只需严格 API 和有限状态；不采用。
- 将记忆写拼成既有 Task 事件或通过模型轮询判断：混淆事实、范围和未知；复验真实 fence 并要求重新查询。

## 后果、验证与回滚

新增路由为 Local API v1 的加法，不改原字段、错误含义、ProductEvent v1、Runtime/Observation/Schema 或授权资格。客户端所有业务版本和内容仍来自现有受保护服务；同用户恶意进程/端口冒充风险不由该 Cookie 边界解决。

新上下文独立 R3 设计批准后实施，最终 HEAD 另需全新独立 R3、原完整检查/当前 primary 来源/Ready/live/保护合入与 main 回读。正常开发验证包括实际临时 HTTP/SQLite 配对/任务/纠错闭环、旧 Cookie 重新配对、失败不撤销旧会话、Scope 与 CSRF、正文失效/迟到响应、写响应丢失后精确幂等重试、纯协议/资源错误及无 Node 的浏览器编译闭包。实际浏览器/Cookie/键盘/200% 验收不由 Node 传输测试代替；受限旧实验不运行。

回滚停用新客户端和 browser-pair 入口，通过新的受审 revert PR 回退代码；原 CLI/API 合同继续使用。无数据迁移，保留已有纠正、遗忘、结果和最新独立 journal，不恢复旧凭据或旧正文。
