import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createNodeScenarioExecutor } from "./node-executor.ts";
import { SYNTHETIC_FIXTURE, executeLedgerScenario, fixturePorts, verifyLedgerEvidence } from "./ledger-scenarios.ts";
import { openSqliteObservationLedgerV1 } from "../../memory-store/src/index.ts";
import { ScenarioExecutionError } from "./scenario-runner.ts";

async function withWorker(code: string, action: (workerUrl: URL, tempRoot: string, base: string) => Promise<void>): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), "zhiwei-g4-selftest-"));
  const file = join(base, "test-worker.mjs");
  const tempRoot = mkdtempSync(join(base, "runs-"));
  writeFileSync(file, code);
  try { await action(pathToFileURL(file), tempRoot, base); }
  finally { rmSync(base, { recursive: true, force: true }); }
}

test("G-4 timeout kills native-blocked execution, waits for close, and cleans SQLite before returning", async () => {
  await withWorker(`
    import { writeFileSync } from 'node:fs';
    import { dirname, join } from 'node:path';
    import { DatabaseSync } from 'node:sqlite';
    const {filePath} = JSON.parse(process.argv[2]);
    const db = new DatabaseSync(filePath);
    db.exec('CREATE TABLE synthetic(value TEXT)');
    writeFileSync(join(dirname(dirname(filePath)), 'started'), String(process.pid));
    process.send({status: 'passed'});
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    writeFileSync(filePath + '-late', 'must never happen');
  `, async (workerUrl, tempRoot) => {
    const started = Date.now();
    await assert.rejects(createNodeScenarioExecutor({ workerUrl, tempRoot }).execute("E0-02", SYNTHETIC_FIXTURE, 1_000), error => error instanceof ScenarioExecutionError && error.code === "timeout");
    assert.ok(Date.now() - started < 10_000, "timeout must settle after kill, without indefinite native I/O");
    const pid = Number(readFileSync(join(tempRoot, "started"), "utf8"));
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }, "owned process has exited");
    assert.deepEqual(readdirSync(tempRoot), ["started"], "owned database directory removed before return");
    await delay(50);
    assert.deepEqual(readdirSync(tempRoot), ["started"], "no late I/O recreates artifacts");
  });
});

test("G-4 rejects missing output, duplicate output, side-channel output, and failed exit; always cleans", async () => {
  const cases = [
    { code: "process.disconnect();", expected: "invalid-output" },
    { code: "process.send({}); process.send({}); process.disconnect();", expected: "invalid-output" },
    { code: "process.stdout.write('forbidden'); process.disconnect();", expected: "invalid-output" },
    { code: "process.stderr.write('private path must not escape'); process.disconnect();", expected: "invalid-output" },
    { code: "process.exit(9);", expected: "execution" },
    { code: "throw new Error('private error must not escape');", expected: "invalid-output" },
  ];
  for (const item of cases) await withWorker(item.code, async (workerUrl, tempRoot) => {
    await assert.rejects(createNodeScenarioExecutor({ workerUrl, tempRoot }).execute("E0-02", SYNTHETIC_FIXTURE, 5_000), error => {
      assert.ok(error instanceof ScenarioExecutionError);
      assert.equal(error.code, item.expected);
      assert.equal(error.message, item.expected);
      return true;
    });
    assert.deepEqual(readdirSync(tempRoot), []);
  });
});

test("G-4 injected clock, IDs, model and I/O are actually consumed through the public Ledger", () => {
  const base = mkdtempSync(join(tmpdir(), "zhiwei-g4-ports-"));
  const fixture = { now: "2026-03-01T00:00:00.000Z", idPrefix: "injected-synthetic", modelReply: "synthetic-custom-command" };
  const counts = { clock: 0, ids: 0, model: 0, io: 0 };
  const ports = fixturePorts(fixture, { open: options => { counts.io += 1; return openSqliteObservationLedgerV1(options); } });
  try {
    const proof = executeLedgerScenario("E0-02", join(base, "synthetic.sqlite"), {
      ...ports,
      clock: { now: () => { counts.clock += 1; return fixture.now; } },
      ids: { next: label => { counts.ids += 1; return `${fixture.idPrefix}-${label}`; } },
      model: { complete: input => { assert.match(input, /synthetic/); counts.model += 1; return fixture.modelReply; } },
    });
    verifyLedgerEvidence("E0-02", fixture, proof);
    assert.ok(counts.clock >= 4);
    assert.ok(counts.ids >= 7);
    assert.equal(counts.model, 1);
    assert.equal(counts.io, 2);
  } finally { rmSync(base, { recursive: true, force: true }); }
});


test("G-4 sanitizes setup errors and cleans a directory even when process creation fails", async () => {
  await withWorker("", async (_workerUrl, tempRoot) => {
    // fork rejects a non-file URL before executing anything or accessing a network.
    await assert.rejects(createNodeScenarioExecutor({ workerUrl: new URL("https://example.invalid/synthetic"), tempRoot }).execute("E0-02", SYNTHETIC_FIXTURE, 1_000), error => error instanceof ScenarioExecutionError && error.message === "execution");
    assert.deepEqual(readdirSync(tempRoot), []);
    await assert.rejects(createNodeScenarioExecutor({ tempRoot: join(tempRoot, "does-not-exist") }).execute("E0-02", SYNTHETIC_FIXTURE, 1_000), error => error instanceof ScenarioExecutionError && error.message === "execution");
  });
});
