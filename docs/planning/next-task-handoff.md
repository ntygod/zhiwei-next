# 下一开发上下文交接

更新于2026-10-30。当前主线是 P1-08；[项目状态](../harness/project-state.md)保存阶段摘要，[execution-mode.json](../harness/execution-mode.json)保存实现与验收两个状态，具体交付以 canonical Issue、primary PR 和原始检查证据为准。

## 当前工作与顺序

- canonical [Issue129](https://github.com/ntygod/zhiwei-next/issues/129)，唯一 primary [PR131](https://github.com/ntygod/zhiwei-next/pull/131)，分支 `fix/129-task-keyboard-navigation`。
- protected main `11e7eff5050fdad8279e169bf1aa740579e89167` 已包含 PR128 工作台接入和 PR130 PC 配对/加载/到期修复。P1-01—P1-07 合成实现已交付；不再从旧“下一项 P1-01”或 PR127/128 的 CI 快照选工。
- 所有者本轮明确：先恢复 PR131 的证据链并完成合入，再补齐 PC 实际验收，同时同步文档；手机端继续暂缓。基础 PC/APK 打包仍等待双端浏览器验收，不开启新的产品 WIP。

## PR131 的事实与剩余门

原 `4dddec0fef4b9cd42133392b178a65add0656929` 实现任务详情页签的方向键/Home/End、焦点停靠和 ARIA 面板关联；切换只改呈现，不发送业务命令。其独立代码审查、本地1175项完整检查以及最后的 Draft CI38355031419 已成功。

原 Artifact 下载曾被环境代理 CONNECT403 阻止；当前配置连接已能到达存储域名，旧Artifact列表为空。2026-10-30重跑原SDK/Worker工作流38355031441完整attempt2，新原ZIP已实际下载并经原validators/完整冻结对象校验。Worker双attempt来源续期和最终HEAD的原完整检查、新独立R3、Ready/live、保护合入及main回读仍须实际完成；这些门不由旧代码批准或Draft跳过的检查代替。

来源的机器事实源为 SDK/Worker manifests，原件身份与比较边界见[SDK记录](../spikes/pi-runtime-contract/sdk-rpc-parity-lifecycle.md)和[Worker记录](../../packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle.md)。仅同步真实身份，不重写冻结对象/normalizer；临时取证guard只允许在原完整比较之后失败，最终恢复原比较器。CI整项预算为所有者已授权的20分钟，原测试发现、断言及Daemon/Worker/RPC期限保持。

## 合入后的 PC 验收

使用[工作台运行入口](../../apps/web/README.md)创建新的临时虚构安装和固定Worker。复用已有核心PC流程证据，补实际页签方向键/Home/End/Tab、读屏语义与原生200%，以及与这些变更相关的正常/加载/错误/权限/断线状态。记录真实平台、源码、结果与截图；DOM、CSS缩放或窄视口不冒充原生浏览器缩放，PC视口不冒充安卓设备。

PC验收后把新结果写入对应事实源；安卓保持暂缓，P1-08整体和Z18不能因此记为全部通过。后续安卓连接/设备认证及基础客户端打包沿[任务目录](implementation-plan.md#p1-08--交付双端工作台与基础客户端)与[ADR0025](../adr/0025-browser-first-client-delivery.md)独立推进，不提前P1-09/P2。

## 保持边界

只使用新自有虚构临时资料与固定模型/I/O，普通真实入口关闭。正式产品启用、实际模型/账户/个人资料、外发和部署仍受原授权与前置约束；手机端本轮不调试。

原 #90/preintegration-safety、Private/链接替换/备份/captureRestore及等价受限实验不运行，具体拒绝不换路绕过。当前取证使用配置允许的网络连接，不改代理或绕过网络策略；如再次受策略阻断，应记录实际条件和合法恢复路径。

回滚通过受审代码revert，数据、控制journal与纠正/遗忘历史不回退。原型、未跟踪用户文件与已归档工作区保持；所有后续提交仍在同一 canonical work item 的当前 primary 完成。
