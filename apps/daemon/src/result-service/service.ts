import type { CriterionCheckV1, CriterionObservationPayloadV1, TaskResultBundleV1, OutcomeVerificationPlanV1 } from "../../../../packages/domain/src/index.ts";
import { CognitiveProtocolError, parseLocalApiCommandV1, parseOutcomePlanCommandV1, parseOutcomeVerifyCommandV1, parseOutcomeFeedbackCommandV1,
  type LocalApiCommandV1, type OutcomePlanCommandV1, type OutcomeVerifyCommandV1, type OutcomeFeedbackCommandV1 } from "../../../../packages/protocol/src/index.ts";
import { CognitiveStoreErrorV2, type SyntheticCognitionStoreV2, type OutcomeVerificationSnapshotV1, type OutcomeCommitV1, type OutcomePlanCommitV1 } from "../../../../packages/memory-store/src/index.ts";
import { SessionApiError, type SessionApiContext } from "../session-api/service.ts";
import type { PersistentSessionApplication } from "../task-service/application.ts";

/** This in-process reader is fixed by the owning daemon, never supplied through the wire. */
export interface OutcomeVerificationReaderV1 {
  preparePlan(plan: OutcomeVerificationPlanV1): void;
  read(snapshot: OutcomeVerificationSnapshotV1, check: CriterionCheckV1): CriterionObservationPayloadV1;
}
export interface OutcomeServiceV1 {
  bindPlan(context: SessionApiContext, command: OutcomePlanCommandV1): OutcomePlanCommitV1;
  verify(context: SessionApiContext, command: OutcomeVerifyCommandV1): OutcomeCommitV1;
  feedback(context: SessionApiContext, command: OutcomeFeedbackCommandV1): OutcomeCommitV1;
  confirm(context: SessionApiContext, command: LocalApiCommandV1): OutcomeCommitV1;
  read(context: SessionApiContext, taskId: string): TaskResultBundleV1;
  history(context: SessionApiContext, taskId: string): readonly TaskResultBundleV1[];
}
function mapped<T>(operation: () => T): T {
  try { return operation(); } catch (error) {
    if (error instanceof SessionApiError || error instanceof CognitiveProtocolError) throw error;
    if (error instanceof CognitiveStoreErrorV2) {
      const shape = { revision_conflict: ["revision_conflict", "stale_context", 409], conflict: ["idempotency_conflict", "idempotency_conflict", 409],
        unavailable: ["not_found", "not_found", 404], unsupported: ["unsupported", "runtime_capability", 422], validation: ["validation", "invalid_shape", 400],
        corruption: ["corruption", "integrity_failed", 500] } as const;
      const value = shape[error.code as keyof typeof shape]; if (value) throw new SessionApiError(value[0], value[1], value[2]);
    }
    throw new SessionApiError("unavailable", "dependency_down", 503);
  }
}
export function createOutcomeServiceV1(options: Readonly<{ store: () => SyntheticCognitionStoreV2; application: PersistentSessionApplication;
  reader: OutcomeVerificationReaderV1; ids: { next(): string }; now(): string }>): OutcomeServiceV1 {
  const owner = (context: SessionApiContext, taskId: string) => options.application.contextForTask(context, options.application.getTask(context, taskId).value);
  const commit = (context: SessionApiContext, command: OutcomeFeedbackCommandV1) => {
    const current = owner(context, command.taskId), prepared = options.store().outcomes.prepareFeedback(current, command);
    const result = prepared.committed ?? options.store().outcomes.commit(current, prepared.snapshot.id, []);
    if (!result.replay) options.application.committed(); return result;
  };
  const service: OutcomeServiceV1 = {
    bindPlan(context, raw) { return mapped(() => { const command = parseOutcomePlanCommandV1(raw), result = options.store().outcomes.bindPlan(owner(context, command.taskId), command);
      options.reader.preparePlan(result.plan); return result; }); },
    verify(context, raw) { return mapped(() => {
      const command = parseOutcomeVerifyCommandV1(raw), current = owner(context, command.taskId), prepared = options.store().outcomes.prepare(current, command);
      if (prepared.committed) return prepared.committed;
      const snapshot = prepared.snapshot, observations = snapshot.plan.checks.map(check => {
        let payload: CriterionObservationPayloadV1;
        if (snapshot.task.state === "CANCELLED") payload = { kind: "unknown", reason: "incomplete" };
        else { try { payload = options.reader.read(snapshot, check); } catch { payload = { kind: "unknown", reason: "validator-error" }; } }
        return { schemaVersion: 1 as const, id: options.ids.next(), workspaceId: snapshot.task.workspaceId, taskId: snapshot.task.id,
          attemptId: snapshot.plan.taskAttempt.attemptId, intentRevision: snapshot.plan.taskAttempt.intentRevision, criterionId: check.criterionId,
          criterionRevision: check.criterionRevision, observedAt: options.now(), notAfter: snapshot.notAfter, payload };
      });
      const result = options.store().outcomes.commit(current, snapshot.id, observations); if (!result.replay) options.application.committed(); return result;
    }); },
    feedback(context, raw) { return mapped(() => commit(context, parseOutcomeFeedbackCommandV1(raw))); },
    confirm(context, raw) { return mapped(() => {
      const command = parseLocalApiCommandV1(raw), payload = command.payload; if (payload.kind !== "task.confirm-result") throw new SessionApiError("validation", "invalid_shape", 400);
      owner(context, payload.targetRef.id);
      const prior = options.store().outcomes.history(context.workspaceId, payload.targetRef.id).find(item => item.task.revision === payload.targetRef.revision),
        observation = prior?.observations.find(item => item.criterionId === payload.criterionId && item.criterionRevision === payload.criterionRevision);
      if (!prior || payload.evidenceRefs.length !== 1 || !observation || payload.evidenceRefs[0]!.id !== observation.id || payload.evidenceRefs[0]!.revision !== 1)
        throw new SessionApiError("revision_conflict", "stale_context", 409);
      return commit(context, parseOutcomeFeedbackCommandV1({ schemaVersion: 1, commandId: command.commandId, idempotencyKey: command.idempotencyKey, workspaceId: command.workspaceId,
        taskId: payload.targetRef.id, expectedRevision: command.expectedRevision, attemptId: payload.attemptId, intentRevision: payload.intentRevision,
        outcomeId: prior.outcome.id, outcomeRevision: prior.outcome.revision, criterionId: payload.criterionId, criterionRevision: payload.criterionRevision, decision: "accepted" }));
    }); },
    read(context, taskId) { return mapped(() => { owner(context, taskId); const result = options.store().outcomes.read(context.workspaceId, taskId);
      if (!result) throw new SessionApiError("not_found", "not_found", 404); return result; }); },
    history(context, taskId) { return mapped(() => { owner(context, taskId); return options.store().outcomes.history(context.workspaceId, taskId); }); },
  };
  return service;
}
