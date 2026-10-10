import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  initializeRecoveryJournalV2,
  openRecoveryJournalV2,
  parseRecoveryControlIntentV2,
  RecoveryJournalErrorV2,
  type RecoveryControlIntentV2,
  type RecoveryControlTargetV2,
} from "./recovery-journal-v2.ts";

const at = "2026-10-10T09:00:00.000Z";
const scope = { kind: "workspace", workspaceId: "workspace-synthetic" } as const;
const target: RecoveryControlTargetV2 = { kind: "scope", scope };
function forget(operationId = "operation-forget"): Extract<RecoveryControlIntentV2, { kind: "FORGET" }> {
  return { kind: "FORGET", operationId, at, authorization: "synthetic-user-request", targets: [target] };
}
function fixture(run: (options: { controlRoot: string; installationId: string }) => void): void {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-control-journal-synthetic-"));
  try { run({ controlRoot: join(root, "control"), installationId: "installation-synthetic" }); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
function invalid(input: unknown): void {
  assert.throws(() => parseRecoveryControlIntentV2(input), (error: unknown) => {
    assert.ok(error instanceof RecoveryJournalErrorV2);
    assert.equal(error.code, "validation");
    assert.equal(error.message, "Recovery journal validation.");
    assert.equal(error.cause, undefined);
    return true;
  });
}

test("new synthetic control root durably appends, reopens and exactly replays an operation", () => {
  fixture(options => {
    const journal = initializeRecoveryJournalV2(options);
    const empty = journal.read();
    assert.equal(empty.head.controlSequence, 0);
    assert.equal(empty.recoveryEpoch, 0);
    assert.equal(empty.recoveryRequired, false);
    assert.equal(empty.records.length, 0);
    assert.equal(empty.installationId, options.installationId);
    const record = journal.append(forget());
    assert.equal(record.controlSequence, 1);
    assert.equal(record.previousChecksum, empty.head.checksum);
    assert.equal(record.recoveryEpoch, 0);
    const reopened = openRecoveryJournalV2(options);
    assert.deepEqual(reopened.read().records, [record]);
    assert.deepEqual(reopened.append(forget()), record);
    assert.equal(reopened.read().head.controlSequence, 1);
    assert.equal(readFileSync(join(options.controlRoot, "recovery.log"), "utf8").split("\n").length, 2);
    assert.equal(JSON.parse(readFileSync(join(options.controlRoot, "recovery.head"), "utf8")).checksum, record.checksum);
  });
});

test("all fixed control kinds persist with versioned targets and monotonically increasing restore epochs", () => {
  fixture(options => {
    const journal = initializeRecoveryJournalV2(options);
    const allTargets: readonly RecoveryControlTargetV2[] = [
      target,
      { kind: "content", scope, contentId: "content-synthetic", contentVersion: 2 },
      { kind: "claim", scope, id: "claim-synthetic", version: 3 },
      { kind: "observation", scope, id: "observation-synthetic" },
    ];
    const intents: RecoveryControlIntentV2[] = [
      { ...forget(), targets: allTargets },
      { kind: "SOURCE_SUPPRESS", operationId: "operation-suppress", at, authorization: "synthetic-user-request", scope, bindingId: "binding-synthetic", resourceId: "resource-synthetic" },
      { kind: "PRIVACY_RESTRICT", operationId: "operation-privacy", at, authorization: "synthetic-user-request", targets: [target], privacy: "local-only" },
      { kind: "RETENTION_SHORTEN", operationId: "operation-retention", at, authorization: "synthetic-retention-policy", targets: [target], retentionUntil: "2026-10-11T00:00:00.000Z" },
      { kind: "RESTORE_BEGIN", operationId: "operation-restore-1", at, authorization: "synthetic-recovery-request", expectedRecoveryEpoch: 0 },
      { kind: "RESTORE_BEGIN", operationId: "operation-restore-2", at, authorization: "synthetic-recovery-request", expectedRecoveryEpoch: 1 },
      forget("operation-forget-after-restore"),
    ];
    const records = intents.map(intent => journal.append(intent));
    assert.deepEqual(journal.append(intents[4]), records[4]);
    assert.deepEqual(records.map(record => record.controlSequence), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(records.map(record => record.recoveryEpoch), [0, 0, 0, 0, 1, 2, 2]);
    for (let index = 1; index < records.length; index += 1) assert.equal(records[index].previousChecksum, records[index - 1].checksum);
    const state = openRecoveryJournalV2(options).read();
    assert.deepEqual(state.records, records);
    assert.equal(state.recoveryRequired, false);
    assert.equal(state.recoveryEpoch, 2);
    assert.equal(state.head.recoveryEpoch, 2);
    assert.equal(JSON.parse(readFileSync(join(options.controlRoot, "installation.json"), "utf8")).recoveryEpoch, 2);
  });
});

test("a retained handle reads the current durable chain after another legitimate handle appends", () => {
  fixture(options => {
    const first = initializeRecoveryJournalV2(options);
    const second = openRecoveryJournalV2(options);
    const one = second.append(forget("operation-one"));
    assert.equal(first.read().head.checksum, one.checksum);
    const two = first.append(forget("operation-two"));
    assert.equal(two.controlSequence, 2);
    assert.equal(two.previousChecksum, one.checksum);
    assert.equal(second.read().head.checksum, two.checksum);
    const state = first.read();
    assert.deepEqual(first.reconcileDurableHead({ expectedSequence: state.durableTail.controlSequence, expectedChecksum: state.durableTail.checksum, at }), state);
  });
});

test("pure control parser accepts each controlled scope and returns an independent value", () => {
  const scopes = [
    { kind: "global" }, scope,
    { kind: "task", workspaceId: "workspace-synthetic", taskId: "task-synthetic" },
    { kind: "session", workspaceId: "workspace-synthetic", sessionId: "session-synthetic" },
  ];
  for (const current of scopes) {
    const input = { ...forget(), targets: [{ kind: "scope", scope: current }] };
    const parsed = parseRecoveryControlIntentV2(input);
    if (parsed.kind !== "FORGET") assert.fail("Expected a FORGET intent.");
    assert.notEqual(parsed.targets, input.targets);
    assert.notEqual(parsed, input);
    assert.deepEqual(parsed, input);
  }
});

test("pure control parser rejects free payloads, paths, content fingerprints and unknown fields", () => {
  for (const key of ["body", "path", "contentHash", "summary", "token", "reason", "unknown"]) {
    invalid({ ...forget(), [key]: "synthetic-private-value" });
  }
  invalid({ ...forget(), operationId: "/synthetic/private/path" });
  invalid({ ...forget(), operationId: "a".repeat(257) });
  invalid({ ...forget(), targets: [{ kind: "content", scope, contentId: "content-synthetic", contentVersion: 1, digest: "a".repeat(64) }] });
  invalid({ ...forget(), targets: [{ kind: "scope", scope: { ...scope, path: "/synthetic/private/path" } }] });
  invalid({ ...forget(), kind: "UNKNOWN" });
  invalid({ ...forget(), authorization: "user-request" });
  invalid({ ...forget(), authorization: true });
});

test("pure control parser rejects malformed versions, times, ambiguous targets and oversized batches", () => {
  invalid({ ...forget(), targets: [] });
  invalid({ ...forget(), targets: [target, target] });
  invalid({ ...forget(), targets: Array.from({ length: 65 }, (_, index) => ({ kind: "observation", scope, id: `observation-${index}` })) });
  invalid({ ...forget(), targets: [{ kind: "claim", scope, id: "claim-synthetic" }] });
  invalid({ ...forget(), targets: [{ kind: "claim", scope, id: "claim-synthetic", version: 0 }] });
  invalid({ ...forget(), targets: [{ kind: "content", scope, contentId: "content-synthetic", contentVersion: 1.5 }] });
  invalid({ ...forget(), targets: [{ kind: "observation", scope, id: "observation-synthetic", version: 1 }] });
  invalid({ ...forget(), at: "2026-02-30T00:00:00.000Z" });
  invalid({ ...forget(), at: "2026-10-10T09:00:00Z" });
  const sparse = new Array(1);
  invalid({ ...forget(), targets: sparse });
  const extra = [target];
  Object.defineProperty(extra, "additional", { value: "synthetic" });
  invalid({ ...forget(), targets: extra });
});

test("pure control parser rejects permission widening and mismatched authorization categories", () => {
  const base = { operationId: "operation-synthetic", at };
  invalid({ ...base, kind: "PRIVACY_RESTRICT", authorization: "synthetic-user-request", targets: [target], privacy: "model-allowed" });
  invalid({ ...base, kind: "PRIVACY_RESTRICT", authorization: "synthetic-retention-policy", targets: [target], privacy: "local-only" });
  invalid({ ...base, kind: "RESTORE_BEGIN", authorization: "synthetic-user-request", expectedRecoveryEpoch: 0 });
  invalid({ ...base, kind: "RESTORE_BEGIN", authorization: "synthetic-recovery-request", expectedRecoveryEpoch: Number.MAX_SAFE_INTEGER });
  invalid({ ...base, kind: "RESTORE_BEGIN", authorization: "synthetic-recovery-request", expectedRecoveryEpoch: -1 });
  invalid({ ...forget(), authorization: "synthetic-recovery-request" });
  invalid({ ...base, kind: "RETENTION_SHORTEN", authorization: "synthetic-user-request", targets: [target], retentionUntil: "invalid" });
});

test("pure control parser never invokes input accessors", () => {
  let invoked = false;
  const input = { ...forget() };
  Object.defineProperty(input, "operationId", { enumerable: true, get: () => { invoked = true; return "operation-synthetic"; } });
  invalid(input);
  assert.equal(invoked, false);
  const accessorTargets: unknown[] = [];
  Object.defineProperty(accessorTargets, "0", { enumerable: true, get: () => { invoked = true; return target; } });
  invalid({ ...forget(), targets: accessorTargets });
  assert.equal(invoked, false);
});

// Deliberately not represented as passing evidence: crash/log-ahead and corrupt-control-state
// dynamic diagnostics, private replacement/rebuild, and old-backup attack reproductions were
// not run. Those require a separately permitted R3 validation scope; this file uses only
// normal synthetic temporary-fixture operations and pure contract-validation negatives.
