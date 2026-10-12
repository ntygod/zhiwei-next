# ADR 0024：双端共享工作台界面与同源开发预览

- 状态：Proposed（先独立 R3 设计审查，再实施；最终 HEAD 另审）
- 日期：2026-10-12
- 工作项：#127；P1-08，共享界面为 PC 与安卓交付方式的共同部分
- 被取代关系：补充 ADR0016/0018/0023，不改原领域、持久协议、Runtime、配对或真实启用许可

## 背景

所有者提供 banxing-agent-ui-v0.2 并要求接入 PC 与安卓界面。当前包的 app.js/style.css/Token 已是知微黑曜/冷瓷版本，screens 中仍有旧伴行浅绿图片；以当前可运行源码为视觉参考。其 LocalStorage、模拟任务/设备/审批及 task-contract.ts 是原型，不是业务真源。#125/PR126 已交付 BrowserWorkbench 与受保护 API，但没有可操作页面、静态资源或启动预览。

现有 P1 选择 React/TypeScript/Vite 同源 Web，P4 才有完整桌面；安装包/APK 是不同交付，已向所有者澄清。本决定只建立两者都需要的共享 UI，不用响应式网页宣称完成可安装客户端或跨设备接入。

## 决策

1. apps/web 以已接受的 React/TypeScript/Vite 实现共享界面，复用 BrowserWorkbench 和 protocol 公开 DTO；生产模块不导入 Daemon、Store、Node 或原型业务接口。不引入通用状态框架。依赖在实施中从官方 registry 精确锁定；Node22.23.1/npm10.9.8/Pi原发布闭包、完整 strict 程序、全部现有检查保留。React文档当前19.3与Vite的Node下限已核对，具体patch和平台闭包另以实际安装确认。
2. 保留源码中的主题、字阶、图标、电脑侧栏/工作区与手机底栏/页签；移除固定尺寸预览外框，按实际viewport响应。概览/任务/成果/记忆/设置接线当前API，例行自动化/设备集成等只按capability如实显示尚不可用。计数、状态、版本和结果来自后端；无总量不显示百分比，不用动画/点击制造批准、完成、配置提交或学习晋升。
3. BrowserWorkbench 是受保护视图的唯一客户端来源；React只保留导航ID、用户未提交输入与临时呈现状态。正文/身份失效通知必须同时清除旧详情、编辑弹层及由后端正文初始化的草稿，不能通过组件state、闭包、隐藏页签或旧Promise保留/恢复正文。Auth改变撤销旧写核对；读失效保持同主体精确未知写语义。UI明确区分confirmed/received/unknown/rejected，未知操作只经用户显式原字节核对，不普通重复发送。
4. 同源静态资源由已有固定literal loopback API组合提供：启动边界加载Vite构建的明确HTML/JS/CSS清单、校验类型/路径/体积，请求只做精确清单查找，不把URL拼成文件路径、不提供任意目录/fallback/proxy/CORS。所有资源no-store、nosniff，固定CSP禁止远端脚本、inline/eval、frame/object、任意base与导航。正文使用React文本节点；不可信HTML/Markdown、路径与工具输入不进入执行sink。生产Daemon入口仍不接此组合。
5. 新的受保护GET /v1/workbench-context按真实配对主体、已选Workspace授权后，返回已有正式SessionContract模板及当前界面上下文；模板由实际组合提供并严格解析，缺读者明确unsupported。增加独立v1响应/能力声明，不改旧JSON必填字段、错误含义或ProductEvent。UI不能复制固定Daemon契约或凭本地模型/权限选项创建授权；所有命令仍由现有后端复验。
6. 可运行预览仅由专用可信开发launcher创建全新的自有虚构临时安装，固定模型/I/O、固定fixture主体及目录，关闭时回收；不接任意data-root、账户、模型密钥或accepted/authorized开关。样例入口在UI明确说明虚构资料和当前受限执行器。若提供初始化配对路由，它只存在于该合成组合：固定同源Host/Origin/Fetch Metadata、严格限额/体积/固定请求、不能接受principal/Workspace/路径/profile权限；由launcher固定fixture签发既有一次性browser ticket。秘密只通过受控响应在内存转交原browser-pair，不能进入URL query、日志、浏览器持久存储或页面状态。普通API/Daemon没有匿名真实配对路由，既有bootstrap、Cookie/CSRF和Scope检查保持。
7. 页面层事件订阅负责必要获准重读，恢复先清正文、取得完整快照再重建流。事件不等于结果、进度不查模型，自动恢复不重发写入。界面上下文和正文仍服从ADR0023资格期限；不在组件缓存中延期。任务原终态、Outcome历史、纠正的新版本/旧版本替代与遗忘边界保持。
8. 开发验证覆盖实际HTTP/SQLite/固定Worker交互、全状态、无正文执行、焦点/弹层/窄屏/200%/减少动效。实际浏览器/Android/安装包、Cookie与产品场景未运行时明确not_run，不冒充平台supported或Z18passed；既有被拒浏览器/受限旧实验不重试。真实入口保持关闭，P1-09/P2与自动外发不借本项实施。

## 备选方案

- 直接执行原型app.js与LocalStorage：会产生第二真源与假成功，不采用。
- Vite另端口代理并改写Origin绕过认证：破坏既有同源边界，不采用；Vite只构建，API同源提供成品。
- 以手机viewport当作安卓APK或远程控制：混淆交付与权限，不采用；包装/设备连接在明确需求和独立决策后处理。

## 后果、验证与回滚

普通页面具备实际受保护交互，同时原型未来能力保持可解释的未实现状态。新增资产/上下文/样例入口扩大的是明确合成开发表面，不能继承真实个人数据授权；最终实现按R3完成独立审查、原完整检查、当前primary Runtime来源、Ready/live、保护合入与main来源回读。

回滚用新受审revert停用新增UI/静态资产/样例入口，原受保护API/CLI保留；无数据迁移，数据、最新控制journal、纠正/遗忘及结果历史不回退，不执行数据capture/restore。

技术事实参考：[React versions](https://react.dev/versions)、[Vite getting started](https://vite.dev/guide/)（2026-10-12）。
