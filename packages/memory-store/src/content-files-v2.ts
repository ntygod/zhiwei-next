import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  opendirSync,
  readSync,
  renameSync,
  unlinkSync,
  writeSync,
  type BigIntStats,
} from "node:fs";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";

export type ContentFileErrorCodeV2 =
  | "validation"
  | "conflict"
  | "unavailable"
  | "corruption"
  | "limit"
  | "unsupported"
  | "io";

const ERROR_MESSAGES: Readonly<Record<ContentFileErrorCodeV2, string>> = {
  validation: "Invalid content file request.",
  conflict: "Content file state conflicts with the request.",
  unavailable: "Content file is unavailable.",
  corruption: "Content file integrity validation failed.",
  limit: "Content file resource limit exceeded.",
  unsupported: "Required content file durability is unsupported.",
  io: "Content file operation failed.",
};

export class ContentFileErrorV2 extends Error {
  readonly code: ContentFileErrorCodeV2;

  constructor(code: ContentFileErrorCodeV2) {
    super(ERROR_MESSAGES[code]);
    this.name = "ContentFileErrorV2";
    this.code = code;
  }
}

export interface ContentFileKeyV2 {
  readonly contentId: string;
  readonly version: number;
  readonly reservationId: string;
}

export interface ContentFileDescriptorV2 extends ContentFileKeyV2 {
  readonly digest: string;
  readonly byteCount: number;
}

export type ContentFileLocationV2 = "staging" | "objects";

/** Identity is an opaque comparison token, not a path or authorization. */
export interface ContentFileIdentityV2 {
  readonly device: string;
  readonly inode: string;
  readonly byteCount: number;
  readonly modifiedAtNs: string;
  readonly changedAtNs: string;
}

export interface ContentFileInventoryEntryV2 extends ContentFileKeyV2 {
  readonly location: ContentFileLocationV2;
  readonly state: "reserved" | "orphan";
  readonly identity: ContentFileIdentityV2;
}

export type ContentFileRemovalResultV2 =
  | { readonly state: "removed" | "absent" }
  | { readonly state: "failed"; readonly code: ContentFileErrorCodeV2 };

export interface ContentFilesOptionsV2 {
  /** Existing directory selected by the trusted caller, never content input. */
  readonly contentRoot: string;
  /** Explicit new-installation authority. Reopen never recreates missing paths. */
  readonly initialize?: boolean;
  readonly maxBytes?: number;
  readonly maxInventoryEntries?: number;
}

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_INVENTORY_ENTRIES = 100_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FILE_NAME = /^([0-9a-f-]{36})\.([1-9][0-9]{0,15})\.([0-9a-f-]{36})\.body$/;
const LOCATIONS: readonly ContentFileLocationV2[] = ["staging", "objects"];

function fail(code: ContentFileErrorCodeV2): never {
  throw new ContentFileErrorV2(code);
}

function nativeCode(error: unknown): unknown {
  return error !== null && typeof error === "object" && "code" in error
    ? error.code
    : undefined;
}

function safeError(error: unknown): ContentFileErrorV2 {
  if (error instanceof ContentFileErrorV2) return error;
  switch (nativeCode(error)) {
    case "ENOENT": return new ContentFileErrorV2("unavailable");
    case "EEXIST": return new ContentFileErrorV2("conflict");
    case "ELOOP":
    case "ENOTDIR": return new ContentFileErrorV2("corruption");
    default: return new ContentFileErrorV2("io");
  }
}

function guarded<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw safeError(error);
  }
}

function assertKey(key: ContentFileKeyV2): void {
  if (
    key === null || typeof key !== "object" ||
    typeof key.contentId !== "string" || !UUID.test(key.contentId) ||
    typeof key.reservationId !== "string" || !UUID.test(key.reservationId) ||
    !Number.isSafeInteger(key.version) || key.version < 1
  ) fail("validation");
}

function filename(key: ContentFileKeyV2): string {
  assertKey(key);
  return `${key.contentId}.${key.version}.${key.reservationId}.body`;
}

function parseFilename(value: string): ContentFileKeyV2 {
  const match = FILE_NAME.exec(value);
  if (!match) fail("corruption");
  const key = { contentId: match[1], version: Number(match[2]), reservationId: match[3] };
  try {
    assertKey(key);
  } catch {
    fail("corruption");
  }
  if (filename(key) !== value) fail("corruption");
  return key;
}

function identity(stat: BigIntStats): ContentFileIdentityV2 {
  if (stat.size < 0n || stat.size > BigInt(Number.MAX_SAFE_INTEGER)) fail("corruption");
  return {
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    byteCount: Number(stat.size),
    modifiedAtNs: stat.mtimeNs.toString(),
    changedAtNs: stat.ctimeNs.toString(),
  };
}

function sameIdentity(left: ContentFileIdentityV2, right: ContentFileIdentityV2): boolean {
  return left.device === right.device && left.inode === right.inode &&
    left.byteCount === right.byteCount && left.modifiedAtNs === right.modifiedAtNs &&
    left.changedAtNs === right.changedAtNs;
}

function assertFile(stat: BigIntStats): void {
  if (!stat.isFile() || stat.nlink !== 1n) fail("corruption");
}

function existingStat(path: string): BigIntStats | undefined {
  try {
    return lstatSync(path, { bigint: true });
  } catch (error) {
    if (nativeCode(error) === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * Internal file adapter. The sole Persistence Coordinator owns the process lock,
 * reservations, authorization, retention and database availability transitions.
 * An object file, descriptor, or inventory entry never grants read authority.
 * No same-user hostile-process isolation or forensic erasure is claimed.
 */
export class ContentFilesV2 {
  readonly #root: string;
  readonly #maxBytes: number;
  readonly #maxInventoryEntries: number;
  readonly #directories: ReadonlyMap<string, { readonly device: bigint; readonly inode: bigint }>;

  private constructor(
    root: string,
    maxBytes: number,
    maxInventoryEntries: number,
    directories: ReadonlyMap<string, { readonly device: bigint; readonly inode: bigint }>,
  ) {
    this.#root = root;
    this.#maxBytes = maxBytes;
    this.#maxInventoryEntries = maxInventoryEntries;
    this.#directories = directories;
  }

  static open(options: ContentFilesOptionsV2): ContentFilesV2 {
    return guarded(() => {
      if (options === null || typeof options !== "object" ||
          typeof options.contentRoot !== "string" || !isAbsolute(options.contentRoot) ||
          options.contentRoot.includes("\0") ||
          (options.initialize !== undefined && typeof options.initialize !== "boolean")) fail("validation");
      const root = resolve(options.contentRoot);
      const maxBytes = options.maxBytes ?? MAX_BYTES;
      const maxInventoryEntries = options.maxInventoryEntries ?? MAX_INVENTORY_ENTRIES;
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES ||
          !Number.isSafeInteger(maxInventoryEntries) || maxInventoryEntries < 1 ||
          maxInventoryEntries > MAX_INVENTORY_ENTRIES || root === parse(root).root) fail("validation");
      if (typeof constants.O_NOFOLLOW !== "number" ||
          typeof constants.O_DIRECTORY !== "number" ||
          typeof constants.O_NONBLOCK !== "number") fail("unsupported");
      const directories = new Map<string, { readonly device: bigint; readonly inode: bigint }>();
      const parents: string[] = [];
      for (let path = root; ; path = dirname(path)) {
        parents.unshift(path);
        if (path === dirname(path)) break;
      }
      for (const path of parents) {
        const stat = lstatSync(path, { bigint: true });
        if (!stat.isDirectory()) fail("corruption");
        directories.set(path, { device: stat.dev, inode: stat.ino });
      }
      for (const location of LOCATIONS) {
        const stat = existingStat(join(root, location));
        if (options.initialize === true && stat) fail("conflict");
        if (options.initialize !== true && !stat) fail("unavailable");
        if (stat && !stat.isDirectory()) fail("corruption");
      }
      for (const location of LOCATIONS) {
        const path = join(root, location);
        if (options.initialize === true) mkdirSync(path, { mode: 0o700 });
        const stat = lstatSync(path, { bigint: true });
        if (!stat.isDirectory()) fail("corruption");
        directories.set(path, { device: stat.dev, inode: stat.ino });
      }
      const store = new ContentFilesV2(root, maxBytes, maxInventoryEntries, directories);
      store.#checkDirectories();
      // Also verifies that this filesystem supports the required directory sync.
      for (const location of LOCATIONS) store.#syncDirectory(join(root, location));
      store.#syncDirectory(root);
      return store;
    });
  }

  stage(key: ContentFileKeyV2, bytes: Uint8Array): ContentFileDescriptorV2 {
    return guarded(() => {
      const name = filename(key);
      if (!(bytes instanceof Uint8Array)) fail("validation");
      if (bytes.byteLength > this.#maxBytes) fail("limit");
      this.#checkDirectories();
      if (existingStat(join(this.#root, "objects", name))) fail("conflict");
      const body = Buffer.from(bytes);
      const descriptor: ContentFileDescriptorV2 = {
        contentId: key.contentId,
        version: key.version,
        reservationId: key.reservationId,
        byteCount: body.byteLength,
        digest: createHash("sha256").update(body).digest("hex"),
      };
      const path = join(this.#root, "staging", name);
      // A failed or partial write is deliberately retained for explicit recovery.
      const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try {
        assertFile(fstatSync(fd, { bigint: true }));
        let written = 0;
        while (written < body.byteLength) {
          const count = writeSync(fd, body, written, body.byteLength - written, written);
          if (count <= 0) fail("io");
          written += count;
        }
        fsyncSync(fd);
        const stat = fstatSync(fd, { bigint: true });
        assertFile(stat);
        if (stat.size !== BigInt(body.byteLength)) fail("corruption");
      } finally {
        closeSync(fd);
      }
      this.#checkDirectories();
      this.#syncDirectory(join(this.#root, "staging"));
      return descriptor;
    });
  }

  publish(descriptor: ContentFileDescriptorV2): void {
    guarded(() => {
      this.#assertDescriptor(descriptor);
      this.#checkDirectories();
      const name = filename(descriptor);
      const staged = join(this.#root, "staging", name);
      const target = join(this.#root, "objects", name);
      if (existingStat(target)) fail("conflict");
      this.#readVerified("staging", descriptor);
      // The Coordinator's exclusive process lock prevents a second normal writer
      // between the target check and rename; Node has no portable rename-noreplace.
      renameSync(staged, target);
      this.#checkDirectories();
      this.#syncDirectory(join(this.#root, "objects"));
      this.#syncDirectory(join(this.#root, "staging"));
      // The caller must still commit a current, authorized available DB reference.
    });
  }

  read(descriptor: ContentFileDescriptorV2): Uint8Array {
    return guarded(() => {
      this.#assertDescriptor(descriptor);
      this.#checkDirectories();
      return this.#readVerified("objects", descriptor);
    });
  }

  remove(
    key: ContentFileKeyV2,
    expected?: Readonly<Partial<Record<ContentFileLocationV2, ContentFileIdentityV2>>>,
  ): Readonly<Record<ContentFileLocationV2, ContentFileRemovalResultV2>> {
    // Malformed keys are caller errors; filesystem failures are per-copy results.
    assertKey(key);
    return {
      staging: this.#removeFile(key, "staging", expected?.staging),
      objects: this.#removeFile(key, "objects", expected?.objects),
    };
  }

  /** Removes only the exact copy observed by a previous inventory operation. */
  removeInventoryEntry(entry: ContentFileInventoryEntryV2): ContentFileRemovalResultV2 {
    return guarded(() => {
      assertKey(entry);
      if (!LOCATIONS.includes(entry.location) || !entry.identity ||
          (entry.state !== "reserved" && entry.state !== "orphan")) fail("validation");
      return this.#removeFile(entry, entry.location, entry.identity);
    });
  }

  inventory(reservations: readonly ContentFileKeyV2[]): readonly ContentFileInventoryEntryV2[] {
    return guarded(() => {
      if (!Array.isArray(reservations)) fail("validation");
      if (reservations.length > this.#maxInventoryEntries) fail("limit");
      const reserved = new Map<string, string>();
      for (const key of reservations) {
        const name = filename(key);
        if (reserved.has(key.reservationId)) fail("validation");
        reserved.set(key.reservationId, name);
      }
      this.#checkDirectories();
      const result: ContentFileInventoryEntryV2[] = [];
      for (const location of LOCATIONS) {
        const directory = opendirSync(join(this.#root, location));
        try {
          for (let entry = directory.readSync(); entry !== null; entry = directory.readSync()) {
            if (result.length >= this.#maxInventoryEntries) fail("limit");
            const key = parseFilename(entry.name);
            const stat = lstatSync(join(this.#root, location, entry.name), { bigint: true });
            assertFile(stat);
            const registered = reserved.get(key.reservationId);
            if (registered !== undefined && registered !== entry.name) fail("corruption");
            result.push({ ...key, location, state: registered === undefined ? "orphan" : "reserved", identity: identity(stat) });
          }
        } finally {
          directory.closeSync();
        }
      }
      this.#checkDirectories();
      return result.sort((left, right) => {
        const a = `${left.location}/${filename(left)}`;
        const b = `${right.location}/${filename(right)}`;
        return a < b ? -1 : a > b ? 1 : 0;
      });
    });
  }

  #assertDescriptor(descriptor: ContentFileDescriptorV2): void {
    assertKey(descriptor);
    if (typeof descriptor.digest !== "string" || !/^[0-9a-f]{64}$/.test(descriptor.digest) ||
        !Number.isSafeInteger(descriptor.byteCount) || descriptor.byteCount < 0 ||
        descriptor.byteCount > this.#maxBytes) fail("validation");
  }

  #checkDirectories(): void {
    for (const [path, expected] of this.#directories) {
      const stat = lstatSync(path, { bigint: true });
      if (!stat.isDirectory() || stat.dev !== expected.device || stat.ino !== expected.inode) fail("corruption");
    }
  }

  #syncDirectory(path: string): void {
    let fd: number | undefined;
    try {
      fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      const stat = fstatSync(fd, { bigint: true });
      const expected = this.#directories.get(path);
      if (!expected || !stat.isDirectory() || stat.dev !== expected.device || stat.ino !== expected.inode) fail("corruption");
      fsyncSync(fd);
    } catch (error) {
      if (["EINVAL", "ENOTSUP", "EOPNOTSUPP", "EISDIR"].includes(String(nativeCode(error)))) fail("unsupported");
      throw error;
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }

  #readVerified(location: ContentFileLocationV2, descriptor: ContentFileDescriptorV2): Uint8Array {
    const path = join(this.#root, location, filename(descriptor));
    const before = lstatSync(path, { bigint: true });
    assertFile(before);
    if (before.size !== BigInt(descriptor.byteCount)) fail("corruption");
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = fstatSync(fd, { bigint: true });
      assertFile(opened);
      if (!sameIdentity(identity(before), identity(opened))) fail("corruption");
      const body = Buffer.alloc(descriptor.byteCount);
      let received = 0;
      while (received < body.byteLength) {
        const count = readSync(fd, body, received, body.byteLength - received, received);
        if (count <= 0) fail("corruption");
        received += count;
      }
      if (readSync(fd, Buffer.alloc(1), 0, 1, received) !== 0) fail("corruption");
      const after = fstatSync(fd, { bigint: true });
      assertFile(after);
      if (!sameIdentity(identity(opened), identity(after)) ||
          !sameIdentity(identity(after), identity(lstatSync(path, { bigint: true }))) ||
          createHash("sha256").update(body).digest("hex") !== descriptor.digest) fail("corruption");
      this.#checkDirectories();
      return body;
    } finally {
      closeSync(fd);
    }
  }

  #removeFile(
    key: ContentFileKeyV2,
    location: ContentFileLocationV2,
    expected?: ContentFileIdentityV2,
  ): ContentFileRemovalResultV2 {
    try {
      this.#checkDirectories();
      const path = join(this.#root, location, filename(key));
      const stat = existingStat(path);
      if (!stat) {
        // A retry after unlink but before fsync still must establish durability.
        this.#syncDirectory(join(this.#root, location));
        return { state: "absent" };
      }
      assertFile(stat);
      if (expected && !sameIdentity(identity(stat), expected)) fail("conflict");
      unlinkSync(path);
      this.#syncDirectory(join(this.#root, location));
      this.#checkDirectories();
      return { state: "removed" };
    } catch (error) {
      return { state: "failed", code: safeError(error).code };
    }
  }
}
