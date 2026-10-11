import { CognitiveStoreErrorV2, type MemoryPersistenceV1, type SyntheticCognitionStoreV2 } from "../../../../packages/memory-store/src/index.ts";
import { SessionApiError, type SessionApiContext } from "../session-api/service.ts";

/** Pairing membership is composition-owned; requests cannot select their principal. */
export function createPersistentMemoryApplication(options: Readonly<{ store(): SyntheticCognitionStoreV2; authorize(context: SessionApiContext): boolean }>): MemoryPersistenceV1 {
  const invoke = <T>(context: SessionApiContext, action: (memory: MemoryPersistenceV1) => T): T => {
    if (!options.authorize(context)) throw new SessionApiError("not_found", "not_found", 404);
    try { return action(options.store().memories); }
    catch (error) {
      if (error instanceof SessionApiError) throw error;
      if (error instanceof CognitiveStoreErrorV2) {
        switch (error.code) {
          case "revision_conflict": throw new SessionApiError("revision_conflict", "stale_context", 409);
          case "conflict": throw new SessionApiError("idempotency_conflict", "idempotency_conflict", 409);
          case "unavailable": throw new SessionApiError("not_found", "not_found", 404);
          case "validation": throw new SessionApiError("validation", "invalid_shape", 400);
          case "unsupported": throw new SessionApiError("unsupported", "runtime_capability", 422);
          case "corruption": throw new SessionApiError("corruption", "integrity_failed", 500);
          case "recovery_required": throw new SessionApiError("unavailable", "recovery_required", 503);
        }
      }
      throw new SessionApiError("unavailable", "dependency_down", 503);
    }
  };
  return { capture: (context, input) => invoke(context, memory => memory.capture(context, input)),
    execute: (context, command) => invoke(context, memory => memory.execute(context, command)),
    search: (context, query, audience) => invoke(context, memory => memory.search(context, query, audience)),
    explain: (context, scope, id, version) => invoke(context, memory => memory.explain(context, scope, id, version)) };
}
