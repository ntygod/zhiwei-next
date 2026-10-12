# 浏览器工作台 API 接线

P1-08 / #125 的无布局客户端入口为 `src/workbench.ts`。生产代码只依赖 protocol 公开入口，可用实际 DOM 类型独立编译，不依赖 Node、Daemon、SQLite 或浏览器持久存储。UI 布局由 Gemini 提供；本目录不含 React/Vite 页面，也没有真实启动入口。

入口提供实际同源 origin、已选 Workspace、短期 nonce、清除 fragment 的函数和可选传输/时间边界。`pairFromFragment()` 在任何配对 I/O 前清除 bootstrapCode；Cookie 由浏览器管理，客户端只在内存保留 CSRF。重新配对使用独立 `/v1/browser-pair`，原首次配对合同保持。只有随后同源 Cookie 的能力查询和已选 Workspace 完整快照实际获准，才显示 connected；同时只允许一项配对请求。

Gemini 页面可用 `subscribe()` 订阅 `WorkbenchView`，或在用户动作后读取 `view`。`capabilities()`、`refresh()`、`session()`、`task()`、`search()`、`explain()`、`result()`提供现有后端查询；`createSession()`、`command()`、`capture()`、`bindPlan()`、`verify()`、`feedback()`提供现有写入。调用方构造正式 DTO；客户端解析并核对回执，不推导 Task、MemoryClaim 或 Outcome 业务状态。

`watchEvents()` 从完整获准快照的 cursor 开始，验证范围、重复和 revision 缺口。流结束、资格变化或缺口使旧读代次失效并清除正文；页面处理明确错误后调用 `recover()` 重新读取完整快照，再建立事件流。恢复不重发写入，也不调用模型查询进度。状态没有虚构百分比。

写状态 `confirmed` 只用于匹配 commandId/目标的 committed receipt；现有 input/plan DTO 没有该回执，只显示 `received`。响应丢失、损坏成功、redirect、5xx 或已发送写被取消为 `unknown`。只有用户显式 `retryUnknown()` 才重发同身份代次的原始字节；新配对/Workspace 切换撤销这一资格。`discardUnknown()`只清除本地待核对信息，不能撤销可能已提交的后端操作。

正文只能在服务器有限读取期限内显示。客户端在发布、通知和 `view` 访问前验证代次/期限；纠正、遗忘、自然到期或断线后，旧查询和旧流不得恢复正文。每种视图只接受最近一次查询选择，较早的迟到回应不能覆盖用户的新选择。可保留带确认时间的任务摘要；权限失效清除整个视图。设计和期限语义的事实源为 [ADR0023](../../docs/adr/0023-browser-workbench-api-interactions.md)。

正常开发测试使用自有新临时安装、实际 HTTP/SQLite、固定 Worker 和 Node 传输适配；适配器不是实际浏览器 Cookie 证据。页面布局、键盘/200%/实际浏览器验收尚未完成，P1-08 整体保持 `in_progress`，Z18 为 `not_run`，真实入口关闭。
