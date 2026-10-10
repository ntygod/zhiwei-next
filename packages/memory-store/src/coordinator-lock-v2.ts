import {
  closeSync, constants, lstatSync, openSync, realpathSync, type BigIntStats,
} from "node:fs";
import { isAbsolute, join, parse, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { assertIdentifierV2 } from "../../domain/src/index.ts";

export type CoordinatorLockErrorCodeV2 = "conflict" | "corruption" | "io";

export class CoordinatorLockErrorV2 extends Error {
  readonly code: CoordinatorLockErrorCodeV2;

  constructor(code: CoordinatorLockErrorCodeV2) {
    super(`Coordinator lock ${code}.`);
    this.name = "CoordinatorLockErrorV2";
    this.code = code;
  }
}

export interface CoordinatorLockV2 {
  release(): void;
}

export interface CoordinatorLockOptionsV2 {
  readonly dataRoot: string;
  readonly installationId: string;
}

function fail(code: CoordinatorLockErrorCodeV2): never {
  throw new CoordinatorLockErrorV2(code);
}

function nativeCode(error: unknown): unknown {
  return error !== null && typeof error === "object" && "code" in error
    ? error.code : undefined;
}

function safeError(error: unknown): CoordinatorLockErrorV2 {
  if (error instanceof CoordinatorLockErrorV2) return error;
  if (error !== null && typeof error === "object" && "errcode" in error
    && typeof error.errcode === "number") {
    // SQLite extended result codes retain their primary code in the low byte.
    const code = error.errcode & 0xff;
    if (code === 5 || code === 6) return new CoordinatorLockErrorV2("conflict");
    if (code === 11 || code === 26) return new CoordinatorLockErrorV2("corruption");
  }
  if (["ELOOP", "ENOTDIR"].includes(String(nativeCode(error)))) {
    return new CoordinatorLockErrorV2("corruption");
  }
  return new CoordinatorLockErrorV2("io");
}

function statIfPresent(path: string): BigIntStats | undefined {
  try { return lstatSync(path, { bigint: true }); }
  catch (error) {
    if (nativeCode(error) === "ENOENT") return undefined;
    throw error;
  }
}

function ordinaryFile(stat: BigIntStats): void {
  if (!stat.isFile() || stat.nlink !== 1n) fail("corruption");
}

function sameInode(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return sameInode(left, right) && left.nlink === right.nlink
    && left.mode === right.mode && left.uid === right.uid && left.gid === right.gid
    && left.size === right.size && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs && left.birthtimeNs === right.birthtimeNs;
}

function checkSidecars(path: string): void {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const stat = statIfPresent(`${path}${suffix}`);
    if (stat) ordinaryFile(stat);
  }
}

function checkRoot(path: string, expected?: BigIntStats): BigIntStats {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isDirectory() || realpathSync(path) !== path
    || (expected !== undefined && !sameInode(stat, expected))) fail("corruption");
  return stat;
}

function prepareFile(path: string): BigIntStats {
  let stat = statIfPresent(path);
  if (!stat) {
    // The descriptor is closed BEFORE opening SQLite. Closing an independently
    // opened descriptor of an active SQLite inode can drop POSIX advisory locks.
    try {
      const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT
        | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      closeSync(fd);
    } catch (error) {
      if (nativeCode(error) !== "EEXIST") throw error;
    }
    stat = lstatSync(path, { bigint: true });
  }
  ordinaryFile(stat);
  checkSidecars(path);
  return stat;
}

function scalar(db: DatabaseSync, pragma: string): unknown {
  const row = db.prepare(`PRAGMA ${pragma}`).get();
  return row === undefined ? undefined : Object.values(row)[0];
}

function checkEmptyMutex(db: DatabaseSync): void {
  if (db.prepare("SELECT name FROM main.sqlite_schema").all().length !== 0
    || scalar(db, "application_id") !== 0 || scalar(db, "user_version") !== 0) {
    fail("corruption");
  }
}

/**
 * Internal synthetic-store process mutex, not another persistence source.
 * The fixed, empty SQLite file holds NO records, content, owner/PID authority,
 * installation state, or recovery truth. BEGIN EXCLUSIVE owns a real SQLite
 * write lock for the entire lifetime; process exit releases it in the OS.
 * There is no stale-PID guess, lockfile deletion, or unlink/reacquire race.
 *
 * Callers must use one canonical local data root, this SQLite runtime, and a
 * filesystem supporting SQLite locking. Never rename, unlink, replace, back up,
 * or independently open/read this mutex file while a coordinator is running.
 * Canonical path and ordinary-file identity checks detect observed drift; Node
 * does not expose SQLite's descriptor, so they do not claim protection against
 * a hostile same-user process changing paths concurrently.
 */
export function acquireCoordinatorLockV2(options: CoordinatorLockOptionsV2): CoordinatorLockV2 {
  let db: DatabaseSync | undefined;
  try {
    if (!options || typeof options.dataRoot !== "string" || !isAbsolute(options.dataRoot)
      || options.dataRoot.includes("\0")) fail("corruption");
    try { assertIdentifierV2(options.installationId); }
    catch { fail("corruption"); }
    const root = resolve(options.dataRoot);
    if (root === parse(root).root || typeof constants.O_NOFOLLOW !== "number") fail("corruption");
    const rootIdentity = checkRoot(root);
    const path = join(root, "coordinator-lock.sqlite");
    const before = prepareFile(path);
    db = new DatabaseSync(path, { enableForeignKeyConstraints: true, enableDoubleQuotedStringLiterals: false });
    const opened = lstatSync(path, { bigint: true });
    ordinaryFile(opened);
    if (!sameInode(before, opened)) fail("corruption");
    checkRoot(root, rootIdentity);
    checkEmptyMutex(db);
    db.exec("PRAGMA busy_timeout=0; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;"
      + " PRAGMA temp_store=MEMORY; PRAGMA synchronous=FULL; PRAGMA journal_mode=WAL;");
    if (scalar(db, "journal_mode") !== "wal" || scalar(db, "foreign_keys") !== 1
      || scalar(db, "busy_timeout") !== 0 || scalar(db, "synchronous") !== 2
      || scalar(db, "trusted_schema") !== 0 || scalar(db, "temp_store") !== 2) fail("io");
    // In WAL mode EXCLUSIVE immediately takes the writer lock, just as
    // IMMEDIATE does. It does not depend on writing a row or a later statement.
    db.exec("BEGIN EXCLUSIVE");
    if (!db.isTransaction) fail("io");
    checkEmptyMutex(db);
    const integrity = db.prepare("PRAGMA integrity_check").all();
    if (integrity.length !== 1 || Object.values(integrity[0]).length !== 1
      || Object.values(integrity[0])[0] !== "ok") fail("corruption");
    checkRoot(root, rootIdentity);
    checkSidecars(path);
    const heldIdentity = lstatSync(path, { bigint: true });
    ordinaryFile(heldIdentity);
    if (!sameInode(before, heldIdentity)) fail("corruption");
    const held = db;
    let released = false;
    return {
      release(): void {
        if (released) return;
        let failure: CoordinatorLockErrorV2 | undefined;
        try {
          checkRoot(root, rootIdentity);
          const current = lstatSync(path, { bigint: true });
          ordinaryFile(current);
          if (!sameFile(heldIdentity, current) || !held.isTransaction) fail("corruption");
          checkSidecars(path);
        } catch (error) { failure = safeError(error); }
        try {
          // close rolls back the empty transaction and releases the actual OS
          // lock. The persistent mutex inode is deliberately never removed.
          held.close();
          released = true;
        } catch (error) { failure ??= safeError(error); }
        if (failure) throw failure;
      },
    };
  } catch (error) {
    if (db) {
      try { db.close(); }
      catch { fail("io"); }
    }
    throw safeError(error);
  }
}
