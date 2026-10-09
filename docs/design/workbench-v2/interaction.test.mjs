import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

// VM 对象替身仅验证真实 app.js 的事件分派与输出逻辑。
// 它不是 DOM 或浏览器，不证明原生 dialog、布局、键盘或视觉可访问性通过。
const [modelSource, appSource] = await Promise.all([
  readFile(new URL('./model.js', import.meta.url), 'utf8'),
  readFile(new URL('./app.js', import.meta.url), 'utf8'),
]);

function harness(hash = '#project') {
  const listeners = new Map();
  const windowListeners = new Map();
  const closeEvents = [];
  const nodes = new Map();
  const document = {
    activeElement: null,
    querySelector(selector) { return nodes.get(selector) ?? null; },
    querySelectorAll() { return []; },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  function element(action = null) {
    return {
      isConnected: true, disabled: false, dataset: action ? { action } : {},
      textContent: '',
      focus() { document.activeElement = this; },
      closest(selector) { return selector === '[data-action]' && action ? this : null; },
    };
  }
  function region(selector) {
    const result = element();
    let html = '';
    result.buttons = [];
    Object.defineProperty(result, 'innerHTML', {
      get() { return html; },
      set(value) {
        for (const button of result.buttons) button.isConnected = false;
        if (result.title) {
          result.title.isConnected = false;
          nodes.delete('#dialog-title');
          result.title = null;
        }
        html = value;
        result.buttons = [...value.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(match => {
          const action = /data-action="([^"]+)"/.exec(match[1])?.[1];
          const button = element(action);
          button.disabled = /\sdisabled(?:\s|$)/.test(match[1]);
          return button;
        });
        const title = /<h2\b[^>]*id="dialog-title"[^>]*>([^<]*)<\/h2>/.exec(value);
        if (title) {
          result.title = element();
          result.title.textContent = title[1];
          nodes.set('#dialog-title', result.title);
        }
      },
    });
    nodes.set(selector, result);
    return result;
  }
  const main = region('main');
  const content = region('#dialog-content');
  for (const id of ['#breadcrumb', '#nav-status', '#announcer', '#feedback-status']) {
    nodes.set(id, element());
  }
  const dialogListeners = new Map();
  const dialog = {
    open: false,
    showModal() { this.open = true; },
    close() {
      if (!this.open) return;
      this.open = false;
      closeEvents.push(() => dialogListeners.get('close')?.());
    },
    addEventListener(type, listener) { dialogListeners.set(type, listener); },
  };
  nodes.set('#dialog', dialog);
  const location = { hash };
  const context = vm.createContext({
    document, location,
    window: { addEventListener(type, listener) { windowListeners.set(type, listener); } },
  });
  vm.runInContext(modelSource, context, { filename: 'model.js' });
  vm.runInContext(appSource, context, { filename: 'app.js' });

  function click(target) {
    assert.ok(target?.isConnected, 'Only a connected generated control may be clicked');
    target.focus();
    let prevented = false;
    listeners.get('click')({ target, preventDefault() { prevented = true; } });
    while (closeEvents.length) closeEvents.shift()();
    return prevented;
  }
  function action(name) {
    const target = (dialog.open ? content : main).buttons.find(button => button.dataset.action === name);
    assert.ok(target, `Rendered action ${name} must exist`);
    click(target);
    return target;
  }
  return {
    action, click, main, content, dialog, document, location,
    navigate(hash) {
      location.hash = hash;
      windowListeners.get('hashchange')();
      while (closeEvents.length) closeEvents.shift()();
    },
    skip: { ...element(), closest(selector) { return selector === '.skip' ? this : null; } },
    snapshot() { return JSON.parse(vm.runInContext('JSON.stringify(state)', context)); },
  };
}

test('VM: skip link focuses the work area without changing the current route', () => {
  for (const route of ['#project', '#memory', '#settings']) {
    const h = harness(route);
    const before = h.main.innerHTML;
    assert.equal(h.click(h.skip), true, 'Native hash navigation must be prevented');
    assert.equal(h.location.hash, route);
    assert.equal(h.main.innerHTML, before);
    assert.equal(h.document.activeElement, h.main);
  }
});

test('VM: nested correction cancellation retains the external panel trigger', () => {
  const h = harness();
  const before = h.snapshot();
  const panelTrigger = h.action('panel');
  const removedInnerTrigger = h.action('correct');
  assert.equal(removedInnerTrigger.isConnected, false, 'Dialog content was replaced');
  h.action('close');
  assert.equal(h.dialog.open, false);
  assert.equal(h.document.activeElement, panelTrigger);
  assert.deepEqual(h.snapshot(), before, 'Cancellation must not confirm the correction');
});

test('VM: replacing an open dialog requests focus on its newly connected title', () => {
  const h = harness();
  h.action('panel');
  const oldTitle = h.content.title;
  assert.equal(h.document.activeElement, oldTitle);
  assert.equal(oldTitle.tabIndex, -1);
  h.action('correct');
  const newTitle = h.content.title;
  assert.notEqual(newTitle, oldTitle);
  assert.equal(oldTitle.isConnected, false);
  assert.equal(newTitle.isConnected, true);
  assert.match(newTitle.textContent, /把项目预算改为 8 万元/);
  assert.equal(newTitle.tabIndex, -1);
  assert.equal(h.document.activeElement, newTitle);
  assert.equal(h.dialog.open, true);
});

test('VM: Today and the task panel describe the latest attempt across its lifecycle', () => {
  const h = harness();
  function summary(title, text, label) {
    h.navigate('#today');
    assert.ok(h.main.innerHTML.includes(`<h2>${title}</h2><p>${text}</p>`));
    h.navigate('#project');
    const match = /<h2>本次工作<\/h2><span class="tag warning">([^<]+)<\/span>/.exec(h.main.innerHTML);
    assert.equal(match?.[1], label);
  }
  summary('方案有了，还有两件事要核实。',
    '上次已准备筹备方案草稿。供应商报价与场地日期还缺证据，可以先检查结果，再调整项目决定。', '结果待核验');
  h.action('correct');
  h.action('confirm');
  summary('新预算记住了，方案需要跟上。',
    '预算已经从 10 万元调整为 8 万元。旧方案保留为历史，下一次尝试将使用当前决定。', '旧结果陈旧');
  h.action('start');
  summary('正在把当前决定，变成新方案。',
    '这次演示尝试正在运行；还没有结果。可以查看进度，或中断本次尝试。', '模拟执行中');
  h.action('stop');
  summary('上次停在这里，准备好再继续。',
    '最近一次演示尝试已中断，没有形成新结果。可以使用当前依据开启另一次尝试。', '尝试已中断');
  h.action('start');
  h.action('finish');
  h.action('attempt:1');
  summary('新预算方案有了，还需要核实。',
    '最近一次草稿已采用当前预算。供应商报价与场地日期仍缺证据，先检查结果再决定下一步。', '新草稿待核验');
  assert.equal(h.snapshot().attempts.at(-1).status, 'review');
});

test('VM: current feedback stays with its attempt when historical details are reopened', () => {
  const h = harness();
  h.action('correct');
  h.action('confirm');
  h.action('start');
  h.action('finish');
  h.action('inspect:2');
  h.action('feedback:符合要求');
  h.action('close');
  h.action('inspect:2');
  assert.match(h.content.innerHTML, /本次尝试反馈：符合要求/);
  h.action('close');
  h.action('attempt:1');
  h.action('inspect:1');
  assert.match(h.content.innerHTML, /陈旧结果/);
  assert.doesNotMatch(h.content.innerHTML, /本次尝试反馈：符合要求/);
  const before = h.snapshot();
  const disabledFeedback = h.action('feedback:需要修改');
  assert.equal(disabledFeedback.disabled, true);
  assert.deepEqual(h.snapshot(), before, 'Historical feedback controls must not mutate current feedback');
  assert.equal(before.attempts[0].feedback, null);
  assert.equal(before.attempts[1].feedback, '符合要求');
  assert.equal(before.attempts[1].status, 'review');
});
