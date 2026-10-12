import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createSyntheticTaskSessionHarness } from "./task-service/synthetic-harness.ts";
import { createSyntheticWorkerTestPackage } from "./runtime/controlled-worker-test-fixture.ts";

/** Owns new temporary fixtures only. No user root, credential, model or activation argument. */
export async function createOwnedWorkbenchPreview() {
  if (process.versions.node !== "22.23.1") throw new Error("Use the formal Node 22.23.1 runtime.");
  const built = new URL("../../web/dist/", import.meta.url);
  const [html, javascript, stylesheet] = await Promise.all(["index.html", "assets/workbench.js", "assets/workbench.css"].map(file => readFile(new URL(file, built), "utf8")));
  const worker = await createSyntheticWorkerTestPackage();
  try {
    const harness = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: worker.root, nodeExecutable: process.execPath }, webAssets: { html: html!, javascript: javascript!, stylesheet: stylesheet! } });
    try {
      const origin = await harness.api.listen(); let closing: Promise<void> | undefined, closed = false;
      return { origin, async close() {
        if (closed) return;
        closing ??= harness.close().then(() => worker.remove()).then(() => { closed = true; });
        const pending = closing;
        try { await pending; } finally { if (closing === pending) closing = undefined; }
      } };
    } catch (error) { await harness.close(); throw error; }
  } catch (error) { await worker.remove(); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error("This preview accepts no arguments.");
  const preview = await createOwnedWorkbenchPreview();
  console.log(`知微开发样例：${preview.origin}/`); // Public origin only; no pairing secret.
  console.log("仅虚构临时资料与固定样例执行器；退出后清除，不连接个人数据或真实模型。");
  const stop = () => { void preview.close().then(() => { process.exitCode = 0; }, () => { process.exitCode = 1; }); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}
