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

export {
  OBSERVATION_LEDGER_PROTOCOL_VERSION,
  ObservationLedgerClosedError,
  ObservationLedgerConflictError,
  ObservationLedgerCorruptionError,
  ObservationLedgerError,
  ObservationLedgerQueryError,
  ObservationLedgerSequenceError,
  SqliteObservationLedgerV1,
  fingerprintNormalizedRuntimeEventV1,
  openSqliteObservationLedgerV1,
} from "./sqlite-observation-ledger.ts";

export type {
  AppendRuntimeEventBatchResultV1,
  AppendRuntimeEventResultV1,
  ObservationLedgerConflictKind,
  ObservationLedgerErrorCode,
  OpenSqliteObservationLedgerOptions,
  RuntimeEventReplayOptionsV1,
  RuntimeSourceStreamIdentityV1,
  StoredRuntimeEventV1,
} from "./sqlite-observation-ledger.ts";

// Synthetic development only; real-data and external-model consumers remain disabled.
export { SyntheticCognitionStoreV2, CognitiveStoreErrorV2, openSyntheticCognitionStoreV2 } from "./cognitive-store-v2.ts";
export type { SyntheticCognitionStoreOptionsV2, CognitionFenceV2, CognitiveStoreErrorCodeV2,
  StageCognitiveContentV2, CognitiveCommitReceiptV2, CognitiveOutboxEventV2 } from "./cognitive-store-v2.ts";
export { convertRuntimeV1ToObservationV2 } from "./cognitive-codec-v2.ts";
export type { CognitiveRecordKindV2, CognitiveRecordByKindV2 } from "./cognitive-codec-v2.ts";
export type { RecoveryControlIntentV2, RecoveryControlTargetV2 } from "./recovery-journal-v2.ts";
export { SyntheticRecoveryCoordinatorV2, SyntheticRecoveryErrorV2,
  createSyntheticRecoveryCoordinatorV2, openSyntheticRecoveryCoordinatorV2 } from "./synthetic-recovery-v2.ts";
export type { SyntheticRecoveryOptionsV2, CreateSyntheticRecoveryOptionsV2,
  RestoreSyntheticSnapshotV2, SyntheticRecoveryReceiptV2, SyntheticSnapshotManifestV2,
  SyntheticRecoveryErrorCodeV2, ManagedSyntheticRecoveryCopyV2,
  ManagedSyntheticRecoveryPurgeResultV2 } from "./synthetic-recovery-v2.ts";

export type { TaskPersistenceBoundaryV1, TaskPersistenceStoreV1, TaskStoreContextV1, TaskStoreCommandV1, TaskRuntimeCommandV1, TaskReductionContextV1, TaskReductionV1, TaskStoreCommitV1, TaskStoreReceiptV1, TaskStoreReadV1, TaskStoreSnapshotV1, TaskStoreReplayV1, TaskOutboxRowV1, RuntimeInputSnapshotV1, TaskInputCommitV1, TaskInputCommitResultV1 } from "./task-store-v1-types.ts";
export type { TaskRecoveryCustodyV1, TaskExecutionPersistenceV1, TaskExecutionReadV1, TaskExecutionEventCommitV1, TaskExecutionDetailsV1, TaskExecutionSourceIdentityV1, TaskModelRequestSnapshotV1, TaskModelRequestCommitV1 } from "./task-execution-v1-types.ts";
