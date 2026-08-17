import { events, requireValue } from "./check-normalized-runtime-event-v1-context.mjs";

const completions = events.filter(
  (event) => event.data.kind === "tool.lifecycle" && event.data.phase === "completed",
);
requireValue(
  JSON.stringify(completions.map((event) => event.data.toolName)) === JSON.stringify(["beta", "gamma", "alpha"]),
  "Parallel Tool completion order must remain beta, gamma, alpha.",
);
const completionByCall = new Map(
  completions.map((event) => [event.correlation.normalized.toolCallId, event]),
);
const results = events.filter(
  (event) => event.data.kind === "message.lifecycle" && event.data.phase === "ended" && event.data.role === "tool",
);
requireValue(
  JSON.stringify(results.map((event) => event.correlation.normalized.toolCallId)) ===
    JSON.stringify(["fixture-tool-alpha", "fixture-tool-beta", "fixture-tool-gamma"]),
  "Tool Result Message order must remain alpha, beta, gamma by Tool Call identity.",
);
for (const result of results) {
  const completion = completionByCall.get(result.correlation.normalized.toolCallId);
  requireValue(Boolean(completion), "Tool Result Message is missing its completion.");
  requireValue(
    result.links?.sourceEventIds?.length === 1 &&
      result.links.sourceEventIds[0] === completion?.eventId &&
      result.data.toolName === completion?.data.toolName &&
      result.data.success === completion?.data.success,
    `Tool Result Message lineage drifted for ${result.correlation.normalized.toolCallId}.`,
  );
}
const snapshot = events.find((event) => event.data.kind === "snapshot.messages");
const snapshotTools = snapshot?.data.kind === "snapshot.messages"
  ? snapshot.data.messages.filter((message) => message.role === "tool")
  : [];
requireValue(
  JSON.stringify(snapshotTools.map((message) => message.toolCallId)) ===
    JSON.stringify(["fixture-tool-alpha", "fixture-tool-beta", "fixture-tool-gamma"]),
  "Messages Snapshot must retain Tool Call identity and alpha, beta, gamma order.",
);
requireValue(
  snapshotTools.every((message) => message.role === "tool" && message.toolName && typeof message.success === "boolean"),
  "Messages Snapshot Tool items must retain name and success.",
);
