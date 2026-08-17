import { events, indexOf, requireValue } from "./check-normalized-runtime-event-v1-context.mjs";

const queueStates = events
  .filter((event) => event.data.kind === "queue.changed" && event.data.queue === "follow-up")
  .map((event) => event.data.pending);
requireValue(JSON.stringify(queueStates) === JSON.stringify([1, 0]), "Follow-up queue boundaries drifted.");
requireValue(
  events.some((event) => event.data.kind === "retry.lifecycle" && event.data.phase === "aborted") &&
    events.some((event) => event.data.kind === "retry.lifecycle" && event.data.phase === "exhausted"),
  "Fixture must retain Retry aborted and exhausted facts.",
);
const retry = events.filter((event) => event.runtimeSessionId === "fixture-session-retry-success");
const sdkEnds = retry.filter(
  (event) => event.source.surface === "sdk" && event.data.kind === "agent.lifecycle" && event.data.phase === "ended",
);
const extensionEnds = retry.filter(
  (event) => event.source.surface === "extension" && event.data.kind === "agent.lifecycle" && event.data.phase === "ended",
);
requireValue(
  JSON.stringify(sdkEnds.map((event) => event.data.willRetry)) === JSON.stringify([true, false]),
  "Retry success SDK agent_end must retain willRetry=[true,false].",
);
requireValue(
  JSON.stringify(extensionEnds.map((event) => event.data.willRetry)) ===
    JSON.stringify(["unavailable", "unavailable"]),
  "Retry success Extension agent_end must retain explicit unavailable willRetry.",
);
const start = indexOf(retry, (event) => event.data.kind === "retry.lifecycle" && event.data.phase === "started");
const run2 = indexOf(retry, (event) =>
  event.data.kind === "agent.lifecycle" && event.data.phase === "started" &&
  event.correlation.normalized.agentRunId === "fixture-run-e2");
const complete = indexOf(retry, (event) => event.data.kind === "retry.lifecycle" && event.data.phase === "completed");
const end2 = indexOf(retry, (event) =>
  event.data.kind === "agent.lifecycle" && event.data.phase === "ended" &&
  event.correlation.normalized.agentRunId === "fixture-run-e2");
const settled = indexOf(retry, (event) => event.data.kind === "agent.lifecycle" && event.data.phase === "settled");
requireValue(start >= 0 && start < run2 && run2 < complete && complete < end2 && end2 < settled,
  "Retry success ordering drifted.");
const completion = retry[complete];
requireValue(
  completion?.data.kind === "retry.lifecycle" && completion.data.phase === "completed" &&
    completion.data.attempt === 1 && completion.data.success === true &&
    completion.correlation.normalized.agentRunId === undefined,
  "Successful Retry completion must be an independent attempt fact.",
);
