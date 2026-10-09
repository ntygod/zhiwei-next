'use strict';
const { initial, transition } = globalThis.WorkbenchDemo;
let state = initial();
let selectedAttempt = null;
let dialogTrigger = null;
let pendingRevision = null;
const main = document.querySelector('main');
const dialog = document.querySelector('#dialog');
const labels = { today: '今天', project: '秋日工作坊', memory: '记忆', settings: '设置与演示控制' };
const scenarios = { normal: '正常', empty: '空项目', loading: '加载中', offline: '断线', error: '读取错误', permission: '权限受阻', model: '模型不可用', index: '索引滞后', unknown: '副作用未知', conflict: '版本冲突' };
const money = value => `${value / 10000} 万元`;
const latest = () => state.attempts.at(-1);
const currentPage = () => Object.hasOwn(labels, location.hash.slice(1)) ? location.hash.slice(1) : 'today';
const disabled = () => ['offline', 'error', 'permission', 'loading', 'conflict', 'empty'].includes(state.scenario);
const button = (action, text, cls = '', off = false) => `<button type="button" data-action="${action}" class="${cls}" ${off ? 'disabled' : ''}>${text}</button>`;
function announce(text) { document.querySelector('#announcer').textContent = text; }
function dispatch(action, message) { state = transition(state, action); render(); if (message) announce(message); }
function controls() { return `<div class="scenario-bar"><strong>演示状态</strong><label for="scenario">切换体验</label><select id="scenario">${Object.entries(scenarios).map(([id, title]) => `<option value="${id}" ${state.scenario === id ? 'selected' : ''}>${title}</option>`).join('')}</select><span>不会连接真实服务或授予权限</span></div>`; }
function stateNotice() {
  const data = {
    loading: ['正在载入演示快照', '保留最后确认内容，不推断任务完成。可取消这次载入。', '恢复正常演示'],
    offline: ['演示连接已断开 · 最后确认于 09:42', '当前画面是最后确认快照。断线不代表任务停止或成功；写操作暂不可用。', '模拟重连并读回'],
    error: ['暂时无法读取演示状态', '诊断 ID：DEMO-READ-01。没有提交任何更改。', '重试演示读取'],
    permission: ['受阻：没有向供应商发送询价的权限', '本轮只有方案草拟范围。可缩小为本地草稿；这里不能授予真实权限。', '缩小为草稿演示'],
    model: ['生成暂不可用', '记忆查阅和纠正仍可操作。此页面从不调用模型。', '恢复模拟生成'],
    index: ['演示索引滞后', '界面直接读取当前内存版本。被替代的预算不会重新进入新尝试。', '恢复正常演示'],
    unknown: ['演示外发状态未知 · 请先核对回执', '这是一条合成异常情景，实际没有发送。不能据此显示成功或提供重复发送。', '查看核对说明'],
    conflict: ['预算存在演示版本冲突', '项目决定为 8 万元，旧材料仍为 10 万元。不要混合采用；查看来源后回到当前演示快照。', '比较冲突来源']
  }[state.scenario];
  if (!data) return '';
  return `<section class="notice ${['error','permission'].includes(state.scenario) ? 'error' : 'info'} state-area" aria-label="演示异常状态"><strong>${data[0]}</strong><p>${data[1]}</p>${button(state.scenario === 'unknown' ? 'receipt' : state.scenario === 'conflict' ? 'conflict' : 'recover', data[2])}</section>`;
}
function contextContent() { return `<h2>本次工作</h2><span class="tag warning">结果待核验</span><div class="rule"></div><h3>目标</h3><p class="subtle">为 30 人秋日工作坊准备一份可执行的筹备方案。</p><h3>完成条件</h3><ul><li>总支出不超过 ${money(state.budget)}</li><li>供应商报价有可核实来源</li><li>场地日期得到确认</li></ul><div class="rule"></div><h3>本轮采用的依据</h3><p class="subtle">项目决定 · 预算 ${money(state.budget)}<br>范围：仅「秋日工作坊」<br>来源：合成用户输入 · 版本 ${state.revision}</p>${button('correct', '纠正这条预算记忆', 'inline-action', disabled() || state.budget === 80000)}<div class="rule"></div><h3>当前未知项</h3><p class="subtle">报价含税范围、场地档期。没有证据就保持未知。</p><details><summary>查看解释与排错信息</summary><p>DEMO-TASK-01 · memory revision ${state.revision}<br>上下文仅包含当前有效演示预算。旧版本保留在历史中，不作为新任务依据。</p></details>`; }
function artifact(attempt) {
  const estimate = attempt.budget === 100000 ? 92000 : 76000;
  return `<section class="artifact" aria-label="方案产物"><div class="artifact-head"><span>▤ 筹备方案 · 第 ${attempt.id} 次尝试</span><span class="tag ${attempt.stale ? 'warning' : 'neutral'}">${attempt.stale ? '陈旧 · 请勿继续采用' : '合成草稿'}</span></div><div class="artifact-body"><h3>小规模交流，把预算留给体验。</h3><p>以场地与基础设备为核心，精简装饰和礼品。所有金额和材料均为演示内容。</p><div class="facts"><div><small>本次预算依据</small><strong>${money(attempt.budget)}</strong></div><div><small>模拟合计</small><strong>${money(estimate)}</strong></div><div><small>参与人数</small><strong>30 人</strong></div></div>${attempt.stale ? '<div class="notice"><strong>预算依据已被替代</strong><br>这份历史方案不能作为当前结果。请用新预算开启新的尝试，旧产物仍可查阅。</div>' : '<div class="notice"><strong>待核验 · 还不能说任务完成</strong><br>金额是模拟估算，缺供应商报价与场地回执。执行结束不等于 Outcome 已通过。</div>'}<div class="button-row">${button(`inspect:${attempt.id}`, '检查产物与依据')}${button('correct', '预算变了，纠正记忆', '', disabled() || state.budget === 80000)}</div></div></section>`;
}
function today() { return `<div class="page-heading"><div class="intro"><p class="eyebrow">接着上次，一起往前</p><h1>今天，从一件重要的事开始。</h1><p>项目、决定与下一步，都留在同一条合作脉络里。</p></div><span class="tag neutral">设计预览</span></div><section class="card hero"><div class="hero-grid"><div><span class="eyebrow">继续协作 · 秋日工作坊</span><h2>${state.budget === 80000 ? '新预算记住了，方案需要跟上。' : '方案有了，还有两件事要核实。'}</h2><p>${state.budget === 80000 ? '预算已经从 10 万元调整为 8 万元。旧方案保留为历史，新的尝试将使用当前决定。' : '上次已准备筹备方案草稿。供应商报价与场地日期还缺证据，可以先检查结果，再调整项目决定。'}</p><div class="button-row"><a class="tag" href="#project">继续这项工作 →</a></div></div><div class="hero-aside"><div><strong>01</strong><small>正在协作的项目</small></div><div><strong>02</strong><small>待核实项 · 演示</small></div></div></div></section><div class="two-col"><section class="card"><p class="eyebrow">项目决定</p><h2>预算 ${money(state.budget)}</h2><p class="muted">限定在秋日工作坊内使用。你可以查看来源，并纠正它。</p><a href="#memory">查看记忆与版本 →</a></section><section class="card"><p class="eyebrow">合作中的积累</p><h2>先检查结果，再谈经验。</h2><p class="muted">当前没有已验证的做法。一次演示结果不足以证明某种做法更好。</p>${button('learning', '看看后续如何学习', 'inline-action')}</section></div>`; }
function project() {
  const a = state.attempts.find(a => a.id === selectedAttempt) || latest();
  const busy = latest().status === 'running';
  const canStart = !disabled() && state.scenario !== 'model' && !busy && (latest().stale || latest().status === 'interrupted');
  return `<div class="page-heading"><div><p class="eyebrow">项目 / 秋日工作坊</p><h1>让一次交流，值得大家到来。</h1><p class="muted">目标：为 30 人准备一份预算内、可执行的工作坊方案。</p></div>${button('panel', '查看本次工作', 'mobile-panel')}</div><div class="workbench"><section class="conversation" aria-label="合作对话与产物"><div class="message"><span class="avatar user" aria-hidden="true">你</span><div class="message-body"><p class="message-label">合成用户输入 · 项目目标</p><p>帮我筹备秋日工作坊。30 人，预算先按 10 万元，重点是交流体验。</p></div></div>${state.budget === 80000 ? '<div class="message"><span class="avatar user" aria-hidden="true">你</span><div class="message-body"><p class="message-label">演示纠正 · 项目决定</p><p>预算改为 8 万元，仅用于这个项目。旧的 10 万元预算不再使用。</p></div></div>' : ''}<div class="message"><span class="avatar" aria-hidden="true">知</span><div class="message-body"><p class="message-label">知微 · 演示执行记录</p>${a.status === 'running' ? `<section class="card"><span class="tag">模拟执行中</span><h2>正在按 ${money(a.budget)} 准备新方案</h2><p>已选择当前项目决定；等待演示执行结果。不显示虚构完成百分比。</p><div class="button-row">${button('finish', '模拟执行结束', 'primary', disabled())}${button('stop', '中断这次演示', '', disabled())}</div></section>` : a.status === 'interrupted' ? '<section class="card"><span class="tag warning">尝试已中断</span><h2>这次没有形成结果。</h2><p>历史仍在。准备好后，可使用当前上下文开启新的尝试。</p></section>' : artifact(a)}</div></div><div class="card"><h3>尝试历史</h3><p class="subtle">每次执行独立记录，纠正不会改写旧产物。</p>${state.attempts.map(t => button(`attempt:${t.id}`, `第 ${t.id} 次 · ${t.stale ? '陈旧' : t.status === 'running' ? '执行中' : t.status === 'interrupted' ? '已中断' : '待核验'}`, 'history-button')).join('')}</div><section class="composer"><p>${busy ? '当前已有一次演示执行；不能重复开启。' : canStart ? '下一步：带上当前有效预算，开始一次新的执行。' : '下一步：先检查方案中的证据，或纠正不再准确的预算。'}</p>${button('start', '使用当前依据，开启新尝试', 'primary', !canStart)}<div class="status-line">仅模拟本地草拟 · 不发送询价 · 不授予额外权限</div></section></section><aside class="context-panel" aria-label="任务目标与依据"><div class="card">${contextContent()}</div><div class="card"><p class="eyebrow">这次发生了什么</p><ol class="timeline">${state.log.map(item => `<li>${item}</li>`).join('')}</ol></div></aside></div>`;
}
function memory() { return `<div class="page-heading"><div><p class="eyebrow">可查、可改、说得清</p><h1>记忆</h1><p class="muted">这里保留项目决定与来源，让下次合作不必从头解释。</p></div><span class="tag neutral">秋日工作坊 · 项目范围</span></div><label for="search">查找这次演示的记忆</label><input id="search" class="search" type="search" placeholder="搜索预算、工作坊或项目决定" autocomplete="off"><div id="memory-results"><section class="card"><div class="memory-row"><div><span class="tag">项目决定 · 当前有效（演示）</span><h2 class="memory-value">预算上限 ${money(state.budget)}</h2><p class="muted">来源：合成用户输入 · 仅作用于秋日工作坊</p></div>${button('correct', state.budget === 80000 ? '已完成演示纠正' : '纠正这条记忆', 'primary', disabled() || state.budget === 80000)}</div><p>每次纠正建立新版本。历史可解释，当前上下文只使用有效版本。</p>${state.previousBudget ? '<div class="version"><span class="tag neutral">旧版本 · 已替代</span><p>版本 1：预算 10 万元。保留为历史，不再作为新任务依据。<br>版本 2：预算 8 万元。关联旧方案已标为陈旧。</p></div>' : '<div class="version">版本 1 · 预算 10 万元 · 尚无纠正历史</div>'}<details><summary>查看演示来源与使用范围</summary><p>合成来源 DEMO-INPUT-01。项目 DEMO-WORKSHOP。不是全局偏好，不授予消费或外发权限。</p></details></section></div><section class="card"><h2>最近学到的做法</h2><p class="muted">还没有经过验证的做法。当前场景只演示结果检查与记忆纠正，学习试用属于后续阶段。</p>${button('learning', '了解候选与已验证做法的区别', 'inline-action')}</section>`; }
function settings() { return `<div class="page-heading"><div><p class="eyebrow">清晰的边界，安心地尝试</p><h1>设置与演示控制</h1><p class="muted">本页设置只控制原型体验，不修改产品或设备配置。</p></div></div><section class="card"><div class="setting-row"><div><h3>数据与保存</h3><p>仅当前页面内存。刷新或清除后回到初始场景；不使用浏览器存储。</p></div><span class="tag neutral">不持久化</span></div><div class="setting-row"><div><h3>模型、Runtime 与连接器</h3><p>均未连接。没有后台执行，没有真实外发，也没有可授予的权限。</p></div><span class="tag neutral">未接入</span></div><div class="setting-row"><div><h3>重置这次演示</h3><p>清除预算纠正、尝试历史与反馈，恢复合成初始数据。不会删除真实信息。</p></div>${button('reset', '清除演示状态', 'danger')}</div></section><section class="card"><h2>建议体验路线</h2><ol class="checklist"><li>在项目中检查草稿与待核实依据。</li><li>预览预算纠正的影响，试试取消，再确认。</li><li>查阅被替代的记忆和陈旧方案。</li><li>开启新尝试，中断或完成模拟执行。</li><li>检查新结果，区分反馈与真正的验证。</li></ol><a href="#project">回到项目工作台 →</a></section>`; }
function render() {
  const page = currentPage();
  document.querySelector('#breadcrumb').textContent = labels[page];
  document.querySelectorAll('[data-nav]').forEach(el => { if (el.dataset.nav === page) { el.classList.add('active'); el.setAttribute('aria-current', 'page'); } else { el.classList.remove('active'); el.removeAttribute('aria-current'); } });
  document.querySelector('#nav-status').textContent = `进行中 ${latest().status === 'running' ? 1 : 0} · 待审批 0`;
  const empty = state.scenario === 'empty' && page !== 'settings';
  main.innerHTML = controls() + stateNotice() + (empty ? `<section class="card empty"><div class="symbol" aria-hidden="true">◇</div><h1>还没有开始的项目</h1><p class="muted">用一份合成项目，体验如何把目标、结果与记忆连起来。</p>${button('recover', '载入工作坊演示', 'primary')}</section>` : ({ today, project, memory, settings }[page])());
}
function openDialog(html) { dialogTrigger = document.activeElement; document.querySelector('#dialog-content').innerHTML = html; dialog.showModal(); }
function closeDialog() { dialog.close(); pendingRevision = null; }
const dialogEnd = (primary = '') => `<div class="button-row">${button('close', '返回')}${primary}</div>`;
function inspect(id) { const a = state.attempts.find(a => a.id === id); if (!a) return; openDialog(`<p class="eyebrow">合成产物 / 第 ${a.id} 次尝试</p><h2 id="dialog-title">方案有了，证据还不完整。</h2>${a.stale ? '<div class="notice"><strong>陈旧结果</strong><br>引用的预算已被替代。即使给出反馈，也不能恢复为当前有效结果。</div>' : ''}<h3>1. 主结论</h3><p>按 ${money(a.budget)} 草拟的方案尚不能认定已完成。</p><h3>2. 产物</h3><p>工作坊筹备草稿 · 模拟合计 ${money(a.budget === 100000 ? 92000 : 76000)}。未导出、未发送。</p><h3>3. 验证证据</h3><ul class="checklist"><li>预算依据：合成项目决定 ${money(a.budget)}</li><li>报价来源：缺失，模拟估算不是报价凭证</li><li>场地回执：缺失，未核对档期</li></ul><h3>4. 未完成项</h3><p>取得真实报价与档期确认。原型不执行这两项，也不会模拟“已通过”验证。</p><div class="notice info">你的反馈只表示主观评价，不会把待核验变为已验证成功。</div><div id="feedback-status" role="status">${state.feedback ? `当前反馈：${state.feedback}。结果仍待核验。` : ''}</div><div class="button-row">${button('feedback:符合要求', '符合要求', '', disabled() || a.stale || a.id !== latest().id)}${button('feedback:需要修改', '需要修改', '', disabled() || a.stale || a.id !== latest().id)}</div>${dialogEnd()}`); }
document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]'); if (!target || target.disabled) return;
  const [action, value] = target.dataset.action.split(':');
  if (action === 'close') return closeDialog();
  if (action === 'correct') { pendingRevision = state.revision; return openDialog(`<p class="eyebrow">记忆纠正 · 先看看影响</p><h2 id="dialog-title">把项目预算改为 8 万元？</h2><p>仅修改「秋日工作坊」的合成预算决定，不影响其他项目或全局偏好。</p><div class="compare"><div><small>旧版本 · 将被替代</small><strong>10 万元</strong></div><div><small>新版本 · 将用于后续尝试</small><strong>8 万元</strong></div></div><h3>确认后，会发生什么</h3><ul><li>旧预算保留在版本历史，新上下文不再采用。</li><li>已有方案标记为陈旧，不覆盖历史内容。</li><li>正在运行的演示尝试会中断；需要开启新尝试。</li></ul><p class="subtle">这里只更新页面内存，不写入真实记忆，不改变消费或外发授权。</p><div class="button-row">${button('close', '取消，保持原样')}${button('confirm', '确认演示纠正', 'primary')}</div>`); }
  if (action === 'confirm') { const revision = pendingRevision; closeDialog(); dispatch({ type: 'correct', revision }, '演示预算已更新为 8 万元，旧方案已标为陈旧。'); main.focus(); return; }
  if (action === 'inspect') return inspect(Number(value));
  if (action === 'attempt') { selectedAttempt = Number(value); render(); main.focus(); return; }
  if (action === 'start' || action === 'stop' || action === 'finish') { dispatch({ type: action }, action === 'start' ? '已开启新演示尝试。' : action === 'stop' ? '演示尝试已中断。' : '演示执行结束，结果仍待核验。'); selectedAttempt = latest().id; render(); main.focus(); return; }
  if (action === 'feedback') { state = transition(state, { type: 'feedback', value }); document.querySelector('#feedback-status').textContent = `当前反馈：${state.feedback}。结果仍待核验。`; return; }
  if (action === 'recover') { dispatch({ type: 'scenario', value: 'normal' }, '已恢复正常演示快照。'); main.focus(); return; }
  if (action === 'panel') return openDialog(`<h2 id="dialog-title">本次工作与依据</h2>${contextContent()}${dialogEnd()}`);
  if (action === 'learning') return openDialog(`<h2 id="dialog-title">经验要经过验证，才能成为做法。</h2><p>这次结果仍缺证据，不会自动生成一条“成功经验”。</p><ol><li>先保留任务、采用依据和结果。</li><li>可信结果可以提出可撤销的候选做法。</li><li>经过试用与收益验证，再考虑晋升。</li></ol><p class="subtle">这是 P2 目标的说明，不是已实现的自动学习。</p>${dialogEnd()}`);
  if (action === 'receipt') return openDialog(`<h2 id="dialog-title">先核对，不盲目重发。</h2><p>真实产品遇到外发结果未知时，应查询回执或请用户核对。本原型没有外发能力，也没有任何真实回执。</p><p>关闭后仍保留“未知”演示状态。可从状态选择器切回正常场景。</p>${dialogEnd()}`);
  if (action === 'conflict') return openDialog(`<h2 id="dialog-title">冲突的两份演示来源</h2><div class="compare"><div><small>较新的项目决定 · 合成</small><strong>8 万元</strong></div><div><small>较旧的材料 · 合成</small><strong>10 万元</strong></div></div><p>此情景没有真正提交版本。返回后通过“演示状态”恢复正常，再使用纠正流程明确确认。</p>${dialogEnd()}`);
  if (action === 'reset') return openDialog(`<h2 id="dialog-title">清除本次演示状态？</h2><p>预算、尝试历史与反馈将恢复为初始合成内容。这个动作不涉及真实数据。</p><div class="button-row">${button('close', '取消')}${button('confirm-reset', '清除并重新开始', 'danger')}</div>`);
  if (action === 'confirm-reset') { closeDialog(); state = initial(); selectedAttempt = null; render(); main.focus(); announce('演示状态已清除并恢复。'); }
});
document.addEventListener('change', event => { if (event.target.id === 'scenario') { const value = event.target.value; dispatch({ type: 'scenario', value }, `已切换${scenarios[value]}演示。`); document.querySelector('#scenario').focus(); } });
document.addEventListener('input', event => { if (event.target.id === 'search') { const matches = !event.target.value.trim() || ['预算','工作坊','项目决定','10','8','万元'].some(word => word.includes(event.target.value.trim()) || event.target.value.includes(word)); document.querySelector('#memory-results').hidden = !matches; let empty = document.querySelector('#search-empty'); if (!matches && !empty) { empty = document.createElement('p'); empty.id = 'search-empty'; empty.setAttribute('role','status'); empty.textContent = '没有匹配的演示记忆。试试“预算”，或清空搜索。'; document.querySelector('#memory-results').after(empty); } else if (matches && empty) empty.remove(); } });
dialog.addEventListener('close', () => { if (dialogTrigger?.isConnected) dialogTrigger.focus(); else main.focus(); });
dialog.addEventListener('cancel', () => { pendingRevision = null; });
window.addEventListener('hashchange', () => { if (dialog.open) closeDialog(); render(); main.focus(); });
render();
