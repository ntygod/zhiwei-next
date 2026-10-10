import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  acquireCoordinatorLockV2, CoordinatorLockErrorV2, type CoordinatorLockV2,
} from "./coordinator-lock-v2.ts";

// Ordinary synthetic mutex lifecycle tests only. No backup, replacement,
// private-data, recovery attack, or restricted preintegration diagnostics.
function fixture(t: TestContext) {
  const dataRoot = mkdtempSync(join(tmpdir(), "zhiwei-normal-mutex-v2-"));
  const locks: CoordinatorLockV2[] = [];
  t.after(() => {
    try { for (const lock of locks.reverse()) lock.release(); }
    finally { rmSync(dataRoot, { recursive: true, force: true }); }
  });
  const options = { dataRoot, installationId: "synthetic-installation" };
  return {
    options,
    acquire(): CoordinatorLockV2 {
      const lock = acquireCoordinatorLockV2(options);
      locks.push(lock);
      return lock;
    },
  };
}

function conflict(action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof CoordinatorLockErrorV2);
    assert.equal(error.code, "conflict");
    assert.equal(error.message, "Coordinator lock conflict.");
    return true;
  });
}

function child(options: { dataRoot: string; installationId: string }, expected: "acquired" | "conflict") {
  const moduleUrl = new URL("./coordinator-lock-v2.ts", import.meta.url).href;
  const source = `
    import { acquireCoordinatorLockV2, CoordinatorLockErrorV2 } from ${JSON.stringify(moduleUrl)};
    try {
      acquireCoordinatorLockV2(${JSON.stringify(options)});
      process.stdout.write("acquired");
      // Ordinary process exit, intentionally without calling release().
    } catch (error) {
      if (!(error instanceof CoordinatorLockErrorV2) || error.code !== "conflict") throw error;
      process.stdout.write("conflict");
    }
  `;
  const result = spawnSync(process.execPath,
    ["--experimental-strip-types", "--input-type=module", "--eval", source],
    { encoding: "utf8", timeout: 10_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, expected);
}

test("ordinary mutex acquire, conflict, release and reacquire retain one inode", t => {
  const f = fixture(t);
  const first = f.acquire();
  const path = join(f.options.dataRoot, "coordinator-lock.sqlite");
  const original = lstatSync(path, { bigint: true });
  conflict(() => f.acquire());
  first.release();
  const second = f.acquire();
  const reopened = lstatSync(path, { bigint: true });
  assert.equal(reopened.dev, original.dev);
  assert.equal(reopened.ino, original.ino);
  assert.equal(reopened.nlink, 1n);
  first.release();
  conflict(() => f.acquire());
  second.release();
});

test("ordinary live mutex excludes another process after a failed local acquisition", t => {
  const f = fixture(t);
  const lock = f.acquire();
  conflict(() => f.acquire());
  child(f.options, "conflict");
  conflict(() => f.acquire());
  lock.release();
  child(f.options, "acquired");
  f.acquire().release();
});

test("genuine child process exit releases mutex without deleting its file", t => {
  const f = fixture(t);
  child(f.options, "acquired");
  const path = join(f.options.dataRoot, "coordinator-lock.sqlite");
  const leftByChild = lstatSync(path, { bigint: true });
  const reopened = f.acquire();
  assert.equal(lstatSync(path, { bigint: true }).ino, leftByChild.ino);
  conflict(() => f.acquire());
  reopened.release();
});

test("ordinary distinct synthetic data roots have independent mutexes", t => {
  const first = fixture(t), second = fixture(t);
  first.acquire();
  second.acquire();
  conflict(() => first.acquire());
  conflict(() => second.acquire());
});
