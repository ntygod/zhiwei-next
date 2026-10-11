import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readSync, readdirSync, realpathSync, renameSync, unlinkSync, writeSync, type BigIntStats,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { assertIdentifierV2, assertIsoTimestampV2, type ScopeV2, type ContentRefV2 } from "../../domain/src/index.ts";
import { canonicalJsonV1 } from "../../protocol/src/index.ts";
import { acquireCoordinatorLockV2, type CoordinatorLockV2 } from "./coordinator-lock-v2.ts";
import { openRecoveryJournalV2, type RecoveryJournalStateV2 } from "./recovery-journal-v2.ts";
import { openSyntheticCognitionStoreV2, type SyntheticCognitionStoreV2 } from "./cognitive-store-v2.ts";
import type { TaskPersistenceBoundaryV1 } from "./task-store-v1-types.ts";
import { cognitiveRecoveryPortV2, type CognitiveRecoveryStateV2 } from "./cognitive-recovery-port-v2.ts";

const FORMAT = "synthetic-cognitive-snapshot-v2";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const BODY = /^content\/objects\/([0-9a-f-]{36})\.([1-9][0-9]{0,15})\.([0-9a-f-]{36})\.body$/;
const MAX_DATABASE_BYTES = 256 * 1024 * 1024;
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 512 * 1024 * 1024;
const MAX_ENTRIES = 100_001;
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
const ACTIVE_FILE = "synthetic-active.json";
const CATALOG_DIRECTORY = "synthetic-backup-catalog";
const PURGE_DIRECTORY = "synthetic-copy-purge";

export type SyntheticRecoveryErrorCodeV2 = "validation" | "conflict" | "corruption"
  | "recovery_required" | "unavailable" | "closed" | "sqlite" | "io";
export class SyntheticRecoveryErrorV2 extends Error {
  readonly code: SyntheticRecoveryErrorCodeV2;
  constructor(code: SyntheticRecoveryErrorCodeV2) {
    super(`Synthetic recovery ${code}.`); this.name = "SyntheticRecoveryErrorV2"; this.code = code;
  }
}

export interface SyntheticSnapshotEntryV2 {
  readonly path: string;
  readonly digest: string;
  readonly byteCount: number;
}
export interface SyntheticSnapshotManifestV2 extends CognitiveRecoveryStateV2 {
  readonly format: typeof FORMAT;
  readonly snapshotId: string;
  readonly revision: 1;
  readonly entries: readonly SyntheticSnapshotEntryV2[];
}
interface CatalogEntryV2 extends CognitiveRecoveryStateV2 {
  readonly format: typeof FORMAT;
  readonly snapshotId: string;
  readonly revision: 1;
  readonly manifestDigest: string;
}
interface ActiveGenerationV2 extends CognitiveRecoveryStateV2 {
  readonly format: "synthetic-active-generation-v2";
  readonly generationId: string;
  readonly generation: number;
  readonly previousGenerationId: string | null;
  readonly snapshotId: string | null;
  readonly snapshotManifestDigest: string | null;
  readonly operationId: string | null;
  readonly activatedAt: string;
}
export interface SyntheticRecoveryOptionsV2 {
  /** Existing canonical, separate container; no user-selected arbitrary import paths. */
  readonly recoveryRoot: string;
  /** Current independent control state. It is never copied from a snapshot. */
  readonly controlRoot: string;
  readonly installationId: string;
  readonly clock: { now(): string };
  readonly taskPersistence?: TaskPersistenceBoundaryV1;
}
export interface CreateSyntheticRecoveryOptionsV2 extends SyntheticRecoveryOptionsV2 {
  readonly generationId: string;
}
export interface RestoreSyntheticSnapshotV2 {
  readonly snapshotId: string;
  readonly generationId: string;
  readonly operationId: string;
}
export interface SyntheticRecoveryReceiptV2 extends CognitiveRecoveryStateV2 {
  readonly generationId: string;
}
export interface ManagedSyntheticRecoveryCopyV2 {
  readonly kind: "snapshot" | "inactive-generation";
  readonly id: string;
  /** Retained bytes are owned copies, never falsely reported as outside/purged. */
  readonly purgeState: "pending" | "failed" | "purged";
  readonly restoreEligibility: "catalog-registered-current-journal-required" | "unregistered" | "inactive" | "revoked" | "unknown";
}
export interface ManagedSyntheticRecoveryPurgeResultV2 extends ManagedSyntheticRecoveryCopyV2 {
  readonly errorCode?: SyntheticRecoveryErrorCodeV2;
}
interface PurgeRecordV2 {
  readonly format: "synthetic-copy-purge-v2";
  readonly installationId: string;
  readonly kind: "snapshot" | "inactive-generation";
  readonly id: string;
  readonly state: "pending" | "failed" | "purged";
  readonly at: string;
}

function fail(code: SyntheticRecoveryErrorCodeV2): never { throw new SyntheticRecoveryErrorV2(code); }
function safe<T>(body: () => T): T {
  try { return body(); }
  catch (error) {
    if (error instanceof SyntheticRecoveryErrorV2) throw error;
    const code = (error as { code?: unknown })?.code;
    if (["validation", "conflict", "corruption", "recovery_required", "unavailable", "closed", "sqlite", "io"].includes(String(code))) {
      fail(code as SyntheticRecoveryErrorCodeV2);
    }
    if (code === "ENOENT") fail("recovery_required");
    if (code === "EEXIST") fail("conflict");
    if (code === "ERR_SQLITE_ERROR") fail("sqlite");
    fail("io");
  }
}
function validated<T>(body: () => T): T {
  try { return body(); } catch { fail("validation"); }
}
function object(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("validation");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length || Reflect.ownKeys(descriptors).some(key =>
    typeof key !== "string" || !keys.includes(key) || !("value" in descriptors[key])
    || !descriptors[key].enumerable || descriptors[key].value === undefined)) fail("validation");
}
function integer(value: unknown, minimum = 0): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) fail("validation");
}
function uuid(value: unknown): asserts value is string { if (typeof value !== "string" || !UUID.test(value)) fail("validation"); }
function hash(value: unknown): asserts value is string { if (typeof value !== "string" || !HASH.test(value)) fail("validation"); }
function state(value: Record<string, unknown>): void {
  assertIdentifierV2(value.installationId); if (value.schemaVersion !== 2 && value.schemaVersion !== 3) fail("validation");
  integer(value.controlSequence); integer(value.recoveryEpoch); hash(value.controlChecksum);
  if (value.recoveryEpoch > value.controlSequence) fail("validation");
}
const STATE_KEYS = ["installationId", "schemaVersion", "controlSequence", "controlChecksum", "recoveryEpoch"];
function digest(bytes: Uint8Array | string): string { return createHash("sha256").update(bytes).digest("hex"); }
function serialize(value: unknown): string { return canonicalJsonV1(value); }
function selectedState(value: CognitiveRecoveryStateV2): CognitiveRecoveryStateV2 {
  return { installationId: value.installationId, schemaVersion: value.schemaVersion,
    controlSequence: value.controlSequence, controlChecksum: value.controlChecksum, recoveryEpoch: value.recoveryEpoch };
}
function snapshotPath(value: unknown): asserts value is string {
  if (value === "product.sqlite") return;
  if (typeof value !== "string") fail("validation");
  const match = BODY.exec(value); if (!match) fail("validation");
  uuid(match[1]); uuid(match[3]); integer(Number(match[2]), 1);
}

/** Pure parser. Exported internally for bounded input tests, not from index.ts. */
export function parseSyntheticSnapshotManifestV2(value: unknown): SyntheticSnapshotManifestV2 {
  return validated(() => {
    object(value, [...STATE_KEYS, "format", "snapshotId", "revision", "entries"]); state(value);
    if (value.format !== FORMAT || value.revision !== 1) fail("validation"); uuid(value.snapshotId);
    if (!Array.isArray(value.entries) || Object.getPrototypeOf(value.entries) !== Array.prototype
      || value.entries.length < 1 || value.entries.length > MAX_ENTRIES) fail("validation");
    const descriptors = Object.getOwnPropertyDescriptors(value.entries);
    if (Reflect.ownKeys(descriptors).length !== value.entries.length + 1) fail("validation");
    let total = 0, previous = ""; let databases = 0;
    const entries: SyntheticSnapshotEntryV2[] = [];
    for (let index = 0; index < value.entries.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("validation");
      const entry: unknown = descriptor.value; object(entry, ["path", "digest", "byteCount"]);
      snapshotPath(entry.path); hash(entry.digest); integer(entry.byteCount);
      if (entry.path <= previous || entry.byteCount > (entry.path === "product.sqlite" ? MAX_DATABASE_BYTES : MAX_BODY_BYTES)) fail("validation");
      if (entry.path === "product.sqlite") { databases += 1; if (entry.byteCount === 0) fail("validation"); }
      previous = entry.path; total += entry.byteCount; if (total > MAX_SNAPSHOT_BYTES) fail("validation");
      entries.push({ path: entry.path, digest: entry.digest, byteCount: entry.byteCount });
    }
    if (databases !== 1) fail("validation");
    return { ...value, entries } as unknown as SyntheticSnapshotManifestV2;
  });
}
function parseCatalog(value: unknown): CatalogEntryV2 {
  object(value, [...STATE_KEYS, "format", "snapshotId", "revision", "manifestDigest"]); state(value);
  if (value.format !== FORMAT || value.revision !== 1) fail("validation"); uuid(value.snapshotId); hash(value.manifestDigest);
  return value as unknown as CatalogEntryV2;
}
function parsePurgeRecord(value: unknown): PurgeRecordV2 {
  object(value, ["format", "installationId", "kind", "id", "state", "at"]);
  if (value.format !== "synthetic-copy-purge-v2" || !["snapshot", "inactive-generation"].includes(String(value.kind))
    || !["pending", "failed", "purged"].includes(String(value.state))) fail("validation");
  assertIdentifierV2(value.installationId); uuid(value.id); assertIsoTimestampV2(value.at);
  return value as unknown as PurgeRecordV2;
}
/** Pure activation parser; no caller-supplied proof or permission flag exists. */
export function parseSyntheticActiveGenerationV2(value: unknown): ActiveGenerationV2 {
  return validated(() => {
    object(value, [...STATE_KEYS, "format", "generationId", "generation", "previousGenerationId", "snapshotId", "snapshotManifestDigest", "operationId", "activatedAt"]);
    state(value); if (value.format !== "synthetic-active-generation-v2") fail("validation");
    uuid(value.generationId); integer(value.generation, 1); assertIsoTimestampV2(value.activatedAt);
    if (value.generation === 1) {
      if ([value.previousGenerationId, value.snapshotId, value.snapshotManifestDigest, value.operationId].some(item => item !== null)) fail("validation");
    } else {
      uuid(value.previousGenerationId); uuid(value.snapshotId); hash(value.snapshotManifestDigest); assertIdentifierV2(value.operationId);
      integer(value.recoveryEpoch, 1);
      if (value.previousGenerationId === value.generationId) fail("validation");
    }
    return value as unknown as ActiveGenerationV2;
  });
}

function directory(path: string): void {
  const stat = lstatSync(path); if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path) fail("corruption");
}
function syncDirectory(path: string): void {
  directory(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function readFile(path: string, maxBytes: number): Uint8Array {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(maxBytes)) fail("corruption");
    const bytes = Buffer.alloc(Number(before.size)); let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(fd, bytes, offset, bytes.byteLength - offset, offset);
      if (!count) fail("corruption"); offset += count;
    }
    const after = fstatSync(fd, { bigint: true }), named = lstatSync(path, { bigint: true });
    if (after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs
      || named.dev !== before.dev || named.ino !== before.ino || named.nlink !== 1n || !named.isFile()) fail("corruption");
    return bytes;
  } finally { closeSync(fd); }
}
function writeFile(path: string, bytes: Uint8Array | string): void {
  const buffer = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes;
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    let offset = 0;
    while (offset < buffer.byteLength) {
      const count = writeSync(fd, buffer, offset, buffer.byteLength - offset, offset);
      if (count <= 0) fail("io"); offset += count;
    }
    fsyncSync(fd);
    const stat = fstatSync(fd); if (!stat.isFile() || stat.nlink !== 1 || stat.size !== buffer.byteLength) fail("corruption");
  } finally { closeSync(fd); }
}
function readCanonical<T>(path: string, parse: (value: unknown) => T, maxBytes = MAX_MANIFEST_BYTES): T {
  const text = Buffer.from(readFile(path, maxBytes)).toString("utf8");
  try {
    const value = parse(JSON.parse(text)); if (serialize(value) !== text) fail("corruption"); return value;
  } catch { fail("corruption"); }
}
function createDirectory(path: string): void { mkdirSync(path, { mode: 0o700 }); directory(path); }
function present(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) { if ((error as { code?: unknown })?.code === "ENOENT") return false; throw error; }
}
function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.isFile() && right.isFile() && left.nlink === 1n && right.nlink === 1n
    && left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}
/** Only a pre-enumerated managed tree, never a recursive arbitrary-path delete. */
function inspectCopyFiles(root: string, kind: ManagedSyntheticRecoveryCopyV2["kind"]): {
  files: readonly { path: string; identity: BigIntStats }[]; directories: readonly string[];
} {
  directory(root);
  const files: { path: string; identity: BigIntStats }[] = [];
  const directories = [root];
  const add = (path: string): void => {
    const identity = lstatSync(path, { bigint: true });
    if (!identity.isFile() || identity.nlink !== 1n) fail("corruption");
    files.push({ path, identity }); if (files.length > MAX_ENTRIES + 16) fail("corruption");
  };
  for (const name of readdirSync(root)) {
    if (name === "content") {
      const content = join(root, name); directory(content); directories.push(content);
      for (const location of readdirSync(content)) {
        if (location !== "objects" && location !== "staging") fail("corruption");
        const folder = join(content, location); directory(folder); directories.push(folder);
        for (const name of readdirSync(folder)) {
          snapshotPath(`content/objects/${name}`); add(join(folder, name));
        }
      }
    } else if (["product.sqlite", "product.sqlite-wal", "product.sqlite-shm", "product.sqlite-journal", "manifest.json"].includes(name)) {
      add(join(root, name));
    } else if (kind === "inactive-generation" && (name === "synthetic-generation.json"
      || /^coordinator-lock\.sqlite(?:-wal|-shm|-journal)?$/.test(name))) {
      // Keep identity-only audit and persistent empty mutex files. Never unlink
      // an acquired SQLite mutex inode or call its bytes a business copy.
      const stat = lstatSync(join(root, name)); if (!stat.isFile() || stat.nlink !== 1) fail("corruption");
    } else fail("corruption");
  }
  return { files, directories };
}
function purgeCopyFiles(root: string, kind: ManagedSyntheticRecoveryCopyV2["kind"]): void {
  const { files, directories } = inspectCopyFiles(root, kind);
  // Validate the entire bounded inventory before the first destructive step.
  for (const file of files) {
    if (!sameFile(file.identity, lstatSync(file.path, { bigint: true }))) fail("corruption");
    unlinkSync(file.path);
  }
  for (const path of [...directories].reverse()) syncDirectory(path);
}
function outside(parent: string, child: string): boolean {
  const path = relative(parent, child); return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
}
function options(input: SyntheticRecoveryOptionsV2): SyntheticRecoveryOptionsV2 {
  return validated(() => {
    object(input, ["recoveryRoot", "controlRoot", "installationId", "clock", ...(Object.hasOwn(input, "taskPersistence") ? ["taskPersistence"] : [])]);
    assertIdentifierV2(input.installationId); assertIsoTimestampV2(input.clock.now());
    for (const path of [input.recoveryRoot, input.controlRoot]) {
      if (typeof path !== "string" || !isAbsolute(path) || path.includes("\0") || path.length > 4096 || resolve(path) !== path) fail("validation");
    }
    if (!outside(input.recoveryRoot, input.controlRoot) || !outside(input.controlRoot, input.recoveryRoot)) fail("validation");
    return { ...input };
  });
}
function assertCurrentAnchor(anchor: CognitiveRecoveryStateV2, current: RecoveryJournalStateV2): void {
  if (current.recoveryRequired || anchor.installationId !== current.installationId
    || anchor.controlSequence > current.head.controlSequence || anchor.recoveryEpoch > current.recoveryEpoch) fail("recovery_required");
  const record = current.records[anchor.controlSequence - 1];
  const checksum = record?.checksum ?? current.records[0]?.previousChecksum ?? current.head.checksum;
  if (anchor.controlChecksum !== checksum || anchor.recoveryEpoch !== (record?.recoveryEpoch ?? 0)) fail("recovery_required");
}
function checkSnapshotTree(root: string, entries: readonly SyntheticSnapshotEntryV2[], manifest: boolean): void {
  for (const path of [root, join(root, "content"), join(root, "content", "objects"), join(root, "content", "staging")]) directory(path);
  const expected = ["content", "product.sqlite", ...(manifest ? ["manifest.json"] : [])].sort();
  if (serialize(readdirSync(root).sort()) !== serialize(expected)
    || serialize(readdirSync(join(root, "content")).sort()) !== serialize(["objects", "staging"])
    || readdirSync(join(root, "content", "staging")).length !== 0
    || serialize(readdirSync(join(root, "content", "objects")).sort()) !== serialize(entries.filter(entry => entry.path !== "product.sqlite").map(entry => entry.path.slice("content/objects/".length)).sort())) fail("corruption");
}
function verifyEntry(root: string, entry: SyntheticSnapshotEntryV2): Uint8Array {
  const bytes = readFile(join(root, entry.path), entry.byteCount);
  if (bytes.byteLength !== entry.byteCount || digest(bytes) !== entry.digest) fail("corruption"); return bytes;
}

/**
 * Controlled local synthetic fixture coordinator. Snapshot identities can only
 * originate from captureSnapshot(), never from imported paths or self-reported
 * manifests. This is not the P4 encrypted backup product or a production gate.
 * The persistent container mutex owns the active-store selection. The current
 * store additionally holds both normal data/control mutexes. Direct store APIs
 * must not be used as an alternate consumer of coordinator-managed generations.
 */
export class SyntheticRecoveryCoordinatorV2 {
  readonly #options: SyntheticRecoveryOptionsV2;
  readonly #lock: CoordinatorLockV2;
  readonly #directoryIdentities: ReadonlyMap<string, Readonly<{ dev: bigint; ino: bigint }>>;
  #store: SyntheticCognitionStoreV2 | undefined;
  #active: ActiveGenerationV2;
  #closed = false;
  private constructor(input: SyntheticRecoveryOptionsV2, lock: CoordinatorLockV2,
    active: ActiveGenerationV2, store: SyntheticCognitionStoreV2) {
    this.#options = input; this.#lock = lock; this.#active = active; this.#store = store;
    this.#directoryIdentities = new Map([input.recoveryRoot, input.controlRoot,
      join(input.recoveryRoot, "generations"), join(input.recoveryRoot, "snapshots"),
      join(input.controlRoot, CATALOG_DIRECTORY), join(input.controlRoot, PURGE_DIRECTORY)]
      .map(path => [path, lstatSync(path, { bigint: true })]));
  }
  static create(input: CreateSyntheticRecoveryOptionsV2): SyntheticRecoveryCoordinatorV2 {
    return safe(() => {
      validated(() => { object(input, ["recoveryRoot", "controlRoot", "installationId", "clock", "generationId", ...(Object.hasOwn(input, "taskPersistence") ? ["taskPersistence"] : [])]); uuid(input.generationId); });
      const { generationId, ...base } = input; const config = options(base); directory(config.recoveryRoot);
      if (readdirSync(config.recoveryRoot).length !== 0) fail("conflict");
      const lock = acquireCoordinatorLockV2({ dataRoot: config.recoveryRoot, installationId: config.installationId });
      let store: SyntheticCognitionStoreV2 | undefined;
      try {
        createDirectory(join(config.recoveryRoot, "generations")); createDirectory(join(config.recoveryRoot, "snapshots"));
        const root = join(config.recoveryRoot, "generations", generationId); createDirectory(root);
        store = openSyntheticCognitionStoreV2({ dataRoot: root, controlRoot: config.controlRoot,
          installationId: config.installationId, mode: "create", clock: config.clock, ...(config.taskPersistence ? { taskPersistence: config.taskPersistence } : {}) });
        createDirectory(join(config.controlRoot, CATALOG_DIRECTORY));
        createDirectory(join(config.controlRoot, PURGE_DIRECTORY));
        const boundary = store[cognitiveRecoveryPortV2].verifyRecoveryBoundary();
        const active = parseSyntheticActiveGenerationV2({ ...selectedState(boundary), format: "synthetic-active-generation-v2",
          generationId, generation: 1, previousGenerationId: null, snapshotId: null,
          snapshotManifestDigest: null, operationId: null, activatedAt: config.clock.now() });
        writeFile(join(root, "synthetic-generation.json"), serialize(active)); syncDirectory(root);
        syncDirectory(join(config.recoveryRoot, "generations")); syncDirectory(join(config.recoveryRoot, "snapshots")); syncDirectory(config.recoveryRoot);
        writeFile(join(config.controlRoot, ACTIVE_FILE), serialize(active)); syncDirectory(config.controlRoot);
        return new SyntheticRecoveryCoordinatorV2(config, lock, active, store);
      } catch (error) {
        try { store?.close(); } finally { lock.release(); } throw error;
      }
    });
  }
  static open(input: SyntheticRecoveryOptionsV2): SyntheticRecoveryCoordinatorV2 {
    return safe(() => {
      const config = options(input); directory(config.recoveryRoot); directory(config.controlRoot);
      const lock = acquireCoordinatorLockV2({ dataRoot: config.recoveryRoot, installationId: config.installationId });
      let store: SyntheticCognitionStoreV2 | undefined;
      try {
        for (const path of [join(config.recoveryRoot, "generations"), join(config.recoveryRoot, "snapshots"), join(config.controlRoot, CATALOG_DIRECTORY), join(config.controlRoot, PURGE_DIRECTORY)]) directory(path);
        if (readdirSync(config.controlRoot).some(name => name.startsWith(".synthetic-active.") && name.endsWith(".next"))) fail("recovery_required");
        const active = readCanonical(join(config.controlRoot, ACTIVE_FILE), parseSyntheticActiveGenerationV2);
        if (active.installationId !== config.installationId) fail("recovery_required");
        const root = join(config.recoveryRoot, "generations", active.generationId); directory(root);
        const receipt = readCanonical(join(root, "synthetic-generation.json"), parseSyntheticActiveGenerationV2);
        if (serialize(receipt) !== serialize(active)) fail("recovery_required");
        store = openSyntheticCognitionStoreV2({ dataRoot: root, controlRoot: config.controlRoot,
          installationId: config.installationId, mode: "open", clock: config.clock, ...(config.taskPersistence ? { taskPersistence: config.taskPersistence } : {}) });
        const coordinator = new SyntheticRecoveryCoordinatorV2(config, lock, active, store);
        coordinator.#check(); coordinator.#verifyCurrent(store); return coordinator;
      } catch (error) {
        try { store?.close(); } finally { lock.release(); } throw error;
      }
    });
  }
  #check(): void {
    if (this.#closed) fail("closed");
    for (const [path, expected] of this.#directoryIdentities) {
      directory(path); const current = lstatSync(path, { bigint: true });
      if (current.dev !== expected.dev || current.ino !== expected.ino) fail("corruption");
    }
    if (readdirSync(this.#options.controlRoot).some(name => name.startsWith(".synthetic-active.") && name.endsWith(".next"))) fail("recovery_required");
    const active = readCanonical(join(this.#options.controlRoot, ACTIVE_FILE), parseSyntheticActiveGenerationV2);
    if (serialize(active) !== serialize(this.#active)) fail("recovery_required");
    if (active.snapshotId !== null) {
      const catalog = readCanonical(join(this.#options.controlRoot, CATALOG_DIRECTORY, `${active.snapshotId}.json`), parseCatalog, 8192);
      if (catalog.installationId !== active.installationId || catalog.snapshotId !== active.snapshotId
        || catalog.manifestDigest !== active.snapshotManifestDigest) fail("recovery_required");
      assertCurrentAnchor(catalog, this.#journal());
    }
  }
  #journal(): RecoveryJournalStateV2 {
    return openRecoveryJournalV2({ controlRoot: this.#options.controlRoot, installationId: this.#options.installationId }).read();
  }
  #purgeRecord(kind: ManagedSyntheticRecoveryCopyV2["kind"], id: string): PurgeRecordV2 | undefined {
    const root = join(this.#options.controlRoot, PURGE_DIRECTORY), name = `${kind}-${id}.json`;
    // Even an interrupted revocation publication blocks restoration. It must not
    // become a window in which an in-progress purge is mistaken for eligibility.
    if (present(join(root, `.${name}.next`))) fail("recovery_required");
    if (!present(join(root, name))) return undefined;
    const record = readCanonical(join(root, name), parsePurgeRecord, 8192);
    if (record.kind !== kind || record.id !== id || record.installationId !== this.#options.installationId) fail("corruption");
    return record;
  }
  #writePurgeRecord(kind: ManagedSyntheticRecoveryCopyV2["kind"], id: string, state: PurgeRecordV2["state"]): void {
    const root = join(this.#options.controlRoot, PURGE_DIRECTORY), name = `${kind}-${id}.json`;
    const value: PurgeRecordV2 = { format: "synthetic-copy-purge-v2", installationId: this.#options.installationId,
      kind, id, state, at: this.#options.clock.now() };
    parsePurgeRecord(value);
    const temporary = join(root, `.${name}.next`);
    // A interrupted, well-formed old update can be completed explicitly here.
    // Only cleanup retries use this path; restoration never repairs revocations.
    if (present(temporary)) {
      const prior = readCanonical(temporary, parsePurgeRecord, 8192);
      if (prior.kind !== kind || prior.id !== id || prior.installationId !== this.#options.installationId) fail("corruption");
      renameSync(temporary, join(root, name)); syncDirectory(root);
    }
    writeFile(temporary, serialize(value)); syncDirectory(root);
    renameSync(temporary, join(root, name)); syncDirectory(root);
  }
  #verifyCurrent(store: SyntheticCognitionStoreV2): CognitiveRecoveryStateV2 {
    const boundary = store[cognitiveRecoveryPortV2].verifyRecoveryBoundary(), current = this.#journal();
    assertCurrentAnchor(this.#active, current); assertCurrentAnchor(boundary, current);
    if (boundary.controlSequence !== current.head.controlSequence || boundary.controlChecksum !== current.head.checksum
      || boundary.recoveryEpoch !== current.recoveryEpoch || boundary.nonQuarantinedOldOutbox !== 0) fail("recovery_required");
    return selectedState(boundary);
  }
  get store(): SyntheticCognitionStoreV2 {
    return safe(() => { this.#check(); if (!this.#store) fail("recovery_required"); return this.#store; });
  }
  listManagedRecoveryCopies(): readonly ManagedSyntheticRecoveryCopyV2[] {
    return safe(() => {
      this.#check(); this.#verifyCurrent(this.store);
      const result: ManagedSyntheticRecoveryCopyV2[] = [];
      const catalogRoot = join(this.#options.controlRoot, CATALOG_DIRECTORY);
      const catalogIds = new Set<string>();
      for (const name of readdirSync(catalogRoot)) {
        const id = name.endsWith(".json") ? name.slice(0, -5) : "";
        if (!UUID.test(id)) fail("corruption");
        const entry = readCanonical(join(catalogRoot, name), parseCatalog, 8192);
        if (entry.snapshotId !== id || entry.installationId !== this.#options.installationId) fail("corruption");
        catalogIds.add(id);
      }
      for (const id of readdirSync(join(this.#options.recoveryRoot, "snapshots")).sort()) {
        if (!UUID.test(id)) fail("corruption"); directory(join(this.#options.recoveryRoot, "snapshots", id));
        const purge = this.#purgeRecord("snapshot", id);
        if (purge?.state === "purged" && inspectCopyFiles(join(this.#options.recoveryRoot, "snapshots", id), "snapshot").files.length !== 0) fail("corruption");
        result.push({ kind: "snapshot", id, purgeState: purge?.state ?? "pending", restoreEligibility:
          purge ? "revoked" : catalogIds.has(id) ? "catalog-registered-current-journal-required" : "unregistered" });
        catalogIds.delete(id);
      }
      if (catalogIds.size !== 0) fail("recovery_required");
      for (const id of readdirSync(join(this.#options.recoveryRoot, "generations")).sort()) {
        if (!UUID.test(id)) fail("corruption"); directory(join(this.#options.recoveryRoot, "generations", id));
        if (id !== this.#active.generationId) {
          const purge = this.#purgeRecord("inactive-generation", id);
          if (purge?.state === "purged" && inspectCopyFiles(join(this.#options.recoveryRoot, "generations", id), "inactive-generation").files.length !== 0) fail("corruption");
          result.push({ kind: "inactive-generation", id, purgeState: purge?.state ?? "pending", restoreEligibility: "inactive" });
        }
      }
      return result;
    });
  }
  managedCopies(scope: ScopeV2, ref: ContentRefV2): readonly Readonly<{ copyKind: string; state: string }>[] {
    return safe(() => {
      const local = this.store.managedCopies(scope, ref), recovery = this.listManagedRecoveryCopies();
      // Deliberately conservative: no per-content fingerprint inventory is kept
      // in recovery control state. Any retained recovery copy keeps purge pending.
      const backup = recovery.some(copy => copy.purgeState === "failed") ? "failed"
        : recovery.some(copy => copy.purgeState === "pending") ? "pending"
        : recovery.length > 0 ? "purged" : "outside";
      return local.map(copy => copy.copyKind === "backup" ? { copyKind: "backup", state: backup } : copy);
    });
  }
  purgeInactiveRecoveryCopies(): readonly ManagedSyntheticRecoveryPurgeResultV2[] {
    return safe(() => {
      this.#check(); this.#verifyCurrent(this.store);
      const targets: { kind: ManagedSyntheticRecoveryCopyV2["kind"]; id: string }[] = [];
      for (const [kind, folder] of [["snapshot", "snapshots"], ["inactive-generation", "generations"]] as const) {
        for (const id of readdirSync(join(this.#options.recoveryRoot, folder)).sort()) {
          if (!UUID.test(id)) fail("corruption");
          if (kind === "inactive-generation" && id === this.#active.generationId) continue;
          targets.push({ kind, id });
        }
      }
      const result: ManagedSyntheticRecoveryPurgeResultV2[] = [];
      for (const target of targets) {
        let lock: CoordinatorLockV2 | undefined;
        try {
          this.#check();
          // This independent durable record revokes snapshot catalog eligibility
          // before ANY body/DB bytes are removed. Catalog audit metadata remains.
          this.#writePurgeRecord(target.kind, target.id, "pending");
          const folder = target.kind === "snapshot" ? "snapshots" : "generations";
          const root = join(this.#options.recoveryRoot, folder, target.id); directory(root);
          if (target.kind === "inactive-generation") lock = acquireCoordinatorLockV2({ dataRoot: root, installationId: this.#options.installationId });
          purgeCopyFiles(root, target.kind);
          lock?.release(); lock = undefined;
          this.#writePurgeRecord(target.kind, target.id, "purged");
          result.push({ ...target, purgeState: "purged", restoreEligibility: target.kind === "snapshot" ? "revoked" : "inactive" });
        } catch (error) {
          try { lock?.release(); } catch { /* Keep failure and no physical-success claim. */ }
          let errorCode: SyntheticRecoveryErrorCodeV2 = "io";
          try { safe(() => { throw error; }); } catch (classified) {
            if (classified instanceof SyntheticRecoveryErrorV2) errorCode = classified.code;
          }
          // An uncertain revocation remains unavailable. Failure to persist this
          // diagnostic does not retract a durable pending/revoked record.
          try { this.#writePurgeRecord(target.kind, target.id, "failed"); } catch { /* Report failed below. */ }
          let eligibility: ManagedSyntheticRecoveryCopyV2["restoreEligibility"] = "inactive";
          if (target.kind === "snapshot") {
            try { eligibility = this.#purgeRecord("snapshot", target.id) ? "revoked" : "unknown"; }
            catch { eligibility = "unknown"; }
          }
          result.push({ ...target, purgeState: "failed", restoreEligibility: eligibility, errorCode });
        }
      }
      return result;
    });
  }
  captureSnapshot(snapshotId: string): SyntheticSnapshotManifestV2 {
    return safe(() => {
      validated(() => uuid(snapshotId)); this.#check(); const live = this.store;
      const root = join(this.#options.recoveryRoot, "snapshots", snapshotId); createDirectory(root);
      const exported = live[cognitiveRecoveryPortV2].exportSnapshot(root);
      const entries: SyntheticSnapshotEntryV2[] = [];
      const database = readFile(join(root, "product.sqlite"), MAX_DATABASE_BYTES);
      entries.push({ path: "product.sqlite", digest: digest(database), byteCount: database.byteLength });
      for (const content of exported.contents) {
        const entry = { path: `content/objects/${content.contentId}.${content.version}.${content.reservationId}.body`,
          digest: content.digest, byteCount: content.byteCount };
        snapshotPath(entry.path); verifyEntry(root, entry); entries.push(entry);
      }
      entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
      const manifest = parseSyntheticSnapshotManifestV2({ ...selectedState(exported), format: FORMAT, snapshotId, revision: 1, entries });
      checkSnapshotTree(root, manifest.entries, false); assertCurrentAnchor(manifest, this.#journal());
      writeFile(join(root, "manifest.json"), serialize(manifest));
      for (const path of [join(root, "content", "objects"), join(root, "content", "staging"), join(root, "content"), root, join(this.#options.recoveryRoot, "snapshots")]) syncDirectory(path);
      const catalog: CatalogEntryV2 = { ...selectedState(manifest), format: FORMAT, snapshotId, revision: 1, manifestDigest: digest(serialize(manifest)) };
      // Registration is last. A failed capture remains an untrusted orphan;
      // there is deliberately no scan/register/import API for such directories.
      const catalogRoot = join(this.#options.controlRoot, CATALOG_DIRECTORY); directory(catalogRoot);
      writeFile(join(catalogRoot, `${snapshotId}.json`), serialize(catalog)); syncDirectory(catalogRoot);
      this.#verifyCurrent(live); return structuredClone(manifest);
    });
  }
  restoreSnapshot(input: RestoreSyntheticSnapshotV2): SyntheticRecoveryReceiptV2 {
    return safe(() => {
      validated(() => { object(input, ["snapshotId", "generationId", "operationId"]);
        uuid(input.snapshotId); uuid(input.generationId); assertIdentifierV2(input.operationId); });
      this.#check(); const live = this.store;
      if (this.#active.operationId === input.operationId) {
        if (this.#active.snapshotId !== input.snapshotId || this.#active.generationId !== input.generationId) fail("conflict");
        return { ...this.#verifyCurrent(live), generationId: this.#active.generationId };
      }
      const before = this.#verifyCurrent(live), journal = this.#journal();
      if (journal.records.some(record => record.intent.operationId === input.operationId)
        || this.#active.generation === Number.MAX_SAFE_INTEGER) fail("conflict");
      if (this.#purgeRecord("snapshot", input.snapshotId)) fail("unavailable");
      const catalog = readCanonical(join(this.#options.controlRoot, CATALOG_DIRECTORY, `${input.snapshotId}.json`), parseCatalog, 8192);
      if (catalog.snapshotId !== input.snapshotId || catalog.installationId !== this.#options.installationId) fail("recovery_required");
      const snapshotRoot = join(this.#options.recoveryRoot, "snapshots", input.snapshotId);
      const manifest = readCanonical(join(snapshotRoot, "manifest.json"), parseSyntheticSnapshotManifestV2);
      if (digest(serialize(manifest)) !== catalog.manifestDigest || manifest.snapshotId !== catalog.snapshotId
        || serialize(selectedState(manifest)) !== serialize(selectedState(catalog))) fail("corruption");
      assertCurrentAnchor(catalog, journal); checkSnapshotTree(snapshotRoot, manifest.entries, true);
      const candidateRoot = join(this.#options.recoveryRoot, "generations", input.generationId); createDirectory(candidateRoot);
      createDirectory(join(candidateRoot, "content")); createDirectory(join(candidateRoot, "content", "objects")); createDirectory(join(candidateRoot, "content", "staging"));
      for (const entry of manifest.entries) writeFile(join(candidateRoot, entry.path), verifyEntry(snapshotRoot, entry));
      // All input bytes and exact inventory are checked before changing either
      // the current generation or the independent control epoch.
      checkSnapshotTree(candidateRoot, manifest.entries, false); this.#verifyCurrent(live);
      this.#store = undefined; live.close();
      let candidate: SyntheticCognitionStoreV2 | undefined;
      try {
        candidate = openSyntheticCognitionStoreV2({ dataRoot: candidateRoot, controlRoot: this.#options.controlRoot,
          installationId: this.#options.installationId, mode: "open", clock: this.#options.clock, ...(this.#options.taskPersistence ? { taskPersistence: this.#options.taskPersistence } : {}) });
        // Normal open first applies CURRENT independent FORGET/privacy/retention
        // records inside the isolated candidate, with no consumer reference.
        const reconciled = candidate[cognitiveRecoveryPortV2].verifyRecoveryBoundary();
        const current = this.#journal(); assertCurrentAnchor(reconciled, current);
        if (reconciled.controlSequence !== current.head.controlSequence || reconciled.recoveryEpoch < before.recoveryEpoch) fail("recovery_required");
        candidate.applyControlIntent({ kind: "RESTORE_BEGIN", operationId: input.operationId,
          at: this.#options.clock.now(), authorization: "synthetic-recovery-request", expectedRecoveryEpoch: current.recoveryEpoch });
        const boundary = candidate[cognitiveRecoveryPortV2].verifyRecoveryBoundary(), after = this.#journal();
        assertCurrentAnchor(boundary, after);
        if (boundary.controlSequence !== after.head.controlSequence || boundary.recoveryEpoch !== current.recoveryEpoch + 1
          || boundary.nonQuarantinedOldOutbox !== 0) fail("recovery_required");
        const active = parseSyntheticActiveGenerationV2({ ...selectedState(boundary), format: "synthetic-active-generation-v2",
          generationId: input.generationId, generation: this.#active.generation + 1, previousGenerationId: this.#active.generationId,
          snapshotId: input.snapshotId, snapshotManifestDigest: catalog.manifestDigest,
          operationId: input.operationId, activatedAt: this.#options.clock.now() });
        writeFile(join(candidateRoot, "synthetic-generation.json"), serialize(active));
        for (const path of [join(candidateRoot, "content", "objects"), join(candidateRoot, "content", "staging"), join(candidateRoot, "content"), candidateRoot, join(this.#options.recoveryRoot, "generations")]) syncDirectory(path);
        this.#check();
        // The candidate still owns the CURRENT control mutex here. A single
        // same-directory rename changes the sole trusted active selection.
        // Failed/uncertain publication never restores the previous epoch.
        const temporary = join(this.#options.controlRoot, `.synthetic-active.${input.generationId}.next`);
        writeFile(temporary, serialize(active)); syncDirectory(this.#options.controlRoot);
        renameSync(temporary, join(this.#options.controlRoot, ACTIVE_FILE)); syncDirectory(this.#options.controlRoot);
        this.#active = active; this.#store = candidate;
        this.#check(); this.#verifyCurrent(candidate);
        return { ...selectedState(boundary), generationId: input.generationId };
      } catch (error) {
        // The old active file remains selected unless the atomic rename happened.
        // Reopen reconciles it with the irreversible epoch, or refuses a partial
        // switch footprint. No unverified candidate is automatically selected.
        this.#store = undefined; candidate?.close(); throw error;
      }
    });
  }
  close(): void {
    if (this.#closed) return;
    safe(() => {
      try { this.#store?.close(); }
      finally { this.#store = undefined; this.#closed = true; this.#lock.release(); }
    });
  }
}

export function createSyntheticRecoveryCoordinatorV2(options: CreateSyntheticRecoveryOptionsV2): SyntheticRecoveryCoordinatorV2 {
  return SyntheticRecoveryCoordinatorV2.create(options);
}
export function openSyntheticRecoveryCoordinatorV2(options: SyntheticRecoveryOptionsV2): SyntheticRecoveryCoordinatorV2 {
  return SyntheticRecoveryCoordinatorV2.open(options);
}
