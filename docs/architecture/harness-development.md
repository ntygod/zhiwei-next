# Harness 源码与知微开发方式

状态：开发合同设计。当前仓库只有架构，以下包、构建和启动流程尚未实施；示例不是现在已经可运行的知微命令。

## 1. 两份代码各自负责什么

```text
work/
  zhiwei-next/                 知微仓库，业务插件、Bundle、合同、测试与部署
  deepseek-harness-upstream/    可选的固定版本源码 checkout，阅读和调试
```

日常开发以已发布的 `@deepseek-ai/dsh@0.2.2-alpha.2` 和配套固定依赖为基础。Harness 源码不复制到知微仓库，不把知微业务直接放进上游 `packages/`。源码 checkout 可帮助阅读实现、运行上游测试和定位扩展点；它不是必须维护的 Fork。

只有公开扩展点确实不能满足具体合同，才提出上游补丁；记录复现、影响和回退。需要临时补丁时固定补丁集与 commit，保持可回到上游，不能让未登记的本机改动进入生产制品。

## 2. 知微仓库的目标组织

```text
packages/
  contracts/                  API、事件和桥接协议
  domain/                     纯业务规则，不依赖 Cordis/Harness
  harness-bridge/             Agent API、原生事件与知微身份的转换
  plugins/                    Router、Task、Memory、Learning、Attention、Policy
  bundle-control-plane/       控制面插件入口、manifest、cordis.patch.yml
  bundle-worker/              Worker 插件入口与受限组合
  storage/                    PostgreSQL、Markdown 对象、效果/失效日志
  connectors/                 邮件、日历、GitHub 与设备事件
apps/
  execution-agent/            设备端受控执行
  supervisor/                 独立监督
```

这是责任映射，不要求每个逻辑插件单独发布一个 npm 包。先按实际复用和隔离边界组织包，插件可同包分文件；不制造空包数量。

## 3. Plugin、Bundle、Profile

- Plugin：TypeScript 模块，通过 `apply(ctx)`、Service 和 `inject` 注册/消费能力。
- Bundle：我们构建、分发的包；`package.json` 中声明 `dsh.bundle.patch`，贡献插件配置层。
- Profile：运行环境中的具名组合，列出有序 Bundle 和部署配置；用 `dsh --profile <name>` 启动。

Bundle manifest 示意（包名为项目内部约定，不代表已经发布）：

```json
{
  "name": "@zhiwei/harness-bundle",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "files": ["dist", "cordis.patch.yml"],
  "engines": { "dsh": "0.2.2-alpha.2" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "peerDependencies": {
    "@deepseek-ai/cordis": "4.0.6-alpha.1",
    "@deepseek-ai/dsh-agent": "0.2.2-alpha.2"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "4.0.6-alpha.1",
    "@deepseek-ai/dsh-agent": "0.2.2-alpha.2"
  }
}
```

需要共享实例的 dsh/Cordis 包声明 peer + dev dependency，遵循上游 runtime resolution；不要用任意 `npm link` 方式装出两份不一致的宿主服务。独立第三方依赖按普通依赖处理。整体 lockfile 与运行制品摘要一并保存。

Cordis 使用独立版本号，不能把所有包都填成 dsh 的版本。已核对发布的 `dsh-agent@0.2.2-alpha.2` 要求 Cordis `~4.0.6-alpha.1`，本设计固定为 `4.0.6-alpha.1`；其 loader/include 依赖也要按发布清单和 lockfile 解析。上述示意只列直接使用的宿主 peers，不代替完整依赖闭包验证。

## 4. 本地联调

1. 在知微仓库编写 TypeScript 插件、领域规则及测试，先构建插件 JS 产物。
2. 使用独立开发 `DSH_HOME`、无真实数据的 cwd 和固定 Harness CLI，把本地 Bundle 链接到开发 Profile。
3. 在启动前 dump 最终配置，核对全部层、必需服务、禁用项和 peer 来源。
4. 使用合成输入/本地测试适配器验证生命周期和接口；接真实模型前另行配置明确授权的凭据与目的地。
5. 用原生 Agent API 在插件内驱动 Agent；跨进程 Worker 经过知微桥接，不假定 SDK wire 已有取消接口。

已核对的官方 CLI 语法示意：

```sh
dsh plugin --profile zhiwei-dev add ./packages/bundle-control-plane
dsh --profile zhiwei-dev --dump-config
dsh --profile zhiwei-dev
```

前提是该包已经存在且构建完成，并已用专用环境和知微组合检查器检查配置。`dsh plugin` 管理 Profile 依赖时使用 pnpm；应用代码的构建工具可以独立选择，但依赖与包管理器版本必须固定。

首次 `dsh plugin add` 会给自定义 Profile 加入 `dsh-base`。因此不能安装后不检查就启动：需要在知微发布配置中明确取消/覆盖不需要的层和行，确保没有默认日志上传、原始会话持久化、直接 Provider、宽权限工具、插件管理或 HMR。`--dump-config` 自身不启动 Agent；对 unmatched patch、缺失/disabled 必需插件和不兼容版本视为预检失败。

`--from-default-profile` 会重置目标 Profile（包括原依赖和 patch），只可用于明确创建的可丢弃配置，不作为日常开发的无害启动参数。源码方式运行时，先在上游 checkout 按官方要求构建，再使用其 `pnpm dsh`；开发 overlay 可以指向知微插件的绝对路径。

## 5. 生产制品与升级

交付预构建 npm 包或 tarball，不要求服务器在安装时执行任意 Git prepare 脚本。完整制品包括：固定 Harness 及其依赖、知微 Bundle、受审 Profile 清单、版本/digest、数据迁移和回滚说明。

生产使用独立 DSH_HOME、固定工作目录和最小环境；禁止额外 home/CLI overlay 和动态安装改变已核验组合。启动前封锁 CLI 的 DSH_HOME/logs 原始诊断写入，捕获其 stderr 回落且不原样收集；正常停止先走知微 drain，再进入官方 CLI 的 5 秒清理。具体边界与验收见[部署合同](deployment.md)。启动器仍是官方 dsh，知微提供配置生成/预检和部署入口，不复制其 Agent Loop。

升级时在候选组合中运行完整契约、取消、插件清理、数据边界与恢复场景，再切换实际配置。源码 checkout 的调试修改必须通过正式补丁/制品登记才能上线；同一版本字符串不能掩盖不同构建内容。

## 6. 本次范围

本次同步架构选型和开发方式，没有下载/构建上游源码、安装产品依赖或启动模型。UI 仍不设计；现有 `npm run check` 仍只检查设计材料。依据：[官方打包与安装指南](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/docs/user/develop/basic/publish.zh.md)、[CLI 行为](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/apps/cli/reference/README.md)。
