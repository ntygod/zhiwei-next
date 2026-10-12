# 双端浏览器工作台

P1-08 / #127 将所有者提供的 banxing-agent-ui-v0.2 最新知微黑曜/冷瓷界面接到 #125 的真实 API 客户端。电脑侧栏、双栏任务与手机底栏/页签共享 React/TypeScript/Vite 页面。生产模块仅调用 protocol/BrowserWorkbench，不访问 Node、Daemon、SQLite 或浏览器持久存储。所有者已明确先接 PC/安卓浏览器，再单独打包客户端；本切片不含安装包或 APK。

## 运行开发样例

在正式 Node22.23.1/npm10.9.8 环境安装锁定依赖后执行：

```sh
sh scripts/formal-toolchain.sh install
npm run build:web
npm run preview:web
```

打开终端输出的 `http://127.0.0.1:端口/`，点击「进入开发样例」。预览拥有全新的临时虚构安装，固定主体/工作区和固定 Worker；不读取个人数据库，不接真实模型。Ctrl+C 关闭服务并回收临时资料。缺少正式运行时或构建产物时明确失败，普通 `start:daemon` 仍为诊断入口。

在概览填入可执行的虚构样例并声明完成条件，即可创建任务、查看执行、核验结果并给出「符合要求/需要修改」反馈；自由填写的其他请求只会记录，不由固定执行器假装完成。记忆页按明确搜索词读取，支持添加、来源/版本、纠正和遗忘。原型中的自动化、设备集成、模型/目录配置未接入，只显示实际限制。

## 安卓浏览器的开发连接

同一页面按设备宽度显示手机布局。服务只监听 literal loopback；安卓设备可在所有者已启用 USB 调试并授权的开发连接中，按[Android 官方反向端口转发说明](https://developer.android.com/develop/ui/views/layout/webapps/access-local-server)转发同一端口。将 SERIAL 和 PORT 替换为目标设备与预览实际端口：

```sh
adb -s SERIAL reverse --no-rebind tcp:PORT tcp:PORT
```

手机浏览器打开与电脑完全相同的 `http://127.0.0.1:PORT/`，独立进入样例。退出后使用 `adb -s SERIAL reverse --remove tcp:PORT` 移除本次映射。此路径不扩展监听/CORS，也不改写 Host/Origin；本次未连接真实安卓设备，USB/Chrome/Cookie、窄屏视觉、200% 和触屏产品验收均为 `not_run`。它不是 APK、无线远程访问或已认证的平台支持。

## 客户端与状态

入口提供实际同源 origin、已选 Workspace、短期 nonce、清除 fragment 的函数和可选传输/时间边界。`pairFromFragment()` 在任何配对 I/O 前清除 bootstrapCode；Cookie 由浏览器管理，客户端只在内存保留 CSRF。重新配对使用独立 `/v1/browser-pair`，原首次配对合同保持。只有随后同源 Cookie 的能力查询和已选 Workspace 完整快照实际获准，才显示 connected；同时只允许一项配对请求。

页面通过 `controller.ts` 构造正式命令、订阅 `WorkbenchView`；`app.ts` 只保留导航、用户输入和临时主题。`capabilities()`、`context()`、`refresh()`、`session()`、`task()`、`search()`、`explain()`、`result()`提供后端查询；`createSession()`、`command()`、`capture()`、`bindPlan()`、`verify()`、`feedback()`提供写入。客户端解析并核对回执，不推导 Task、MemoryClaim 或 Outcome 业务状态。

`watchEvents()` 从完整获准快照的 cursor 开始，验证范围、重复和 revision 缺口。流结束、资格变化或缺口使旧读代次失效并清除正文；页面处理明确错误后调用 `recover()` 重新读取完整快照，再建立事件流。恢复不重发写入，也不调用模型查询进度。状态没有虚构百分比。

写状态 `confirmed` 只用于匹配 commandId/目标的 committed receipt；现有 input/plan DTO 没有该回执，只显示 `received`。响应丢失、损坏成功、redirect、5xx 或已发送写被取消为 `unknown`。只有用户显式 `retryUnknown()` 才重发同身份代次的原始字节；新配对/Workspace 切换撤销这一资格。`discardUnknown()`只清除本地待核对信息，不能撤销可能已提交的后端操作。

正文只能在服务器有限读取期限内显示。客户端在发布、通知和 `view` 访问前验证代次/期限；纠正、遗忘、自然到期或断线后，旧查询和旧流不得恢复正文。每种视图只接受最近一次查询选择，较早的迟到回应不能覆盖用户的新选择。可保留带确认时间的任务摘要；权限失效清除整个视图。设计和期限语义的事实源为 [ADR0023](../../docs/adr/0023-browser-workbench-api-interactions.md)。

正常开发测试使用自有新临时安装、实际 HTTP/SQLite、固定 Worker、React/jsdom 和 Node 传输适配，验证任务/结果/版本、未知写原字节核对、弹层焦点与失效清除；这些不替代实际浏览器 Cookie、视觉或产品验收。P1-08 整体保持 `in_progress`，Z18 为 `not_run`，真实入口关闭。静态资源/上下文/合成初始化边界见 [ADR0024](../../docs/adr/0024-shared-workbench-ui-and-owned-preview.md)。
