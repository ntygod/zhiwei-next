import { assertIdentifierV2, assertRevisionV2, type CognitiveDecisionV1, type ContextClaimRefV1 } from "../../domain/src/index.ts";
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
