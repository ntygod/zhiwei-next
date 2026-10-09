import { parentPort, workerData } from "node:worker_threads";
import { openSqliteObservationLedgerV1 } from "../../memory-store/src/index.ts";
import { SCENARIOS, type ScenarioId } from "./catalog.ts";
import { executeLedgerScenario, fixturePorts, type ScenarioFixture } from "./ledger-scenarios.ts";

// This entry is launched only by the bounded host, never by a product Worker.
const input: unknown = workerData;
if (!input || typeof input !== "object" || !parentPort) throw new Error("Invalid evaluation worker input");
const { id, filePath, fixture } = input as Record<string, unknown>;
if (typeof id !== "string" || !SCENARIOS.some(scenario => scenario.id === id) || typeof filePath !== "string") {
  throw new Error("Invalid evaluation scenario");
}
if (!fixture || typeof fixture !== "object") throw new Error("Invalid evaluation fixture");
const fields = fixture as Record<string, unknown>;
if (typeof fields.now !== "string" || typeof fields.idPrefix !== "string" || typeof fields.modelReply !== "string") {
  throw new Error("Invalid evaluation fixture fields");
}
const validatedFixture: ScenarioFixture = { now: fields.now, idPrefix: fields.idPrefix, modelReply: fields.modelReply };
const evidence = executeLedgerScenario(id as ScenarioId, filePath, fixturePorts(validatedFixture, { open: openSqliteObservationLedgerV1 }));
parentPort.postMessage(evidence);
