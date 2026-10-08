# G-2a 本地诊断的使用与验证

当前范围为 [Issue #84](https://github.com/ntygod/zhiwei-next/issues/84) / [PR #85](https://github.com/ntygod/zhiwei-next/pull/85)，有限安全决策见 [ADR 0012](../adr/0012-protected-local-diagnostics.md)。这里说明现有 Bootstrap health/meta 与 doctor；不代表完整 G-2 或正式 Daemon/Worker 已交付。

## 明确配置与兼容变化

原来的匿名访问和无凭据启动不再支持。用户或可信启动器需要给 Daemon 和 CLI 分别注入同一个、大小写完全一致的 `ZHIWEI_DIAGNOSTIC_TOKEN`。它必须是 64 个 ASCII 十六进制字符；格式检查不能判断随机性，部署时由用户安全提供高熵随机值。不要把凭据放入 URL、命令参数、源码或提交的配置文件；不要把测试里的重复字符凭据用于部署。本任务不生成、保存或部署真实凭据，也不改变 OS/网络设置。

| 进程 | 配置 | 支持值 |
|---|---|---|
| Daemon、CLI | `ZHIWEI_DIAGNOSTIC_TOKEN` | 必填，完全一致的 64 字符十六进制值 |
| Daemon | `ZHIWEI_HOST` | 默认且仅允许 `127.0.0.1` |
| Daemon | `ZHIWEI_PORT` | 默认 `4265`，完整十进制 1..65535，无空白/前导零/后缀 |
| CLI | `ZHIWEI_DAEMON_URL` | 默认 `http://127.0.0.1:4265`；允许其他有效端口及可选末尾 `/` |

启动器完成上述环境注入后运行 `npm run start:daemon`，另一个同样配置的终端运行 `npm run start:cli -- doctor`。修改 Daemon 端口时同步修改 CLI URL。首次没有凭据会得到 `invalid_configuration` 与非零退出码，没有自动匿名 fallback；`help`、`version` 不要求凭据。进程日志只报告固定启动/错误类别，不打印地址或配置值。

只支持 numeric IPv4 loopback；`localhost`、IPv6、`127.1`、其他 127/8 地址、整数或十六进制别名、外部 URL、userinfo、query、fragment 与非根路径均不支持。显式 null/空串/非法类型不是默认值。边界只在值缺失（undefined）时应用默认配置。

## 实际调用链与错误合同

- `apps/daemon/src/index.ts` 的 `createDaemonServer`、`startDaemon` 接受显式配置；返回有界 `listen` / `close` 生命周期，不暴露 Node Server 的任意 listen options。`DaemonDiagnosticError.code` 为固定配置/网络/生命周期类别。
- `apps/daemon/src/local-api-security.ts` 在现有路由前验证 peer、Host、Origin、Authorization、body、method、原始 request-target；`GET /health`、`GET /v1/meta` 是唯一成功路径。重复 Host/Authorization 也拒绝，浏览器 Origin 包含空值/null 时仍拒绝；Expect 进入同一认证边界，不发送默认 100/417，超过每连接一个请求的 pipelining 直接关闭。凭据不授权未来新路由。
- `apps/cli/src/doctor.ts` 的 `checkDaemonHealth` 直接请求已解析 numeric 地址，不跟随重定向，不读取代理配置。2 秒整体期限、8192-byte headers、4096-byte body，包括未结束的流；每个结果立即销毁请求并清理 timer。显式测试期限只允许 1..5000 ms。
- `packages/protocol/src/local-diagnostics-v1.ts` 只承载有限 DTO、凭据文本格式与 health 解析、错误枚举，不包含授权策略或 Node I/O。原 Runtime Event v1 的字段/版本/fixture 不变。
- `runCli(args, output, config)` 的配置显式传入；只有可执行 entrypoint 读取环境，测试不修改全局环境。成功输出重建后的四个常量 health 字段；远端 JSON、错误正文、header、URL、异常和未知命令参数都不会原样打印。

Daemon 请求与 doctor 响应都保留 8192-byte HTTP parser 上限，关闭 Node 默认的 header 数量静默截断，以完整 `rawHeaders` 的 name/value pair 数计数。每条消息最多 64 个字段（重复字段分别计数）；第 65 个起在服务端认证/路由或客户端状态/内容处理前拒绝，分别返回 `400 invalid_request` 与 `invalid_response`。64 字段为当前仅需少量诊断字段的通道保留余量，不扩大字节接收上限；迟置的 Origin、重复 Authorization/Host/Content-Type、body/Expect 或 Content-Encoding 不能藏在截断后。客户端显式发送完整 `Host: 127.0.0.1:<port>`，包括 80，不依赖 Node 省略默认端口的自动格式化。

| 类别 | 行为 |
|---|---|
| `invalid_configuration` | listen / HTTP I/O 前失败，检查地址、端口、凭据格式 |
| `unauthorized` / `forbidden` | 区分凭据和来源/authority 拒绝 |
| `daemon_unavailable` | 本地连接/监听不可用 |
| `timeout` | 整体等待截止，包括 headers / 未结束 body |
| `redirect_refused` / `unexpected_status` | 区分重定向与其他非成功 HTTP 状态 |
| `invalid_response` / `response_too_large` | 区分协议/schema/UTF-8/截断与字节上限 |
| `invalid_request` / `method_not_allowed` / `not_found` | 服务端固定请求、方法、路由失败 |

HTTP 错误固定为 `DiagnosticErrorV1`（HTTP parser、upgrade/CONNECT 拒绝可为空 body）；均 no-store、关闭连接且没有 CORS 允许头。CLI doctor 失败退出 1，参数错误退出 2，help/version/合法 doctor 退出 0。客户端不消费错误正文，因此远端不能借错误字段控制本地输出。

## 威胁范围与仍待交付

Bearer 只认证客户端，不认证 Daemon：能抢占本地端口的进程仍可能窃取 token。可信 Node、代码、启动器、环境注入是前提；可读环境/内存/网络、可改代码/本地文件的同机恶意进程和恶意本机洪泛不在保证内。loopback HTTP 不是 TLS、OS 或文件系统 sandbox。

该切片不访问 Ledger、用户文件、工具或模型，不持久化 token/请求/响应正文。G-2 其余真实文件路径/symlink/TOCTOU、工具返回指令、Private 外发和元数据/正文/Claim/cache/backup 保留与删除仍未完成。D-04、D-08 聚合维持 Proposed；不从本地 health 成功解锁 M0 或 #67。

## 验证与回滚

`apps/daemon/src/index.test.ts` 使用真实 loopback HTTP、原始 TCP HTTP 请求和独立 CLI/Daemon 子进程；`apps/cli/src/index.test.ts` 使用真实 HTTP/畸形协议/重定向目标服务器；协议测试验证闭合字段与 accessor 拒绝。所有凭据和敏感标记是合成数据，子进程只得到显式测试环境。

覆盖合法 health/meta/doctor；无/错/重复授权、Host、Origin/null、不同 peer、方法/路径/消息体、parser/超大 headers、64/65 字段边界、超过旧 Node 截断点的迟置字段、畸形配置、无重定向命中、UTF-8/JSON/schema/未知字段、超大/截断响应、等待与连接回收、真实 SIGTERM 关闭、端口复用和拒绝 upgrade/CONNECT/parser-error 后半开客户端不阻塞关闭。Node 22.23.1 已先复现旧实现三条漏洞及 header 截断绕过，再由这些负例反转。

默认验证 `npm run check`，另运行原 `check-execution-plan.mjs`、`check-current-decisions.mjs` 和 `current-decisions.test.mjs`。严格类型检查覆盖新增文件与全部既有源码/测试/声明。Runtime 动态矩阵须沿用真实 CI；本地没有 Docker，未运行动态矩阵，静态 fixture 通过不能代替它。最终 HEAD 独立 R3、Ready CI、受保护合入和来源回读另行记录在 primary PR。

port 80 的回归在隔离子进程检查 doctor 实际创建的 Node 请求 Host，并在连接前销毁请求；不绑定特权端口或修改权限。本地未运行完整 port 80 listen 往返，其他动态端口的真实 Daemon/doctor 往返已覆盖；支持的配置范围仍为 1..65535。

回滚为 revert 本切片，无数据库迁移或持久凭据；回滚会恢复旧匿名接口风险，不能视为安全等价替代。
