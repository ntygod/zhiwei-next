# G-3a 正式工具链与支持边界

G-3a 工具链已由 [Issue #82](https://github.com/ntygod/zhiwei-next/issues/82) / [PR #83](https://github.com/ntygod/zhiwei-next/pull/83)交付。随后 #86 / PR #87 的独立有限决策审查接受了 [ADR 0011](../adr/0011-formal-toolchain-baseline.md) 的精确版本及 [ADR 0013](../adr/0013-pi-cli-jsonl-worker.md) 的官方 CLI JSONL 方向，历史身份见[当前执行决议](../planning/current-decisions.md)。本页仍说明 G-3a 的工具链保证；新[CLI 状态探针合同](pi-cli-state-contract.md)及 [G-3 原卡验收](../planning/g3-baseline-acceptance.md)分别记录实现和未完成验证，不等于 M0-4。

## 精确支持版本

| 输入 | 固定值 | 依据 |
|---|---|---|
| Node | 22.23.1 | 现有官方 Pi Runtime 隔离矩阵的版本；高于 Pi 最低 22.19.0 |
| npm | 10.9.8 | 同一既有 Runtime 镜像配套版本；安装时实测并拒绝不匹配 |
| TypeScript | 5.9.3 | Pi 固定上游声明的开发依赖版本；本次真实严格编译验证 |
| @types/node | 22.19.19 | Pi 0.84.1 发布 shrinkwrap 中的 Node 22 类型版本 |
| Pi | @earendil-works/pi-coding-agent 0.84.1 | 原固定 tarball integrity 与官方发布 shrinkwrap；不升级 |

G-3a 选择 ADR 0006 既有 Ledger 支持范围（>=22.16.0 <23）中的一个精确验证版本，没有重写该 Accepted ADR 的历史能力边界；Pi 的更高最低版本与整个仓库的重复安装由本切片固定。

版本事实源为根 `toolchain.json`。`package.json`、`.node-version`、根 lock、安装态 package manifests 必须一致。当前实测平台为 Linux x64；其他平台未完成本轮安装/行为验证，版本范围没有扩展。

## 闭包与安装

根 lock 共 147 个依赖条目。Pi 官方 shrinkwrap 的全部 143 个子条目按原版本/URL/依赖/平台字段保留，npm 仅传播 `dev: true`；其中 6 个内部 Pi 包的官方 shrinkwrap 没有 integrity，根 lock 额外补入官方 registry 精确 0.84.1 的 sha512。这是本地 lock 的可审计增强，不宣称与发布 shrinkwrap 逐字相同；原发布 shrinkwrap 本身保持原字节，sha256 为 `a724da15dc849d0ab2fe346845f8986b059ab89339a03a365b5910b23217c0c3`。增补来源与摘要逐项记录在 `toolchain.json`。

安装入口：先选择上述 Node/npm，在仓库根运行：

```bash
sh scripts/formal-toolchain.sh install
npm run check
```

shell 入口在 Node 启动前用 env allowlist 去掉继承的 Node preload、NODE_PATH、HOME、npm、Pi 和凭证变量。安装器再创建临时 HOME、空 npm user/global config、临时 cache，核验实际 npm 版本后执行 `npm ci --ignore-scripts --no-audit --no-fund --install-strategy=hoisted`，核对 lock 未变、完整图及安装版本。依赖 lifecycle scripts 不执行。

有企业网络代理的环境可以显式提供 `--https-proxy=<无凭证URL> --use-system-ca`；仅支持 http/https 且拒绝用户名/密码，不读取或自动继承宿主代理配置，不关闭 TLS 验证。受控代理与系统 CA 只改变传输，registry URL、精确版本和 integrity 仍核对。2026-10-08 本地新建空 cache 的完整 npm ci 已实际通过此模式。

这不是操作系统沙箱，也不能证明恶意同进程代码无法读取其他路径。初始 PATH/Node/npm 必须是可信工具链；直接运行普通 npm 时，npm 本身可能在仓库检查之前读取宿主配置。需要隔离安装时使用上述 shell 入口，不把后续环境清理误称能撤销已执行的 preload。真实 Pi 执行仍只在原有 hardened Runtime probes 内完成。

## 完整源码检查与有限 Pi 类型面

`npm run typecheck` 建立真实 TypeScript program，strict/noEmit/NodeNext/erasableSyntaxOnly/skipLibCheck=false。apps/packages 下全部 `.ts` 文件（源码、测试和 fixture）是 roots，数量由检查器实际遍历输出；检查器独立遍历文件并比较 root 集合，防止通过 tsconfig.exclude 或收窄 include 绕过文件。导入的声明图同样检查。既有被测试的 `.mjs` fixture 辅助文件按真实 JS 推断，不手抄声明；本次未把 JS 迁移成新的正式生产模块。

新 `pi-client-types.test.ts` 消费官方 `@earendil-works/pi-coding-agent/client` 公共类型面。该公共子路径及全部传递声明已实际 strict NodeNext 编译，涵盖 RemoteSession 的 create/open/subscribe/submit/abort/reconnect/dispose 与 transcript snapshot/progress API；合成 lifecycle/options/prompt 正例不启动 Pi，也不发送请求。缺 API、错误 prompt 类型、错误 lifecycle operation 都由同一真实编译器拒绝。所有 Pi 类型只出现在 pi-adapter，且未从 Adapter 公共 barrel 向外导出。

这段类型检查不选择生产 Client/SDK/RPC 路径；D-07 选择官方 CLI JSONL 的独立证据见 ADR 0013，不由 RemoteSession/CBOR 的类型证明推导。不声称正式 RemoteSession 或 Worker 已接入。既有正式 normalizer 与所有包测试均同时被检查，而不是仅检查新增示例。

## 明确未支持的 root SDK 声明

官方 Pi 0.84.1 root export 的完整声明图，在固定 TS 5.9.3 + strict NodeNext 下仍有 46 个上游诊断：

- 39 个 pi-ai provider `.models.d.ts` 的 JSON import 缺 NodeNext import attribute
- 6 个 @anthropic-ai/sdk 0.91.1 声明引用不存在的多层相对 undici-types 路径
- 1 个 @google/genai 1.52.0 声明无条件引用缺失的 optional MCP peer

独立复现命令 `npm run diagnose:pi-root-types` 返回非零并打印原始诊断；不属于根 check 的通过条件。没有修改第三方声明、关闭 skipLibCheck、过滤诊断、添加 ambient stub 或改用 Bundler 掩盖问题。公共 ./client 的绿不能证明 root SDK 类型兼容；当前选择的 CLI 合同不消费这些声明。若将来改变已接受方向选择 root SDK，须独立解决这些确切缺陷、显式 supersede 决策并重跑矩阵。

## 验证、CI 与未覆盖边界

- 完整编译、依赖漂移/缺包/缺 integrity/非官方源、缺 API/错类型、合成宿主 npm/Pi/凭证与 Node preload 污染负例在根 check 执行
- 原 Node 行为测试继续单独执行；类型修复保留运行时失败检查、现有断言和来源 fixture
- Static contracts 仅固定 Node 并在原 check 前增加隔离 npm ci；原 job 身份、权限、五个动态 probe、三套 standalone、evidence/observer/provenance 门保持
- 工具链输入路径纯追加到原动态矩阵触发集合；所有既有矩阵须由真实 CI 容器重跑
- 本地环境无 Docker，本轮本地没有运行九个动态 Runtime probe；不能将静态 fixture 检查或 Faux Provider 结果外推真实模型/网络/用户数据授权

最终 HEAD 的全部命令、CI、独立 R3、受保护合并和 main provenance 以 PR #83 实证为准。没有用旧 PR 批准继承新变更。回滚可 revert 本切片，没有生产 Schema 或用户数据变化。
