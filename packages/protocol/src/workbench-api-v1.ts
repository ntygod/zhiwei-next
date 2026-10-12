import { assertEvidenceRefV2, assertMemoryClaimV2, assertScopeV2, isScopeWithinV2, sameScopeV2,
  type EvidenceRefV2, type MemoryClaimV2, type ScopeV2 } from "../../domain/src/index.ts";
import { identifier, invalid, keys, list, member, object, revision, textValue, timestamp, unique, version, wireBoundary } from "./cognitive-wire.ts";
import { parseObservationV2 } from "./observation-v2.ts";
import { parseSessionApiReceiptV1, parseSessionTaskRecoveryV1, parseSessionTaskV1, parseSessionV1 } from "./session-api-v1.ts";
import { parseOutcomeVerificationPlanV1, parseTaskResultBundleV1 } from "./task-result-v1.ts";
import type { SessionApiReadV1, SessionPairResponseV1 } from "./session-api-v1-types.ts";

const statuses = ["ACTIVE", "SUPERSEDED", "DISPUTED", "EXPIRED", "FORGOTTEN"] as const;
const commands = ["session.create", "task.create", "task.continue", "task.pause", "task.cancel", "task.retry", "task.revise-request", "task.respond",
  "memory.remember", "memory.correct", "memory.dispute", "memory.forget", "task.confirm-result", "result.plan", "result.verify", "result.feedback"] as const;
export const parseWorkbenchIdentifierV1 = identifier;
export const parseWorkbenchReadNotAfterV1 = timestamp;
export function parseWorkbenchCursorV1(input: unknown): string {
  const value = textValue(input, 4096); if (!/^[A-Za-z0-9_-]+$/.test(value)) invalid(); return value;
}
export function parseBrowserPairResponseV1(input: unknown): SessionPairResponseV1 & Readonly<{ clientKind: "browser"; csrfToken: string }> {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "clientKind", "expiresAt", "csrfToken"]); version(value.schemaVersion, 1); member(value.clientKind, ["browser"]);
    timestamp(value.expiresAt); if (typeof value.csrfToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.csrfToken)) invalid();
    return value as unknown as SessionPairResponseV1 & Readonly<{ clientKind: "browser"; csrfToken: string }>;
  });
}
export function parseWorkbenchCapabilitiesV1(input: unknown) {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "protocolVersions", "mode", "production", "productAcceptance", "features", "supportedCommands", "unsupportedCommands", "runtime", "limits"]);
    version(value.schemaVersion, 1); if (list(value.protocolVersions, 1, 1)[0] !== 1) invalid();
    member(value.mode, ["synthetic-fixtures-only"]); member(value.production, ["unsupported"]); member(value.productAcceptance, ["not_run"]);
    const features = list(value.features, 6).map(item => member(item, ["sessions", "tasks", "snapshot", "events", "memory", "task-results"])); unique(features);
    const supportedCommands = list(value.supportedCommands, commands.length).map(item => member(item, commands)); unique(supportedCommands);
    const unsupportedCommands = list(value.unsupportedCommands, commands.length).map(item => member(item, commands)); unique(unsupportedCommands);
    if (supportedCommands.some(item => unsupportedCommands.includes(item))) invalid();
    const runtime = object(value.runtime); keys(runtime, ["status", "reason", "limitations"]); member(runtime.status, ["limited"]); member(runtime.reason, ["fixed-synthetic-fixtures-only"]);
    const limitations = list(runtime.limitations, 3, 3).map(item => member(item, ["fixed-synthetic-request-only", "no-model-status-query", "no-production-authority"])); unique(limitations);
    const limits = object(value.limits); keys(limits, ["bodyBytes", "pageSize", "eventFrameBytes", "subscribers"]);
    if (limits.bodyBytes !== 1_048_576 || limits.pageSize !== 50 || limits.eventFrameBytes !== 1_048_576 || limits.subscribers !== 32) invalid();
    return { schemaVersion: 1 as const, mode: "synthetic-fixtures-only" as const, production: "unsupported" as const, productAcceptance: "not_run" as const,
      protocolVersions: [1] as const, features, supportedCommands, unsupportedCommands,
      runtime: { status: "limited" as const, reason: "fixed-synthetic-fixtures-only" as const, limitations },
      limits: { bodyBytes: 1_048_576, pageSize: 50, eventFrameBytes: 1_048_576, subscribers: 32 } };
  });
}
function read<T>(input: unknown, parse: (value: unknown) => T, recovery = false): SessionApiReadV1<T> {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "value", "asOfCursor"], recovery ? ["recovery"] : []); version(value.schemaVersion, 1);
    return { schemaVersion: 1, value: parse(value.value), asOfCursor: parseWorkbenchCursorV1(value.asOfCursor),
      ...(value.recovery === undefined ? {} : { recovery: parseSessionTaskRecoveryV1(value.recovery) }) };
  });
}
export const parseWorkbenchTaskReadV1 = (input: unknown) => read(input, parseSessionTaskV1, true);
export const parseWorkbenchSessionReadV1 = (input: unknown) => read(input, parseSessionV1);
export interface WorkbenchMemoryInputResponseV1 { readonly schemaVersion: 1; readonly evidence: EvidenceRefV2; readonly replay: boolean; readonly asOfCursor: string }
export function parseWorkbenchMemoryInputResponseV1(input: unknown): WorkbenchMemoryInputResponseV1 {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "evidence", "replay", "asOfCursor"]); version(value.schemaVersion, 1); assertEvidenceRefV2(value.evidence);
    if (typeof value.replay !== "boolean") invalid(); parseWorkbenchCursorV1(value.asOfCursor); return value as unknown as WorkbenchMemoryInputResponseV1;
  });
}
export interface WorkbenchMemorySearchResponseV1 {
  readonly schemaVersion: 1; readonly material: readonly Readonly<{ claim: MemoryClaimV2; currentStatus: MemoryClaimV2["status"]; historical: boolean }>[];
  readonly ranking: Readonly<{ method: "fts5-trigram" | "scoped-short-query"; rows: readonly Readonly<{ id: string; version: number; score: number }>[] }>;
  readonly fence: Readonly<{ installationId: string; scope: ScopeV2; cognitionEpoch: number; policyEpoch: number; recoveryEpoch: number }>;
  readonly asOfCursor: string;
}
export function parseWorkbenchMemorySearchResponseV1(input: unknown): WorkbenchMemorySearchResponseV1 {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "material", "ranking", "fence", "asOfCursor"]); version(value.schemaVersion, 1); parseWorkbenchCursorV1(value.asOfCursor);
    const fence = object(value.fence); keys(fence, ["installationId", "scope", "cognitionEpoch", "policyEpoch", "recoveryEpoch"]);
    identifier(fence.installationId); assertScopeV2(fence.scope); for (const name of ["cognitionEpoch", "policyEpoch", "recoveryEpoch"]) revision(fence[name], true);
    const fenceScope = fence.scope;
    const material = list(value.material, 50).map(item => {
      const row = object(item); keys(row, ["claim", "currentStatus", "historical"]); assertMemoryClaimV2(row.claim); member(row.currentStatus, statuses);
      if (typeof row.historical !== "boolean" || !isScopeWithinV2(row.claim.scope, fenceScope)) invalid(); return row as unknown as WorkbenchMemorySearchResponseV1["material"][number];
    }); unique(material.map(row => `${row.claim.id}:${row.claim.version}`));
    const ranking = object(value.ranking); keys(ranking, ["method", "rows"]); member(ranking.method, ["fts5-trigram", "scoped-short-query"]);
    const ranks = list(ranking.rows, 50); if (ranks.length !== material.length) invalid();
    ranks.forEach((item, index) => { const row = object(item); keys(row, ["id", "version", "score"]); identifier(row.id); revision(row.version);
      if (typeof row.score !== "number" || !Number.isFinite(row.score) || row.id !== material[index]!.claim.id || row.version !== material[index]!.claim.version) invalid(); });
    return value as unknown as WorkbenchMemorySearchResponseV1;
  });
}
export interface WorkbenchMemoryExplanationResponseV1 {
  readonly schemaVersion: 1; readonly id: string; readonly scope: ScopeV2; readonly currentVersion: number;
  readonly versions: readonly Readonly<{ version: number; revision: number; status: MemoryClaimV2["status"]; createdAt: string; updatedAt: string; available: boolean }>[];
  readonly value?: MemoryClaimV2; readonly unavailableReason?: "content-unavailable" | "source-unavailable";
  readonly sources: readonly Readonly<{ observation: ReturnType<typeof parseObservationV2>; excerpt?: string }>[];
  readonly affected: readonly Readonly<{ kind: string; id: string; version: number }>[]; readonly asOfCursor: string;
}
export function parseWorkbenchMemoryExplanationResponseV1(input: unknown): WorkbenchMemoryExplanationResponseV1 {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "id", "scope", "currentVersion", "versions", "sources", "affected", "asOfCursor"], ["value", "unavailableReason"]);
    version(value.schemaVersion, 1); identifier(value.id); assertScopeV2(value.scope); revision(value.currentVersion); parseWorkbenchCursorV1(value.asOfCursor);
    const scope = value.scope;
    const versions = list(value.versions, 50, 1).map(item => { const row = object(item); keys(row, ["version", "revision", "status", "createdAt", "updatedAt", "available"]);
      revision(row.version); revision(row.revision); member(row.status, statuses); if (timestamp(row.updatedAt) < timestamp(row.createdAt) || typeof row.available !== "boolean") invalid(); return row; });
    unique(versions.map(row => String(row.version))); if (versions[0]!.version !== value.currentVersion) invalid();
    if (value.value !== undefined) { assertMemoryClaimV2(value.value);
      if (value.unavailableReason !== undefined || value.value.id !== value.id || !sameScopeV2(value.value.scope, value.scope)
        || !versions.some(row => row.version === (value.value as MemoryClaimV2).version && row.available === true)) invalid(); }
    else member(value.unavailableReason, ["content-unavailable", "source-unavailable"]);
    const sources = list(value.sources, 100).map(item => { const row = object(item); keys(row, ["observation"], ["excerpt"]); const observation = parseObservationV2(row.observation);
      if (!isScopeWithinV2(observation.scope, scope) || (row.excerpt !== undefined && observation.content.availability !== "available")) invalid();
      if (row.excerpt !== undefined) textValue(row.excerpt, 1024); return observation.id; }); unique(sources);
    for (const item of list(value.affected)) { const row = object(item); keys(row, ["kind", "id", "version"]); identifier(row.kind); identifier(row.id); revision(row.version); }
    return value as unknown as WorkbenchMemoryExplanationResponseV1;
  });
}
export function parseWorkbenchPlanResponseV1(input: unknown) {
  return wireBoundary(input, value => { keys(value, ["schemaVersion", "plan", "replay"]); version(value.schemaVersion, 1); if (typeof value.replay !== "boolean") invalid();
    return { schemaVersion: 1 as const, plan: parseOutcomeVerificationPlanV1(value.plan), replay: value.replay }; });
}
export function parseWorkbenchResultResponseV1(input: unknown) {
  return wireBoundary(input, value => { keys(value, ["schemaVersion", "value", "receipt", "replay"]); version(value.schemaVersion, 1); if (typeof value.replay !== "boolean") invalid();
    const bundle = parseTaskResultBundleV1(value.value), receipt = parseSessionApiReceiptV1(value.receipt);
    if (receipt.aggregate.kind !== "task" || receipt.aggregate.id !== bundle.task.id || receipt.aggregate.revision !== bundle.task.revision) invalid();
    return { schemaVersion: 1 as const, value: bundle, receipt, replay: value.replay }; });
}
export const parseWorkbenchResultReadV1 = (input: unknown) => wireBoundary(input, value => {
  keys(value, ["schemaVersion", "value"]); version(value.schemaVersion, 1); return { schemaVersion: 1 as const, value: parseTaskResultBundleV1(value.value) };
});
export const parseWorkbenchResultHistoryV1 = (input: unknown) => wireBoundary(input, value => {
  keys(value, ["schemaVersion", "value"]); version(value.schemaVersion, 1); return { schemaVersion: 1 as const, value: list(value.value, 100).map(parseTaskResultBundleV1) };
});
