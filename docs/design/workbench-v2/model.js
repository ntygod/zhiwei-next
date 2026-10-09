/* Explanatory prototype only. No product domain or persistence implementation. */
(function (root) {
  'use strict';
  const initial = () => ({ revision: 1, budget: 100000, previousBudget: null, attempts: [{ id: 1, budget: 100000, status: 'review', stale: false }], scenario: 'normal', feedback: null, log: ['演示任务已载入；方案等待核验。'] });
  function transition(state, action) {
    const next = JSON.parse(JSON.stringify(state));
    const current = next.attempts.at(-1);
    const blocked = ['offline', 'error', 'permission', 'loading', 'conflict', 'empty'].includes(next.scenario);
    switch (action.type) {
      case 'scenario': next.scenario = action.value; break;
      case 'correct':
        if (blocked || action.revision !== next.revision || next.budget === 80000) return state;
        next.previousBudget = next.budget; next.budget = 80000; next.revision++;
        next.attempts.forEach(a => { a.stale = true; if (a.status === 'running') a.status = 'interrupted'; });
        next.feedback = null; next.log.push('预算演示版本 2：8万元；旧版本被替代，相关产物标为陈旧。'); break;
      case 'start':
        if (blocked || next.scenario === 'model' || current?.status === 'running' || (current && !current.stale && current.status !== 'interrupted')) return state;
        next.attempts.push({ id: (current?.id || 0) + 1, budget: next.budget, status: 'running', stale: false });
        next.feedback = null; next.log.push('开启新的演示尝试；使用当前预算，尚未生成结果。'); break;
      case 'finish':
        if (blocked || !current || current.status !== 'running' || current.stale) return state;
        current.status = 'review'; next.log.push('演示执行结束；供应商报价和场地档期仍缺证据，结果待核验。'); break;
      case 'stop':
        if (blocked || !current || current.status !== 'running') return state;
        current.status = 'interrupted'; next.log.push('演示尝试已中断；未产生已验证结果。'); break;
      case 'feedback':
        if (blocked || !current || current.stale || current.status !== 'review') return state;
        next.feedback = action.value; break;
      case 'reset': return initial();
      default: return state;
    }
    return next;
  }
  root.WorkbenchDemo = { initial, transition };
})(globalThis);
