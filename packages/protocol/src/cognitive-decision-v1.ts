import { assertIdentifierV2, assertRevisionV2, assertIsoTimestampV2, type CognitiveDecisionV1, type CognitiveDecisionInputV1, type ContextClaimRefV1 } from "../../domain/src/index.ts";
import { canonicalJsonV1 } from "./lossless-json.ts";
import { decodeWireJson } from "./cognitive-wire.ts";

function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("Invalid decision shape");
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== keys.length || keys.some(key => !fields[key] || !("value" in fields[key]!) || !fields[key]!.enumerable || fields[key]!.value === undefined)) throw new Error("Invalid decision fields");
}
function bounded(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || value.includes("\0")) throw new Error("Invalid decision text");
  return value;
}
export function parseCognitiveDecisionV1(value: unknown): CognitiveDecisionV1 {
  if (!value || typeof value !== "object") throw new Error("Invalid decision");
  const actionField = Object.getOwnPropertyDescriptor(value, "action");
  if (!actionField || !("value" in actionField)) throw new Error("Invalid decision action");
  const action = actionField.value as unknown;
  const field = action === "respond" ? "text" : action === "clarify" ? "question" : action === "retrieve" ? "query"
    : action === "execute" ? "plan" : action === "wait" ? "condition" : action === "stop" ? "reason" : undefined;
  if (!field) throw new Error("Unknown decision action");
  exact(value, ["schemaVersion", "action", "summary", "claimRefs", field]);
  if (value.schemaVersion !== 1) throw new Error("Unknown decision version");
  const summary = bounded(value.summary, 1024);
  if (!Array.isArray(value.claimRefs) || value.claimRefs.length > 100 || Reflect.ownKeys(value.claimRefs).length !== value.claimRefs.length + 1) throw new Error("Invalid decision references");
  const claimRefs: ContextClaimRefV1[] = [];
  for (let i = 0; i < value.claimRefs.length; i++) {
    const entry = Object.getOwnPropertyDescriptor(value.claimRefs, String(i));
    if (!entry || !("value" in entry)) throw new Error("Invalid decision reference");
    const ref: unknown = entry.value; exact(ref, ["kind", "id", "revision", "version"]);
    if (ref.kind !== "claim") throw new Error("Unknown decision reference");
    assertIdentifierV2(ref.id); assertRevisionV2(ref.revision); assertRevisionV2(ref.version);
    if (claimRefs.some(prior => prior.id === ref.id)) throw new Error("Duplicate decision reference");
    claimRefs.push({ kind: "claim", id: ref.id, revision: ref.revision, version: ref.version });
  }
  const basis = { schemaVersion: 1 as const, summary, claimRefs };
  if (action === "respond") return { ...basis, action, text: bounded(value.text, 4096) };
  if (action === "retrieve") return { ...basis, action, query: bounded(value.query, 256) };
  if (action === "execute") return { ...basis, action, plan: bounded(value.plan, 2048) };
  if (action === "clarify") {
    exact(value.question, ["id", "prompt"]); assertIdentifierV2(value.question.id);
    return { ...basis, action, question: { id: value.question.id, prompt: bounded(value.question.prompt, 1024) } };
  }
  if (action === "wait") {
    exact(value.condition, ["kind", "id", "description"]); assertIdentifierV2(value.condition.id);
    if (value.condition.kind !== "user-input") throw new Error("Unknown wait condition");
    return { ...basis, action, condition: { kind: "user-input", id: value.condition.id, description: bounded(value.condition.description, 1024) } };
  }
  if (action === "stop" && ["no-progress", "invalid-decision", "call-limit", "unsupported", "declined"].includes(value.reason as string)) return { ...basis, action, reason: value.reason as Extract<CognitiveDecisionV1, { action: "stop" }>["reason"] };
  throw new Error("Invalid decision reason");
}
export function serializeCognitiveDecisionV1(value: unknown): string { return canonicalJsonV1(parseCognitiveDecisionV1(value)); }
export function deserializeCognitiveDecisionV1(value: string): CognitiveDecisionV1 {
  if (value.length > 16384) throw new Error("Oversize decision");
  return parseCognitiveDecisionV1(decodeWireJson(value));
}

/** Fixed Runtime-neutral transport projection; no permission or Provider configuration. */
export function cognitiveDecisionRequestContextV1(input: CognitiveDecisionInputV1): import("./lossless-json.ts").JsonValue {
  return { systemPrompt: "Return one JSON decision with schemaVersion=1, action respond/clarify/retrieve/execute/wait/stop, summary and exact claimRefs. Use only the supplied fields. Do not return reasoning, grants or a successful Outcome.",
    messages: [{ role: "user", content: [{ type: "text", text: canonicalJsonV1(input) }], timestamp: Date.parse(input.preparedAt) }], tools: [] };
}
export function parseCognitiveDecisionInputV1(value: unknown): CognitiveDecisionInputV1 {
  exact(value, ["schemaVersion", "boundaryId", "ordinal", "capsuleId", "task", "workingState", "context", "claimRefs", "capabilities", "unknown", "remainingCalls", "purpose", "preparedAt"]);
  if (value.schemaVersion !== 1 || value.ordinal !== 1 && value.ordinal !== 2 || value.remainingCalls !== 2 - (value.ordinal as number)
    || !["initial", "repair", "retrieval"].includes(value.purpose as string)) throw new Error("Invalid decision input version");
  assertIdentifierV2(value.boundaryId); assertIdentifierV2(value.capsuleId); bounded(value.context, 262144);
  assertIsoTimestampV2(value.preparedAt);
  exact(value.task, ["id", "revision", "attemptId", "intentRevision"]);
  assertIdentifierV2(value.task.id); assertIdentifierV2(value.task.attemptId); assertRevisionV2(value.task.revision); assertRevisionV2(value.task.intentRevision);
  exact(value.workingState, ["id", "revision"]); assertIdentifierV2(value.workingState.id); assertRevisionV2(value.workingState.revision);
  // Reuse the exact-reference parser; the finite proposal below is only a syntax carrier.
  parseCognitiveDecisionV1({ schemaVersion: 1, action: "stop", summary: "input validation", claimRefs: value.claimRefs, reason: "declined" });
  for (const field of ["capabilities", "unknown"]) {
    const items = value[field]; if (!Array.isArray(items) || items.length > 100 || Reflect.ownKeys(items).length !== items.length + 1) throw new Error("Invalid decision input list");
    for (let i = 0; i < items.length; i++) { const descriptor = Object.getOwnPropertyDescriptor(items, String(i)); if (!descriptor || !("value" in descriptor)) throw new Error("Invalid input item"); bounded(descriptor.value, 8192); }
  }
  const capabilities = value.capabilities as string[];
  if (new Set(capabilities).size !== capabilities.length || capabilities.some(item => !["respond", "clarify", "retrieve", "execute", "wait", "stop"].includes(item))) throw new Error("Invalid decision capability");
  return JSON.parse(canonicalJsonV1(value)) as CognitiveDecisionInputV1;
}
export interface CognitiveDecisionModelRequestV1 {
  readonly requestId: string;
  readonly boundaryId: string;
  readonly capsuleId: string;
  readonly ordinal: 1 | 2;
  readonly context: import("./lossless-json.ts").JsonValue;
  readonly maxTokens: number;
}
export interface CognitiveDecisionModelPortV1 {
  readonly profile: Readonly<{ id: string; revision: number }>;
  readonly structuredDecision: "synthetic-scripted" | "unsupported";
  invoke(request: CognitiveDecisionModelRequestV1): Promise<Readonly<{ text: string }>>;
}
