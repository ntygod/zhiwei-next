import { randomUUID } from "node:crypto";
import { evaluateCriterionObservationsV1, buildResultEpisodeV1, deriveMemoryAdoptionV1 } from "../../../../packages/cognition-core/src/index.ts";
import type { OutcomePersistenceBoundaryV1 } from "../../../../packages/memory-store/src/index.ts";
/** Fixed synthetic composition, with no reader, model, tool grant or production activation. */
export const syntheticOutcomeBoundaryV1: OutcomePersistenceBoundaryV1 = Object.freeze({
  verifier: Object.freeze({ id: "outcome-verifier-v1", revision: 1 }), verificationTtlMs: 30_000,
  ids: Object.freeze({ next: () => randomUUID() }), evaluate: evaluateCriterionObservationsV1, buildEpisode: buildResultEpisodeV1, adoption: deriveMemoryAdoptionV1,
});
