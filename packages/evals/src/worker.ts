import { openSqliteObservationLedgerV1 } from "../../memory-store/src/index.ts";
import { SCENARIOS, type ScenarioId } from "./catalog.ts";
import { executeLedgerScenario, fixturePorts, type ScenarioFixture } from "./ledger-scenarios.ts";

// Launched only by the bounded evaluation host, never by a product Worker.
try {
  const input: unknown = JSON.parse(process.argv[2] ?? "null");
  if (!input || typeof input !== "object" || !process.send) throw new Error("Invalid input");
  const { id, filePath, fixture } = input as Record<string, unknown>;
  if (typeof id !== "string" || !SCENARIOS.some(scenario => scenario.id === id) || typeof filePath !== "string") throw new Error("Invalid scenario");
  if (!fixture || typeof fixture !== "object") throw new Error("Invalid fixture");
  const fields = fixture as Record<string, unknown>;
  if (typeof fields.now !== "string" || typeof fields.idPrefix !== "string" || typeof fields.modelReply !== "string") throw new Error("Invalid fixture fields");
  const validatedFixture: ScenarioFixture = { now: fields.now, idPrefix: fields.idPrefix, modelReply: fields.modelReply };
  const evidence = executeLedgerScenario(id as ScenarioId, filePath, fixturePorts(validatedFixture, { open: openSqliteObservationLedgerV1 }));
  process.send(evidence, error => {
    if (error) process.exitCode = 1;
    process.disconnect();
  });
} catch {
  // Do not forward arbitrary I/O, model, path, or provider error messages.
  process.exitCode = 1;
  if (process.connected) process.disconnect();
}
