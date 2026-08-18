import {
  canonicalNormalizedRuntimeEventV1,
  events,
  requireValue,
  verifySourceSlotConflict,
} from "./check-normalized-runtime-event-v1-context.mjs";

const compactStart = events.find((event) => event.data.kind === "compaction.lifecycle" && event.data.phase === "started");
const compact = events.find((event) => event.data.kind === "compaction.lifecycle" && event.data.phase === "completed");
requireValue(Boolean(compactStart && compact?.links?.sourceEventIds?.includes(compactStart.eventId) && compact.links.replacesEventIds?.length),
  "Compaction Fixture must retain started/source/replacement lineage.");
const replacementStart = events.find((event) =>
  event.data.kind === "session.identity" && event.data.action === "started" &&
  event.data.previousSessionIdentity !== undefined);
const invalidated = events.find((event) => event.data.kind === "session.identity" && event.data.action === "invalidated");
const replacement = events.find((event) => event.data.kind === "session.identity" && event.data.action === "replaced");
const rebound = events.find((event) => event.data.kind === "session.identity" && event.data.action === "listener-rebound");
requireValue(replacementStart?.source.surface === "extension" && replacementStart.provenance === "observed",
  "Replacement start must remain observed Extension.");
requireValue(invalidated?.source.surface === "host" && invalidated.provenance === "host-synthesized",
  "Invalidation must remain Host-synthesized.");
requireValue(
  replacement?.source.surface === "host" && replacement.provenance === "host-synthesized" &&
    replacement.links?.sourceEventIds?.length === 2 && replacement.data.kind === "session.identity" &&
    replacement.data.action === "replaced" &&
    replacement.data.previousRuntimeInstanceId === replacement.runtimeInstanceId &&
    replacement.data.nextRuntimeInstanceId === replacement.runtimeInstanceId,
  "Replacement must prove source-linked same-instance Session Object replacement.",
);
requireValue(rebound?.source.surface === "host" && rebound.provenance === "host-synthesized",
  "Listener rebind must remain Host-synthesized.");
const hostActions = events.filter((event) => event.data.kind === "host.action");
for (const action of ["send-command", "close-stdin", "request-signal"]) {
  requireValue(hostActions.some((event) => event.data.action === action), `Fixture is missing Host ${action}.`);
}
requireValue(hostActions.every((event) => event.source.surface === "host" && event.provenance === "host-synthesized"),
  "Host actions must remain Host-synthesized.");
const boundaries = events.filter((event) => event.data.kind === "process.boundary");
for (const boundary of ["spawn", "exit", "close"]) {
  requireValue(boundaries.some((event) => event.data.boundary === boundary), `Fixture is missing ${boundary}.`);
}
requireValue(boundaries.every((event) => event.source.surface === "host" && event.provenance === "observed"),
  "Process boundaries must remain Host-observed.");
const unknown = events.find((event) => event.data.kind === "runtime.unknown");
requireValue(unknown?.data.kind === "runtime.unknown" && unknown.data.canonicalization === "zhiwei-json-v1" &&
  unknown.compatibility === "ignorable", "Unknown diagnostic drifted.");
requireValue(events.every((event) => event.data.kind === "runtime.unknown" ||
  (event.data.kind === "message.lifecycle" && event.data.phase === "updated") || event.compatibility === "required"),
  "Known stable vocabulary must remain required.");
verifySourceSlotConflict();
for (const [index, event] of events.entries()) {
  const canonical = canonicalNormalizedRuntimeEventV1(event);
  requireValue(!canonical.includes("globalSequence"), `Event ${index} contains globalSequence.`);
  requireValue(!canonical.includes("taskSucceeded"), `Event ${index} contains taskSucceeded.`);
  requireValue(!canonical.includes("sdkEvent") && !canonical.includes("rawSdk"), `Event ${index} contains raw SDK data.`);
}
