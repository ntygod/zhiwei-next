import assert from "node:assert/strict";
import test from "node:test";
import {
  SyntheticRecoveryErrorV2, parseSyntheticSnapshotManifestV2,
  parseSyntheticActiveGenerationV2,
} from "./synthetic-recovery-v2.ts";

// Pure contract tests only. No snapshot restore, attack reproduction, filesystem
// replacement, or disputed historical diagnostic is executed by this file.
const snapshotId = "20000000-0000-4000-8000-000000000001";
const generationId = "30000000-0000-4000-8000-000000000001";
const bodyPath = "content/objects/40000000-0000-4000-8000-000000000001.1.50000000-0000-4000-8000-000000000001.body";
const digest = "a".repeat(64);
const state = { installationId: "synthetic-installation", schemaVersion: 2,
  controlSequence: 4, controlChecksum: digest, recoveryEpoch: 1 };
function manifest(): Record<string, unknown> {
  return { ...state, format: "synthetic-cognitive-snapshot-v2", snapshotId, revision: 1,
    entries: [{ path: bodyPath, digest, byteCount: 4 }, { path: "product.sqlite", digest, byteCount: 4096 }] };
}
function initialActivation(): Record<string, unknown> {
  return { ...state, format: "synthetic-active-generation-v2", generationId, generation: 1,
    previousGenerationId: null, snapshotId: null, snapshotManifestDigest: null,
    operationId: null, activatedAt: "2026-10-10T10:00:00.000Z" };
}
function validation(body: () => unknown): void {
  assert.throws(body, error => error instanceof SyntheticRecoveryErrorV2
    && error.code === "validation" && error.message === "Synthetic recovery validation.");
}

test("synthetic snapshot parser accepts the exact bounded versioned inventory", () => {
  const source = manifest(), parsed = parseSyntheticSnapshotManifestV2(source);
  assert.deepEqual(parsed, source);
  (source.entries as { byteCount: number }[])[0].byteCount = 20;
  assert.equal(parsed.entries[0].byteCount, 4);
});

test("synthetic snapshot parser rejects unknown fields and self-reported acceptance", () => {
  for (const extra of [{ accepted: true }, { authorized: true }, { proof: { verified: true } }, { formatVersion: 2 }]) {
    validation(() => parseSyntheticSnapshotManifestV2({ ...manifest(), ...extra }));
  }
  validation(() => parseSyntheticSnapshotManifestV2({ ...manifest(), revision: 2 }));
  validation(() => parseSyntheticSnapshotManifestV2({ ...manifest(), schemaVersion: 3 }));
  validation(() => parseSyntheticSnapshotManifestV2({ ...manifest(), recoveryEpoch: 5 }));
});

test("synthetic snapshot parser only permits opaque product and object paths", () => {
  for (const path of ["../product.sqlite", "/product.sqlite", "content/staging/entry.body",
    "content/objects/../entry.body", "control-root/recovery.log", "product.sqlite-wal", "manifest.json",
    bodyPath.replace(".1.", ".01."), bodyPath.replace(".1.", ".9007199254740992.")]) {
    validation(() => parseSyntheticSnapshotManifestV2({ ...manifest(), entries: [{ path, digest, byteCount: 4 }] }));
  }
});

test("synthetic snapshot parser enforces complete unique sorted bounded entries", () => {
  const database = { path: "product.sqlite", digest, byteCount: 4096 };
  const content = { path: bodyPath, digest, byteCount: 4 };
  for (const entries of [[], [content], [database, database], [database, content],
    [{ ...database, byteCount: 0 }], [{ ...database, byteCount: 256 * 1024 * 1024 + 1 }],
    [{ ...content, byteCount: 20 * 1024 * 1024 + 1 }, database],
    [{ ...database, digest: "untrusted" }], [{ ...database, byteCount: -1 }],
    [{ ...database, byteCount: 0.5 }], [{ ...database, ignored: true }]]) {
    validation(() => parseSyntheticSnapshotManifestV2({ ...manifest(), entries }));
  }
});

test("pure snapshot parser never invokes accessors or accepts sparse inventories", () => {
  const accessor = manifest(); let called = false;
  Object.defineProperty(accessor, "snapshotId", { enumerable: true, get() { called = true; return snapshotId; } });
  validation(() => parseSyntheticSnapshotManifestV2(accessor)); assert.equal(called, false);
  const entries = [{ path: "product.sqlite", digest, byteCount: 4096 }]; entries.length = 2;
  validation(() => parseSyntheticSnapshotManifestV2({ ...manifest(), entries }));
  const symbol = manifest(); Object.defineProperty(symbol, Symbol("hidden"), { value: true });
  validation(() => parseSyntheticSnapshotManifestV2(symbol));
});

test("pure activation contract binds initial selection and exact restored provenance", () => {
  assert.deepEqual(parseSyntheticActiveGenerationV2(initialActivation()), initialActivation());
  const restored = { ...initialActivation(), generation: 2,
    previousGenerationId: "30000000-0000-4000-8000-000000000002", snapshotId,
    snapshotManifestDigest: digest, operationId: "synthetic-restore-operation" };
  assert.deepEqual(parseSyntheticActiveGenerationV2(restored), restored);
  for (const invalid of [{ ...restored, previousGenerationId: generationId },
    { ...restored, operationId: null }, { ...restored, recoveryEpoch: 0 },
    { ...initialActivation(), snapshotId }, { ...restored, accepted: true }]) {
    validation(() => parseSyntheticActiveGenerationV2(invalid));
  }
});
