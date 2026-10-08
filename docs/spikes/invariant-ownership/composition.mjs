// Fixed synthetic experiment, not a Provider registry or a product entry point.
import assert from "node:assert/strict";
import { normalizePiRuntimeEventV1 } from "../../../packages/pi-adapter/src/index.ts";
import { openSqliteObservationLedgerV1 } from "../../../packages/memory-store/src/index.ts";
import { exactKeys, validateCatalog } from "./catalog-check.mjs";

export function syntheticDeclaration() {
  return { providers: [{ id: "synthetic-pi-input", capabilities: ["pi-event-input-v1"], coreValidation: "required" }] };
}
export function validateDeclaration(declaration) {
  exactKeys(declaration, ["providers"]);
  assert.ok(Array.isArray(declaration.providers) && declaration.providers.length > 0, "Providers required");
  const providers = new Set();
  const capabilities = new Set();
  for (const provider of declaration.providers) {
    exactKeys(provider, ["id", "capabilities", "coreValidation"]);
    assert.ok(typeof provider.id === "string" && provider.id.length > 0, "Provider ID required");
    assert.ok(!providers.has(provider.id), "Duplicate provider ID");
    providers.add(provider.id);
    assert.equal(provider.coreValidation, "required", "Provider cannot disable core validation");
    assert.ok(Array.isArray(provider.capabilities) && provider.capabilities.length > 0, "Capabilities required");
    for (const capability of provider.capabilities) {
      assert.ok(typeof capability === "string" && capability.length > 0, "Capability ID required");
      assert.ok(!capabilities.has(capability), "Duplicate capability ID");
      capabilities.add(capability);
    }
  }
  assert.deepEqual([...providers], ["synthetic-pi-input"], "Only the fixed synthetic provider is supported");
  assert.deepEqual([...capabilities], ["pi-event-input-v1"], "Only the fixed synthetic capability is supported");
}
export function syntheticInput(sourceSequence = 1) {
  return {
    workspaceId: "synthetic-workspace", runtimeSessionId: "synthetic-session",
    runtimeInstanceId: "synthetic-worker", runtimeVersion: "0.84.1", surface: "rpc",
    sequenceDomain: "synthetic-rpc-output", sourceSequence, sourceEventType: "response",
    observedAt: "2026-10-08T00:00:00.000Z", provenance: "observed",
    correlation: { observed: { requestId: `synthetic-request-${sourceSequence}` },
      normalized: { rpcRequestId: `synthetic-rpc-${sourceSequence}` } },
    event: { type: "command_response", command: "get_state", success: true },
  };
}
export function runSyntheticComposition({ catalog, declaration, inputs, filePath }) {
  // Reject declarations before opening the database or processing provider data.
  // Catalog source-reference checking itself reads repository files.
  validateDeclaration(declaration);
  const ids = validateCatalog(catalog);
  for (const id of ["I-PI-PROJECTION", "I-EVENT-SHAPE", "I-LEDGER-IDENTITY", "I-LEDGER-SCHEMA"]) {
    assert.ok(ids.has(id), `Fixed experiment requires ${id}`);
  }
  const events = inputs.map((input) => normalizePiRuntimeEventV1(input));
  const ledger = openSqliteObservationLedgerV1({ filePath,
    clock: { now: () => "2026-10-08T00:00:00.000Z" } });
  try {
    const result = ledger.appendBatch(events);
    return { result, rows: ledger.readWorkspace("synthetic-workspace"),
      integrity: ledger.integrityCheck(), journalMode: ledger.journalMode };
  } finally {
    ledger.close();
  }
}
