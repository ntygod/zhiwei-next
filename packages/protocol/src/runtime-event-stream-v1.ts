import {
  parseNormalizedRuntimeEventTraceV1 as parseTraceCore,
} from "./runtime-event-stream-v1-core.ts";
import type {
  NormalizedRuntimeEventV1,
  RuntimeSessionShutdownV1,
  RuntimeSessionStartedV1,
} from "./runtime-event-v1.ts";

export * from "./runtime-event-stream-v1-core.ts";

type ExtensionShutdown = NormalizedRuntimeEventV1 & {
  readonly data: RuntimeSessionShutdownV1;
};
type ExtensionStart = NormalizedRuntimeEventV1 & {
  readonly data: RuntimeSessionStartedV1;
};

function isExtensionShutdown(event: NormalizedRuntimeEventV1): event is ExtensionShutdown {
  return event.source.surface === "extension" &&
    event.provenance === "observed" &&
    event.data.kind === "session.identity" &&
    event.data.action === "shutdown";
}

function isExtensionStart(event: NormalizedRuntimeEventV1): event is ExtensionStart {
  return event.source.surface === "extension" &&
    event.provenance === "observed" &&
    event.data.kind === "session.identity" &&
    event.data.action === "started";
}

function validateSessionReplacementLineage(
  events: readonly NormalizedRuntimeEventV1[],
): void {
  const byId = new Map(events.map((event) => [event.eventId, event]));
  const indexes = new Map(events.map((event, index) => [event.eventId, index]));

  for (const event of events) {
    if (event.data.kind !== "session.identity" || event.data.action !== "replaced") continue;
    const lineage = event.links!.sourceEventIds!.map((id) => byId.get(id)!);
    if (lineage.some((source) => source.runtimeSessionId !== event.runtimeSessionId)) {
      throw new TypeError("session replacement lineage must remain in one Runtime Session");
    }
    const shutdowns = lineage.filter(isExtensionShutdown);
    const starts = lineage.filter(isExtensionStart);
    if (shutdowns.length !== 1 || starts.length !== 1) {
      throw new TypeError(
        "session replacement must link one observed Extension shutdown and one observed Extension start",
      );
    }
    const shutdown = shutdowns[0];
    const started = starts[0];
    if (indexes.get(shutdown.eventId)! >= indexes.get(started.eventId)!) {
      throw new TypeError("session replacement shutdown must precede the replacement start");
    }
    if (shutdown.data.previousSessionIdentity !== event.data.previousSessionIdentity) {
      throw new TypeError("session replacement previous identity does not match its shutdown source");
    }
    if (
      started.data.previousSessionIdentity !== event.data.previousSessionIdentity ||
      started.data.nextSessionIdentity !== event.data.nextSessionIdentity
    ) {
      throw new TypeError("session replacement old/new identities do not match its start source");
    }
    if (event.runtimeInstanceId !== started.runtimeInstanceId) {
      throw new TypeError("session replacement must be emitted by the new Runtime instance");
    }
    if (
      event.data.previousRuntimeInstanceId !== undefined &&
      event.data.previousRuntimeInstanceId !== shutdown.runtimeInstanceId
    ) {
      throw new TypeError("session replacement previous Runtime instance does not match shutdown");
    }
    if (
      event.data.nextRuntimeInstanceId !== undefined &&
      (
        event.data.nextRuntimeInstanceId !== started.runtimeInstanceId ||
        event.data.nextRuntimeInstanceId !== event.runtimeInstanceId
      )
    ) {
      throw new TypeError("session replacement next Runtime instance does not match start/aggregate");
    }
  }
}

export function parseNormalizedRuntimeEventTraceV1(
  inputs: readonly unknown[],
): readonly NormalizedRuntimeEventV1[] {
  const events = parseTraceCore(inputs);
  validateSessionReplacementLineage(events);
  return events;
}

export function assertReplayableNormalizedRuntimeEventTraceV1(
  inputs: readonly unknown[],
): readonly NormalizedRuntimeEventV1[] {
  const events = parseNormalizedRuntimeEventTraceV1(inputs);
  const requiredUnknown = events.find(
    (event) => event.data.kind === "runtime.unknown" && event.compatibility === "required",
  );
  if (requiredUnknown) {
    throw new TypeError(
      `required unknown Runtime event blocks replay: ${requiredUnknown.data.sourceType}`,
    );
  }
  return events;
}
