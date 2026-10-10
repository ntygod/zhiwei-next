# ADR 0019：受控 Pi Worker 的一方 Broker 扩展边界

- 状态：Accepted
- 有限决策审查：[PR115 的独立审查记录](https://github.com/ntygod/zhiwei-next/pull/115#issuecomment-6096740729)绑定提案 sha256 `5ba41331c07c4891df4a1b0a14f4e4f739827d2402b4a382e574e459c7231699`；只接受合成运行时边界设计，不批准当前或未来实现代码。
- 日期：2026-10-10
- 工作项：[#114](https://github.com/ntygod/zhiwei-next/issues/114)，P1-03
- 被取代关系：不取代 ADR0011/0013；保持精确工具链、官方 CLI JSONL 唯一路径和 root SDK 不支持的事实

## 背景

P1-03 需要实际 Worker 传输、Supervisor 和全部工具/模型的 Broker 边界。现有零 prompt 状态探针不是生产执行器。Pi 的 RPC 本身没有远端工具执行接口；注册专用 Provider 与工具需要显式加载由知微拥有的一方 extension。上游 root ExtensionAPI 声明图仍有 46 个错误。额外只读类型探查发现 pi-ai 公共 root 也有 7 个传递依赖错误（6 个 Anthropic undici-types 与 1 个 Google optional MCP peer）。这些错误未修复，不因本地桥代码编译通过而消失。

官方 0.84.1 源码说明：`--no-builtin-tools` 仅影响初始 active tools，精确 `--tools` 列表才约束后续 registry；`--no-extensions` 仍加载显式 `-e`，并保留上游内置 llama.cpp extension。`before_provider_request` 及 `user_bash` hook 会捕获异常，抛错不能充当拒绝安全闸。RPC 同时暴露 bash/模型切换等命令，因此 Host 的命令白名单不可省略。

## 决策提案

继续仅从固定官方包公开 `bin.pi=dist/cli.js` 启动 JSONL Worker。新增一个仓库拥有、路径固定、源码受审的 TypeScript extension；不接受用户路径、发现目录或任意扩展参数。不维护 Fork，不增加第二 Agent Loop。Pi 负责单次任务的模型与工具循环。

Extension 接口是明确的运行时兼容边界：入口接收 `unknown`，核验所需 callable/输入形状；自有协议和值在严格 TS 中实现。禁止 `declare module`、复制 ExtensionAPI/SDK 声明、`as ExtensionAPI`、关闭或过滤编译诊断、使用 JS 绕过正式源码检查。此选择仅证明本地桥的完整类型检查与运行时校验，不宣称上游 SDK 类型受支持。全部真实 SDK 类型导入仍遵守原限制。

一方 extension 注册固定 native Provider，`stream` 与 `streamSimple` 都只向继承的专用 fd3 发送受限请求，不持有凭据、网络客户端或文件工具。其返回流每次只有一项有界模型请求；工具调用交还 Pi 原生循环。工具只注册固定文件只读、memory 读取、隔离草稿写入，处理函数也只走 fd3。没有 legacy Provider、默认模型或网络 fallback。

fd3 是父进程创建并拥有的实际连接。请求正文不能指定 Workspace/Grant/执行绑定，Daemon 用连接绑定的不可变 ExecutionSpec 决定上下文。请求/响应有版本、严格形状、关联 ID、字节/次数/时间上限。收到 extension 的实际 tools registry/active tools、Provider/model 身份与协议 revision 握手，以及真实 get_state/get_messages 一致观测后才 READY；加载失败或任何能力不符在 prompt 前失败。

Host 仅发送固定 get_state/get_messages/prompt/abort，不提供任意 RPC；prompt 本身会在普通 preflight 前解释扩展 slash commands，因此本 profile 在发送前拒绝以 slash command 或 shell shortcut 开头的 prompt，不把任意字符串都视为纯数据。启动固定包含 `--offline`（抑制上游网络刷新，不是 OS 网络隔离）、精确 tools allowlist、关闭自动发现及 context files、独立空 HOME/agent/cwd/state，固定显式一方 extension。内建 llama.cpp 仍被上游加载这一事实须披露，不能声称零扩展或 OS 沙箱。实际模型请求记录包括 system prompt、消息/工具组成；不把仅发送给 Runtime 的输入当模型可见证据，不保留原始思维链或其 hash。

## 当前启用边界

只提供明确命名的合成构造器及固定合成材料/模型接收器。现有诊断服务器不新增数据或执行 route；诊断 token 不被复用。Task/Grant/action 持久记录、恢复接线和实际接入验收不存在时，真实模式 unsupported，不能用任意调用者 ref 或 `verified:true` 代替。

正常类型、纯协议、合成子进程正常生命周期与固定合成 Broker 工具开发测试可运行。旧 #90 及同等受限 Private/注入/链接替换/备份攻击动态实验不重跑；相关 Z08/Z09 安全验收明确 not_run，用户后续完成。没有新模型账户、用户凭据、个人数据、生产部署或新外发权限。新的 CLI+extension 官方包组合没有真实完整兼容矩阵前，不把 synthetic fixtures 记为官方 profile supported。既有原 Runtime Artifact/来源 CI 仍须完成，但不冒充新扩展的验收。

## 备选方案

- 根 SDK：声明不支持，扩大进程信任域，拒绝。
- 任意工具/模型 + hook：异常吞掉及 bypass 表面使其不能构成强制边界，拒绝。
- 新通用 Loop：违反项目红线，拒绝。
- 暂不实现 Worker：不能交付本任务的受控代码切片；保留真实入口关闭不阻塞已就绪合成开发。

## 验证、风险与回滚

R3：独立审查该决策及最终完整 HEAD，完整原 check、当前 PR Runtime 来源、Ready/live 与受保护合入保持。协议未知、坏字节、早 EOF、崩溃、重复响应、背压、取消/关闭均不得伪成功。请求接受、settled、工具成功和进程 close 不决定 Task Outcome。

可信基仍为固定 launcher/包/源码与 OS 用户；不承诺抵御恶意同 UID 修改代码/内存，目录与环境校验不构成 OS sandbox。Windows 没有实测则 unsupported。回滚关闭新 profile、排空/停止 Worker，恢复仅原诊断路径；无 Schema 迁移、不删除已有证据。ADR 接受不改变 D-04/D-08/P0 的旧真实接入验收门。
