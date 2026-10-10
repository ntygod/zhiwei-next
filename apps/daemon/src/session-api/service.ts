import type { Task } from "../../../../packages/domain/src/index.ts";
import type { LocalApiCommandV1, LocalApiErrorCodeV1, ProductEventV1, SessionApiReceiptV1, SessionCreateCommandV1, SessionV1, TaskSummaryV1 } from "../../../../packages/protocol/src/index.ts";

export interface SessionApiContext { readonly principalId: string; readonly workspaceId: string }
export interface SessionApiCommitted<T> { readonly value: T; readonly commitCursor: number }
type WithoutCursor<T> = T extends unknown ? Omit<T, "eventCursor"> : never;
export type SessionApiDurableReceipt = WithoutCursor<SessionApiReceiptV1>;
export interface SessionApiSnapshot { readonly sessions: readonly SessionV1[]; readonly tasks: readonly TaskSummaryV1[]; readonly commitCursor: number }
export interface SessionApiReplay {
  readonly events: readonly Readonly<{ commitCursor: number; event: ProductEventV1 }>[];
  readonly highWatermark: number;
  readonly hasMore: boolean;
  readonly gap: boolean;
}
/** The daemon supplies this application port. The HTTP layer never opens SQLite or starts a model.
 * Methods are synchronous: authorization and consistent read/commit happen without an await gap.
 * The service must independently scope all reads and apply durable CAS/idempotency in one transaction.
 */
export interface SessionApiApplication {
  /** Wake subscribers only after commit; replay remains the durable source of truth. */
  subscribe(listener: () => void): () => void;
  authorize(context: SessionApiContext): boolean;
  createSession(context: SessionApiContext, command: SessionCreateCommandV1): SessionApiCommitted<SessionApiDurableReceipt>;
  executeTask(context: SessionApiContext, command: LocalApiCommandV1): SessionApiCommitted<SessionApiDurableReceipt>;
  getSession(context: SessionApiContext, id: string): SessionApiCommitted<SessionV1>;
  getTask(context: SessionApiContext, id: string): SessionApiCommitted<Task>;
  listTasks(context: SessionApiContext, query: Readonly<{ state?: string; limit: number; after?: string }>): SessionApiCommitted<Readonly<{ tasks: readonly TaskSummaryV1[]; nextAfter?: string }>>;
  /** Consistent view; each collection has stable ID order for watermark-pinned transport paging. */
  snapshot(context: SessionApiContext): SessionApiSnapshot;
  replay(context: SessionApiContext, query: Readonly<{ afterCommitCursor: number; limit: number }>): SessionApiReplay;
}
export type SessionApiErrorReason = "invalid_shape" | "too_large" | "unsupported_media" | "expired_session" | "action_not_granted" | "origin_mismatch" | "csrf_mismatch" | "not_found" | "stale_intent" | "stale_context" | "idempotency_conflict" | "cursor_expired" | "snapshot_required" | "event_gap" | "slow_consumer" | "runtime_capability" | "protocol_version" | "rate_limit" | "dependency_down" | "recovery_required" | "integrity_failed";
/** Only this bounded error class is translated; raw Store/OS errors never cross the wire. */
export class SessionApiError extends Error {
  readonly code: LocalApiErrorCodeV1;
  readonly reason: SessionApiErrorReason;
  readonly status: number;
  constructor(code: LocalApiErrorCodeV1, reason: SessionApiErrorReason, status: number) {
    super("The session request could not be completed."); this.name = "SessionApiError";
    this.code = code; this.reason = reason; this.status = status;
  }
}
