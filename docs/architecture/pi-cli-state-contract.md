# G-3b：有限 CLI 状态探针合同

[Issue #86](https://github.com/ntygod/zhiwei-next/issues/86) / [PR #87](https://github.com/ntygod/zhiwei-next/pull/87) 将内部 `packages/pi-adapter/fixtures/pi-cli-state-contract.ts` 接入既有 `scripts/probes/pi-rpc-state.mjs`。实际消费者仍是隔离 Artifact job 的两个状态请求；没有生产 Host/Session API、Adapter barrel 导出、模型请求或通用监督器。

[ADR 0011](../adr/0011-formal-toolchain-baseline.md) / [ADR 0013](../adr/0013-pi-cli-jsonl-worker.md)及 D-07 已由[独立有限决策审查](https://github.com/ntygod/zhiwei-next/pull/87#issuecomment-6070476496)接受：被审 HEAD `37c6228ef9187b932a9648d472319bce31a4aef5`，scope digest `b13ccee54ba167fc7553d517ad60154ebf7a0a88c2df8e1f87082d1c19d9d764`。此批准只覆盖版本/路径选择，下面的新实现仍需最终完整 HEAD 的独立 R3 和真实动态矩阵；当前决议保留历史证据，并不认证新代码。

## 显式启动输入

`runPiCliStateProbe(unknown)` 只接受 `packageDirectory`、`nodeExecutable`、`workspaceDirectory`、`stateDirectory`、`hostEnvironment` 及可选 `deadlineMs`。路径必须显式、绝对、规范；无 cwd/PATH/Pi executable 或任意 prefix fallback。Node 必须是明确选择的当前 `process.execPath` 的同一真实文件，运行版本必须为 22.23.1。

安装包目录可以是既有 Artifact installer 创建的 package-view symlink；先取其真实根，再检查普通 manifest、精确 `@earendil-works/pi-coding-agent@0.84.1`、唯一 `bin.pi=dist/cli.js` 及包内普通真实入口。manifest 读取最多 64 KiB；软链接 manifest、特殊文件、缺失、错误版本及 bin/入口逃逸均拒绝。名称与版本检查不是供应链认证；官方 tarball、shrinkwrap、闭包和来源检查仍由外层 Artifact runner 完成。

workspace 与 state 必须分别为空、由当前用户拥有、无 group/world 写权限的真实目录，不允许目录软链接。两者相异且互不包含，也不得与真实 package 根重叠；预置 `.pi`、配置、凭据或任何其他内容均失败。合同在 state 下独占创建私有临时目录，将 HOME、XDG、Pi agent、tmp、session 分开，结束时只删除本次自建目录，保留调用者 state 根。

子进程参数固定为：

```text
<explicit-node> <verified-package>/dist/cli.js
  --mode rpc --no-session --no-tools --no-extensions --no-skills
  --no-prompt-templates --no-themes --no-context-files --offline
  --thinking off --session-dir <owned-state>/sessions
```

不传 prompt、model/provider 配置、extension 或 `--approve`。`--no-extensions` 不会阻止显式指定的 extension，因此合同完全不接受此类任意追加参数。`--offline` 只抑制上游启动网络活动；`--no-tools` 不是 OS sandbox；`--approve` 是信任项目文件的选项，不是 blanket approval，本合同不使用它。

环境完全从固定 allowlist 构造，无对象展开或继承：只含本次自建 HOME/USERPROFILE/XDG、Pi agent、tmp、固定语言/颜色及探针身份。宿主 HOME、PATH、npm 配置和其他未知普通变量不传给子进程；显式提供的 Node 变量、proxy、凭据类变量、非认可 Pi 配置变量或非字符串值直接拒绝。三个 PI_PACKAGE_DIR / PI_PROBE_CWD / PI_PROBE_STATE_DIR 只是探针输入选择器，不传入 Pi。旧 PI_EXECUTABLE / PI_EXECUTABLE_ARGS_JSON 不再支持。

## 成功与失败边界

只写两条 LF 请求：`state-1/get_state` 和 `messages-1/get_messages`。上游响应从 unknown 检查 type、request ID、command、success/data；两 ID 各恰好一次。状态必须有非空 sessionId、isStreaming=false，若含 messageCount 则为 0；messages 必须为空。原有成功摘要字段保持，原 sessionId/路径/JSON 不输出。

复用既有严格 LF JSONL reader，外层先检查每行 32,768 bytes、总 stdout 131,072 bytes 和 stderr 16,384 bytes。UTF-8 跨 chunk 可重组；CRLF、空行、非法 JSON/UTF-8、未终止尾片全部失败。旧 reader 的异常原文不越过新边界，只映射固定错误类别。

收到两条有效响应后才发送 stdin EOF。**成功须再等 stdout EOF 和自然 close(code=0, signal=null)**；整个过程中继续检查后续完整记录、重复响应和尾片。收到两条响应不等于进程成功，晚重复/坏尾片/非零退出仍失败。仅收不到完整响应的正常退出为 missing-response；异常退出与错误 response 不合并为成功。

默认 deadline 为 15 秒，可显式选择 50..15000 ms 的有限测试期限。失败或超时先请求 TERM，250 ms 后升级 KILL，仍需确认 close；再过 1000 ms 仍未关闭才报告 cleanup。记录 kill 请求不能冒充已退出；不复用 child.killed 当存活判断。外层 Artifact 的 60 秒上限不变。

错误公开有限 code 和固定消息，不附带原始 cause；consumer 输出不带原 stderr、JSON、异常栈、配置值或路径。配置/环境、Node、package/entry、directories、spawn、framing、输出上限、响应形状、关联、重复、缺失、异常退出、transport、timeout、cleanup 分开。stderr 只计字节并保留是否出现，不反射正文。

## 验证与部署边界

新 TS 源和真实子进程测试自动进入原全部源码 strict/noEmit 及行为测试。fixture 使用合成 package、合成配置/秘密标记、真实 Node 子进程，覆盖启动漂移、宿主污染、cwd/state 配置、逐字节 UTF-8、framing、关联、晚输出/退出、deadline、TERM-resistant cleanup 和固定无秘密错误。consumer 测试还验证实际脚本和与 CI 相同的无根 package.json source bundle 路径。

Artifact job 只机械追加内部 TS 合同和既有 reader 到原只读 source bundle，并追加所需触发路径；原 digest-pinned 容器、contents-read、网络/挂载/capability 限制及全部 evidence/observer/provenance 门不变。真正官方 Pi 的自然 EOF 兼容性须由该 fresh Artifact job 验证；本地无 Docker，不声称运行了真实 Pi/九项 capture 或 live provenance。

初始 Node、探针源码、启动器、已验证包和临时目录创建者必须可信。探针开始前已经执行的 Node preload 无法被随后环境检查撤销。目录检查/环境 allowlist 不是文件系统沙箱，不抵御恶意同 UID 改代码、替换文件、竞态换目录、读内存/环境或在子进程中任意派生其他进程。cleanup 只管理这个直接 child；未实现整个进程树监督。操作系统隔离和制品验证不能省略。

D-04/D-08、G-2 其余文件/工具/Private 外发/保留及 M0-3/4/5 仍未完成。回滚此探针合同会恢复旧的宽松启动/输出行为，不能作为安全等价降级；没有用户数据、凭据配置或数据库迁移。
