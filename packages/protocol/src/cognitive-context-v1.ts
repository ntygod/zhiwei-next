import { assertIdentifierV2, assertRevisionV2, assertIsoTimestampV2, assertScopeV2, assertEvidenceRefV2,
  type CognitiveContextCapsuleV1 } from "../../domain/src/index.ts";
import { canonicalJsonV1 } from "./lossless-json.ts";
function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("Invalid capsule record");
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== keys.length || keys.some(key => !fields[key] || !("value" in fields[key]!) || !fields[key]!.enumerable || fields[key]!.value === undefined)) throw new Error("Invalid capsule fields");
}
function list(value: unknown): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > 100 || Reflect.ownKeys(value).length !== value.length + 1) throw new Error("Invalid capsule list");
  for (let i = 0; i < value.length; i++) if (!("value" in (Object.getOwnPropertyDescriptor(value, String(i)) ?? {}))) throw new Error("Invalid capsule item");
}
function reference(value: unknown): void {
  exact(value, ["kind", "id", "revision", "version"]); if (value.kind !== "claim") throw new Error("Invalid capsule reference");
  assertIdentifierV2(value.id); assertRevisionV2(value.revision); assertRevisionV2(value.version);
}
export function parseCognitiveContextCapsuleV1(value: unknown): CognitiveContextCapsuleV1 {
  exact(value, ["schemaVersion", "id", "workspaceId", "sessionId", "taskId", "taskRevision", "attemptId", "intentRevision", "workingState", "scope", "compiledAt", "modelProfile", "compilerRevision", "rendererRevision", "counter", "budget", "rendering", "report"]);
  if (value.schemaVersion !== 1 || value.compilerRevision !== "cognitive-context-v1" || value.rendererRevision !== "context-budget-json-lines-v1") throw new Error("Unknown capsule version");
  for (const field of ["id", "workspaceId", "sessionId", "taskId", "attemptId"]) assertIdentifierV2(value[field]);
  assertRevisionV2(value.taskRevision); assertRevisionV2(value.intentRevision); assertIsoTimestampV2(value.compiledAt); assertScopeV2(value.scope);
  if (value.scope.kind !== "workspace" || value.scope.workspaceId !== value.workspaceId) throw new Error("Invalid capsule scope");
  for (const field of ["workingState", "modelProfile"]) { exact(value[field], ["id", "revision"]); assertIdentifierV2(value[field].id); assertRevisionV2(value[field].revision); }
  exact(value.counter, ["id", "version", "mode"]); assertIdentifierV2(value.counter.id);
  if (value.counter.mode !== "exact" || typeof value.counter.version !== "string" || !value.counter.version.length || value.counter.version.length > 128) throw new Error("Invalid capsule counter");
  exact(value.budget, ["contextLimit", "reservedOutput", "mandatoryProtocolOverhead"]);
  assertRevisionV2(value.budget.contextLimit); assertRevisionV2(value.budget.reservedOutput); assertRevisionV2(value.budget.mandatoryProtocolOverhead, true);
  exact(value.rendering, ["baseText", "memoryText", "fullText"]);
  for (const field of ["baseText", "memoryText", "fullText"]) if (typeof value.rendering[field] !== "string" || value.rendering[field].length > 262144 || (value.rendering[field] as string).includes("\0")) throw new Error("Invalid capsule rendering");
  exact(value.report, ["selected", "excluded", "availableInput", "memoryBudget", "baseTokens", "memoryTokens", "inputTokens"]);
  for (const field of ["availableInput", "memoryBudget", "baseTokens", "memoryTokens", "inputTokens"]) assertRevisionV2(value.report[field], true);
  assertRevisionV2(value.report.baseTokens, true); assertRevisionV2(value.report.inputTokens, true); assertRevisionV2(value.report.memoryTokens, true);
  if (value.report.availableInput !== value.budget.contextLimit - value.budget.reservedOutput - value.budget.mandatoryProtocolOverhead
    || value.report.memoryBudget !== Math.min(4096, Math.floor(value.report.availableInput / 4), value.report.availableInput - value.report.baseTokens) || value.report.inputTokens > value.report.availableInput || value.report.memoryTokens > value.report.memoryBudget) throw new Error("Invalid capsule accounting");
  list(value.report.selected); list(value.report.excluded);
  const seen = new Set<string>();
  for (const selection of value.report.selected) {
    exact(selection, ["ref", "evidence", "required", "reason"]); reference(selection.ref); list(selection.evidence);
    if (!selection.evidence.length || typeof selection.required !== "boolean" || !["required", "selected_by_category", "selected_by_borrow"].includes(selection.reason as string)) throw new Error("Invalid capsule selection");
    for (const evidence of selection.evidence) { assertEvidenceRefV2(evidence); if (evidence.privacy !== "model-allowed") throw new Error("Invalid capsule evidence"); }
    const id = (selection.ref as { id: string }).id; if (seen.has(id)) throw new Error("Duplicate capsule selection"); seen.add(id);
  }
  for (const selection of value.report.excluded) {
    exact(selection, ["ref", "reason"]); reference(selection.ref);
    if (!["category_budget", "memory_budget", "final_budget"].includes(selection.reason as string)) throw new Error("Invalid capsule exclusion");
    const id = (selection.ref as { id: string }).id; if (seen.has(id)) throw new Error("Duplicate capsule selection"); seen.add(id);
  }
  return JSON.parse(canonicalJsonV1(value)) as CognitiveContextCapsuleV1;
}
