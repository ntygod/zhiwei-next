import "./check-normalized-runtime-event-v1-tool.mjs";
import "./check-normalized-runtime-event-v1-retry.mjs";
import "./check-normalized-runtime-event-v1-system.mjs";
import "./check-normalized-runtime-event-v1-source.mjs";
import {
  events,
  fixtureHash,
  violations,
} from "./check-normalized-runtime-event-v1-context.mjs";

if (violations.length > 0) {
  console.error(
    "NormalizedRuntimeEvent v1 contract violations:\n" +
      violations.map((violation) => `- ${violation}`).join("\n"),
  );
  process.exit(1);
}
console.log(`NormalizedRuntimeEvent v1 contract: OK (${events.length} events, ${fixtureHash})`);
