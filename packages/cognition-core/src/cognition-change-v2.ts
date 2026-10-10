import {
  DomainValidationErrorV2, domainErrorV2, assertExpectedRevisionV2, assertIsoTimestampV2,
  assertEvidenceRefV2, assertEvidenceForScopeV2, isScopeWithinV2, sameScopeV2,
  type CognitionMetadataV2, type DomainErrorCodeV2, type EvidenceRefV2, type IsoTimestamp,
} from "../../domain/src/index.ts";

/** Pure in-memory CAS only. A store must recheck revisions and commit atomically. */
export interface CognitionChangeV2 {
  readonly expectedRevision: number;
  readonly nextRevision: number;
  readonly now: IsoTimestamp;
}

export function reject(code: DomainErrorCodeV2, reason: string, message: string): never {
  throw new DomainValidationErrorV2(domainErrorV2(code, reason, message));
}

export function exactObject(value: unknown, required: readonly string[], optional: readonly string[] = []): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    reject("validation", "invalid_record", "Expected a plain data record");
  }
  const keys = Reflect.ownKeys(value);
  if (required.some(key => !Object.hasOwn(value, key))
    || keys.some(key => typeof key !== "string" || ![...required, ...optional].includes(key))) {
    reject("validation", "unknown_or_missing_field", "Record has unknown or missing fields");
  }
  if (keys.some(key => !Object.getOwnPropertyDescriptor(value, key)?.enumerable
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, "value")
    || Object.getOwnPropertyDescriptor(value, key)!.value === undefined)) {
    reject("validation", "invalid_record", "Record must contain enumerable data properties");
  }
}

export function dataArray(value: unknown, minimum = 0): asserts value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length < minimum || value.length > 1000) reject("validation", "invalid_array", "Expected a bounded data array");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== value.length + 1) reject("validation", "invalid_array", "Array contains holes or extra fields");
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable || descriptor.value === undefined) {
      reject("validation", "invalid_array", "Array must contain enumerable data elements");
    }
  }
}

export function checkChange(state: CognitionMetadataV2, change: CognitionChangeV2): void {
  exactObject(change, ["expectedRevision", "nextRevision", "now"]);
  assertExpectedRevisionV2(state.revision, change.expectedRevision, change.nextRevision);
  assertIsoTimestampV2(change.now);
  if (change.now < state.updatedAt) reject("validation", "time_reversed", "Change time precedes current state");
}

export function requireState(actual: string, ...allowed: readonly string[]): void {
  if (!allowed.includes(actual)) reject("invalid_transition", "invalid_source_state", "Current state does not permit this transition");
}

export function initialState(state: CognitionMetadataV2): void {
  if (state.revision !== 1 || state.createdAt !== state.updatedAt) {
    reject("validation", "invalid_initial_revision", "New cognition must start at revision one with one recording time");
  }
}

/** Copy before freezing: caller objects and prior history stay untouched, including aliases. */
export function snapshot<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(item => snapshot(item))) as T;
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item)]))) as T;
  }
  return value;
}

export function evidenceKey(evidence: EvidenceRefV2): string {
  return JSON.stringify([evidence.source.id, evidence.source.revision, evidence.fragmentId ?? null, evidence.role]);
}

export function mergeEvidence(existing: readonly EvidenceRefV2[], added: readonly EvidenceRefV2[]): readonly EvidenceRefV2[] {
  const merged = [...existing];
  for (const item of added) {
    const prior = merged.find(entry => evidenceKey(entry) === evidenceKey(item));
    if (prior && (!sameScopeV2(prior.scope, item.scope) || prior.privacy !== item.privacy
      || prior.sourceTrust !== item.sourceTrust || prior.observedAt !== item.observedAt)) {
      reject("evidence_invalid", "evidence_identity_conflict", "One evidence identity has inconsistent metadata");
    }
    if (!prior) merged.push(item);
  }
  return merged;
}

export function checkEvidence(state: CognitionMetadataV2, evidence: EvidenceRefV2, now: string,
  trust?: "user-direct" | "verified-tool"): void {
  assertEvidenceRefV2(evidence);
  if (!isScopeWithinV2(state.scope, evidence.scope)) reject("scope_conflict", "evidence_scope_widening", "Evidence cannot widen the cognition scope");
  if (evidence.privacy === "local-only" && state.privacy !== "local-only") reject("forbidden", "privacy_widening", "Evidence privacy cannot be relaxed");
  if (evidence.observedAt > now) reject("evidence_invalid", "future_evidence", "Evidence is from the future");
  if (trust && evidence.sourceTrust !== trust) {
    reject("evidence_invalid", "unsupported_evidence_source", "Evidence does not have the required source type");
  }
}

export function checkUserEvidence(state: CognitionMetadataV2, evidence: EvidenceRefV2, now: string): void {
  checkEvidence(state, evidence, now, "user-direct");
  if (evidence.role !== "supports" || evidence.observedAt < state.updatedAt) {
    reject("evidence_invalid", "stale_or_refuting_confirmation", "A current supporting user confirmation is required");
  }
}

/** Validate new action evidence as a set without rewriting immutable version evidence. */
export function checkAdditionalEvidence(state: CognitionMetadataV2, original: readonly EvidenceRefV2[],
  added: readonly EvidenceRefV2[], now: string): void {
  dataArray(added);
  const seen = new Set<string>();
  for (const evidence of added) {
    checkEvidence(state, evidence, now);
    const key = evidenceKey(evidence);
    if (seen.has(key)) reject("evidence_invalid", "duplicate_action_evidence", "Action evidence must not contain duplicates");
    seen.add(key);
  }
  assertEvidenceForScopeV2(mergeEvidence(original, added), state.scope, state.privacy, now);
}
