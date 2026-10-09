# G-2 接入前安全合成实验

状态：独立 opt-in 的有限证据，关联 [Issue #90](https://github.com/ntygod/zhiwei-next/issues/90)、[D-04 提案](../../adr/0014-data-retention-boundary.md)、[D-08 提案](../../adr/0015-preintegration-safety-boundary.md)。起始基线为 `main@ab6052efbb84abe6f87bc6758bfd7e8143b73964`，分支 `spike/90-preintegration-safety`。实验成功不接受 ADR，也不证明 G-2/真实接入已完成；当前决议状态见[当前执行决议](../../planning/current-decisions.md)。

目标：用真实文件、真实公开 Ledger/D-01 API 和可观察的合成输出证明接入前拒绝与正文不可用语义；不以独立 policy 布尔返回值替代行为证据。风险 R3。本目录仅有实验、测试和说明，无新依赖，不注册根测试或 CI，不修改协议、Schema、产品 API、Daemon、Host、Session、Worker 或 M5 Policy。

## 固定合成组合

`createSyntheticComposition` 是可信测试宿主的有限工厂。它创建自己拥有的临时目录，只放置代码中命名的虚构资源。它不是可供客户端调用的生产接口，也不是身份认证/通用授权框架。

| 入口或对象 | 实际行为 | 不代表的能力 |
|---|---|---|
| `readSyntheticFile` | 有界的 POSIX 普通文件读取原语，实际打开并检查文件/目录 handle，返回完整 bytes 或固定错误 | 根由可信宿主指定；原语本身不鉴别客户端，不能当任意调用者可选根的 sandbox |
| `read` / `send` | 严格请求形状与已列名资源；可信宿主的 opaque object capability 绑定操作、Workspace、资源和目的地 | capability 仅存在于固定测试进程，不是 Bearer、诊断凭据、正式 Grant 或跨进程身份协议 |
| `reconstruct` | 读取独立正文文件和 D-01 reference record，真实调用公开 `reconstructSyntheticInput` | 只证明本地合成输入边界，无真实 Pi/Provider 请求或输出复现 |
| `forget` | 先写入并 rename 无正文 revocation journal，再更新独立的可信进程水位；后续所有受控物化入口拒绝 | 非生产原子事务、断电持久性、跨进程传播或 Claim 失效实现 |
| `purge` | 另一把合成授权实际 unlink `body/public.txt` 与 `cache/public.txt`；失败返回 `CLEANUP_PENDING` | 返回 `partial`，不伪称备份、介质、调用者内存或生产 Ledger 已清除 |
| `restore` | 在隔离的旧关闭态 SQLite 副本上做受控读取和 D-01 重建；先核对最新独立 revocation 状态 | 不导入 active store，不是正式恢复协调器或在线备份一致性证明 |

所有正文都是源码中写定的 synthetic 字符串；有一段带假凭据标记、假授权和外发指令的工具文本。没有真实用户数据、真实凭据、外部网络/模型请求或任意工具执行。测试中的 HTTP 客户端只用 `node:http` 访问测试刚创建的数字 `127.0.0.1` 端口，无代理发现、DNS 或重定向；它代表一个“外发目的地”，不是向远程服务器传输。

## 文件边界与平台限制

请求层只接受命名资源，不接受自由文件路径。底层读取原语的相对路径语法刻意收窄为 ASCII segment：拒绝绝对路径、`..`、`.`、空段、尾斜线、反斜线、Windows drive/UNC、NUL、percent 编码及 Unicode 别名，不自动解码或正规化修复。根内关系用相对路径验证，不用易混淆的字符串前缀判断。

从文件系统根直到目标父目录逐段 `lstat`，拒绝根/祖先/中间目录链接；根及其子目录须属于当前 uid。保持各目录 `O_DIRECTORY | O_NOFOLLOW` handle，比较打开后的身份；叶子必须是当前 uid 拥有且 `nlink === 1` 的普通文件，用 `O_NOFOLLOW` 打开。读取前后复查目录路径身份与叶子 handle/path 的 dev、inode、mode、size、nlink、mtime/ctime；所有 handle 在 finally 关闭。上限为 4096 bytes，缓冲区最多 4097 bytes，超出不返回部分正文。

测试真实注入打开前/打开后/读取后叶子替换、目录/根替换及就地内容修改，证明在这些可控时点发现变化后不向消费者返回任何字节。并未证明所有可能交错都安全：Node 的这些 path-based 调用不是完整 `openat2`/descriptor-relative sandbox；恶意同 uid 持续改写、改权限、同时恢复 inode/时间、改代码或读内存不在保证内。删除前检查和 unlink 也不具备恶意并发目录攻击下的原子性。

已执行环境为 Linux/POSIX、Node 22.23.1。Windows 或缺少 uid、`O_NOFOLLOW` / `O_DIRECTORY` 的平台显式拒绝；没有真实 Windows/macOS 文件系统验收。文件系统根链如果本身包含符号链接，也会拒绝而非降级。没有执行 chmod 或修改任何 OS/网络/安全设置。

## 来源与外发证据

固定 request schema 仅含 `schema / workspace / resources / destination`。未知版本、缺字段、额外 `authority / body / classification / token` 等字段、重复/未知资源均失败。可信宿主预建的 capability 存放于私有 WeakMap；JSON 中自报的 role、allow、authority，复制出来的 token 和诊断字符串不能取得权限。工具文本真实经授权本地读取，再尝试用其假授权读取 Private 或外发，均失败；没有解析指令后执行第二个动作。

分类来自可信资源表，不来自正文。即使测试宿主特意给 Private、工具文本或 mixed 集合分配了匹配的合成 `send` capability，分类仍先于物化与 transport 拒绝。未分类、跨 Workspace、未知目的地同样失败。缓存内容漂移也不能冒充原 Public 正文。只有明确定义的 Public 资源与绑定目的地可到达可信固定 transport。

测试对真实 loopback receiver 的 connections、requests、body bytes 及 transport calls 同时断言：所有禁止情形均为零；合法 Public 正例确实有一次连接、一次请求，并收到逐字节相同的合成正文。拒绝不是“发送后删除日志”。分类枚举中的 `Public` 只是本实验标签，不为生产数据赋予外发许可。

这是接入前调用边界；已经开始的 transport、先前返回给调用者的 bytes、此前发送的副本不能撤回。没有实现并发中的授权撤回/请求取消、流式发送或真实目的端删除。可信 transport/测试宿主可运行任意代码，故不属于恶意同进程隔离承诺。

## 保留、遗忘与恢复证据

实验同时保留两种明确区分的实际数据：

1. `metadata.sqlite`：通过公开 `createNormalizedRuntimeEventV1` 与 `openSqliteObservationLedgerV1` append 真实 v1 `message.lifecycle` 元数据事件，不偷加引用/删除字段。正文留在独立临时文件；D-01 record 只持有该合成消息的 reference。测试关闭重开 Ledger，比较 forget/purge 前后 canonical 记录逐字节一致。
2. `backup/inline-source.sqlite` 与关闭后复制出的 `inline-snapshot.sqlite`：专门展示当前生产 v1 的限制。正文真实存在于 `event_json` 和 `data_json`，DELETE 仍被拒绝，公开 API 没有 purge。forget/purge 之后直接调用受信任 Ledger API 仍能读出同一旧正文；这不是漏洞修复的声称，而是必须保留的反证。

受控 `restore` 在 forget 前确实从该 SQLite 副本读取正文并经现有 D-01 API 重建同一个请求；forget 后，即使副本完全未变，也必须在打开副本和调用 D-01 前返回 `FORGOTTEN`。固定次数计数可验证 D-01 实际调用与 reference resolver；缺失 live body 会让真实 resolver 返回 unavailable，由原 D-01 拒绝，再投影为 `CONTENT_UNAVAILABLE`，不会偷偷读取仍存在的 cache 或 backup。

持久化的 D-01 record 也属于不可信输入。可信合成宿主在初始化时独立保留完整 canonical record；`reconstruct` 和 `restore` 在读取正文/打开备份数据库前，先比较磁盘 record 与该可信绑定。不一致返回固定 `CONTENT_INVALID`，不调用 D-01 或 reference resolver；一致时只将原始冻结 record 交给重建器。记录自己的正文/request hash 即使自洽，也不能为替换内容、增加消息或另一 request identity 授权。JSON 空白与键顺序不影响 canonical 比较。

这项绑定只证明固定合成组合的记录完整性。可信基线不从待检查 record 或旧备份派生；它不是持久签名服务、跨进程身份或恢复授权方案，不扩大对恶意同进程/内存修改者的保证。

`control/revocations.json` 只存固定 schema、水位和受控资源名，不存正文、正文摘要、路径或异常。最新可信水位与该 journal 的摘要留在测试宿主内存，独立于旧 backup manifest；该摘要只检查无正文控制记录的一致性，不是来源认证或正文 hash。恢复缺失 journal、旧水位、同水位篡改、损坏格式、缺失独立可信 anchor 均失败关闭。备份状态/版本/水位缺失、未知或越过可信当前水位也拒绝。

该内存 anchor 不证明生产持久化：新进程不能从旧备份自认证“这是最新状态”。本实验通过丢失 anchor 后所有读取/恢复拒绝，表达缺少独立恢复授权的阻塞；未实现可信持久 anchor 的跨进程恢复。journal 的写入/rename 已实际执行，但未测试 fsync、断电、跨库提交或多进程故障，不能以此接受这些保证。

授权 unlink 后仅报告 owned live body/cache 已移除、备份 retained-revoked、总状态 partial、`secureErasureProven: false`。第二步 cache 清理故障会保留第一步 body 已删事实，并继续拒绝 cache/restore。后来重写相同 body/cache、再次 append 旧元数据或迟到的新元数据事件，也不能越过既有遗忘状态。临时目录由测试 finally 整体清理只是 fixture teardown，不是生产删除方案或备份清除验收。

当前实验不创建 Claim，不实现 TTL、过期扫描、证据依赖传播、向量/FTS 清理或备份自动到期。它们仍是 ADR 0014 的后续合同与独立产品任务。源码中的固定 fixture 常量、可信宿主内存和此前交给调用者的复制品没有“被删除”；逻辑遗忘只阻止本实验受控入口继续物化和使用。

## 安全错误与日志

`safeSyntheticBoundary` 只生成固定 operation/code 审计。异常不被打印或序列化；不会读取原 Error 的 message/name/cause/stack/code，包括可能带 getter 的对象。没有调用者自由文本 ID、原始 request、路径或正文加入审计。真实 Ledger open 失败会在原错误中携带路径和 native cause；测试先确认该事实，再验证经过边界只输出 `DEPENDENCY_FAILED`，假凭据标记和路径不在结果/审计里。

文件拒绝、正文不可用/漂移、授权拒绝、外发拒绝、已遗忘、revocation 不可用和清理 pending 有各自固定代码；不暴露底层异常来“帮助诊断”。CLI 只接受零参数的固定 synthetic 场景，只打印安全摘要；调用者附加参数失败且不反射内容。

## 重现、计数与限制

使用正式 Node 22.23.1 / npm 10.9.8，并在不注入真实凭据的干净环境运行：

```bash
node --experimental-strip-types docs/spikes/preintegration-safety/experiment.mjs
node --experimental-strip-types --test docs/spikes/preintegration-safety/experiment.test.mjs
npm run check
git diff --check
```

实验为 `.mjs`，与原 D-01 一样 opt-in，不属于根 `npm run check` 的测试发现范围；不是在产品 `tsconfig` 中新增了未类型检查的生产代码。禁止将实验测试数加进根测试数，也不能仅凭根门禁绿色声称本实验已运行。

2026-10-09 修复后的工作树验证：90 个实验测试通过，0 fail / skip / TODO，包含原 80 项及 10 项记录绑定回归；固定 CLI 成功，非法参数返回 2，安全摘要无正文/路径/假凭据标记。使用固定 Node 22.23.1 的 Linux 容器，源码只读、临时目录独立、无外网，`env -i` 不继承宿主凭据。镜像为 `node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3`。本记录不表示远端 Agent 的平台限制已经解除；最终完整 HEAD 的根门禁、独立 R3、CI 与集成证据仍由同一 primary PR 另行绑定。

| 场景组 | 测试证据 |
|---|---|
| 文件 | 有效 bytes；20 类非法路径；同前缀兄弟目录；根/祖先/目录/叶子 symlink；hardlink；非普通/缺失/过大；打开前后/读取后替换；就地修改 |
| 来源/外发 | 实际 Public 接收正例；Private/mixed/未分类/工具/跨 Workspace/未知资源零输出；schema/字段/目的地异常；假 token；工具指令仅为数据；坏 cache |
| 保留/恢复 | 公开 Ledger 元数据 append/replay；真实 inline 旧副本和不可 DELETE；D-01 live/backup 正例；forget 后各入口拒绝；分权 unlink；partial 失败；迟到 duplicate；缺 reference；缺/旧/损坏控制状态；未知备份状态 |
| 记录绑定 | live/backup 的自洽替换记录、追加 inline 消息、另一 request identity 均拒绝；缺正文/备份时仍先拒绝失配记录；D-01/resolver 零调用、无正文审计；相同记录换 JSON 顺序/空白仍成功 |
| 脱敏 | 真实 Ledger 原始路径/cause；恶意 Error getter；只含固定操作/代码的审计；CLI 正例与非法参数 |

回滚：移除本目录即可，无生产 Schema/迁移/数据/权限改变。不得因为撤回实验而撤回 [ADR 0012](../../adr/0012-protected-local-diagnostics.md) 的现有诊断保护，也不得把回滚视为撤销已经发生的真实物理删除。
