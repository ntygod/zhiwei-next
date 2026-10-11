import assert from "node:assert/strict";
import { test } from "node:test";
import type { MemoryClaimV2, Task, WorkingStateV2, EvidenceRefV2 } from "../../domain/src/index.ts";
import { compileCognitiveContextV1, type CognitiveContextInputV1 } from "./index.ts";
const at = "2026-10-11T00:00:00.000Z", compiledAt = "2026-10-11T00:00:01.000Z";
const workspaceId = "synthetic-workspace-a";
const evidence: EvidenceRefV2 = { source: { kind: "observation", id: "synthetic-input", revision: 1 }, scope: { kind: "task", workspaceId, taskId: "synthetic-task" }, privacy: "model-allowed", sourceTrust: "user-direct", role: "supports", observedAt: at };
const intent = { revision: 1, request: "Prepare the synthetic project plan.", constraints: ["Use synthetic material only."], criteria: [{ id: "synthetic-criterion", revision: 1, description: "A synthetic plan exists.", required: true, method: "artifact" }] };
const task = { id: "synthetic-task", workspaceId, sessionId: "synthetic-session", revision: 2, intent, state: "READY", createdAt: at, updatedAt: at,
  attempts: [{ id: "synthetic-attempt", taskId: "synthetic-task", workspaceId, intent, state: "READY", createdAt: at, updatedAt: at, pauseRequested: false, cancellationRequested: false, completeness: "not-settled", outcomes: [], unresolvedActions: [] }] } as unknown as Task;
const working: WorkingStateV2 = { schemaVersion: 2, id: "synthetic-working", revision: 2, scope: evidence.scope, privacy: "model-allowed", sourceTrust: "user-direct", createdAt: at, updatedAt: at,
  task: { kind: "task", id: task.id, revision: task.revision }, taskAttempt: { taskId: task.id, attemptId: task.attempts[0]!.id, intentRevision: 1 }, intentRevision: 1,
  currentStep: "Ready", known: [], unknown: [], pendingInput: [], nextSteps: ["Prepare the plan"], evidence: [evidence] };
function claim(id: string, patch: Partial<MemoryClaimV2> = {}): MemoryClaimV2 {
  return { schemaVersion: 2, id, revision: 1, version: 1, scope: { kind: "workspace", workspaceId }, privacy: "model-allowed", sourceTrust: "user-direct",
    createdAt: at, updatedAt: at, kind: "preference", statement: "The synthetic project uses a blue notebook.", epistemic: "asserted", status: "ACTIVE", validFrom: at,
    evidence: [{ ...evidence, source: { kind: "observation", id: "source-" + id, revision: 1 }, scope: { kind: "workspace", workspaceId } }], ...patch };
}
function input(claims: readonly MemoryClaimV2[], counted: string[] = []): CognitiveContextInputV1 {
  return { id: "synthetic-capsule", task, workingState: working, scope: { kind: "workspace", workspaceId }, claims, requiredClaims: [], compiledAt,
    modelProfile: { id: "synthetic-v1", revision: 1 }, budget: { contextLimit: 30_000, reservedOutput: 1000, mandatoryProtocolOverhead: 0 },
    // Exact for this synthetic character counter only, never a real Provider tokenizer claim.
    counter: { id: "synthetic-character-counter", version: "1", mode: "exact", count(text) { counted.push(text); return text.length; } } };
}
test("Cognitive context filters before counting, renders attribution, deduplicates and freezes its exact source versions", () => {
  const visible = claim("visible"), counted: string[] = [];
  const local = claim("local", { privacy: "local-only", statement: "Synthetic hidden local statement." });
  const otherScope = { kind: "workspace" as const, workspaceId: "synthetic-workspace-b" };
  const other = claim("other", { scope: otherScope, statement: "Synthetic hidden other workspace.", evidence: [{ ...evidence, scope: otherScope }] });
  const result = compileCognitiveContextV1(input([other, visible, local, structuredClone(visible), claim("expired", { status: "EXPIRED" })], counted));
  assert.equal(result.ok, true); if (!result.ok) return;
  assert.equal(result.capsule.report.selected.length, 1); assert.equal(result.capsule.report.selected[0]!.ref.id, "visible");
  assert.match(result.capsule.rendering.fullText, /asserted/); assert.match(result.capsule.rendering.fullText, /source-visible/);
  for (const text of counted) assert.doesNotMatch(text, /hidden local|hidden other|source-local|source-other/);
  assert.ok(Object.isFrozen(result.capsule.report.selected[0]!.evidence[0]!.source));
  (visible as { statement: string }).statement = "Changed input"; assert.doesNotMatch(result.capsule.rendering.fullText, /Changed input/);
});
test("Context requires current task/working versions and exact required memory, with explicit budget failure", () => {
  const memory = claim("required"), base = input([memory]);
  assert.deepEqual(compileCognitiveContextV1({ ...base, workingState: { ...working, task: { ...working.task, revision: 1 } } }), { ok: false, error: "invalid_input", reason: "invalid_input" });
  const otherSession = { kind: "session" as const, workspaceId, sessionId: "synthetic-other-session" };
  const counted: string[] = [];
  assert.deepEqual(compileCognitiveContextV1({ ...input([memory], counted), workingState: { ...working, scope: otherSession, evidence: [{ ...evidence, scope: otherSession }] } }), { ok: false, error: "invalid_input", reason: "invalid_input" });
  assert.equal(counted.length, 0);
  assert.deepEqual(compileCognitiveContextV1({ ...base, requiredClaims: [{ claimId: "missing", version: 1 }] }), { ok: false, error: "invalid_input", reason: "required_unavailable" });
  const overflow = compileCognitiveContextV1({ ...base, budget: { contextLimit: 10, reservedOutput: 0, mandatoryProtocolOverhead: 0 } });
  assert.equal(overflow.ok, false); if (!overflow.ok) assert.equal(overflow.error, "budget_conflict");
  const large = compileCognitiveContextV1({ ...input([claim("required", { statement: "x".repeat(1800) })]), requiredClaims: [{ claimId: "required", version: 1 }], budget: { contextLimit: 3000, reservedOutput: 0, mandatoryProtocolOverhead: 0 } });
  assert.equal(large.ok, false); if (!large.ok) assert.equal(large.error, "budget_conflict");
});
test("Context order and selection are stable and another task's scoped fact is not current knowledge", () => {
  const a = claim("a"), b = claim("b", { kind: "decision" });
  const otherScope = { kind: "task" as const, workspaceId, taskId: "synthetic-other-task" };
  const other = claim("other-task", { scope: otherScope, evidence: [{ ...evidence, scope: otherScope }] });
  const first = compileCognitiveContextV1(input([a,b,other])), second = compileCognitiveContextV1(input([other,b,a]));
  assert.deepEqual(first, second); assert.equal(first.ok, true);
  if (first.ok) assert.deepEqual(first.capsule.report.selected.map(item => item.ref.id), ["b","a"]);
});
