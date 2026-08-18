import type {
  NormalizedRuntimeCorrelationV1,
  NormalizedRuntimeEventV1,
} from "../src/index.ts";
import type { FixtureContext } from "./normalized-runtime-event-v1.fixture-context.ts";

export function append_primary_tool_fixture({ append }: FixtureContext): void {
  const declarations = new Map<string, NormalizedRuntimeEventV1>();
  for (const name of ["alpha", "beta", "gamma"]) {
    declarations.set(name, append({
      surface: "sdk",
      sequenceDomain: "sdk-public-events",
      sourceEventType: "tool_declared",
      correlation: {
        observed: {},
        normalized: {
          agentRunId: "fixture-run-a",
          turnId: "fixture-turn-a",
          toolCallId: `fixture-tool-${name}`,
        },
      },
      data: {
        kind: "tool.lifecycle",
        phase: "declared",
        toolName: name,
        input: { name },
      },
    }));
  }
  for (const name of ["alpha", "beta", "gamma"]) {
    const declaration = declarations.get(name)!;
    append({
      surface: "sdk",
      sequenceDomain: "sdk-public-events",
      sourceEventType: "tool_started",
      correlation: declaration.correlation,
      links: { sourceEventIds: [declaration.eventId] },
      data: { kind: "tool.lifecycle", phase: "started", toolName: name },
    });
  }
  const completions = new Map<string, NormalizedRuntimeEventV1>();
  for (const name of ["beta", "gamma", "alpha"]) {
    const declaration = declarations.get(name)!;
    completions.set(name, append({
      surface: "sdk",
      sequenceDomain: "sdk-public-events",
      sourceEventType: "tool_completed",
      correlation: declaration.correlation,
      links: { sourceEventIds: [declaration.eventId] },
      data: {
        kind: "tool.lifecycle",
        phase: "completed",
        toolName: name,
        success: true,
        result: { name, completed: true },
      },
    }));
  }
  for (const name of ["alpha", "beta", "gamma"]) {
    const completed = completions.get(name)!;
    const messageId = `fixture-tool-message-${name}`;
    const correlation: NormalizedRuntimeCorrelationV1 = {
      observed: {},
      normalized: {
        agentRunId: "fixture-run-a",
        turnId: "fixture-turn-a",
        messageId,
        toolCallId: `fixture-tool-${name}`,
      },
    };
    append({
      surface: "sdk",
      sequenceDomain: "sdk-public-events",
      sourceEventType: "message_start",
      correlation,
      links: { sourceEventIds: [completed.eventId] },
      data: {
        kind: "message.lifecycle",
        phase: "started",
        role: "tool",
        toolName: name,
        success: true,
        contentKinds: ["tool-result"],
      },
    });
    append({
      surface: "sdk",
      sequenceDomain: "sdk-public-events",
      sourceEventType: "message_end",
      correlation,
      links: { sourceEventIds: [completed.eventId] },
      data: {
        kind: "message.lifecycle",
        phase: "ended",
        role: "tool",
        toolName: name,
        success: true,
        contentKinds: ["tool-result"],
        body: { text: name },
      },
    });
  }
}
