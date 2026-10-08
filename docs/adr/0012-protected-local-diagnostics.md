# ADR 0012：有限本地诊断通道

- 状态：Accepted
- 日期：2026-10-08
- 范围：[Issue #84](https://github.com/ntygod/zhiwei-next/issues/84)，G-2 / D-08 的现有 health、meta、doctor 切片
- 被取代关系：不取代 Accepted ADR；不接受 D-04、D-08 聚合决策

## 背景

现有 Bootstrap Daemon 的 health/meta 没有客户端身份与来源边界，可被任意浏览器来源调用；host 可配置为外部地址。doctor 接受任意 URL、跟随重定向并打印未经校验 JSON/错误。Node 22.23.1 的隔离本地 HTTP 实测重现这三条路径；证据只使用虚构凭据。

## 决策提案

只支持 literal `127.0.0.1` 上的 HTTP，不进行 DNS，不接受 localhost、IPv6、缩写/整数/十六进制 IP、外部监听或目标。端口采用完整十进制 `1..65535`，默认 4265。客户端 URL 必须是 `http://127.0.0.1:<port>`，只允许可选根斜杠；userinfo、其他 path、query、fragment、其他 scheme 全部拒绝，不先用 URL 正规化隐藏非法原输入。

用户或可信启动器须明确给两个进程注入相同 `ZHIWEI_DIAGNOSTIC_TOKEN`，格式为 64 个 ASCII 十六进制字符（32 bytes 的编码）。长度/字符校验不证明随机性；实际部署须由用户安全提供高熵随机值。本实现不会生成、保存、展示或部署真实凭据。原来无配置即启动/doctor 的行为有意失败关闭；help/version 仍可独立使用。

Daemon 只在配置有效后建立服务器，由封装的 listen 绑定已验证地址，不公开原始 listen options。每个请求先检查本地/远端 socket 地址、唯一且精确的 Host authority、Origin 不存在（包括 null 也拒绝）、唯一且精确的 Bearer Authorization；等长 token 用 timing-safe 比较。仅 GET 与原始 `/health`、`/v1/meta` 成功，不接受 body、Expect、absolute-form、query、encoded/normalized 路径、CORS、升级或 CONNECT；Expect 不绕过认证边界，超出每连接一个请求的 pipelining 直接关闭。错误固定类别，不反射请求、header 或异常；响应 no-store，限制 header 和连接等待。

CLI 使用 Node HTTP 的直接数字 loopback 请求，无代理自动发现、DNS、cookie、自动重定向或解压。所有配置在 I/O 前解析。全请求默认 2 秒 deadline（API 可显式传入 1..5000 ms 测试期限），headers 上限 8192 bytes，body 上限 4096 bytes。拒绝非 200、不支持的媒体类型/编码、非法 UTF-8/JSON、未知 health 字段和值；只重建闭合的已知 health DTO 后输出。所有完成/错误路径停止请求并关闭连接；配置、认证、来源拒绝、网络、超时、redirect、状态、响应格式/过大保持不同错误类别，CLI 失败返回 1，参数错误返回 2。

protocol 只拥有有限 DTO、错误枚举与格式解析；请求授权和传输属于各自 app 边界，不引入领域 Policy、Session、工具或模型框架。原 Runtime Event v1 不变。诊断凭据只授权现有两个诊断端点，未来数据/工具接口不能自动继承它。

## 备选方案

- 继续匿名 localhost：浏览器与无授权同机客户端可访问，不满足边界。
- OS local socket：可结合文件权限，但跨平台权限/部署合同尚无消费者；不顺手扩展本次范围。
- 桌面桥接：没有现有 Desktop 实现，提前增加框架不解决当前 HTTP 入口。
- TLS/mTLS、系统凭据库：可加强服务端身份与凭据管理，但涉及新的部署与系统权限合同，另项审查。

## 信任与明确不保证

可信初始代码、Node、启动器和 token 注入是前提。Bearer 只认证客户端，不能证明服务端身份；能抢占目标端口的同机进程可以收到客户端 token。可读环境/内存/网络、修改应用代码或本地文件的恶意同机进程不在保证内。此通道没有 TLS，不是操作系统或文件系统 sandbox，也不保证恶意本机洪泛的可用性。未修改 OS/网络权限，无真实凭据配置。

health/meta 与固定错误只含非个人诊断常量，不访问 Ledger/文件/模型，不持久化请求、token 或响应正文。G-2 其余 filesystem root/symlink/TOCTOU、工具返回指令与可信来源、Private 模型外发、元数据/正文/Claim/cache/backup 保留和遗忘/物理删除仍未完成；URL 路径拒绝不是文件能力沙箱。D-04/D-08 保持 Proposed，不解锁 M0-3/4/5/7 或 #67 整体。

## 后果、验证与回滚

有限提案在同一 primary PR 的真实独立决策审查前保持 Proposed，接受后新最终完整 HEAD 仍须独立 R3 与真实 Ready CI。测试反转旧漏洞，覆盖真实 HTTP 正负场景、合成凭据脱敏及严格类型检查。动态 Runtime 矩阵由现有 CI 完成，本地无 Docker 不声称已运行。

可 revert 本切片恢复旧 API/config 行为；这也恢复旧入口风险，不能作为安全等价降级。没有数据库迁移、用户数据或持久凭据变化。
