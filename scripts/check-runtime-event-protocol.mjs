import { readFile } from "node:fs/promises";

const violations = [];

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

const [protocol, protocolIndex, adapter, adapterIndex, architecture, piIntegration, projectState] =
  await Promise.all([
    readFile("packages/protocol/src/runtime-events.ts", "utf8"),
    readFile("packages/protocol/src/index.ts", "utf8"),
    readFile("packages/pi-adapter/src/normalize-runtime-event.ts", "utf8"),
    readFile("packages/pi-adapter/src/index.ts", "utf8"),
    readFile("docs/architecture/normalized-runtime-event.md", "utf8"),
    readFile("docs/architecture/pi-integration.md", "utf8"),
    readFile("docs/harness/project-state.md", "utf8"),
  ]);

for (const pattern of [
  /from\s+["']node:/,
  /require\s*\(\s*["']node:/,
  /@earendil-works\/pi/,
  /\bDate\.now\s*\(/,
  /\bnew\s+Date\s*\(/,
  /\bprocess\./,
  /\bfetch\s*\(/,
]) {
  requireValue(
    !pattern.test(protocol),
    `packages/protocol/src/runtime-events.ts contains forbidden dependency or ambient input: ${pattern}`,
  );
}

requireValue(
  protocol.includes("export const RUNTIME_EVENT_PROTOCOL_VERSION = 1"),
  "Runtime event protocol version 1 is missing.",
);
requireValue(
  protocol.includes('export type RuntimeSourceSurface = "sdk" | "extension" | "rpc" | "host"'),
  "Runtime source surface union is incomplete.",
);
requireValue(
  protocol.includes('export type RuntimeEventProvenance = "observed" | "host-synthesized"'),
  "Runtime event provenance union is incomplete.",
);
requireValue(
  protocol.includes('export type RuntimeEventDurability = "transient" | "boundary" | "stable"'),
  "Runtime event durability union is incomplete.",
);
requireValue(
  protocol.includes("buildRuntimeEventIdempotencyKey"),
  "Runtime event deterministic idempotency key builder is missing.",
);
requireValue(
  protocol.includes("validateRuntimeEventStream"),
  "Runtime event stream validator is missing.",
);
requireValue(
  protocol.includes("queue snapshots cannot be treated as stable Prompt completion"),
  "Empty queue must not be treated as Prompt completion.",
);
requireValue(
  protocol.includes("agent-run.ended requires willRetry=true|false|unknown"),
  "Agent Run ended events must preserve observed or unknown Retry intent.",
);
requireValue(
  protocol.includes("data.toolCallId must equal correlation.toolCallId"),
  "Tool Call correlation invariant is missing.",
);
requireValue(
  protocol.includes("data.requestId must equal correlation.rpcRequestId"),
  "RPC Request correlation invariant is missing.",
);
requireValue(
  protocolIndex.includes('export * from "./runtime-events.ts";'),
  "Protocol source entry does not export runtime-events.ts.",
);
requireValue(
  adapterIndex.includes('export * from "./normalize-runtime-event.ts";'),
  "Pi Adapter source entry does not export normalize-runtime-event.ts.",
);

requireValue(
  adapter.includes('willRetry: input.willRetry ?? "unknown"'),
  "Pi Adapter must preserve missing Extension willRetry as unknown.",
);
requireValue(
  adapter.includes("context.correlation?.toolCallId ?? input.toolCallId"),
  "Pi Adapter must reject an already supplied conflicting Tool Call correlation.",
);
requireValue(
  adapter.includes("context.correlation?.rpcRequestId ?? input.requestId"),
  "Pi Adapter must reject an already supplied conflicting RPC Request correlation.",
);
requireValue(
  adapter.includes('input.type === "tool_execution_update" ? "transient" : "boundary"'),
  "Tool progress must remain transient.",
);
requireValue(
  adapter.includes('phase === "delta" ? "transient" : "boundary"'),
  "Message deltas must remain transient.",
);
requireValue(
  adapter.includes('sourceSurface: RuntimeSourceSurface'),
  "Pi Adapter normalization context must require a source surface.",
);
requireValue(
  !/@earendil-works\/pi/.test(adapter),
  "Pure normalization file must not import Pi SDK types directly; upstream typing stays at the capture boundary.",
);

for (const token of [
  "Prompt 接受与任务完成",
  "willRetry=true",
  "空队列",
  "声明顺序",
  "Compaction Summary",
  "Session Replacement",
  "RPC Prompt Response",
  "Worker Exit",
  "禁止推断",
]) {
  requireValue(
    architecture.includes(token),
    `NormalizedRuntimeEvent architecture document is missing token: ${token}`,
  );
}

requireValue(
  piIntegration.includes("## NormalizedRuntimeEvent v1"),
  "Pi integration document is missing the NormalizedRuntimeEvent v1 boundary.",
);
requireValue(
  projectState.includes("NormalizedRuntimeEvent v1 协议候选"),
  "Project state is missing the NormalizedRuntimeEvent v1 handoff.",
);
requireValue(
  projectState.includes("冻结 Observation Ledger Schema"),
  "Project state does not advance to the Observation Ledger Schema.",
);

if (violations.length > 0) {
  console.error(
    "NormalizedRuntimeEvent protocol violations:\n" +
      violations.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log("NormalizedRuntimeEvent v1 contract: OK");
