import { readFile, requireValue } from "./check-normalized-runtime-event-v1-context.mjs";

for (const path of [
  "packages/protocol/src/sha256.ts",
  "packages/protocol/src/lossless-json.ts",
  "packages/protocol/src/runtime-event-payload-v1.ts",
  "packages/protocol/src/runtime-event-v1.ts",
  "packages/protocol/src/runtime-event-stream-v1.ts",
]) {
  const source = await readFile(path, "utf8");
  requireValue(!/from\s+["']node:/.test(source), `${path} must not import Node APIs.`);
  requireValue(!/from\s+["'][^"']*pi[^"']*["']/.test(source), `${path} must not import Pi.`);
  requireValue(!/\bDate\s*\./.test(source), `${path} must not read the system clock.`);
  requireValue(!/Math\.random/.test(source), `${path} must not generate random identity.`);
}
const payload = await readFile("packages/protocol/src/runtime-event-payload-v1.ts", "utf8");
for (const token of [
  "RuntimeWillRetryV1", '"unavailable"', "RuntimeRetryCompletedV1", 'phase: "completed"',
  "RuntimeToolResultMessageEndedV1", "RuntimeToolMessageSnapshotItemV1", "toolCallId", "toolName", "success",
]) {
  requireValue(payload.includes(token), `Protocol payload extension is missing ${token}.`);
}
const adapter = await readFile("packages/pi-adapter/src/normalized-runtime-event-v1.ts", "utf8");
for (const token of [
  'willRetry: boolean | "unavailable"', 'type: "retry_completed"',
  "PiRuntimeToolMessageEndInputV1", "toolCallId", "toolName", "success",
]) {
  requireValue(adapter.includes(token), `Pi Adapter R2 mapping is missing ${token}.`);
}
requireValue(!/\bDate\s*\./.test(adapter), "Pi Adapter must not read the system clock.");
requireValue(!/Math\.random/.test(adapter), "Pi Adapter must not generate random IDs.");
const state = await readFile("docs/harness/project-state.md", "utf8");
for (const token of [
  "74-event", "willRetry=unavailable", "retry.lifecycle/completed", "Tool Result Message",
  "d77c66abff429219c0ac95ba405c57057e56b929", "CHANGES_REQUESTED",
]) {
  requireValue(state.includes(token), `Project State is missing ${token}.`);
}
