import { assertIdentifierV2, assertIsoTimestampV2, assertRevisionV2, assertScopeV2, assertWorkingStateV2, assertMemoryClaimV2,
  assertTaskIntent, isScopeWithinV2, type Task, type WorkingStateV2, type MemoryClaimV2, type ScopeV2,
  type ClaimVersionRefV2, type CognitiveContextCapsuleV1, type ContextBudgetV1, type ContextClaimRefV1 } from "../../domain/src/index.ts";
import { selectContextBudget, type ExactTokenCounter, type BudgetMaterial, type BudgetSelectionFailure } from "./budget-selection.ts";

export interface CognitiveContextInputV1 {
  readonly id: string;
  readonly task: Task;
  readonly workingState: WorkingStateV2;
  readonly scope: ScopeV2;
  readonly claims: readonly MemoryClaimV2[];
  readonly requiredClaims: readonly ClaimVersionRefV2[];
  readonly compiledAt: string;
  readonly modelProfile: Readonly<{ id: string; revision: number }>;
  readonly budget: ContextBudgetV1;
  readonly counter: ExactTokenCounter;
}
export type CognitiveContextResultV1 = Readonly<{ ok: true; capsule: CognitiveContextCapsuleV1 }> | BudgetSelectionFailure;
const priority = { constraint: 0, decision: 1, preference: 2, fact: 3 } as const;
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function ref(claim: MemoryClaimV2): ContextClaimRefV1 { return { kind: "claim", id: claim.id, revision: claim.revision, version: claim.version }; }
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function invalid(): never { throw new Error("Invalid context input"); }

/** The caller supplies source-checked current snapshots. Persistent read-set/fence validation
 * remains at the owning Store; a pure capsule can never be used as a send credential. */
export function compileCognitiveContextV1(input: CognitiveContextInputV1): CognitiveContextResultV1 {
  try {
    const { task, workingState: working, scope, compiledAt } = input;
    assertIdentifierV2(input.id); assertIsoTimestampV2(compiledAt); assertScopeV2(scope);
    assertIdentifierV2(task.id); assertIdentifierV2(task.workspaceId); assertIdentifierV2(task.sessionId); assertRevisionV2(task.revision); assertTaskIntent(task.intent);
    assertWorkingStateV2(working); assertIdentifierV2(input.modelProfile.id); assertRevisionV2(input.modelProfile.revision);
    const attempt = task.attempts.at(-1);
    if (scope.kind !== "workspace" || scope.workspaceId !== task.workspaceId || !attempt || attempt.taskId !== task.id
      || attempt.workspaceId !== task.workspaceId || attempt.intent.revision !== task.intent.revision
      || working.task.id !== task.id || working.task.revision !== task.revision || working.intentRevision !== task.intent.revision
      || working.taskAttempt.taskId !== task.id || working.taskAttempt.attemptId !== attempt.id || working.taskAttempt.intentRevision !== task.intent.revision
      || !isScopeWithinV2(working.scope, scope) || working.privacy !== "model-allowed"
      || !["READY", "RUNNING"].includes(task.state) || compiledAt < task.updatedAt || compiledAt < working.updatedAt
      || !Array.isArray(input.claims) || input.claims.length > 100 || !Array.isArray(input.requiredClaims)) invalid();
    const required = new Map<string, number>();
    for (const wanted of input.requiredClaims) {
      assertIdentifierV2(wanted.claimId); assertRevisionV2(wanted.version);
      if (required.has(wanted.claimId) && required.get(wanted.claimId) !== wanted.version) invalid();
      required.set(wanted.claimId, wanted.version);
    }
    const inTask = (candidate: ScopeV2) => isScopeWithinV2(candidate, scope)
      && (candidate.kind !== "task" || candidate.taskId === task.id)
      && (candidate.kind !== "session" || candidate.sessionId === task.sessionId);
    const eligible = new Map<string, MemoryClaimV2>();
    for (const claim of input.claims) {
      assertMemoryClaimV2(claim);
      // No ineligible body is rendered or passed to a counter/model boundary.
      if (!inTask(claim.scope) || claim.privacy !== "model-allowed" || claim.status !== "ACTIVE"
        || claim.createdAt > compiledAt || claim.validFrom > compiledAt || claim.validUntil !== undefined && claim.validUntil <= compiledAt
        || claim.evidence.some(source => source.privacy !== "model-allowed" || !inTask(source.scope))) continue;
      const prior = eligible.get(claim.id);
      const identity = (value: MemoryClaimV2) => JSON.stringify({ ...value, evidence: [...value.evidence].sort((a,b) => compare(a.source.id,b.source.id) || compare(a.fragmentId ?? "",b.fragmentId ?? "")) });
      if (prior && (prior.version !== claim.version || prior.revision !== claim.revision || identity(prior) !== identity(claim))) invalid();
      eligible.set(claim.id, claim);
    }
    for (const [id, version] of required) if (eligible.get(id)?.version !== version) return freeze({ ok: false, error: "invalid_input", reason: "required_unavailable" });
    const materials: BudgetMaterial[] = [...eligible.values()].map(claim => ({ id: claim.id, version: claim.version,
      body: JSON.stringify({ statement: claim.statement, epistemic: claim.epistemic, sourceTrust: claim.sourceTrust, kind: claim.kind }),
      sourceRefs: claim.evidence.map(source => ({ id: source.source.id, version: source.source.revision, selector: source.fragmentId ?? "observation" })),
      category: "current", required: required.has(claim.id), priorityOrdinal: priority[claim.kind] }));
    const selected = selectContextBudget({ base: { constraints: JSON.stringify(task.intent.constraints), currentRequest: task.intent.request,
      acceptanceCriteria: JSON.stringify(task.intent.criteria), workingState: JSON.stringify({ currentStep: working.currentStep, known: working.known,
        unknown: working.unknown, pendingInput: working.pendingInput, nextSteps: working.nextSteps, evidence: working.evidence }) },
      materials, budget: input.budget, counter: input.counter });
    if (!selected.ok) return selected;
    const capsule: CognitiveContextCapsuleV1 = { schemaVersion: 1, id: input.id, workspaceId: task.workspaceId, sessionId: task.sessionId,
      taskId: task.id, taskRevision: task.revision, attemptId: attempt.id, intentRevision: task.intent.revision,
      workingState: { id: working.id, revision: working.revision }, scope: { ...scope }, compiledAt, modelProfile: { ...input.modelProfile },
      compilerRevision: "cognitive-context-v1", rendererRevision: selected.metadata.rendererRevision, counter: { ...selected.metadata.counter },
      budget: { ...input.budget }, rendering: { ...selected.rendering }, report: {
        selected: selected.decisions.filter(d => d.status === "selected").flatMap(d => d.refs.map(item => {
          const claim = eligible.get(item.id)!; return { ref: ref(claim), evidence: JSON.parse(JSON.stringify(claim.evidence)) as MemoryClaimV2["evidence"], required: required.has(claim.id), reason: d.reason }; })),
        excluded: selected.decisions.filter(d => d.status === "excluded").flatMap(d => d.refs.map(item => ({ ref: ref(eligible.get(item.id)!), reason: d.reason }))),
        availableInput: selected.accounting.availableInput, memoryBudget: selected.accounting.memoryBudget, baseTokens: selected.accounting.baseTokens,
        memoryTokens: selected.accounting.finalExactTokens.memory, inputTokens: selected.accounting.finalExactTokens.full } };
    // All nested output values are copied, including sources and the caller's budget/profile.
    return freeze({ ok: true, capsule });
  } catch { return freeze({ ok: false, error: "invalid_input", reason: "invalid_input" }); }
}
