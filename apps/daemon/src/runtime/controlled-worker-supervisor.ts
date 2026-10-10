import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { ids } from "../../../../packages/domain/src/index.ts";
import {
  parseExecutionSpecV1, parseNormalizedRuntimeEnvelopeV1, parseRuntimeBindingV1,
  parseRuntimeCapabilityProfileV1, parseRuntimeCommandAcceptanceV1,
  parseRuntimeProcessCloseEvidenceV1, parseRuntimeStopAcknowledgementV1,
  type ExecutionSpecV1, type RuntimeBindingV1, type RuntimeCapabilityProfileV1,
  type RuntimePort, type RuntimeWorkerStateV1,
} from "../../../../packages/protocol/src/index.ts";
import { createControlledPiWorkerClient, type ControlledPiWorkerClient } from "../../../../packages/pi-adapter/src/index.ts";
import {
  createSyntheticControlledBroker, type SyntheticBrokerSnapshot,
} from "../infrastructure/controlled-broker.ts";

export type SyntheticSupervisorErrorCode = "unsupported" | "invalid_request" | "binding_mismatch" | "state" | "cleanup";
export class SyntheticSupervisorError extends Error {
  readonly code: SyntheticSupervisorErrorCode;
  constructor(code: SyntheticSupervisorErrorCode) {
    super(`Synthetic Worker Supervisor: ${code}.`);
    this.name = "SyntheticSupervisorError";
    this.code = code;
  }
}
function fail(code: SyntheticSupervisorErrorCode): never { throw new SyntheticSupervisorError(code); }
const RUNTIME = { implementation: "pi", version: "0.84.1" } as const;
const limited = (reason: string) => ({ status: "limited" as const, evidenceRevision: "controlled-worker-synthetic-v1", limitations: [reason, "official-extension-combination-not-run", "production-authority-unsupported"] });
const unsupported = (reason: string) => ({ status: "unsupported" as const, evidenceRevision: "controlled-worker-synthetic-v1", limitations: [reason] });
const CAPABILITIES = parseRuntimeCapabilityProfileV1({
  schemaVersion: 1, profileId: "zhiwei-controlled-synthetic-v1", profileRevision: 1, runtime: RUNTIME,
  structuredDecision: unsupported("no-structured-decision-contract"),
  modelBoundaryCapture: limited("first-party-synthetic-receiver-only"),
  toolInterception: limited("fixed-synthetic-tools-only"),
  abort: limited("acknowledgement-not-effect-cancellation"),
  resume: unsupported("no-durable-checkpoint-contract"),
  progress: limited("bounded-in-memory-events-only"),
  nativeCompaction: unsupported("compaction-disabled"),
});

export interface SyntheticWorkerSupervisor {
  /** A locally generated fixture spec, not a durable Task or authorization record. */
  readonly spec: ExecutionSpecV1;
  readonly runtime: RuntimePort;
  snapshot(): Readonly<{
    mode: "synthetic-fixtures-only";
    production: "unsupported";
    binding: RuntimeBindingV1;
    broker: SyntheticBrokerSnapshot;
    taskOutcome: "not_evaluated";
  }>;
  close(): Promise<void>;
}
export interface SyntheticWorkerSupervisorOptions {
  /** Trusted launcher-selected installation; signature/source authentication is an outer prerequisite. */
  readonly packageDirectory: string;
  readonly nodeExecutable: string;
  readonly scenario?: "text" | "tools";
}

/** No daemon HTTP route calls this factory. It can only dispatch its own generated synthetic input,
 * uses a first-party synthetic receiver, and creates its own file/memory/draft fixtures. The returned
 * RuntimePort is consumed here to establish the future composition seam; it is not a live Task API.
 */
export async function createSyntheticControlledWorkerSupervisor(input: SyntheticWorkerSupervisorOptions): Promise<SyntheticWorkerSupervisor> {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid_request");
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(input).some(key => typeof key !== "string" || !["packageDirectory", "nodeExecutable", "scenario"].includes(key)
    || !descriptors[key] || !("value" in descriptors[key]) || !descriptors[key].enumerable)) fail("invalid_request");
  const scenario = input.scenario ?? "text";
  if (typeof input.packageDirectory !== "string" || typeof input.nodeExecutable !== "string" || !["text", "tools"].includes(scenario)) fail("invalid_request");
  const packageDirectory = input.packageDirectory;
  const nodeExecutable = input.nodeExecutable;
  if (process.platform !== "linux") fail("unsupported");
  const key = randomUUID();
  const now = () => new Date().toISOString();
  const workerInstanceId = `synthetic-worker-${key}`;
  const bindingId = `synthetic-binding-${key}`;
  const spec = parseExecutionSpecV1({
    schemaVersion: 1, executionUnitId: `synthetic-execution-${key}`, workspaceId: `synthetic-workspace-${key}`, sessionId: `synthetic-session-${key}`,
    prompt: scenario === "tools" ? "Use the fixed synthetic tools to prepare the sample draft, then summarize the synthetic result." : "Summarize the fixed synthetic sample.",
    requestSnapshotRef: { contentId: `synthetic-input-${key}`, contentVersion: 1 },
    fence: {
      installationId: `synthetic-installation-${key}`, recoveryEpoch: `synthetic-recovery-${key}`,
      owner: { kind: "task_attempt", id: `synthetic-attempt-${key}` },
      sourceTask: { taskId: `synthetic-task-${key}`, attemptId: `synthetic-attempt-${key}`, intentRevision: 1 },
      contractRevision: 1, leaseEpoch: 1, cognition: { global: 0, workspace: 0 }, policy: { global: 0, workspace: 0 },
      notAfter: new Date(Date.now() + 60_000).toISOString(),
    },
    selectedModelProfile: { id: "synthetic-v1", revision: 1 },
    toolProfile: scenario === "tools" ? "controlled-read-memory-draft-v1" : "none",
    bounds: { maxOutputBytes: 1_048_576, maxDurationMs: 60_000, maxTokens: 32_768, maxModelRequests: 8, maxToolCalls: scenario === "tools" ? 3 : 0 },
    controlledCwdRef: `synthetic-cwd-${key}`,
  });
  const root = await mkdtemp(join(tmpdir(), "zhiwei-synthetic-worker-"));
  let broker: Awaited<ReturnType<typeof createSyntheticControlledBroker>>;
  try {
    await mkdir(join(root, "workspace"), { mode: 0o700 });
    await mkdir(join(root, "state"), { mode: 0o700 });
    broker = await createSyntheticControlledBroker(spec, { scenario });
  } catch {
    await rm(root, { recursive: true, force: true });
    throw new SyntheticSupervisorError("invalid_request");
  }
  let binding = parseRuntimeBindingV1({
    schemaVersion: 1, bindingId, executionUnitId: spec.executionUnitId, workspaceId: spec.workspaceId, sessionId: spec.sessionId,
    owner: spec.fence.owner, workerInstanceId, leaseEpoch: spec.fence.leaseEpoch, profileRevision: 1, runtime: RUNTIME,
    state: "ALLOCATED", observedRuntimeSessionIds: [], sourceStreams: [],
  });
  const state = (next: RuntimeWorkerStateV1) => { binding = parseRuntimeBindingV1({ ...binding, state: next }); };
  let client: ControlledPiWorkerClient;
  try { client = createControlledPiWorkerClient({
    packageDirectory, nodeExecutable,
    workspaceDirectory: join(root, "workspace"), stateDirectory: join(root, "state"), hostEnvironment: {},
    workspaceId: ids.workspace(spec.workspaceId), workerInstanceId, toolProfile: spec.toolProfile,
    maxOutputBytes: spec.bounds.maxOutputBytes, maxDurationMs: spec.bounds.maxDurationMs, now,
    onBrokerRecord: request => broker.handle(request),
  }); } catch (error) {
    await broker.dispose();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  let dispatchStarted = false;
  let cancelRequested = false;
  let eventsTaken = false;
  let closed = false;
  let closePromise: Promise<void> | undefined;
  let disposePromise: ReturnType<RuntimePort["dispose"]> | undefined;
  let commandSequence = 0;
  const exactBinding = (id: string) => { if (id !== bindingId) fail("binding_mismatch"); };
  const sourceStream = (surface: string, domain: string) => `synthetic-stream-${key}-${surface}-${domain}`;
  const runtime: RuntimePort = {
    capabilities(): RuntimeCapabilityProfileV1 { return CAPABILITIES; },
    async start(candidate) {
      if (closed || binding.state !== "ALLOCATED") fail("state");
      if (!isDeepStrictEqual(parseExecutionSpecV1(candidate), spec)) fail("invalid_request");
      state("STARTING");
      try {
        const observed = await client.start();
        if (closed) fail("state");
        binding = parseRuntimeBindingV1({ ...binding, state: "READY", observedRuntimeSessionIds: [observed.runtimeSessionId], sourceStreams: [
          { sourceStreamId: sourceStream("host", "host-client-actions"), surface: "host", runtimeInstanceId: workerInstanceId, sequenceDomain: "host-client-actions" },
          { sourceStreamId: sourceStream("rpc", "worker-output-and-process-boundaries"), surface: "rpc", runtimeInstanceId: workerInstanceId, sequenceDomain: "worker-output-and-process-boundaries" },
        ] });
        return binding;
      } catch (error) { state("FAILED"); throw error; }
    },
    async dispatch(id) {
      exactBinding(id);
      if (closed || cancelRequested || dispatchStarted || binding.state !== "READY") fail("state");
      if (Date.now() >= Date.parse(spec.fence.notAfter)) fail("state");
      dispatchStarted = true;
      const requestId = `synthetic-prompt-${++commandSequence}`;
      state("BUSY");
      try {
        const response = await client.request({ id: requestId, type: "prompt", message: spec.prompt });
        if (!response.success) state("FAILED");
        return parseRuntimeCommandAcceptanceV1({ schemaVersion: 1, bindingId, requestId, status: response.success ? "accepted" : "rejected", ...(!response.success ? { errorCode: "runtime_rejected" } : {}) });
      } catch (error) { state("FAILED"); throw error; }
    },
    events(id) {
      exactBinding(id);
      if (eventsTaken || ["ALLOCATED", "STARTING"].includes(binding.state)) fail("state");
      eventsTaken = true;
      return (async function* () {
        try {
          for await (const event of client.events()) {
            if (event.runtimeInstanceId !== workerInstanceId || event.workspaceId !== spec.workspaceId
              || !binding.observedRuntimeSessionIds.includes(event.runtimeSessionId)) fail("binding_mismatch");
            const streamId = sourceStream(event.source.surface, event.sequence.domain);
            if (!binding.sourceStreams.some(stream => stream.sourceStreamId === streamId)) {
              binding = parseRuntimeBindingV1({ ...binding, sourceStreams: [...binding.sourceStreams, { sourceStreamId: streamId, surface: event.source.surface, runtimeInstanceId: workerInstanceId, sequenceDomain: event.sequence.domain }] });
            }
            if (event.stability === "settled" && binding.state === "BUSY") state("DRAINING");
            const reasoningOmitted = (event.data.kind === "message.lifecycle" && "contentKinds" in event.data && event.data.contentKinds?.includes("thinking"))
              || (event.data.kind === "snapshot.messages" && event.data.messages.some(message => message.contentKinds?.includes("thinking")));
            yield parseNormalizedRuntimeEnvelopeV1({ schemaVersion: 1, bindingId, executionUnitId: spec.executionUnitId, workerInstanceId, sourceStreamId: streamId, event,
              ...(reasoningOmitted ? { omissions: [{ category: "model-reasoning", reason: "not-retained" }] } : {}),
            });
          }
        } catch (error) { state("FAILED"); throw error; }
      })();
    },
    async abort(id, reason) {
      exactBinding(id);
      if (closed || !["READY", "BUSY", "DRAINING"].includes(binding.state)) fail("state");
      parseRuntimeStopAcknowledgementV1({ schemaVersion: 1, bindingId, reason, status: "requested", observedAt: now() });
      cancelRequested = true;
      state("DRAINING");
      // dispose closes admission synchronously, then waits for already in-flight fixture I/O.
      void broker.dispose();
      const receipt = await client.request({ id: `synthetic-abort-${++commandSequence}`, type: "abort" });
      // Neither a successful RPC response nor a requested signal proves stopped external effects.
      return parseRuntimeStopAcknowledgementV1({ schemaVersion: 1, bindingId, reason, status: receipt.success ? "requested" : "unsupported", observedAt: now() });
    },
    dispose(id) {
      exactBinding(id);
      disposePromise ??= (async () => {
        closed = true;
        void broker.dispose();
        if (!["ALLOCATED", "STARTING", "FAILED", "STOPPED"].includes(binding.state)) state("DRAINING");
        try {
          const evidence = await client.dispose();
          const { brokerEof: _brokerEof, ...neutral } = evidence;
          state(client.state === "FAILED" ? "FAILED" : "STOPPED");
          return parseRuntimeProcessCloseEvidenceV1({ schemaVersion: 1, bindingId, ...neutral });
        } catch (error) { state("FAILED"); throw error; }
      })();
      return disposePromise;
    },
  };
  return {
    spec, runtime,
    snapshot: () => {
      if (client.state === "FAILED" && binding.state !== "FAILED") state("FAILED");
      return Object.freeze({ mode: "synthetic-fixtures-only", production: "unsupported", binding, broker: broker.snapshot(), taskOutcome: "not_evaluated" });
    },
    close() {
      closePromise ??= (async () => {
        let failed = false;
        try { await runtime.dispose(bindingId); } catch { failed = true; }
        const cleanup = await broker.dispose();
        if (cleanup.status !== "disposed") failed = true;
        try { await rm(root, { recursive: true, force: true }); } catch { failed = true; }
        if (failed) throw new SyntheticSupervisorError("cleanup");
      })();
      return closePromise;
    },
  };
}
