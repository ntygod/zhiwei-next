import type { Task, TaskState } from "../../../../packages/domain/src/index.ts";
import { parseLocalApiCommandV1, parseSessionCreateCommandV1, parseSessionContractV1, canonicalJsonV1, type SessionContractV1 } from "../../../../packages/protocol/src/index.ts";
import { CognitiveStoreErrorV2, type SyntheticCognitionStoreV2, type TaskStoreContextV1 } from "../../../../packages/memory-store/src/index.ts";
import { SessionApiError, type SessionApiApplication, type SessionApiContext } from "../session-api/service.ts";
export const syntheticTaskPrompt = "Summarize the fixed synthetic sample.";
export const syntheticTaskSessionContract: SessionContractV1 = parseSessionContractV1({ schemaVersion: 1, runtimeProfile: { id: "zhiwei-controlled-synthetic-v1", revision: 1 }, modelProfile: { id: "synthetic-v1", revision: 1 }, toolProfile: { id: "none", revision: 1 }, policyProfile: { id: "synthetic-no-external-effects", revision: 1 }, dataProfile: { id: "synthetic-temporary-content", revision: 1 }, compilerProfile: { id: "fixed-synthetic-input", revision: 1 }, interactionKind: "interactive" });
const pairs = new Map([["synthetic-principal-a", "synthetic-workspace-a"], ["synthetic-principal-b", "synthetic-workspace-b"]]);
export interface PersistentSessionApplication extends SessionApiApplication { committed(): void; contextForTask(context: SessionApiContext, task: Task): TaskStoreContextV1 }
function mapped<T>(operation: () => T): T {
  try { return operation(); } catch (error) {
    if (error instanceof SessionApiError) throw error;
    if (error instanceof CognitiveStoreErrorV2) switch (error.code) {
      case "revision_conflict": throw new SessionApiError("revision_conflict", "stale_context", 409);
      case "conflict": throw new SessionApiError("idempotency_conflict", "idempotency_conflict", 409);
      case "sequence": throw new SessionApiError("unavailable", "event_gap", 410);
      case "unsupported": throw new SessionApiError("unsupported", "runtime_capability", 422);
      case "unavailable": throw new SessionApiError("not_found", "not_found", 404);
      case "validation": throw new SessionApiError("validation", "invalid_shape", 400);
      case "corruption": throw new SessionApiError("corruption", "integrity_failed", 500);
      case "recovery_required": throw new SessionApiError("unavailable", "recovery_required", 503);
    }
    throw new SessionApiError("unavailable", "dependency_down", 503);
  }
}
/** Membership and profile are composition-owned. No HTTP authority overrides or caller history. */
export function createPersistentSessionApplication(options: Readonly<{ store: () => SyntheticCognitionStoreV2; daemonInstanceId: () => string; afterTaskCommand?: (context: SessionApiContext, taskId: string, kind: string) => void }>): PersistentSessionApplication {
  const listeners = new Set<() => void>();
  const authorize = (context: SessionApiContext) => pairs.get(context.principalId) === context.workspaceId;
  const check = (context: SessionApiContext) => { if (!authorize(context)) throw new SessionApiError("not_found", "not_found", 404); };
  const committed = () => { for (const listener of listeners) queueMicrotask(() => { if (listeners.has(listener)) { try { listener(); } catch { /* Durable replay recovers notification failures. */ } } }); };
  const contextForTask = (context: SessionApiContext, task: Task): TaskStoreContextV1 => {
    check(context); const session = options.store().tasks.getSession(context.workspaceId, task.sessionId).value;
    if (!session || task.workspaceId !== context.workspaceId) throw new SessionApiError("not_found", "not_found", 404);
    return { ...context, daemonInstanceId: options.daemonInstanceId(), ownerEpoch: session.ownerEpoch };
  };
  return {
    authorize, committed, contextForTask, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    createSession(context, raw) { return mapped(() => {
      check(context); const command = parseSessionCreateCommandV1(raw);
      if (command.workspaceId !== context.workspaceId) throw new SessionApiError("not_found", "not_found", 404);
      if (canonicalJsonV1(command.payload.contract) !== canonicalJsonV1(syntheticTaskSessionContract)) throw new SessionApiError("unsupported", "runtime_capability", 422);
      const result = options.store().tasks.createSession({ ...context, daemonInstanceId: options.daemonInstanceId(), ownerEpoch: 1 }, command);
      if (!result.replay) committed(); return { value: result.receipt, commitCursor: result.commitCursor };
    }); },
    executeTask(context, raw) { return mapped(() => {
      check(context); const command = parseLocalApiCommandV1(raw);
      if (command.workspaceId !== context.workspaceId) throw new SessionApiError("not_found", "not_found", 404);
      if (!command.payload.kind.startsWith("task.") || command.payload.kind === "task.respond" || command.payload.kind === "task.confirm-result") throw new SessionApiError("unsupported", "runtime_capability", 422);
      let owner: TaskStoreContextV1;
      if (command.payload.kind === "task.create") {
        const session = options.store().tasks.getSession(context.workspaceId, command.payload.sessionId).value;
        if (!session) throw new SessionApiError("not_found", "not_found", 404);
        if (canonicalJsonV1(command.payload.executionProfile) !== canonicalJsonV1(syntheticTaskSessionContract.runtimeProfile) || command.payload.goalRef !== undefined) throw new SessionApiError("unsupported", "runtime_capability", 422);
        owner = { ...context, daemonInstanceId: options.daemonInstanceId(), ownerEpoch: session.ownerEpoch };
      } else {
        if (!("targetRef" in command.payload)) throw new SessionApiError("unsupported", "runtime_capability", 422);
        const task = options.store().tasks.getTask(context.workspaceId, command.payload.targetRef.id).value;
        if (!task) throw new SessionApiError("not_found", "not_found", 404); owner = contextForTask(context, task);
      }
      const result = options.store().tasks.executeTask(owner, command);
      if (!result.replay) { committed(); options.afterTaskCommand?.(context, result.receipt.aggregate.id, command.payload.kind); }
      return { value: result.receipt, commitCursor: result.commitCursor };
    }); },
    getSession(context, id) { return mapped(() => { check(context); const result = options.store().tasks.getSession(context.workspaceId, id); if (!result.value) throw new SessionApiError("not_found", "not_found", 404); return { value: result.value, commitCursor: result.commitCursor }; }); },
    getTask(context, id) { return mapped(() => { check(context); const result = options.store().tasks.getTask(context.workspaceId, id); if (!result.value) throw new SessionApiError("not_found", "not_found", 404); return { value: result.value, commitCursor: result.commitCursor }; }); },
    listTasks(context, query) { return mapped(() => { check(context); const result = options.store().tasks.listTasks(context.workspaceId, { limit: query.limit, ...(query.state ? { state: query.state as TaskState } : {}), ...(query.after ? { after: query.after } : {}) }); return { value: { tasks: result.value, ...(result.value.length === query.limit ? { nextAfter: result.value.at(-1)!.id } : {}) }, commitCursor: result.commitCursor }; }); },
    snapshot(context) { return mapped(() => { check(context); return options.store().tasks.snapshot(context.workspaceId); }); },
    replay(context, query) { return mapped(() => { check(context); return options.store().tasks.replay(context.workspaceId, query); }); },
  };
}
