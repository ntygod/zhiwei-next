import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import './model.js';
const { initial, transition: apply } = globalThis.WorkbenchDemo;
test('correction creates a new budget revision and stales immutable prior artifact', () => {
  const old = initial(); const next = apply(old, { type: 'correct', revision: 1 });
  assert.equal(old.budget, 100000); assert.equal(old.attempts[0].stale, false);
  assert.equal(next.budget, 80000); assert.equal(next.revision, 2);
  assert.equal(next.attempts[0].budget, 100000); assert.equal(next.attempts[0].stale, true);
  assert.deepEqual(apply(next, { type: 'correct', revision: 1 }), next);
});
test('new attempts use corrected context and never turn execution or feedback into success', () => {
  let s = apply(initial(), { type: 'correct', revision: 1 });
  s = apply(s, { type: 'start' }); assert.equal(s.attempts[1].budget, 80000);
  assert.deepEqual(apply(s, { type: 'start' }), s);
  s = apply(s, { type: 'finish' }); assert.equal(s.attempts[1].status, 'review');
  assert.deepEqual(apply(s, { type: 'finish' }), s);
  s = apply(s, { type: 'feedback', value: '符合要求' }); assert.equal(s.attempts[1].status, 'review');
  assert.deepEqual(apply(s, { type: 'start' }), s);
});
test('interruption preserves history and retry is a distinct attempt', () => {
  let s = apply(apply(initial(), { type: 'correct', revision: 1 }), { type: 'start' });
  s = apply(s, { type: 'stop' }); assert.equal(s.attempts[1].status, 'interrupted');
  assert.deepEqual(apply(s, { type: 'finish' }), s);
  s = apply(s, { type: 'start' }); assert.equal(s.attempts[2].id, 3);
  assert.equal(s.attempts[1].status, 'interrupted');
});
test('blocked snapshots reject writes; model degradation preserves correction', () => {
  for (const value of ['offline','error','permission','loading','conflict','empty']) {
    const s = apply(initial(), { type: 'scenario', value });
    for (const action of [{ type:'correct',revision:1 },{type:'start'},{type:'finish'},{type:'stop'},{type:'feedback',value:'符合要求'}]) assert.deepEqual(apply(s, action), s);
  }
  let s = apply(initial(), { type:'scenario',value:'model' }); s = apply(s, {type:'correct',revision:1});
  assert.equal(s.budget,80000); assert.deepEqual(apply(s,{type:'start'}),s);
});
test('reset discards all demonstration changes', () => {
  const s = apply(apply(initial(),{type:'correct',revision:1}),{type:'start'});
  assert.deepEqual(apply(s,{type:'reset'}),initial());
});
test('prototype has no network or persistence primitives and does not touch product paths', async () => {
  const html = await readFile(new URL('./index.html',import.meta.url),'utf8');
  assert.match(html,/connect-src 'none'/); assert.match(html,/合成演示数据/);
  for(const file of ['app.js','model.js']) { const source = await readFile(new URL(file,import.meta.url),'utf8'); assert.doesNotMatch(source,/\b(fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|sendBeacon)\b/); }
});
