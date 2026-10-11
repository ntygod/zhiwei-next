import { randomUUID } from "node:crypto";
import { canonicalJsonV1, parseExecutionSpecV1, type ExecutionSpecV1, type CognitiveDecisionModelPortV1, type CognitiveDecisionModelRequestV1 } from "../../../../packages/protocol/src/index.ts";
import type { SyntheticCognitionStoreV2, TaskStoreContextV1, ContextSnapshotV1 } from "../../../../packages/memory-store/src/index.ts";
import { createSyntheticControlledBroker, type SyntheticBrokerSnapshot, type SyntheticDecisionFixtureV1 } from "../infrastructure/controlled-broker.ts";

export interface SyntheticDecisionModelV1 extends CognitiveDecisionModelPortV1 { snapshot(): SyntheticBrokerSnapshot; close(): Promise<void> }
export function createSyntheticTaskDecisionModelV1(options: Readonly<{ store: () => SyntheticCognitionStoreV2; context: TaskStoreContextV1; initial: ContextSnapshotV1; fixture?: SyntheticDecisionFixtureV1 }>): Promise<SyntheticDecisionModelV1> {
  const global = options.store().currentFence({ kind: "global" }), workspace = options.store().currentFence({ kind: "workspace", workspaceId: options.context.workspaceId }), capsule = options.initial.capsule;
  const spec = parseExecutionSpecV1({ schemaVersion: 1, executionUnitId: randomUUID(), workspaceId: capsule.workspaceId, sessionId: capsule.sessionId, prompt: options.initial.runtimeInput.snapshot.text,
    requestSnapshotRef: options.initial.runtimeInput.contentRef, selectedModelProfile: capsule.modelProfile, toolProfile: "none", controlledCwdRef: "synthetic-decision-cwd",
    fence: { installationId: global.installationId, recoveryEpoch: String(global.recoveryEpoch), owner: { kind: "task_attempt", id: capsule.attemptId },
      sourceTask: { taskId: capsule.taskId, attemptId: capsule.attemptId, intentRevision: capsule.intentRevision }, contractRevision: options.initial.runtimeInput.snapshot.contractRevision,
      leaseEpoch: options.context.ownerEpoch, cognition: { global: global.cognitionEpoch, workspace: workspace.cognitionEpoch }, policy: { global: global.policyEpoch, workspace: workspace.policyEpoch }, notAfter: new Date(Date.now() + 60000).toISOString() },
    bounds: { maxOutputBytes: 65536, maxDurationMs: 60000, maxTokens: capsule.budget.reservedOutput * 2, maxModelRequests: 2, maxToolCalls: 0 } });
  return createSyntheticDecisionModelV1({ ...options, spec });
}
/** Fixed scripted receiver through the existing Broker. No SDK/Provider callback or Agent loop. */
export async function createSyntheticDecisionModelV1(options: Readonly<{ spec: ExecutionSpecV1; store: () => SyntheticCognitionStoreV2; context: TaskStoreContextV1; fixture?: SyntheticDecisionFixtureV1 }>): Promise<SyntheticDecisionModelV1> {
  let pending: CognitiveDecisionModelRequestV1 | undefined, gateFailure: unknown;
  const owner = Object.freeze({ ...options.context });
  const broker = await createSyntheticControlledBroker(options.spec, { scenario: "decision", decisionFixture: options.fixture ?? "execute",
    beforeSyntheticModelReceive(record) {
      if (!pending || pending.requestId !== record.requestId || canonicalJsonV1(pending.context) !== canonicalJsonV1(record.context) || pending.maxTokens !== record.maxTokens) throw new Error("Unbound synthetic decision request");
      try { options.store().contexts.recordDecisionRequest(owner, { ...pending, context: record.context, maxTokens: record.maxTokens }); }
      catch (error) { gateFailure = error; throw error; }
    },
  });
  return Object.freeze({ profile: Object.freeze({ ...options.spec.selectedModelProfile }), structuredDecision: "synthetic-scripted" as const,
    async invoke(request: CognitiveDecisionModelRequestV1) {
      if (pending) throw new Error("Synthetic decision request already pending");
      pending = request; gateFailure = undefined;
      try {
        const result = await broker.handle({ kind: "model.invoke", requestId: request.requestId, context: request.context, maxTokens: request.maxTokens });
        if (gateFailure) throw gateFailure;
        if (!result.ok || result.result.kind !== "model.result" || result.result.toolCalls?.length || typeof result.result.text !== "string") throw new Error("Synthetic decision model unavailable");
        return Object.freeze({ text: result.result.text });
      } finally { pending = undefined; }
    },
    snapshot: () => broker.snapshot(), async close() { const result = await broker.dispose(); if (result.status !== "disposed") throw new Error("Synthetic decision cleanup failed"); },
  });
}
