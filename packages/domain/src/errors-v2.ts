export type DomainErrorCodeV2 = "validation" | "unauthenticated" | "forbidden" | "not_found"
  | "revision_conflict" | "idempotency_conflict" | "unavailable" | "unsupported"
  | "budget_exceeded" | "corruption" | "invalid_transition" | "scope_conflict" | "evidence_invalid";
/** Safe structured business errors; never include raw inputs, native exceptions or credentials. */
export interface DomainErrorV2 {
  readonly code: DomainErrorCodeV2;
  readonly reason: string;
  readonly safeMessage: string;
  readonly retryable: boolean;
}
export type DomainResultV2<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: DomainErrorV2 }>;
export function domainErrorV2(code: DomainErrorCodeV2, reason: string, safeMessage: string, retryable = false): DomainErrorV2 {
  return Object.freeze({ code, reason, safeMessage, retryable });
}
/** Exception carrier only; the serializable error contract is the `error` property. */
export class DomainValidationErrorV2 extends Error {
  readonly error: DomainErrorV2;
  constructor(error: DomainErrorV2) {
    super(error.safeMessage);
    this.name = "DomainValidationErrorV2";
    this.error = error;
  }
}
