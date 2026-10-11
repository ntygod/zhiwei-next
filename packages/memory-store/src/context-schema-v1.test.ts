import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applyMemoryMigrationsV1, applyContextMigrationsV1, applyDecisionMigrationsV1, configureCognitiveDatabaseV2, verifyMemoryDatabaseV1, verifyContextDatabaseV1, verifyDecisionDatabaseV1 } from "./cognitive-schema-v2.ts";
test("fixed schema5 migrates forward from schema4 and older strict readers reject the new version", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const expectedPragmas = configureCognitiveDatabaseV2(db, { filePath: ":memory:", busyTimeoutMs: 5000 }), clock = { now: () => "2026-10-11T00:00:00.000Z" };
    const previous = applyMemoryMigrationsV1(db, { expectedPragmas, clock }); assert.equal(previous.length, 4);
    const latest = applyContextMigrationsV1(db, { expectedPragmas, clock }); assert.deepEqual(latest.slice(0, 4), previous); assert.equal(latest[4]!.version, 5);
    db.exec("BEGIN"); assert.equal(verifyContextDatabaseV1(db, expectedPragmas).migrations.length, 5); assert.throws(() => verifyMemoryDatabaseV1(db, expectedPragmas)); db.exec("ROLLBACK");
    assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
  } finally { db.close(); }
});
test("fixed schema6 retains the applied schema5 prefix and older strict Context readers reject it", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const expectedPragmas = configureCognitiveDatabaseV2(db, { filePath: ":memory:", busyTimeoutMs: 5000 }), clock = { now: () => "2026-10-11T00:00:00.000Z" };
    const previous = applyContextMigrationsV1(db, { expectedPragmas, clock });
    const latest = applyDecisionMigrationsV1(db, { expectedPragmas, clock }); assert.deepEqual(latest.slice(0, 5), previous); assert.equal(latest[5]!.version, 6);
    db.exec("BEGIN"); assert.equal(verifyDecisionDatabaseV1(db, expectedPragmas).migrations.length, 6); assert.throws(() => verifyContextDatabaseV1(db, expectedPragmas)); db.exec("ROLLBACK");
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 6); assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
  } finally { db.close(); }
});
