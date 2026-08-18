import { ids, type IsoTimestamp } from "../../domain/src/index.ts";
import {
  createNormalizedRuntimeEventV1,
  type NormalizedRuntimeCorrelationV1,
  type NormalizedRuntimeEventDraftV1,
  type NormalizedRuntimeEventV1,
  type NormalizedRuntimeLinksV1,
  type NormalizedRuntimePayloadV1,
  type NormalizedRuntimeProvenanceV1,
  type NormalizedRuntimeSourceSurfaceV1,
} from "../src/index.ts";

export const NORMALIZED_RUNTIME_EVENT_V1_FIXTURE_SOURCE = Object.freeze({
  issue: 32,
  mergeCommit: "374a27505c4a150cbcb63c1b8f6c1afb3bfb4448",
  runtimeVersion: "0.84.1",
  evidence: {
    retrySuccess: {
      path: "packages/pi-adapter/fixtures/pi-lifecycle-retry-success.json",
      field: "contractFingerprint",
      value: "e87f7365eefbb4d7de7a4570a6c99df7a1fdf26f58aa2a40fab9149cb6deff02",
    },
    cancelRetryExhaustion: {
      path: "packages/pi-adapter/fixtures/pi-lifecycle-cancel-retry-exhaustion.json",
      field: "contractFingerprint",
      value: "b866798d18569c78d5c712254c3ecdecd7a3e02c0ef11458e6b97b0863b1f6e0",
    },
    parallelToolOrdering: {
      path: "packages/pi-adapter/fixtures/pi-lifecycle-parallel-tool-ordering.json",
      field: "contractFingerprint",
      value: "fd372a8e73f4545bd7a34c6ac3e82cfc2d044dca473ae374627b847864389b02",
    },
    compactionSessionReplacement: {
      path: "packages/pi-adapter/fixtures/pi-lifecycle-compaction-session-replacement.json",
      field: "contractFingerprint",
      value: "9ebe87b12f0670214fa1244239d21d7a517b2332da2f3f85b3372b8b6895ab75",
    },
    sdkRpcParity: {
      path: "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json",
      field: "outerContractFingerprint",
      value: "c99bcfb2872736e085750690965dd11dce1bc873b14b905b53a1e57defa3dcbf",
    },
    rpcWorkerLifecycle: {
      path: "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest-v2.json",
      field: "outerContractFingerprint",
      value: "b4715e2b896258fddec81e2f25f4c28056d24a8562547f46d6305127ebe0053c",
    },
  },
});

export const fixtureWorkspaceId = ids.workspace("fixture-workspace");
export const fixtureSessions = {
  sessionA: ids.session("fixture-session-a"),
  sessionB: ids.session("fixture-session-b"),
  sessionC: ids.session("fixture-session-c"),
  sessionD: ids.session("fixture-session-d"),
  sessionE: ids.session("fixture-session-retry-success"),
  sessionR: ids.session("fixture-session-replacement"),
} as const;

export interface FixtureInput {
  readonly runtimeSessionId?: ReturnType<typeof ids.session>;
  readonly runtimeInstanceId?: string;
  readonly surface: NormalizedRuntimeSourceSurfaceV1;
  readonly sequenceDomain: string;
  readonly sourceEventType: string;
  readonly provenance?: NormalizedRuntimeProvenanceV1;
  readonly compatibility?: "required" | "ignorable";
  readonly persistence?: "durable" | "ephemeral";
  readonly stability?: "update" | "boundary" | "settled";
  readonly correlation?: NormalizedRuntimeCorrelationV1;
  readonly links?: NormalizedRuntimeLinksV1;
  readonly data: NormalizedRuntimePayloadV1;
}

export interface FixtureContext {
  readonly events: NormalizedRuntimeEventV1[];
  readonly append: (input: FixtureInput) => NormalizedRuntimeEventV1;
  readonly sessions: typeof fixtureSessions;
}

function timestamp(index: number): IsoTimestamp {
  const minute = Math.floor(index / 60);
  const second = index % 60;
  return `2026-08-17T05:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.000Z` as IsoTimestamp;
}

function emptyCorrelation(): NormalizedRuntimeCorrelationV1 {
  return { observed: {}, normalized: {} };
}

export function createFixtureContext(): FixtureContext {
  const events: NormalizedRuntimeEventV1[] = [];
  const streamSequences = new Map<string, number>();
  let observedAtIndex = 1;
  const append = (input: FixtureInput): NormalizedRuntimeEventV1 => {
    const runtimeSessionId = input.runtimeSessionId ?? fixtureSessions.sessionA;
    const runtimeInstanceId = input.runtimeInstanceId ?? "fixture-worker-1";
    const stream = JSON.stringify([runtimeSessionId, runtimeInstanceId, input.surface, input.sequenceDomain]);
    const sourceSequence = (streamSequences.get(stream) ?? 0) + 1;
    streamSequences.set(stream, sourceSequence);
    const event = createNormalizedRuntimeEventV1({
      protocolVersion: 1,
      workspaceId: fixtureWorkspaceId,
      runtimeSessionId,
      runtimeInstanceId,
      source: {
        adapter: "pi",
        runtime: {
          implementation: "@earendil-works/pi-coding-agent",
          version: NORMALIZED_RUNTIME_EVENT_V1_FIXTURE_SOURCE.runtimeVersion,
        },
        surface: input.surface,
        eventType: input.sourceEventType,
      },
      sequence: { domain: input.sequenceDomain, value: sourceSequence },
      observedAt: timestamp(observedAtIndex),
      provenance: input.provenance ?? "observed",
      persistence: input.persistence ?? "durable",
      stability: input.stability ?? "boundary",
      compatibility: input.compatibility ?? "required",
      correlation: input.correlation ?? emptyCorrelation(),
      ...(input.links ? { links: input.links } : {}),
      data: input.data,
    } satisfies NormalizedRuntimeEventDraftV1);
    observedAtIndex += 1;
    events.push(event);
    return event;
  };
  return { events, append, sessions: fixtureSessions };
}
