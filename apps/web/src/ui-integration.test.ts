import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { WorkbenchApp } from "./app.ts";
import { WorkbenchController } from "./controller.ts";
import { createSyntheticTaskSessionHarness } from "../../daemon/src/task-service/synthetic-harness.ts";
import { syntheticTaskPrompt } from "../../daemon/src/task-service/application.ts";
import { createSyntheticWorkerTestPackage } from "../../daemon/src/runtime/controlled-worker-test-fixture.ts";
import { parseWorkbenchContextV1, parseSyntheticWorkbenchPairingV1 } from "../../../packages/protocol/src/index.ts";

const context = { principalId: "synthetic-principal-a", workspaceId: "synthetic-workspace-a" };
const assets = { html: '<!doctype html><div id="root"></div>', javascript: '"use strict";', stylesheet: ":root{color-scheme:dark light}" };
function cookiePort(origin: string) {
  let cookie = ""; const sent: { path: string; body?: string }[] = []; let hook: ((path: string, response: Response) => Promise<Response>) | undefined;
  const port: typeof fetch = async (input, init) => {
    const path = String(input), headers = new Headers(init?.headers); assert.ok(path.startsWith("/")); headers.set("origin", origin); headers.set("sec-fetch-site", "same-origin"); if (cookie) headers.set("cookie", cookie);
    sent.push({ path, ...(typeof init?.body === "string" ? { body: init.body } : {}) }); const response = await fetch(origin + path, { ...init, headers });
    const next = response.headers.get("set-cookie"); if (next) cookie = next.split(";")[0]!; return hook ? hook(path, response) : response;
  };
  return { port, sent, hook(value?: typeof hook) { hook = value; } };
}
test("Owned shell has a fixed CSP/asset list and initialization cannot choose identity or Workspace", async t => {
  const harness = await createSyntheticTaskSessionHarness({ webAssets: assets }); t.after(() => harness.close()); const origin = await harness.api.listen();
  const page = await fetch(origin + "/"); assert.equal(page.status, 200); assert.match(page.headers.get("content-security-policy")!, /script-src 'self'/); assert.equal(page.headers.get("cache-control"), "no-store"); assert.equal(await page.text(), assets.html);
  assert.equal((await fetch(origin + "/assets/workbench.js")).status, 200); assert.equal((await fetch(origin + "/assets/workbench.css")).status, 200); assert.equal((await fetch(origin + "/other.js")).status, 404);
  assert.equal((await fetch(origin + "/?bootstrapCode=SYNTHETIC_ONLY")).status, 400);
  assert.equal((await fetch(origin + "/__synthetic__/pairing", { method: "POST", headers: { origin: "http://127.0.0.1:1", "sec-fetch-site": "cross-site", "content-type": "application/json" }, body: '{"schemaVersion":1}' })).status, 403);
  assert.equal((await fetch(origin + "/__synthetic__/pairing", { method: "POST", headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify({ schemaVersion: 1, workspaceId: "synthetic-workspace-b" }) })).status, 400);
  assert.throws(() => parseSyntheticWorkbenchPairingV1({ schemaVersion: 1, mode: "synthetic-fixtures-only", workspaceId: context.workspaceId, bootstrapCode: "x".repeat(43), principalId: "wrong" }));
  const ordinary = await createSyntheticTaskSessionHarness(); t.after(() => ordinary.close()); assert.equal((await fetch(await ordinary.api.listen())).status, 401);
});
test("Actual context/task/correction versions render in DOM; dialogs keep focus and stale bodies are removed", async t => {
  const harness = await createSyntheticTaskSessionHarness({ webAssets: assets }); const origin = await harness.api.listen(), port = cookiePort(origin);
  const controller = new WorkbenchController({ origin, fetch: port.port, id: randomUUID, nonce: () => "n".repeat(43), clearFragment() {} });
  const dom = new JSDOM('<!doctype html><html><body><button id="trigger">打开</button><div id="root"></div></body></html>', { url: origin });
  const globals = ["window", "document", "HTMLElement", "Node", "Event", "KeyboardEvent", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const before = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key as keyof typeof dom.window] });
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.getElementById("root")!, root = createRoot(container);
  t.after(async () => { await act(async () => { controller.close(); root.unmount(); }); await harness.close(); dom.window.close(); for (const key of globals) { const descriptor = before.get(key); if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  await act(async () => { root.render(createElement(WorkbenchApp, { controller })); }); assert.match(container.textContent!, /进入开发样例/); assert.ok(container.querySelector(".sidebar")); assert.ok(container.querySelector(".bottom-nav"));
  await act(async () => { await controller.connect(); }); assert.equal(controller.view!.connection, "connected"); assert.equal(controller.view!.context!.workspaceId, context.workspaceId); assert.throws(() => parseWorkbenchContextV1({ ...controller.view!.context, accountSecret: "SYNTHETIC_ONLY" }));
  await act(async () => { await controller.createTask(syntheticTaskPrompt, "我确认固定样例结果"); }); assert.equal(controller.view!.task!.value.state, "READY"); assert.equal(harness.application.snapshot(context).tasks.length, 1); assert.match(container.textContent!, /我确认固定样例结果/);
  await act(async () => { await controller.taskCommand("task.cancel"); }); assert.equal(controller.view!.task!.value.state, "CANCELLED"); await act(async () => { await controller.taskCommand("task.continue"); }); assert.equal(controller.view!.task!.value.attempts.length, 2);
  await act(async () => { await controller.go("memory"); controller.newMemory(); await controller.saveMemory("SYNTHETIC_ONLY：虚构灯塔的报告是紫色。"); }); const first = controller.view!.memory!.material[0]!.claim; assert.equal(first.version, 1); assert.equal(first.privacy, "local-only");
  const trigger = dom.window.document.getElementById("trigger")! as HTMLElement; trigger.focus(); await act(async () => { await controller.memoryDetail(first.id, "memory-edit"); });
  const editor = container.querySelector("textarea")!; assert.equal(editor.value.includes("紫色"), true); const close = container.querySelector<HTMLButtonElement>('[aria-label="关闭"]')!, save = container.querySelector<HTMLButtonElement>(".modal .button.primary")!;
  close.focus(); close.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })); assert.equal(dom.window.document.activeElement, save);
  await act(async () => { editor.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); }); assert.equal(container.querySelector('[role="dialog"]'), null); assert.equal(dom.window.document.activeElement, trigger);
  await act(async () => { await controller.memoryDetail(first.id, "memory-edit"); await controller.saveMemory('SYNTHETIC_ONLY：虚构灯塔的报告是琥珀色。<img src=x onerror="alert(1)"><script>alert(1)</script>'); }); const second = controller.view!.memory!.material[0]!.claim; assert.equal(second.version, 2); assert.equal(harness.memories.explain(context, second.scope, second.id).versions.some(version => version.version === 1 && version.status === "SUPERSEDED"), true);
  assert.match(container.textContent!, /<img src=x/); assert.equal(container.querySelector("script, img"), null); // React text sinks, not a claim of browser CSP execution testing.
  await act(async () => { await controller.memoryDetail(second.id, "memory-edit"); controller.client!.disconnect(); }); assert.equal(container.querySelector('[role="dialog"]'), null); assert.equal(container.textContent!.includes("琥珀色"), false);
  await act(async () => { await controller.recover(); await controller.search("灯塔"); await controller.memoryDetail(second.id, "forget"); await controller.forget(); }); assert.equal(controller.view!.write.status, "confirmed"); assert.equal(harness.memories.explain(context, second.scope, second.id).value, undefined);
  await act(async () => { controller.client!.selectWorkspace("synthetic-workspace-b"); }); assert.equal(controller.view!.connection, "permission"); assert.match(container.textContent!, /进入开发样例/); assert.equal(container.querySelector('[role="dialog"]'), null);
});
test("Lost input acknowledgement stays unknown and only the explicit original bytes are retried", async t => {
  const harness = await createSyntheticTaskSessionHarness({ webAssets: assets }); t.after(() => harness.close()); const origin = await harness.api.listen(), port = cookiePort(origin);
  const controller = new WorkbenchController({ origin, fetch: port.port, id: randomUUID, nonce: () => "n".repeat(43), clearFragment() {} }); t.after(() => controller.close()); await controller.connect();
  let dropped = false; port.hook(async (path, response) => { if (path === "/v1/memory/inputs" && !dropped) { dropped = true; await response.arrayBuffer(); throw new TypeError("Synthetic lost response"); } return response; });
  controller.newMemory(); await controller.saveMemory("SYNTHETIC_ONLY：虚构输入待核对。"); assert.equal(controller.view!.write.status, "unknown"); assert.equal(controller.view!.write.canRetry, true); assert.equal(port.sent.filter(row => row.path === "/v1/memory/inputs").length, 1);
  await controller.retryUnknown(); assert.equal(controller.view!.write.status, "received"); const sent = port.sent.filter(row => row.path === "/v1/memory/inputs"); assert.equal(sent.length, 2); assert.equal(sent[0]!.body, sent[1]!.body); assert.equal(controller.view!.evidence!.replay, true);
});

test("UI-created plan starts the owned Worker and verification/feedback retain actual result history", async t => {
  const runtime = await createSyntheticWorkerTestPackage(), harness = await createSyntheticTaskSessionHarness({ webAssets: assets, runtime: { packageDirectory: runtime.root, nodeExecutable: process.execPath } });
  t.after(async () => { await harness.close(); await runtime.remove(); }); const origin = await harness.api.listen(), port = cookiePort(origin);
  const controller = new WorkbenchController({ origin, fetch: port.port, id: randomUUID, nonce: () => "n".repeat(43), clearFragment() {} }); t.after(() => controller.close());
  await controller.connect(); await controller.createTask(syntheticTaskPrompt, "我确认固定样例结果");
  await harness.idle(); const taskId = harness.application.snapshot(context).tasks[0]!.id;
  assert.equal(harness.application.getTask(context, taskId).value.state, "VERIFYING"); assert.ok(harness.evidence(context, taskId).execution!.closed);
  await controller.go("task", taskId); assert.equal(controller.view!.task!.value.state, "VERIFYING"); await controller.verify(); assert.equal(controller.view!.write.status, "confirmed");
  const first = controller.view!.result!.value; assert.equal(first.outcome.status, "unverifiable"); const criterion = first.task.intent.criteria[0]!;
  await controller.feedback(criterion.id, criterion.revision, "accepted"); assert.equal(controller.view!.result!.value.outcome.status, "completed");
  assert.equal(controller.view!.resultHistory!.value.length, 2); assert.equal(controller.view!.result!.value.task.state, "UNVERIFIABLE");
});
