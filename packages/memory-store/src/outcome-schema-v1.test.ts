import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applyDecisionMigrationsV1, applyOutcomeMigrationsV1, configureCognitiveDatabaseV2, verifyDecisionDatabaseV1, verifyOutcomeDatabaseV1 } from "./cognitive-schema-v2.ts";
test("schema7 migrates a real WAL database forward, retains the exact schema6 history and rejects the old strict reader", t => {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-outcome-migration-")), filePath = join(root, "product.sqlite"), clock = { now: () => "2026-10-12T00:00:00.000Z" };
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const db = new DatabaseSync(filePath);
  try {
    const expectedPragmas = configureCognitiveDatabaseV2(db, { filePath, busyTimeoutMs: 5000 }), previous = applyDecisionMigrationsV1(db, { clock, expectedPragmas });
    const latest = applyOutcomeMigrationsV1(db, { clock, expectedPragmas }); assert.deepEqual(latest.slice(0, 6), previous); assert.equal(latest[6]!.version, 7);
    db.exec("BEGIN"); assert.equal(verifyOutcomeDatabaseV1(db, expectedPragmas).migrations.length, 7); assert.throws(() => verifyDecisionDatabaseV1(db, expectedPragmas)); db.exec("ROLLBACK");
    assert.equal(db.prepare("PRAGMA journal_mode").get()!.journal_mode, "wal"); assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
  } finally { db.close(); }
  const reopened = new DatabaseSync(filePath); try {
    const expectedPragmas = configureCognitiveDatabaseV2(reopened, { filePath, busyTimeoutMs: 5000 }); reopened.exec("BEGIN");
    assert.equal(verifyOutcomeDatabaseV1(reopened, expectedPragmas).migrations.length, 7); reopened.exec("ROLLBACK");
    assert.equal(reopened.prepare("PRAGMA user_version").get()!.user_version, 7);
  } finally { reopened.close(); }
});
