import type { CognitiveDecisionV1 } from "../../../../packages/domain/src/index.ts";
import { canonicalJsonV1, deserializeCognitiveDecisionV1, type CognitiveDecisionModelPortV1 } from "../../../../packages/protocol/src/index.ts";
import { validateCognitiveDecisionV1 } from "../../../../packages/cognition-core/src/index.ts";
import type { SyntheticCognitionStoreV2, TaskStoreContextV1, ContextSnapshotV1, CognitiveBoundaryReadV1 } from "../../../../packages/memory-store/src/index.ts";

export interface CognitiveCoordinationResultV1 { readonly boundary: CognitiveBoundaryReadV1; readonly context: ContextSnapshotV1 }
/** At most an initial and one repair/retrieval decision. Runtime execution owns its own loop. */
export async function coordinateCognitiveBoundaryV1(options: Readonly<{ store: () => SyntheticCognitionStoreV2; context: TaskStoreContextV1; initial: ContextSnapshotV1; model: CognitiveDecisionModelPortV1; ids: { next(): string } }>): Promise<CognitiveCoordinationResultV1> {
  const owner = Object.freeze({ ...options.context }), store = options.store;
  let current = store().contexts.read(owner.workspaceId, options.initial.capsule.taskId, options.initial.capsule.id);
  let boundary = store().contexts.openBoundary(owner, { id: options.ids.next(), capsuleId: current.capsule.id });
  const done = () => {
    const decision = boundary.decisions.at(-1)?.decision;
    if (decision?.action === "clarify" || decision?.action === "wait") {
      const task = store().tasks.getTask(owner.workspaceId, boundary.taskId).value;
      if (!task) throw new Error("Current task unavailable.");
      const commandId = `cognitive-wait:${boundary.id}`;
      store().tasks.executeTask(owner, { schemaVersion: 1, commandId, idempotencyKey: commandId, workspaceId: owner.workspaceId,
        expectedRevision: boundary.taskRevision, payload: { kind: "task.runtime", taskId: boundary.taskId, event: "cognitive-wait", boundaryId: boundary.id } });
    }
    return { boundary, context: current };
  };
  const stop = (reason: Extract<CognitiveDecisionV1, { action: "stop" }>["reason"]) => {
    boundary = store().contexts.commitDecision(owner, { boundaryId: boundary.id, capsuleId: boundary.capsuleId, origin: "coordinator-stop", requestId: null,
      decision: { schemaVersion: 1, action: "stop", reason, summary: "当前认知边界已明确终止。", claimRefs: [] } }); return done();
  };
  if (boundary.status !== "open") {
    const task = store().tasks.getTask(owner.workspaceId, boundary.taskId).value;
    if (task?.state === "WAITING_INPUT" && task.revision === boundary.taskRevision + 1 && ["clarify", "wait"].includes(boundary.decisions.at(-1)?.decision.action ?? "")) return done();
    store().contexts.assertCurrent(owner, boundary.capsuleId); current = store().contexts.read(owner.workspaceId, boundary.taskId, boundary.capsuleId); return done();
  }
  current = store().contexts.read(owner.workspaceId, boundary.taskId, boundary.capsuleId);
  store().contexts.assertCurrent(owner, current.capsule.id);
  if (options.model.structuredDecision !== "synthetic-scripted" || canonicalJsonV1(options.model.profile) !== canonicalJsonV1(current.capsule.modelProfile)) return stop("unsupported");
  let purpose: "initial" | "repair" | "retrieval" = boundary.callCount === 0 ? "initial" : "repair";
  while (boundary.callCount < 2) {
    const previous = boundary.decisions.at(-1)?.decision;
    if (previous?.action === "retrieve") {
      const refs = current.capsule.report.selected.map(item => ({ claimId: item.ref.id, version: item.ref.version }));
      const replacement = store().contexts.prepare(owner, { id: options.ids.next(), taskId: current.capsule.taskId, expectedRevision: current.capsule.taskRevision, query: previous.query, requiredClaims: refs });
      const materials = (snapshot: ContextSnapshotV1) => snapshot.capsule.report.selected.map(item => canonicalJsonV1(item.ref)).sort();
      // A different query, order or required marker does not constitute new material.
      if (canonicalJsonV1(materials(replacement)) === canonicalJsonV1(materials(current))) return stop("no-progress");
      current = replacement; purpose = "retrieval";
    }
    const reservation = store().contexts.reserveDecisionCall(owner, { boundaryId: boundary.id, capsuleId: current.capsule.id, requestId: options.ids.next(), purpose });
    // The Store owns the committed count. Failure never decrements it or creates a fresh boundary.
    boundary = store().contexts.readBoundary(owner.workspaceId, boundary.taskId, boundary.id);
    const { input, contentRef: _content, ...request } = reservation;
    const response = await options.model.invoke(request);
    store().contexts.assertCurrent(owner, current.capsule.id); // Includes the final model response with no subsequent tool call.
    let decision: CognitiveDecisionV1;
    try { decision = deserializeCognitiveDecisionV1(response.text); }
    catch { if (boundary.callCount === 2) return stop("invalid-decision"); purpose = "repair"; continue; }
    const validity = validateCognitiveDecisionV1(decision, input);
    if (!validity.ok) { if (boundary.callCount === 2 || validity.reason === "call-limit") return stop(validity.reason); purpose = "repair"; continue; }
    boundary = store().contexts.commitDecision(owner, { boundaryId: boundary.id, capsuleId: current.capsule.id, decision, origin: "model-proposal", requestId: reservation.requestId });
    if (decision.action !== "retrieve") return done();
  }
  return stop("call-limit");
}
