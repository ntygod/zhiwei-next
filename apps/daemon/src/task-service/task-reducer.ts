import { ids, isTerminalTaskState, type Task, type TaskId, type TaskAttemptId, type OutcomeId } from "../../../../packages/domain/src/index.ts";
import { createTask, transitionTask, retryTask, reviseTaskIntent, type TaskAction, type TaskChange, type AttemptReceipt } from "../../../../packages/cognition-core/src/index.ts";
import type { TaskStoreCommandV1, TaskReductionContextV1, TaskReductionV1 } from "../../../../packages/memory-store/src/index.ts";
/** Only the Store's locked current Task is reduced; no caller history or external I/O. */
export function reducePersistentTask(current: Task | undefined, command: TaskStoreCommandV1, context: TaskReductionContextV1): TaskReductionV1 {
  const versions: Task[] = []; let task = current;
  const change = (): TaskChange => { if (!task) throw new Error("Task unavailable."); return { expectedRevision: task.revision, nextRevision: task.revision + 1, expectedIntentRevision: task.intent.revision, attemptId: task.attempts.at(-1)!.id, now: context.now, trigger: { id: command.commandId, revision: 1 } }; };
  const apply = (action: TaskAction) => { if (!task) throw new Error("Task unavailable."); task = transitionTask(task, change(), action).task; versions.push(task); };
  const receipt = (): AttemptReceipt => {
    if (!task || command.payload.kind !== "task.runtime" || !command.payload.evidenceRefs?.length) throw new Error("Durable runtime evidence required.");
    return { taskId: task.id, attemptId: task.attempts.at(-1)!.id, workspaceId: task.workspaceId, intentRevision: task.intent.revision, at: context.now, evidence: command.payload.evidenceRefs };
  };
  const stopped = (): AttemptReceipt => {
    if (!task || (context.activeExecution && !context.activeExecution.closed)) throw new Error("Execution not stopped.");
    return { taskId: task.id, attemptId: task.attempts.at(-1)!.id, workspaceId: task.workspaceId, intentRevision: task.intent.revision, at: context.now, evidence: [{ id: context.activeExecution?.bindingId ?? task.id, revision: current?.revision ?? task.revision }] };
  };
  if (!task) {
    if (command.payload.kind !== "task.create") throw new Error("Task unavailable.");
    const input = command.payload;
    task = createTask({ id: context.taskId as TaskId, attemptId: context.attemptId as TaskAttemptId, workspaceId: ids.workspace(command.workspaceId), sessionId: ids.session(input.sessionId), revision: 1, intent: { revision: 1, request: input.request, constraints: input.constraints, criteria: input.acceptanceChecks }, now: context.now });
    versions.push(task); apply({ kind: "prepare" }); return { versions };
  }
  if (command.payload.kind === "task.runtime") {
    switch (command.payload.event) {
      case "prepare": apply({ kind: "prepare" }); break;
      case "start": apply({ kind: "start", preparation: receipt() }); break;
      case "settled": apply({ kind: "settled", receipt: receipt(), completeness: command.payload.completeness ?? "incomplete" }); break;
      case "confirm-stop": apply({ kind: "confirm-stop", receipt: receipt(), unresolvedActions: [] }); break;
      case "confirm-pause": apply({ kind: "confirm-pause", receipt: receipt(), unresolvedActions: [] }); break;
      case "interrupted": {
        if (task.state === "RUNNING") apply({ kind: "settled", receipt: receipt(), completeness: "incomplete" });
        if (task.state !== "VERIFYING") throw new Error("Interrupted task requires closed execution.");
        const attempt = task.attempts.at(-1)!;
        apply({ kind: "finalize", outcomeId: context.outcomeId as OutcomeId, outcomeRevision: 1, results: attempt.intent.criteria.map(criterion => ({ taskId: task!.id, attemptId: attempt.id, workspaceId: task!.workspaceId, intentRevision: attempt.intent.revision, criterionId: criterion.id, criterionRevision: criterion.revision, method: criterion.method, checkedAt: context.now, explanation: "Execution was interrupted; the task result has not been verified.", status: "unknown", reason: "incomplete", evidence: [] })) }); break;
      }
      default: throw new Error("Unsupported runtime command.");
    }
    return { versions };
  }
  switch (command.payload.kind) {
    case "task.cancel": apply({ kind: "cancel" }); if (!context.activeExecution || context.activeExecution.closed) apply({ kind: "confirm-stop", receipt: stopped(), unresolvedActions: [] }); break;
    case "task.pause": apply({ kind: "request-pause" }); break;
    case "task.continue":
      if (task.state === "PAUSED" || (task.state === "READY" && (context.requiresReauthorization || context.activeExecution?.closed))) { stopped(); apply({ kind: "cancel" }); apply({ kind: "confirm-stop", receipt: stopped(), unresolvedActions: [] }); }
      if (!isTerminalTaskState(task.state)) { apply({ kind: "continue" }); break; }
      task = retryTask(task, change(), context.attemptId as TaskAttemptId).task; versions.push(task); apply({ kind: "prepare" }); break;
    case "task.retry": task = retryTask(task, change(), context.attemptId as TaskAttemptId).task; versions.push(task); apply({ kind: "prepare" }); break;
    case "task.revise-request": {
      if (!isTerminalTaskState(task.state)) { stopped(); apply({ kind: "cancel" }); apply({ kind: "confirm-stop", receipt: stopped(), unresolvedActions: [] }); }
      const input = command.payload;
      task = reviseTaskIntent(task, change(), { revision: input.intentRevision + 1, request: input.request, constraints: input.constraints, criteria: input.acceptanceChecks }, context.attemptId as TaskAttemptId).task;
      versions.push(task); apply({ kind: "prepare" }); break;
    }
    case "task.respond": case "task.confirm-result": throw new Error("Exact trusted consumer unsupported.");
    default: throw new Error("Unsupported task command.");
  }
  return { versions };
}
