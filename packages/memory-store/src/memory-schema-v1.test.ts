import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { scopeKeyV2 } from "../../domain/src/index.ts";
import { canonicalJsonV1 } from "../../protocol/src/index.ts";
import { configureCognitiveDatabaseV2, applyTaskMigrationsV1, verifyTaskDatabaseV1 } from "./cognitive-schema-v2.ts";
import { ContentFilesV2 } from "./content-files-v2.ts";
import { initializeRecoveryJournalV2 } from "./recovery-journal-v2.ts";
import { openSyntheticCognitionStoreV2 } from "./index.ts";
import { cognitiveRecoveryPortV2 } from "./cognitive-recovery-port-v2.ts";

test("A real schema3 installation migrates forward to current schema7 with its scope and control state retained", () => {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-memory-migration-")), dataRoot = join(root, "data"), controlRoot = join(root, "control"); mkdirSync(dataRoot);
  const clock = { now: () => "2026-10-11T00:00:00.000Z" }, installationId = "synthetic-schema4", filePath = join(dataRoot, "product.sqlite");
  const scope = { kind: "workspace" as const, workspaceId: "synthetic-migration-workspace" };
  try {
    const journal = initializeRecoveryJournalV2({ controlRoot, installationId });
    mkdirSync(join(dataRoot, "content")); ContentFilesV2.open({ contentRoot: join(dataRoot, "content"), initialize: true });
    const old = new DatabaseSync(filePath);
    try {
      const pragmas = configureCognitiveDatabaseV2(old, { filePath, busyTimeoutMs: 5000 }); applyTaskMigrationsV1(old, { clock, expectedPragmas: pragmas });
      old.prepare("INSERT INTO store_state VALUES(1,?,0,?,0)").run(installationId, journal.read().head.checksum);
      old.prepare("INSERT INTO scope_catalog VALUES(?,?,0,0)").run(scopeKeyV2(scope), canonicalJsonV1(scope));
      assert.equal(old.prepare("PRAGMA user_version").get()!.user_version, 3);
    } finally { old.close(); }
    const store = openSyntheticCognitionStoreV2({ dataRoot, controlRoot, installationId, mode: "open", clock });
    try { assert.equal(store.currentFence(scope).cognitionEpoch, 0); assert.deepEqual(store.listObservations(scope), []);
      assert.equal(store[cognitiveRecoveryPortV2].verifyRecoveryBoundary().schemaVersion, 7); } finally { store.close(); }
    const upgraded = new DatabaseSync(filePath);
    try {
      const pragmas = configureCognitiveDatabaseV2(upgraded, { filePath, busyTimeoutMs: 5000 });
      assert.equal(upgraded.prepare("PRAGMA user_version").get()!.user_version, 7);
      assert.equal(upgraded.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
      upgraded.exec("BEGIN"); assert.throws(() => verifyTaskDatabaseV1(upgraded, pragmas)); upgraded.exec("ROLLBACK");
    } finally { upgraded.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
