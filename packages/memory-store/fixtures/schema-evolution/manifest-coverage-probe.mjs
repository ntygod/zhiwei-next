// Records a boundary; it does not assert that future versions must accept views.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openSqliteObservationLedgerV1 } from "../../src/index.ts";
import { clock, createOldDatabase } from "./candidate.mjs";
const root = mkdtempSync(join(tmpdir(), "zhiwei-manifest-coverage-"));
const filePath = join(root, "synthetic.sqlite");
try {
  createOldDatabase(filePath);
  const database = new DatabaseSync(filePath);
  try { database.exec("CREATE VIEW synthetic_unknown_view AS SELECT event_id FROM runtime_events;"); }
  finally { database.close(); }
  let result;
  try {
    const ledger = openSqliteObservationLedgerV1({ filePath, clock });
    try { result = { outcome: "accepted", schemaVersion: ledger.schemaVersion, eventCount: ledger.countEvents() }; }
    finally { ledger.close(); }
  } catch (error) { result = { outcome: "rejected", errorName: error.name, code: error.code ?? null }; }
  console.log(JSON.stringify({ scenario: "synthetic-extra-view", node: process.version, ...result,
    meaning: "Observed manifest coverage only; not leakage, corruption or a promise of future view acceptance." }));
} finally { rmSync(root, { recursive: true, force: true }); }
