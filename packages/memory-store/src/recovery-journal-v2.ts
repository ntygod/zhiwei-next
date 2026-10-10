import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, realpathSync, renameSync, writeSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import {
  assertIdentifierV2, assertIsoTimestampV2, assertScopeV2,
  type ScopeV2,
} from "../../domain/src/index.ts";

/** Internal synthetic-only control contract; this is not a user/model instruction parser. */
export type RecoveryControlAuthorizationV2 =
  | "synthetic-user-request"
  | "synthetic-retention-policy"
  | "synthetic-recovery-request";

export type RecoveryControlTargetV2 =
  | Readonly<{ kind: "scope"; scope: ScopeV2 }>
  | Readonly<{ kind: "content"; scope: ScopeV2; contentId: string; contentVersion: number }>
  | Readonly<{ kind: "claim"; scope: ScopeV2; id: string; version: number }>
  | Readonly<{ kind: "observation"; scope: ScopeV2; id: string }>;

interface RecoveryControlIntentBaseV2 {
  readonly operationId: string;
  readonly at: string;
  readonly authorization: RecoveryControlAuthorizationV2;
}

export type RecoveryControlIntentV2 = RecoveryControlIntentBaseV2 & (
  | Readonly<{ kind: "FORGET"; targets: readonly RecoveryControlTargetV2[] }>
  | Readonly<{ kind: "SOURCE_SUPPRESS"; scope: ScopeV2; bindingId: string; resourceId: string }>
  | Readonly<{ kind: "PRIVACY_RESTRICT"; targets: readonly RecoveryControlTargetV2[]; privacy: "local-only" }>
  | Readonly<{ kind: "RETENTION_SHORTEN"; targets: readonly RecoveryControlTargetV2[]; retentionUntil: string }>
  | Readonly<{ kind: "RESTORE_BEGIN"; expectedRecoveryEpoch: number }>
);

export interface RecoveryControlRecordV2 {
  readonly formatVersion: 2;
  readonly installationId: string;
  readonly controlSequence: number;
  readonly recoveryEpoch: number;
  readonly intent: RecoveryControlIntentV2;
  /** Checksums cover only controlled journal metadata, never user content. */
  readonly previousChecksum: string;
  readonly checksum: string;
}

export interface RecoveryJournalHeadV2 {
  readonly formatVersion: 2;
  readonly installationId: string;
  readonly controlSequence: number;
  readonly recoveryEpoch: number;
  readonly checksum: string;
  readonly lastReconciliation?: Readonly<{
    kind: "DURABLE_LOG_AHEAD" | "INSTALLATION_EPOCH_LAG";
    fromSequence: number;
    toSequence: number;
    at: string;
  }>;
}

export interface RecoveryJournalStateV2 {
  readonly installationId: string;
  readonly head: RecoveryJournalHeadV2;
  readonly durableTail: Readonly<{ controlSequence: number; checksum: string; recoveryEpoch: number }>;
  /** Effective epoch includes a durable RESTORE_BEGIN even before head reconciliation. */
  readonly recoveryEpoch: number;
  readonly records: readonly RecoveryControlRecordV2[];
  readonly recoveryRequired: boolean;
}

export interface RecoveryJournalOptionsV2 {
  /** Independent, absolute control root; its parent must already exist. */
  readonly controlRoot: string;
  readonly installationId: string;
}

export interface ReconcileRecoveryJournalHeadV2 {
  readonly expectedSequence: number;
  readonly expectedChecksum: string;
  readonly at: string;
}

export type RecoveryJournalErrorCodeV2 =
  | "validation" | "conflict" | "corruption" | "recovery_required" | "capacity" | "io";

export class RecoveryJournalErrorV2 extends Error {
  readonly code: RecoveryJournalErrorCodeV2;
  constructor(code: RecoveryJournalErrorCodeV2) {
    super(`Recovery journal ${code}.`);
    this.name = "RecoveryJournalErrorV2";
    this.code = code;
  }
}

export interface RecoveryJournalV2 {
  read(): RecoveryJournalStateV2;
  append(intent: RecoveryControlIntentV2): RecoveryControlRecordV2;
  reconcileDurableHead(input: ReconcileRecoveryJournalHeadV2): RecoveryJournalStateV2;
}

interface InstallationV2 {
  readonly formatVersion: 2;
  readonly installationId: string;
  readonly recoveryEpoch: number;
}
interface InspectedStateV2 extends RecoveryJournalStateV2 {
  readonly installation: InstallationV2;
}

const MAX_LOG_BYTES = 16 * 1024 * 1024;
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_TARGETS = 64;
const HASH = /^[a-f0-9]{64}$/;

function fail(code: RecoveryJournalErrorCodeV2): never { throw new RecoveryJournalErrorV2(code); }
function safeIo<T>(action: () => T): T {
  try { return action(); }
  catch (error) {
    if (error instanceof RecoveryJournalErrorV2) throw error;
    if (error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      fail("recovery_required");
    }
    fail("io");
  }
}
function validated<T>(action: () => T): T {
  try { return action(); }
  catch { fail("validation"); }
}
function object(value: unknown, keys: readonly string[], optional: readonly string[] = []): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("validation");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || ![...keys, ...optional].includes(key)) fail("validation");
    const descriptor = descriptors[key];
    if (!("value" in descriptor) || !descriptor.enumerable || descriptor.value === undefined) fail("validation");
  }
  for (const key of keys) if (!Object.hasOwn(value, key)) fail("validation");
}
function integer(value: unknown, minimum = 0): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) fail("validation");
}
function checksum(value: unknown): asserts value is string {
  if (typeof value !== "string" || !HASH.test(value)) fail("validation");
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function digest(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
function genesis(installationId: string): string { return digest({ formatVersion: 2, installationId }); }
function parseTarget(value: unknown): RecoveryControlTargetV2 {
  object(value, ["kind", "scope"], ["contentId", "contentVersion", "id", "version"]);
  assertScopeV2(value.scope);
  switch (value.kind) {
    case "scope": object(value, ["kind", "scope"]); break;
    case "content":
      object(value, ["kind", "scope", "contentId", "contentVersion"]);
      assertIdentifierV2(value.contentId); integer(value.contentVersion, 1); break;
    case "claim":
      object(value, ["kind", "scope", "id", "version"]);
      assertIdentifierV2(value.id); integer(value.version, 1); break;
    case "observation":
      object(value, ["kind", "scope", "id"]); assertIdentifierV2(value.id); break;
    default: fail("validation");
  }
  return structuredClone(value) as unknown as RecoveryControlTargetV2;
}
function targets(value: unknown): readonly RecoveryControlTargetV2[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail("validation");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length: unknown = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (typeof length !== "number" || length < 1 || length > MAX_TARGETS
    || Reflect.ownKeys(descriptors).length !== length + 1) fail("validation");
  const result: RecoveryControlTargetV2[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("validation");
    const target = parseTarget(descriptor.value);
    const key = canonical(target);
    if (seen.has(key)) fail("validation");
    seen.add(key); result.push(target);
  }
  return result;
}

/** Pure schema boundary: rejects additional fields, accessors, unknown kinds and unbounded targets. */
export function parseRecoveryControlIntentV2(input: unknown): RecoveryControlIntentV2 {
  return validated(() => {
    const base = ["kind", "operationId", "at", "authorization"];
    object(input, base, ["targets", "scope", "bindingId", "resourceId", "privacy", "retentionUntil", "expectedRecoveryEpoch"]);
    assertIdentifierV2(input.operationId); assertIsoTimestampV2(input.at);
    if (!["synthetic-user-request", "synthetic-retention-policy", "synthetic-recovery-request"].includes(input.authorization as string)) fail("validation");
    switch (input.kind) {
      case "FORGET": object(input, [...base, "targets"]); targets(input.targets); break;
      case "PRIVACY_RESTRICT":
        object(input, [...base, "targets", "privacy"]); targets(input.targets);
        if (input.privacy !== "local-only") fail("validation"); break;
      case "RETENTION_SHORTEN":
        object(input, [...base, "targets", "retentionUntil"]); targets(input.targets);
        assertIsoTimestampV2(input.retentionUntil); break;
      case "SOURCE_SUPPRESS":
        object(input, [...base, "scope", "bindingId", "resourceId"]);
        assertScopeV2(input.scope); assertIdentifierV2(input.bindingId); assertIdentifierV2(input.resourceId); break;
      case "RESTORE_BEGIN":
        object(input, [...base, "expectedRecoveryEpoch"]); integer(input.expectedRecoveryEpoch);
        if (input.expectedRecoveryEpoch === Number.MAX_SAFE_INTEGER) fail("validation"); break;
      default: fail("validation");
    }
    if ((input.kind === "RESTORE_BEGIN") !== (input.authorization === "synthetic-recovery-request")) fail("validation");
    if (input.authorization === "synthetic-retention-policy"
      && input.kind !== "FORGET" && input.kind !== "RETENTION_SHORTEN") fail("validation");
    const result = structuredClone(input) as unknown as RecoveryControlIntentV2;
    if (Buffer.byteLength(canonical(result)) > MAX_RECORD_BYTES - 2048) fail("validation");
    return result;
  });
}
function parseInstallation(value: unknown): InstallationV2 {
  object(value, ["formatVersion", "installationId", "recoveryEpoch"]);
  if (value.formatVersion !== 2) fail("validation");
  assertIdentifierV2(value.installationId); integer(value.recoveryEpoch);
  return value as unknown as InstallationV2;
}
function parseHead(value: unknown): RecoveryJournalHeadV2 {
  object(value, ["formatVersion", "installationId", "controlSequence", "recoveryEpoch", "checksum"], ["lastReconciliation"]);
  if (value.formatVersion !== 2) fail("validation");
  assertIdentifierV2(value.installationId); integer(value.controlSequence); integer(value.recoveryEpoch); checksum(value.checksum);
  if ("lastReconciliation" in value) {
    const result = value.lastReconciliation;
    object(result, ["kind", "fromSequence", "toSequence", "at"]);
    if (result.kind !== "DURABLE_LOG_AHEAD" && result.kind !== "INSTALLATION_EPOCH_LAG") fail("validation");
    integer(result.fromSequence); integer(result.toSequence); assertIsoTimestampV2(result.at);
    if (result.fromSequence > result.toSequence || result.toSequence > value.controlSequence) fail("validation");
    if (result.kind === "DURABLE_LOG_AHEAD" && result.fromSequence === result.toSequence) fail("validation");
  }
  return value as unknown as RecoveryJournalHeadV2;
}
function parseRecord(value: unknown): RecoveryControlRecordV2 {
  object(value, ["formatVersion", "installationId", "controlSequence", "recoveryEpoch", "intent", "previousChecksum", "checksum"]);
  if (value.formatVersion !== 2) fail("validation");
  assertIdentifierV2(value.installationId); integer(value.controlSequence, 1); integer(value.recoveryEpoch);
  parseRecoveryControlIntentV2(value.intent); checksum(value.previousChecksum); checksum(value.checksum);
  return value as unknown as RecoveryControlRecordV2;
}
function readCanonical<T>(text: string, parser: (value: unknown) => T): T {
  try {
    const value: unknown = JSON.parse(text);
    const result = parser(value);
    if (canonical(result) !== text) fail("corruption");
    return result;
  } catch { fail("corruption"); }
}
function parseOptions(options: RecoveryJournalOptionsV2): RecoveryJournalOptionsV2 {
  return validated(() => {
    object(options, ["controlRoot", "installationId"]); assertIdentifierV2(options.installationId);
    if (typeof options.controlRoot !== "string" || options.controlRoot.length > 4096
      || options.controlRoot.includes("\0") || !isAbsolute(options.controlRoot)) fail("validation");
    return { controlRoot: resolve(options.controlRoot), installationId: options.installationId };
  });
}
function regularFile(path: string, flags: number): number {
  const before = lstatSync(path);
  if (!before.isFile() || before.nlink !== 1) fail("corruption");
  const descriptor = openSync(path, flags | (constants.O_NOFOLLOW ?? 0));
  try {
    const after = fstatSync(descriptor);
    if (!after.isFile() || after.nlink !== 1 || before.dev !== after.dev || before.ino !== after.ino) fail("corruption");
    return descriptor;
  } catch (error) { closeSync(descriptor); throw error; }
}
function readFile(path: string, maximum: number): string {
  const descriptor = regularFile(path, constants.O_RDONLY);
  try {
    const before = fstatSync(descriptor);
    if (before.size > maximum) fail("capacity");
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (bytes.length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) fail("corruption");
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) fail("corruption");
    return text;
  } finally { closeSync(descriptor); }
}
function syncDirectory(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0));
  try { if (!fstatSync(descriptor).isDirectory()) fail("corruption"); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
}
function writeAll(descriptor: number, data: string): void {
  const buffer = Buffer.from(data, "utf8");
  let offset = 0;
  while (offset < buffer.length) {
    const count = writeSync(descriptor, buffer, offset, buffer.length - offset);
    if (count <= 0) fail("io");
    offset += count;
  }
  fsyncSync(descriptor);
}
function createFile(path: string, contents: string): void {
  const descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { writeAll(descriptor, contents); }
  finally { closeSync(descriptor); }
}
function atomicFile(root: string, filename: string, value: unknown): void {
  const contents = `${canonical(value)}\n`;
  // A crash may leave this controlled metadata-only temporary file. Never truncate it.
  const temporary = join(root, `.${filename}.${digest(value)}.next`);
  try { createFile(temporary, contents); }
  catch (error) {
    if (error === null || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error;
    if (readFile(temporary, MAX_RECORD_BYTES) !== contents) fail("corruption");
    const descriptor = regularFile(temporary, constants.O_RDONLY);
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
  }
  // Both names live in the same directory; rename publishes only a flushed complete file.
  renameSync(temporary, join(root, filename));
  syncDirectory(root);
}

/** Single coordinator writer required. No public constructor or custom storage/validation bypass. */
class FileRecoveryJournalV2 implements RecoveryJournalV2 {
  readonly #root: string;
  readonly #installationId: string;
  readonly #rootDevice: number;
  readonly #rootInode: number;

  constructor(options: RecoveryJournalOptionsV2) {
    this.#root = options.controlRoot;
    this.#installationId = options.installationId;
    const root = lstatSync(this.#root);
    if (!root.isDirectory() || realpathSync(this.#root) !== this.#root) fail("corruption");
    this.#rootDevice = root.dev;
    this.#rootInode = root.ino;
    this.#inspect();
  }

  #assertRoot(): void {
    const root = lstatSync(this.#root);
    if (!root.isDirectory() || root.dev !== this.#rootDevice || root.ino !== this.#rootInode
      || realpathSync(this.#root) !== this.#root) fail("corruption");
  }

  #inspect(): InspectedStateV2 {
    this.#assertRoot();
    const installationText = readFile(join(this.#root, "installation.json"), 4096);
    const headText = readFile(join(this.#root, "recovery.head"), MAX_RECORD_BYTES);
    if (!installationText.endsWith("\n") || !headText.endsWith("\n")) fail("corruption");
    const installation = readCanonical(installationText.slice(0, -1), parseInstallation);
    const head = readCanonical(headText.slice(0, -1), parseHead);
    if (installation.installationId !== this.#installationId || head.installationId !== this.#installationId) fail("corruption");
    const log = readFile(join(this.#root, "recovery.log"), MAX_LOG_BYTES);
    if (log !== "" && !log.endsWith("\n")) fail("corruption");
    const lines = log === "" ? [] : log.slice(0, -1).split("\n");
    const records: RecoveryControlRecordV2[] = [];
    const operations = new Set<string>();
    let previousChecksum = genesis(this.#installationId);
    let recoveryEpoch = 0;
    for (const line of lines) {
      if (Buffer.byteLength(line) > MAX_RECORD_BYTES) fail("capacity");
      const record = readCanonical(line, parseRecord);
      if (record.installationId !== this.#installationId || record.controlSequence !== records.length + 1
        || record.previousChecksum !== previousChecksum || operations.has(record.intent.operationId)) fail("corruption");
      const { checksum: currentChecksum, ...unsigned } = record;
      if (digest(unsigned) !== currentChecksum) fail("corruption");
      if (record.intent.kind === "RESTORE_BEGIN") {
        if (record.intent.expectedRecoveryEpoch !== recoveryEpoch || recoveryEpoch === Number.MAX_SAFE_INTEGER) fail("corruption");
        recoveryEpoch += 1;
      }
      if (record.recoveryEpoch !== recoveryEpoch) fail("corruption");
      previousChecksum = currentChecksum;
      operations.add(record.intent.operationId);
      records.push(record);
    }
    if (head.controlSequence > records.length) fail("corruption");
    const anchoredRecord = records[head.controlSequence - 1];
    if (head.checksum !== (anchoredRecord?.checksum ?? genesis(this.#installationId))
      || head.recoveryEpoch !== (anchoredRecord?.recoveryEpoch ?? 0)
      || installation.recoveryEpoch > head.recoveryEpoch) fail("corruption");
    const recoveryRequired = head.controlSequence !== records.length || installation.recoveryEpoch !== recoveryEpoch;
    this.#assertRoot();
    return {
      installation,
      installationId: this.#installationId,
      head,
      durableTail: { controlSequence: records.length, checksum: previousChecksum, recoveryEpoch },
      recoveryEpoch,
      records,
      recoveryRequired,
    };
  }

  read(): RecoveryJournalStateV2 {
    return safeIo(() => {
      const { installation: _installation, ...state } = this.#inspect();
      return state;
    });
  }

  append(input: RecoveryControlIntentV2): RecoveryControlRecordV2 {
    const intent = parseRecoveryControlIntentV2(input);
    return safeIo(() => {
      const state = this.#inspect();
      if (state.recoveryRequired) fail("recovery_required");
      const existing = state.records.find(record => record.intent.operationId === intent.operationId);
      if (existing) {
        if (canonical(existing.intent) !== canonical(intent)) fail("conflict");
        return existing;
      }
      if (state.head.controlSequence === Number.MAX_SAFE_INTEGER) fail("capacity");
      let recoveryEpoch = state.recoveryEpoch;
      if (intent.kind === "RESTORE_BEGIN") {
        if (intent.expectedRecoveryEpoch !== recoveryEpoch) fail("conflict");
        if (recoveryEpoch === Number.MAX_SAFE_INTEGER) fail("capacity");
        recoveryEpoch += 1;
      }
      const unsigned = {
        formatVersion: 2 as const,
        installationId: this.#installationId,
        controlSequence: state.head.controlSequence + 1,
        recoveryEpoch,
        intent,
        previousChecksum: state.head.checksum,
      };
      const record: RecoveryControlRecordV2 = { ...unsigned, checksum: digest(unsigned) };
      const line = `${canonical(record)}\n`;
      if (Buffer.byteLength(line) > MAX_RECORD_BYTES) fail("capacity");
      const descriptor = regularFile(join(this.#root, "recovery.log"), constants.O_WRONLY | constants.O_APPEND);
      try {
        const expectedBytes = state.records.reduce((total, item) => total + Buffer.byteLength(canonical(item)) + 1, 0);
        const size = fstatSync(descriptor).size;
        if (size !== expectedBytes) fail("corruption");
        if (size + Buffer.byteLength(line) > MAX_LOG_BYTES) fail("capacity");
        writeAll(descriptor, line);
      } finally { closeSync(descriptor); }
      // This point is irrevocable: failure publishing head/epoch must leave the caller blocked.
      const head: RecoveryJournalHeadV2 = {
        ...state.head,
        controlSequence: record.controlSequence,
        checksum: record.checksum,
        recoveryEpoch,
      };
      atomicFile(this.#root, "recovery.head", head);
      if (recoveryEpoch !== state.installation.recoveryEpoch) {
        atomicFile(this.#root, "installation.json", { ...state.installation, recoveryEpoch });
      }
      const committed = this.#inspect();
      if (committed.recoveryRequired || committed.head.checksum !== record.checksum) fail("recovery_required");
      return record;
    });
  }

  reconcileDurableHead(input: ReconcileRecoveryJournalHeadV2): RecoveryJournalStateV2 {
    validated(() => {
      object(input, ["expectedSequence", "expectedChecksum", "at"]);
      integer(input.expectedSequence); checksum(input.expectedChecksum); assertIsoTimestampV2(input.at);
    });
    return safeIo(() => {
      const state = this.#inspect();
      if (input.expectedSequence !== state.durableTail.controlSequence || input.expectedChecksum !== state.durableTail.checksum) fail("conflict");
      if (!state.recoveryRequired) return this.read();
      const head: RecoveryJournalHeadV2 = {
        formatVersion: 2,
        installationId: this.#installationId,
        ...state.durableTail,
        lastReconciliation: {
          kind: state.head.controlSequence < state.durableTail.controlSequence ? "DURABLE_LOG_AHEAD" : "INSTALLATION_EPOCH_LAG",
          fromSequence: state.head.controlSequence,
          toSequence: state.durableTail.controlSequence,
          at: input.at,
        },
      };
      // Re-flush the complete validated log before explicitly advancing its anchor.
      const descriptor = regularFile(join(this.#root, "recovery.log"), constants.O_RDONLY);
      try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
      atomicFile(this.#root, "recovery.head", head);
      if (state.installation.recoveryEpoch !== state.recoveryEpoch) {
        atomicFile(this.#root, "installation.json", { ...state.installation, recoveryEpoch: state.recoveryEpoch });
      }
      return this.read();
    });
  }
}

/** Creates only a previously absent control root. Existing/partially initialized roots are never repaired. */
export function initializeRecoveryJournalV2(input: RecoveryJournalOptionsV2): RecoveryJournalV2 {
  const options = parseOptions(input);
  return safeIo(() => {
    if (realpathSync(dirname(options.controlRoot)) !== dirname(options.controlRoot)) fail("corruption");
    try { mkdirSync(options.controlRoot, { mode: 0o700 }); }
    catch (error) {
      if (error !== null && typeof error === "object" && "code" in error && error.code === "EEXIST") fail("conflict");
      throw error;
    }
    const installation: InstallationV2 = { formatVersion: 2, installationId: options.installationId, recoveryEpoch: 0 };
    const head: RecoveryJournalHeadV2 = {
      formatVersion: 2, installationId: options.installationId,
      controlSequence: 0, recoveryEpoch: 0, checksum: genesis(options.installationId),
    };
    createFile(join(options.controlRoot, "installation.json"), `${canonical(installation)}\n`);
    createFile(join(options.controlRoot, "recovery.log"), "");
    createFile(join(options.controlRoot, "recovery.head"), `${canonical(head)}\n`);
    syncDirectory(options.controlRoot);
    syncDirectory(dirname(options.controlRoot));
    return new FileRecoveryJournalV2(options);
  });
}

/** Opens existing state only. Missing control files always fail closed; never initialize from a backup. */
export function openRecoveryJournalV2(input: RecoveryJournalOptionsV2): RecoveryJournalV2 {
  const options = parseOptions(input);
  return safeIo(() => new FileRecoveryJournalV2(options));
}
