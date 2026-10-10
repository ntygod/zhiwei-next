/** Internal synthetic recovery seam; not re-exported from the package entry. */
export const cognitiveRecoveryPortV2: unique symbol = Symbol("cognitive-recovery-port-v2");

export interface CognitiveRecoveryStateV2 {
  readonly installationId: string;
  readonly schemaVersion: 2 | 3;
  readonly controlSequence: number;
  readonly controlChecksum: string;
  readonly recoveryEpoch: number;
}

export interface CognitiveSnapshotContentV2 {
  readonly contentId: string;
  readonly version: number;
  readonly reservationId: string;
  readonly digest: string;
  readonly byteCount: number;
}

export interface CognitiveSnapshotExportV2 extends CognitiveRecoveryStateV2 {
  readonly contents: readonly CognitiveSnapshotContentV2[];
}

export interface CognitiveRecoveryBoundaryV2 extends CognitiveRecoveryStateV2 {
  readonly nonQuarantinedOldOutbox: number;
}

export interface CognitiveRecoveryPortV2 {
  /** Fresh empty destination. No journal, mutex, staging or revoked bytes copied. */
  exportSnapshot(destination: string): CognitiveSnapshotExportV2;
  /** Actual fully verified state and a completed WAL checkpoint; locks stay held. */
  verifyRecoveryBoundary(): CognitiveRecoveryBoundaryV2;
}
