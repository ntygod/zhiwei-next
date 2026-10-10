import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyntheticRecoveryCoordinatorV2, openSyntheticRecoveryCoordinatorV2, type SyntheticRecoveryCoordinatorV2, type TaskPersistenceBoundaryV1, type TaskRuntimeCommandV1, type TaskExecutionDetailsV1, type TaskModelRequestSnapshotV1, type RuntimeInputSnapshotV1 } from "../../../../packages/memory-store/src/index.ts";
import { canonicalJsonV1, type RuntimeProcessCloseEvidenceV1 } from "../../../../packages/protocol/src/index.ts";
import type { Task } from "../../../../packages/domain/src/index.ts";
import { createSyntheticSessionApi, type SyntheticSessionApi } from "../session-api/server.ts";
import { SessionApiError, type SessionApiContext } from "../session-api/service.ts";
import { createSyntheticControlledWorkerSupervisor, type SyntheticWorkerSupervisor } from "../runtime/controlled-worker-supervisor.ts";
import { createPersistentSessionApplication, syntheticTaskPrompt, type PersistentSessionApplication } from "./application.ts";
import { reducePersistentTask } from "./task-reducer.ts";
export interface SyntheticTaskSessionHarness {
  readonly mode: "synthetic-fixtures-only"; readonly production: "unsupported";
  readonly application: PersistentSessionApplication; readonly api: SyntheticSessionApi;
  evidence(context: SessionApiContext, taskId: string): Readonly<{ execution?: TaskExecutionDetailsV1; runtimeInputs: readonly RuntimeInputSnapshotV1[]; modelRequests: readonly TaskModelRequestSnapshotV1[] }>;
  runTask(context: SessionApiContext, taskId: string): Promise<void>;
  idle(): Promise<void>; restart(): Promise<void>; interruptControlPlane(): Promise<void>; reconcileRetainedWorkers(): Promise<void>; close(): Promise<void>;
}
export interface SyntheticTaskSessionHarnessOptions { readonly runtime?: Readonly<{ packageDirectory: string; nodeExecutable: string }> }
/** Owns a new temporary installation. No caller data root, application, credentials, prompts,
 * authorization switches or production enablement. Normal daemon startup stays diagnostics-only. */
export async function createSyntheticTaskSessionHarness(options: SyntheticTaskSessionHarnessOptions = {}): Promise<SyntheticTaskSessionHarness> {
  const invalid = (): never => { throw new SessionApiError("validation", "invalid_shape", 400); };
  if (!options || typeof options !== "object" || Array.isArray(options)) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(options);
  if (Reflect.ownKeys(options).some(key => key !== "runtime" || !("value" in descriptors.runtime!))) invalid();
  let runtime: SyntheticTaskSessionHarnessOptions["runtime"];
  const selected: unknown = descriptors.runtime?.value;
  if (selected !== undefined) {
    if (!selected || typeof selected !== "object" || Array.isArray(selected)) invalid();
    const fields = Object.getOwnPropertyDescriptors(selected);
    if (Reflect.ownKeys(fields).length !== 2 || ["packageDirectory", "nodeExecutable"].some(key => !fields[key] || !("value" in fields[key]) || typeof fields[key].value !== "string")) invalid();
    runtime = Object.freeze({ packageDirectory: fields.packageDirectory!.value as string, nodeExecutable: fields.nodeExecutable!.value as string });
  }
  const root = await mkdtemp(join(tmpdir(), "zhiwei-task-session-fixture-"));
  const recoveryRoot = join(root, "recovery"), controlRoot = join(root, "control"); await mkdir(recoveryRoot, { mode: 0o700 });
  const installationId = `synthetic-installation-${randomUUID()}`;
  let daemonInstanceId = `synthetic-daemon-${randomUUID()}`, coordinator: SyntheticRecoveryCoordinatorV2;
  let closed = false, restarting = false, closing = false, lastFailure: unknown;
  let serial = Promise.resolve(), lifecycle = Promise.resolve();
  // Each caller still receives its own failure; later lifecycle work must not inherit a rejected tail.
  // Every operation below repeats the actual API/Worker close and Store checks before proceeding.
  type LiveWorker = { context: SessionApiContext; supervisor: SyntheticWorkerSupervisor; runFinished: boolean; stopping?: Promise<void>; suspended?: boolean };
  const live = new Map<string, LiveWorker>();
  const observedCloses = new Map<string, { spec: TaskExecutionDetailsV1["spec"]; binding: TaskExecutionDetailsV1["binding"]; executionRevision: number; evidence: RuntimeProcessCloseEvidenceV1 }>();
  const boundary = (): TaskPersistenceBoundaryV1 => ({ daemonInstanceId,
    recoveryCustody: { observedClose(input) { const record = observedCloses.get(input.binding.bindingId); return record ? structuredClone(record) : undefined; } },
    runtimeSourceIdentity: { bindingImplementation: "pi", adapter: "pi", implementation: "@earendil-works/pi-coding-agent", version: "0.84.1" },
    contentPolicy: { privacy: "model-allowed", retentionUntil: new Date(Date.now() + 86_400_000).toISOString() }, ids: { next: () => randomUUID() }, reduce: reducePersistentTask });
  const recoveryOptions = () => ({ recoveryRoot, controlRoot, installationId, clock: { now: () => new Date().toISOString() }, taskPersistence: boundary() });
  try {
    coordinator = createSyntheticRecoveryCoordinatorV2({ ...recoveryOptions(), generationId: randomUUID() });
    coordinator.store.registerScope({ kind: "global" });
    for (const suffix of ["a", "b"]) coordinator.store.registerScope({ kind: "workspace", workspaceId: `synthetic-workspace-${suffix}` });
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
  const store = () => { if (closed) throw new SessionApiError("unavailable", "dependency_down", 503); return coordinator.store; };
  const current = (context: SessionApiContext, taskId: string): Task => application.getTask(context, taskId).value;
  const runtimeCommand = (context: SessionApiContext, taskId: string, event: TaskRuntimeCommandV1["payload"]["event"], bindingId: string, completeness?: "complete" | "incomplete") => {
    const task = current(context, taskId), execution = store().executions.readExecution(context.workspaceId, taskId), id = `internal-${randomUUID()}`;
    if (!execution || execution.bindingId !== bindingId) throw new SessionApiError("unavailable", "dependency_down", 503);
    store().tasks.executeTask(application.contextForTask(context, task), { schemaVersion: 1, commandId: id, idempotencyKey: id, workspaceId: context.workspaceId, expectedRevision: task.revision, payload: { kind: "task.runtime", taskId, event, evidenceRefs: [{ id: bindingId, revision: execution.revision }], ...(completeness ? { completeness } : {}) } });
    application.committed();
  };
  const releaseClosedCustody = (taskId: string, active: LiveWorker) => {
    if (!active.runFinished || live.get(taskId) !== active) return;
    const persisted = store().executions.readExecution(active.context.workspaceId, taskId);
    if (persisted?.closed && persisted.bindingId === active.supervisor.snapshot().binding.bindingId) live.delete(taskId);
  };
  const stop = async (taskId: string, reason: "cancelled" | "shutdown") => {
    const active = live.get(taskId); if (!active) return;
    active.stopping ??= (async () => {
      const { supervisor, context } = active, bindingId = supervisor.snapshot().binding.bindingId;
      // A busy peer can withhold abort acknowledgement. Disposal must not wait for it.
      const acknowledgement = supervisor.runtime.abort(bindingId, reason).catch(() => undefined);
      const evidence = await supervisor.runtime.dispose(bindingId); await acknowledgement;
      if (active.suspended) return; // New owner will reconcile this actual retained custody.
      const task = current(context, taskId);
      store().executions.closeExecution(application.contextForTask(context, task), { taskId, evidence });
      if (task.state === "CANCELLING") runtimeCommand(context, taskId, "confirm-stop", bindingId);
      else if (task.state === "RUNNING" && task.attempts.at(-1)!.pauseRequested) runtimeCommand(context, taskId, "confirm-pause", bindingId);
      else if (task.state === "RUNNING") runtimeCommand(context, taskId, "interrupted", bindingId, "incomplete");
      await supervisor.close();
    })();
    const pending = active.stopping;
    try { await pending; if (!active.suspended) releaseClosedCustody(taskId, active); }
    catch (error) {
      // Retain the exact Supervisor so an observed close can be persisted on a later retry.
      if (active.stopping === pending) active.stopping = undefined;
      throw error;
    }
  };
  const application = createPersistentSessionApplication({ store, daemonInstanceId: () => daemonInstanceId,
    afterTaskCommand(context, taskId, kind) {
      if (kind === "task.cancel" || kind === "task.pause") { void stop(taskId, "cancelled").catch(error => { lastFailure = error; }); return; }
      if (runtime && ["task.create", "task.retry", "task.continue", "task.revise-request"].includes(kind)) {
        const task = current(context, taskId);
        if (task.intent.request === syntheticTaskPrompt && task.intent.constraints.length === 0) void runTask(context, taskId).catch(() => undefined);
      }
    },
  });
  const apiOptions = () => ({ application, installationId, recoveryEpoch: () => String(store().currentFence({ kind: "global" }).recoveryEpoch) });
  let api = createSyntheticSessionApi(apiOptions());
  const executeTask = async (context: SessionApiContext, taskId: string) => {
    if (closed || restarting) return;
    if (!runtime) throw new SessionApiError("unsupported", "runtime_capability", 422);
    const task = current(context, taskId); if (task.state !== "READY") return;
    if (task.intent.request !== syntheticTaskPrompt || task.intent.constraints.length) throw new SessionApiError("unsupported", "runtime_capability", 422);
    if (live.size) throw new SessionApiError("unavailable", "dependency_down", 503);
    const owner = application.contextForTask(context, task), attempt = task.attempts.at(-1)!, inputId = `runtime-input-${randomUUID()}`;
    const input = store().tasks.recordRuntimeInput(owner, { commandId: inputId, idempotencyKey: inputId, taskId, expectedRevision: task.revision, attemptId: attempt.id, intentRevision: task.intent.revision, text: syntheticTaskPrompt });
    application.committed();
    const global = store().currentFence({ kind: "global" }), workspace = store().currentFence({ kind: "workspace", workspaceId: context.workspaceId });
    let supervisor: SyntheticWorkerSupervisor | undefined, active: LiveWorker | undefined;
    try {
      supervisor = await createSyntheticControlledWorkerSupervisor({ ...runtime, scenario: "text", taskIdentity: { executionUnitId: `execution-${randomUUID()}`, workspaceId: context.workspaceId, sessionId: task.sessionId, requestSnapshotRef: input.contentRef,
        fence: { installationId, recoveryEpoch: String(global.recoveryEpoch), owner: { kind: "task_attempt", id: attempt.id }, sourceTask: { taskId, attemptId: attempt.id, intentRevision: task.intent.revision }, contractRevision: 1, leaseEpoch: owner.ownerEpoch, cognition: { global: global.cognitionEpoch, workspace: workspace.cognitionEpoch }, policy: { global: global.policyEpoch, workspace: workspace.policyEpoch }, notAfter: new Date(Date.now() + 60_000).toISOString() } },
        beforeSyntheticModelReceive(record) { if (!supervisor || restarting || live.get(taskId)?.suspended) throw new Error("Missing current controlled binding."); store().executions.recordModelRequest(owner, { taskId, bindingId: supervisor.snapshot().binding.bindingId, requestId: record.requestId, context: record.context, maxTokens: record.maxTokens }); application.committed(); },
      });
      const admitted = current(context, taskId);
      if (closed || restarting || admitted.revision !== task.revision || admitted.state !== "READY" || admitted.attempts.at(-1)!.id !== attempt.id) return;
      store().executions.allocateExecution(owner, { taskId, expectedRevision: task.revision, spec: supervisor.spec, binding: supervisor.snapshot().binding });
      active = { context, supervisor, runFinished: false }; live.set(taskId, active);
      const binding = await supervisor.runtime.start(supervisor.spec);
      if (live.get(taskId)?.suspended) return;
      store().executions.markExecutionReady(owner, { taskId, binding });
      const readyTask = current(context, taskId);
      if (closed || restarting || readyTask.state !== "READY" || readyTask.revision !== task.revision) { await stop(taskId, "shutdown"); return; }
      runtimeCommand(context, taskId, "start", binding.bindingId);
      const collecting = (async () => {
        for await (const envelope of supervisor!.runtime.events(binding.bindingId)) {
          if (live.get(taskId)?.stopping || live.get(taskId)?.suspended) break;
          store().executions.observeExecutionBinding(owner, { taskId, binding: supervisor!.snapshot().binding });
          store().executions.ingestExecutionEvent(owner, { taskId, envelope }); application.committed();
          if (envelope.event.stability === "settled") break; // Store atomically commits exact envelope and VERIFYING.
        }
      })();
      const observed = collecting.catch(error => { throw error; }); void observed.catch(() => undefined);
      store().executions.markExecutionDispatched(owner, { taskId, bindingId: binding.bindingId });
      const accepted = await supervisor.runtime.dispatch(binding.bindingId);
      if (accepted.status !== "accepted") throw new SessionApiError("unavailable", "dependency_down", 503);
      await observed;
      if (active.suspended) return;
      if (active.stopping) await active.stopping;
      else { const evidence = await supervisor.runtime.dispose(binding.bindingId); store().executions.closeExecution(owner, { taskId, evidence }); if (current(context, taskId).state === "RUNNING") runtimeCommand(context, taskId, "interrupted", binding.bindingId, "incomplete"); }
    } catch (error) {
      if (live.get(taskId)?.suspended) return;
      const stopping = live.get(taskId)?.stopping; if (stopping) { await stopping; return; }
      if (supervisor) {
        const evidence = await supervisor.runtime.dispose(supervisor.snapshot().binding.bindingId);
        const execution = store().executions.readExecution(context.workspaceId, taskId);
        if (execution && !execution.closed) store().executions.closeExecution(owner, { taskId, evidence });
        if (current(context, taskId).state === "RUNNING") runtimeCommand(context, taskId, "interrupted", supervisor.snapshot().binding.bindingId, "incomplete");
      }
      throw error;
    } finally {
      try { if (supervisor && !active?.suspended) await supervisor.close(); }
      finally { if (active) active.runFinished = true; }
      // Physical disposal is not the durable close commit. A failed write retains this exact
      // Supervisor; a later successful stop retry may release it only after this run has drained.
      if (active && !active.suspended) releaseClosedCustody(taskId, active);
    }
  };
  const runTask = (context: SessionApiContext, taskId: string): Promise<void> => {
    if (closed || restarting || !runtime) return Promise.reject(new SessionApiError("unsupported", "runtime_capability", 422));
    const admittedContext = Object.freeze({ principalId: context.principalId, workspaceId: context.workspaceId });
    const operation = serial.then(() => executeTask(admittedContext, taskId)); serial = operation.catch(error => { lastFailure = error; }); return operation;
  };
  const reconcileRetained = async () => {
    const recovered: [string, LiveWorker][] = [];
    for (const [taskId, active] of [...live]) {
      if (!active.suspended) continue;
      const persisted = store().executions.readExecutionDetails(active.context.workspaceId, taskId);
      if (!persisted || persisted.bindingId !== active.supervisor.snapshot().binding.bindingId || canonicalJsonV1(persisted.spec) !== canonicalJsonV1(active.supervisor.spec)) throw new SessionApiError("unavailable", "recovery_required", 503);
      const acknowledgement = active.supervisor.runtime.abort(persisted.bindingId, "shutdown").catch(() => undefined);
      const evidence = await active.supervisor.runtime.dispose(persisted.bindingId); await acknowledgement;
      // This registry is populated only by observed disposal of the retained exact Supervisor.
      observedCloses.set(persisted.bindingId, { spec: persisted.spec, binding: persisted.binding, executionRevision: persisted.revision, evidence });
      const task = current(active.context, taskId);
      try { if (!persisted.closed) store().executions.recoverExecutionClose(application.contextForTask(active.context, task), { taskId, bindingId: persisted.bindingId, expectedExecutionRevision: persisted.revision }); }
      finally { observedCloses.delete(persisted.bindingId); }
      if (task.state === "CANCELLING") runtimeCommand(active.context, taskId, "confirm-stop", persisted.bindingId);
      else if (task.state === "RUNNING" || task.state === "VERIFYING") runtimeCommand(active.context, taskId, "interrupted", persisted.bindingId, "incomplete");
      await active.supervisor.close(); recovered.push([taskId, active]); application.committed();
    }
    if (recovered.length) { await serial; for (const [taskId, active] of recovered) releaseClosedCustody(taskId, active); }
  };
  return {
    mode: "synthetic-fixtures-only", production: "unsupported", application, get api() { return api; }, runTask,
    evidence(context, taskId) { const task = current(context, taskId), attemptId = task.attempts.at(-1)!.id, execution = store().executions.readExecutionDetails(context.workspaceId, taskId); return { ...(execution ? { execution } : {}), runtimeInputs: store().tasks.listRuntimeInputs(context.workspaceId, taskId, attemptId).value, modelRequests: store().executions.listModelRequests(context.workspaceId, taskId, attemptId) }; },
    async idle() { await serial; if (lastFailure) { const error = lastFailure; lastFailure = undefined; throw error; } },
    async interruptControlPlane() {
      if (closed || restarting) throw new SessionApiError("unavailable", "dependency_down", 503);
      restarting = true;
      lifecycle = lifecycle.catch(() => undefined).then(async () => { try {
        // Abrupt Store/control-plane loss; the enclosing synthetic launcher retains real Worker custody.
        for (const active of live.values()) active.suspended = true;
        await api.close(); coordinator.close(); daemonInstanceId = `synthetic-daemon-${randomUUID()}`;
        coordinator = openSyntheticRecoveryCoordinatorV2(recoveryOptions()); store().tasks.fenceRestartedOwners();
        api = createSyntheticSessionApi(apiOptions()); application.committed();
      } finally { if (!closing) restarting = false; } }); return lifecycle;
    },
    async reconcileRetainedWorkers() {
      if (closed || restarting) throw new SessionApiError("unavailable", "dependency_down", 503);
      restarting = true; lifecycle = lifecycle.catch(() => undefined).then(async () => { try { await reconcileRetained(); } finally { if (!closing) restarting = false; } }); return lifecycle;
    },
    async restart() {
      if (closed || restarting) throw new SessionApiError("unavailable", "dependency_down", 503);
      restarting = true;
      lifecycle = lifecycle.catch(() => undefined).then(async () => { try { await api.close(); await reconcileRetained(); await Promise.all([...live.keys()].map(taskId => stop(taskId, "shutdown"))); await serial; coordinator.close(); daemonInstanceId = `synthetic-daemon-${randomUUID()}`; coordinator = openSyntheticRecoveryCoordinatorV2(recoveryOptions()); store().tasks.fenceRestartedOwners(); api = createSyntheticSessionApi(apiOptions()); application.committed(); } finally { if (!closing) restarting = false; } });
      return lifecycle;
    },
    async close() {
      if (closed) return; if (closing) return lifecycle; closing = true; restarting = true;
      lifecycle = lifecycle.catch(() => undefined).then(async () => { await api.close(); await reconcileRetained(); await Promise.all([...live.keys()].map(taskId => stop(taskId, "shutdown"))); await serial; coordinator.close(); closed = true; await rm(root, { recursive: true, force: true }); }); return lifecycle;
    },
  };
}
