import {
  scopeKey,
  type MemoryClaim,
  type MemoryClaimId,
  type MemoryScope,
  type Observation,
  type ObservationId,
  type SessionId,
} from "../../domain/src/index.ts";

export interface CognitionStore {
  appendObservation(observation: Observation): Promise<void>;
  findObservation(id: ObservationId): Promise<Observation | undefined>;
  listSessionObservations(sessionId: SessionId): Promise<readonly Observation[]>;
  putClaim(claim: MemoryClaim): Promise<void>;
  findClaim(id: MemoryClaimId): Promise<MemoryClaim | undefined>;
  listActiveClaims(scope: MemoryScope): Promise<readonly MemoryClaim[]>;
}

export class InMemoryCognitionStore implements CognitionStore {
  readonly #observations = new Map<ObservationId, Observation>();
  readonly #claims = new Map<MemoryClaimId, MemoryClaim>();

  async appendObservation(observation: Observation): Promise<void> {
    if (this.#observations.has(observation.id)) {
      throw new Error(`Observation already exists: ${observation.id}`);
    }
    this.#observations.set(observation.id, structuredClone(observation));
  }

  async findObservation(id: ObservationId): Promise<Observation | undefined> {
    const value = this.#observations.get(id);
    return value ? structuredClone(value) : undefined;
  }

  async listSessionObservations(sessionId: SessionId): Promise<readonly Observation[]> {
    return [...this.#observations.values()]
      .filter((observation) => observation.sessionId === sessionId)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .map((observation) => structuredClone(observation));
  }

  async putClaim(claim: MemoryClaim): Promise<void> {
    this.#claims.set(claim.id, structuredClone(claim));
  }

  async findClaim(id: MemoryClaimId): Promise<MemoryClaim | undefined> {
    const value = this.#claims.get(id);
    return value ? structuredClone(value) : undefined;
  }

  async listActiveClaims(scope: MemoryScope): Promise<readonly MemoryClaim[]> {
    const key = scopeKey(scope);
    return [...this.#claims.values()]
      .filter((claim) => claim.status === "active" && scopeKey(claim.scope) === key)
      .map((claim) => structuredClone(claim));
  }
}
