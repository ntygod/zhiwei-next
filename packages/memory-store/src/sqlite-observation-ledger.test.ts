import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  canonicalJsonV1,
  canonicalNormalizedRuntimeEventV1,
  createNormalizedRuntimeEventV1,
  type NormalizedRuntimeEventV1,
} from "../../protocol/src/index.ts";
import {
  DEFAULT_OBSERVATION_LEDGER_MIGRATIONS,
  ObservationLedgerMigrationError,
  applyObservationLedgerMigrations,
  type ObservationLedgerMigration,
} from "./migrations.ts";
import {
  ObservationLedgerClosedError,
  ObservationLedgerConflictError,
  ObservationLedgerError,
  ObservationLedgerCorruptionError,
  ObservationLedgerQueryError,
  ObservationLedgerSequenceError,
  openSqliteObservationLedgerV1,
} from "./sqlite-observation-ledger.ts";

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "zhiwei-ledger-v1-"));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

interface EventOverrides {
  workspaceId?: string;
  runtimeSessionId?: string;
  runtimeInstanceId?: string;
  adapter?: string;
  implementation?: string;
  runtimeVersion?: string;
  surface?: "sdk" | "extension" | "rpc" | "host";
  eventType?: string;
  sequenceDomain?: string;
  sequence?: number;
  command?: string;
  observedAt?: string;
}

function makeEvent(overrides: EventOverrides = {}): NormalizedRuntimeEventV1 {
  const sequence = overrides.sequence ?? 1;
  const surface = overrides.surface ?? "rpc";
  const rpc = surface === "rpc";
  return createNormalizedRuntimeEventV1({
    protocolVersion: 1,
    workspaceId: overrides.workspaceId ?? "workspace-a",
    runtimeSessionId: overrides.runtimeSessionId ?? "runtime-session-a",
    runtimeInstanceId: overrides.runtimeInstanceId ?? "runtime-instance-a",
    source: {
      adapter: overrides.adapter ?? "pi-rpc-v1",
      runtime: {
        implementation: overrides.implementation ?? "pi",
        version: overrides.runtimeVersion ?? "0.84.1",
      },
      surface,
      eventType: overrides.eventType ?? (rpc ? "response" : "agent_start"),
    },
    sequence: {
      domain: overrides.sequenceDomain ?? "rpc-jsonl",
      value: sequence,
    },
    observedAt:
      overrides.observedAt ?? `2026-08-18T00:00:${String(sequence).padStart(2, "0")}.000Z`,
    provenance: "observed",
    persistence: "durable",
    stability: "boundary",
    compatibility: "required",
    correlation: rpc
      ? {
          observed: { requestId: `request-${sequence}` },
          normalized: { rpcRequestId: `rpc-request-${sequence}` },
        }
      : {
          observed: {},
          normalized: { agentRunId: `agent-run-${surface}-${sequence}` },
        },
    data: rpc
      ? {
          kind: "command.response",
          command: overrides.command ?? "get_state",
          success: true,
          phase: "command-result",
        }
      : {
          kind: "agent.lifecycle",
          phase: "started",
        },
  }) as NormalizedRuntimeEventV1;
}

function makeEphemeralMessageUpdate(sequence = 1): NormalizedRuntimeEventV1 {
  return createNormalizedRuntimeEventV1({
    protocolVersion: 1,
    workspaceId: "workspace-a",
    runtimeSessionId: "runtime-session-a",
    runtimeInstanceId: "runtime-instance-a",
    source: {
      adapter: "pi-sdk-v1",
      runtime: { implementation: "pi", version: "0.84.1" },
      surface: "sdk",
      eventType: "message_update",
    },
    sequence: { domain: "sdk-events", value: sequence },
    observedAt: `2026-08-18T00:01:${String(sequence).padStart(2, "0")}.000Z`,
    provenance: "observed",
    persistence: "ephemeral",
    stability: "update",
    compatibility: "ignorable",
    correlation: {
      observed: {},
      normalized: {
        agentRunId: "agent-run-message",
        turnId: "turn-message",
        messageId: "message-update",
      },
    },
    data: {
      kind: "message.lifecycle",
      phase: "updated",
      role: "assistant",
      delta: "fictional delta",
    },
  }) as NormalizedRuntimeEventV1;
}

function openMemory() {
  return openSqliteObservationLedgerV1({
    filePath: ":memory:",
    clock: { now: () => "2026-08-18T00:00:00.000Z" },
  });
}

test("SQLite Ledger appends once and exact replay returns the existing row", () => {
  const ledger = openMemory();
  try {
    assert.equal(ledger.schemaVersion, 1);
    assert.equal(ledger.journalMode, "memory");
    const event = makeEvent();
    const inserted = ledger.append(event);
    const replayed = ledger.append(structuredClone(event));

    assert.equal(inserted.inserted, true);
    assert.equal(replayed.inserted, false);
    assert.equal(replayed.rowId, inserted.rowId);
    assert.deepEqual(replayed.event, event);
    assert.equal(ledger.countEvents(), 1);
    assert.deepEqual(ledger.getByEventId(event.eventId)?.event, event);
    assert.deepEqual(ledger.getByIdempotencyKey(event.idempotencyKey)?.event, event);
  } finally {
    ledger.close();
  }
});

test("Ledger preserves an ephemeral ignorable update without promoting its semantics", () => {
  const ledger = openMemory();
  try {
    const event = makeEphemeralMessageUpdate();
    const stored = ledger.append(event);
    assert.equal(stored.event.persistence, "ephemeral");
    assert.equal(stored.event.stability, "update");
    assert.equal(stored.event.compatibility, "ignorable");
    assert.deepEqual(ledger.getByEventId(event.eventId)?.event, event);
  } finally {
    ledger.close();
  }
});

test("source-slot conflict is rejected before it can become a duplicate row", () => {
  const ledger = openMemory();
  try {
    const first = makeEvent({ command: "get_state" });
    const conflicting = makeEvent({ command: "get_messages" });
    assert.equal(first.eventId, conflicting.eventId);
    assert.notEqual(first.idempotencyKey, conflicting.idempotencyKey);
    ledger.append(first);
    assert.throws(
      () => ledger.append(conflicting),
      (error: unknown) =>
        error instanceof ObservationLedgerConflictError &&
        error.conflictKind === "source-slot" &&
        error.eventId === conflicting.eventId,
    );
    assert.equal(ledger.countEvents(), 1);
  } finally {
    ledger.close();
  }
});

test("sequence monotonicity is scoped to the complete v1 source stream", () => {
  const ledger = openMemory();
  try {
    const streamA1 = makeEvent({ sequence: 1 });
    const streamA3 = makeEvent({ sequence: 3 });
    const independent = [
      makeEvent({ runtimeInstanceId: "runtime-instance-b", sequence: 1 }),
      makeEvent({ adapter: "pi-extension-v1", sequence: 1 }),
      makeEvent({ runtimeVersion: "0.84.2", sequence: 1 }),
      makeEvent({ surface: "sdk", sequenceDomain: "sdk-events", sequence: 1 }),
      makeEvent({ sequenceDomain: "rpc-host-actions", sequence: 1 }),
    ];

    ledger.append(streamA1);
    ledger.append(streamA3);
    for (const event of independent) ledger.append(event);
    assert.equal(ledger.countEvents(), 2 + independent.length);

    const outOfOrder = makeEvent({ sequence: 2 });
    assert.throws(
      () => ledger.append(outOfOrder),
      (error: unknown) =>
        error instanceof ObservationLedgerSequenceError &&
        error.sourceSequence === 2 &&
        error.latestSourceSequence === 3 &&
        error.stream.sequenceDomain === "rpc-jsonl",
    );
  } finally {
    ledger.close();
  }
});

test("batch replay prefix and new suffix are atomic and preserve result identity", () => {
  const ledger = openMemory();
  try {
    const first = makeEvent({ sequence: 1 });
    const second = makeEvent({ sequence: 2 });
    const third = makeEvent({ sequence: 3 });
    const storedFirst = ledger.append(first);

    const batch = ledger.appendBatch([first, second, third]);
    assert.equal(batch.insertedCount, 2);
    assert.equal(batch.replayedCount, 1);
    assert.equal(batch.results[0].rowId, storedFirst.rowId);
    assert.deepEqual(
      batch.results.map((result) => result.inserted),
      [false, true, true],
    );
    assert.equal(ledger.countEvents(), 3);
  } finally {
    ledger.close();
  }
});

test("a later batch conflict rolls back all earlier inserts in that batch", () => {
  const ledger = openMemory();
  try {
    const existing = makeEvent({ sequence: 1 });
    ledger.append(existing);
    const candidate = makeEvent({ sequence: 2 });
    const conflicting = makeEvent({ sequence: 1, command: "get_messages" });

    assert.throws(
      () => ledger.appendBatch([candidate, conflicting]),
      ObservationLedgerConflictError,
    );
    assert.equal(ledger.countEvents(), 1);
    assert.equal(ledger.getByEventId(candidate.eventId), undefined);
  } finally {
    ledger.close();
  }
});

test("row cursor replay keeps Workspace and Runtime Session isolated", () => {
  const ledger = openMemory();
  try {
    const a1 = ledger.append(makeEvent({ sequence: 1 }));
    const b1 = ledger.append(
      makeEvent({ workspaceId: "workspace-b", runtimeSessionId: "runtime-session-b", sequence: 1 }),
    );
    const a2 = ledger.append(makeEvent({ sequence: 2 }));
    ledger.append(
      makeEvent({ runtimeSessionId: "runtime-session-c", runtimeInstanceId: "runtime-instance-c", sequence: 1 }),
    );

    assert.deepEqual(
      ledger.readSession("workspace-a", "runtime-session-a").map((item) => item.rowId),
      [a1.rowId, a2.rowId],
    );
    assert.deepEqual(
      ledger
        .readSession("workspace-a", "runtime-session-a", {
          afterRowId: a1.rowId,
          limit: 1,
        })
        .map((item) => item.rowId),
      [a2.rowId],
    );
    assert.deepEqual(
      ledger.readWorkspace("workspace-b").map((item) => item.rowId),
      [b1.rowId],
    );
    assert.equal(
      ledger.countEvents({ workspaceId: "workspace-a", runtimeSessionId: "runtime-session-a" }),
      2,
    );
  } finally {
    ledger.close();
  }
});

test("file Ledger uses WAL and replays the same validated event after reopen", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  const event = makeEvent();
  try {
    const first = openSqliteObservationLedgerV1({
      filePath,
      clock: { now: () => "2026-08-18T00:00:00.000Z" },
    });
    assert.equal(first.journalMode, "wal");
    first.append(event);
    assert.deepEqual(first.integrityCheck(), ["ok"]);
    first.close();

    const reopened = openSqliteObservationLedgerV1({
      filePath,
      clock: { now: () => "2026-08-18T00:00:00.000Z" },
    });
    try {
      assert.equal(reopened.journalMode, "wal");
      assert.deepEqual(reopened.readSession(event.workspaceId, event.runtimeSessionId)[0]?.event, event);
      reopened.assertIntegrity();
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("migration checksum drift is rejected without rewriting migration history", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  try {
    const ledger = openSqliteObservationLedgerV1({
      filePath,
      clock: { now: () => "2026-08-18T00:00:00.000Z" },
    });
    ledger.close();

    const drifted = DEFAULT_OBSERVATION_LEDGER_MIGRATIONS.map((migration) => ({
      ...migration,
      sql: `${migration.sql}\n-- forbidden rewrite`,
    }));
    assert.throws(
      () =>
        openSqliteObservationLedgerV1({
          filePath,
          migrations: drifted,
          clock: { now: () => "2026-08-18T00:00:00.000Z" },
        }),
      ObservationLedgerMigrationError,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("each migration is transactional and failed SQL leaves no partial schema", () => {
  const root = tempRoot();
  const filePath = join(root, "migration.sqlite");
  const database = new DatabaseSync(filePath);
  const migrations: readonly ObservationLedgerMigration[] = [
    { version: 1, name: "base", sql: "CREATE TABLE stable (id INTEGER PRIMARY KEY) STRICT;" },
    {
      version: 2,
      name: "broken",
      sql:
        "CREATE TABLE should_rollback (id INTEGER PRIMARY KEY) STRICT;" +
        "INSERT INTO missing_table VALUES (1);",
    },
  ];
  try {
    assert.throws(
      () =>
        applyObservationLedgerMigrations(database, {
          migrations,
          clock: { now: () => "2026-08-18T00:00:00.000Z" },
        }),
      ObservationLedgerMigrationError,
    );
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    assert.equal(tables.some((row) => row.name === "stable"), true);
    assert.equal(tables.some((row) => row.name === "should_rollback"), false);
    assert.deepEqual(
      database
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all()
        .map((row) => ({ ...row })),
      [{ version: 1 }],
    );
    assert.deepEqual(
      { ...(database.prepare("PRAGMA user_version").get() as Record<string, unknown>) },
      { user_version: 1 },
    );
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("append-only SQL triggers reject UPDATE and DELETE", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  const ledger = openSqliteObservationLedgerV1({
    filePath,
    clock: { now: () => "2026-08-18T00:00:00.000Z" },
  });
  ledger.append(makeEvent());
  ledger.close();

  const database = new DatabaseSync(filePath);
  try {
    assert.throws(
      () => database.exec("UPDATE runtime_events SET source_event_type = 'changed'"),
      /append-only/,
    );
    assert.throws(() => database.exec("DELETE FROM runtime_events"), /append-only/);
    assert.throws(
      () => database.exec("UPDATE schema_migrations SET name = 'changed'"),
      /append-only/,
    );
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("DB read validates canonical full event and all indexed projections", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  const event = makeEvent();
  const ledger = openSqliteObservationLedgerV1({
    filePath,
    clock: { now: () => "2026-08-18T00:00:00.000Z" },
  });
  ledger.append(event);
  ledger.close();

  const database = new DatabaseSync(filePath);
  try {
    database.exec("DROP TRIGGER runtime_events_reject_update");
    const parsed = JSON.parse(canonicalNormalizedRuntimeEventV1(event));
    parsed.source.eventType = "tampered-response";
    database
      .prepare("UPDATE runtime_events SET event_json = ? WHERE event_id = ?")
      .run(JSON.stringify(parsed), event.eventId);
    database.exec(`
      CREATE TRIGGER runtime_events_reject_update
      BEFORE UPDATE ON runtime_events
      BEGIN
        SELECT RAISE(ABORT, 'runtime_events is append-only');
      END;
    `);
  } finally {
    database.close();
  }

  try {
    assert.throws(
      () =>
        openSqliteObservationLedgerV1({
          filePath,
          clock: { now: () => "2026-08-18T00:00:00.000Z" },
        }),
      (error: unknown) =>
        error instanceof ObservationLedgerCorruptionError &&
        error.rowId === 1 &&
        /does not satisfy NormalizedRuntimeEvent v1/.test(error.message),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("DB read rejects a denormalized projection that differs from canonical event_json", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  const event = makeEvent();
  const ledger = openSqliteObservationLedgerV1({
    filePath,
    clock: { now: () => "2026-08-18T00:00:00.000Z" },
  });
  ledger.append(event);
  ledger.close();

  const database = new DatabaseSync(filePath);
  try {
    database.exec("DROP TRIGGER runtime_events_reject_update");
    database
      .prepare("UPDATE runtime_events SET source_event_type = ? WHERE event_id = ?")
      .run("tampered-response", event.eventId);
    database.exec(`
      CREATE TRIGGER runtime_events_reject_update
      BEFORE UPDATE ON runtime_events
      BEGIN
        SELECT RAISE(ABORT, 'runtime_events is append-only');
      END;
    `);
  } finally {
    database.close();
  }

  try {
    assert.throws(
      () =>
        openSqliteObservationLedgerV1({
          filePath,
          clock: { now: () => "2026-08-18T00:00:00.000Z" },
        }),
      (error: unknown) =>
        error instanceof ObservationLedgerCorruptionError &&
        error.rowId === 1 &&
        /projection source_event_type/.test(error.message),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("opening fails when an append-only schema guard has been removed", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  try {
    const ledger = openSqliteObservationLedgerV1({
      filePath,
      clock: { now: () => "2026-08-18T00:00:00.000Z" },
    });
    ledger.close();
    const database = new DatabaseSync(filePath);
    database.exec("DROP TRIGGER runtime_events_reject_delete");
    database.close();

    assert.throws(
      () =>
        openSqliteObservationLedgerV1({
          filePath,
          clock: { now: () => "2026-08-18T00:00:00.000Z" },
        }),
      ObservationLedgerCorruptionError,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an uncommitted writer transaction does not enter replay after process exit", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  const first = makeEvent({ sequence: 1 });
  const pending = makeEvent({ sequence: 2 });
  try {
    const ledger = openSqliteObservationLedgerV1({
      filePath,
      clock: { now: () => "2026-08-18T00:00:00.000Z" },
    });
    ledger.append(first);
    ledger.close();

    const eventJson = canonicalNormalizedRuntimeEventV1(pending);
    const payload = {
      event: pending,
      eventJson,
      fingerprint: sha256(eventJson),
      correlationJson: canonicalJsonV1(pending.correlation),
      linksJson: pending.links === undefined ? null : canonicalJsonV1(pending.links),
      dataJson: canonicalJsonV1(pending.data),
    };
    const payloadPath = join(root, "pending.json");
    const childPath = join(root, "uncommitted.mjs");
    writeFileSync(payloadPath, JSON.stringify(payload), "utf8");
    writeFileSync(
      childPath,
      `import { readFileSync } from "node:fs";\n` +
        `import { DatabaseSync } from "node:sqlite";\n` +
        `const [dbPath, payloadPath] = process.argv.slice(2);\n` +
        `const p = JSON.parse(readFileSync(payloadPath, "utf8"));\n` +
        `const e = p.event;\n` +
        `const db = new DatabaseSync(dbPath);\n` +
        `db.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE");\n` +
        `db.prepare(\`INSERT INTO runtime_events (` +
        `event_id,idempotency_key,event_fingerprint,protocol_version,workspace_id,` +
        `runtime_session_id,runtime_instance_id,source_adapter,runtime_implementation,` +
        `runtime_version,source_surface,source_event_type,sequence_domain,source_sequence,` +
        `observed_at,provenance,persistence,stability,compatibility,correlation_json,` +
        `links_json,data_kind,data_json,event_json) VALUES (` +
        `${Array.from({ length: 24 }, () => "?").join(",")})\`).run(` +
        `e.eventId,e.idempotencyKey,p.fingerprint,e.protocolVersion,e.workspaceId,` +
        `e.runtimeSessionId,e.runtimeInstanceId,e.source.adapter,e.source.runtime.implementation,` +
        `e.source.runtime.version,e.source.surface,e.source.eventType,e.sequence.domain,` +
        `e.sequence.value,e.observedAt,e.provenance,e.persistence,e.stability,e.compatibility,` +
        `p.correlationJson,p.linksJson,e.data.kind,p.dataJson,p.eventJson);\n` +
        `process.exit(0);\n`,
      "utf8",
    );

    const child = spawnSync(process.execPath, [childPath, filePath, payloadPath], {
      encoding: "utf8",
    });
    assert.equal(child.status, 0, child.stderr);

    const reopened = openSqliteObservationLedgerV1({
      filePath,
      clock: { now: () => "2026-08-18T00:00:00.000Z" },
    });
    try {
      assert.equal(reopened.countEvents(), 1);
      assert.equal(reopened.getByEventId(pending.eventId), undefined);
      assert.deepEqual(reopened.readSession(first.workspaceId, first.runtimeSessionId)[0]?.event, first);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("closed Ledger and invalid replay options fail closed", () => {
  const ledger = openMemory();
  assert.throws(
    () => ledger.readWorkspace("workspace-a", { limit: 0 }),
    ObservationLedgerQueryError,
  );
  assert.throws(
    () => ledger.countEvents({ runtimeSessionId: "runtime-session-a" }),
    ObservationLedgerQueryError,
  );
  ledger.close();
  assert.throws(() => ledger.countEvents(), ObservationLedgerClosedError);
  assert.throws(() => ledger.appendBatch([]), ObservationLedgerClosedError);
});

test("migration source file is stable UTF-8 SQL", () => {
  const migration = DEFAULT_OBSERVATION_LEDGER_MIGRATIONS[0];
  assert.equal(migration.version, 1);
  assert.match(migration.sql, /CREATE TABLE runtime_events/);
  assert.equal(
    readFileSync(
      new URL("../migrations/0001_normalized_runtime_event_v1.sql", import.meta.url),
      "utf8",
    ),
    migration.sql,
  );
});

const FIXED_CLOCK = { now: () => "2026-08-18T00:00:00.000Z" };
const RUNTIME_UPDATE_TRIGGER_SQL = `
  CREATE TRIGGER runtime_events_reject_update
  BEFORE UPDATE ON runtime_events
  BEGIN
    SELECT RAISE(ABORT, 'runtime_events is append-only');
  END;
`;
const MIGRATION_DELETE_TRIGGER_SQL = `
  CREATE TRIGGER schema_migrations_reject_delete
  BEFORE DELETE ON schema_migrations
  BEGIN
    SELECT RAISE(ABORT, 'schema_migrations is append-only');
  END;
`;

function openFile(filePath: string, busyTimeoutMs?: number) {
  return openSqliteObservationLedgerV1({
    filePath,
    busyTimeoutMs,
    clock: FIXED_CLOCK,
  });
}

function rawCount(filePath: string): number {
  const database = new DatabaseSync(filePath);
  try {
    const row = database.prepare("SELECT count(*) AS count FROM runtime_events").get() as {
      count: number | bigint;
    };
    return Number(row.count);
  } finally {
    database.close();
  }
}

function mutateRuntimeRow(
  filePath: string,
  mutate: (database: DatabaseSync) => void,
): void {
  const database = new DatabaseSync(filePath);
  try {
    database.exec("DROP TRIGGER runtime_events_reject_update");
    mutate(database);
    database.exec(RUNTIME_UPDATE_TRIGGER_SQL);
  } finally {
    database.close();
  }
}

function assertOpenCorruption(filePath: string, pattern: RegExp): void {
  assert.throws(
    () => openFile(filePath),
    (error: unknown) =>
      error instanceof ObservationLedgerCorruptionError &&
      pattern.test(error.message),
  );
}

function withPrepareOverride<T>(
  match: (sql: string) => boolean,
  replacement: (statement: unknown, sql: string) => unknown,
  operation: () => T,
): T {
  const original = DatabaseSync.prototype.prepare;
  (DatabaseSync.prototype as any).prepare = function prepare(sql: string) {
    const statement = original.call(this, sql);
    return match(sql.trim()) ? replacement(statement, sql.trim()) : statement;
  };
  try {
    return operation();
  } finally {
    (DatabaseSync.prototype as any).prepare = original;
  }
}

test("schema manifest rejects same-name no-op runtime triggers without repairing them", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  try {
    openFile(filePath).close();
    const database = new DatabaseSync(filePath);
    try {
      database.exec("DROP TRIGGER runtime_events_reject_update");
      database.exec(`
        CREATE TRIGGER runtime_events_reject_update
        BEFORE UPDATE ON runtime_events
        BEGIN
          SELECT 1;
        END;
      `);
    } finally {
      database.close();
    }

    assertOpenCorruption(filePath, /schema manifest has drifted/);

    const verify = new DatabaseSync(filePath);
    try {
      const row = verify
        .prepare(
          "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='runtime_events_reject_update'",
        )
        .get() as { sql: string };
      assert.match(row.sql, /SELECT 1/);
      assert.doesNotMatch(row.sql, /RAISE/);
    } finally {
      verify.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing migration guards fail closed and are not recreated by open", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  try {
    openFile(filePath).close();
    const database = new DatabaseSync(filePath);
    database.exec("DROP TRIGGER schema_migrations_reject_delete");
    database.close();

    assert.throws(() => openFile(filePath), ObservationLedgerMigrationError);

    const verify = new DatabaseSync(filePath);
    try {
      const row = verify
        .prepare(
          "SELECT count(*) AS count FROM sqlite_schema WHERE type='trigger' AND name='schema_migrations_reject_delete'",
        )
        .get() as { count: number | bigint };
      assert.equal(Number(row.count), 0);
    } finally {
      verify.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("schema manifest rejects same-name migration trigger drift", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  try {
    openFile(filePath).close();
    const database = new DatabaseSync(filePath);
    try {
      database.exec("DROP TRIGGER schema_migrations_reject_update");
      database.exec(`
        CREATE TRIGGER schema_migrations_reject_update
        BEFORE UPDATE ON schema_migrations
        BEGIN
          SELECT 1;
        END;
      `);
    } finally {
      database.close();
    }
    assert.throws(() => openFile(filePath), ObservationLedgerMigrationError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("schema manifest rejects explicit index definition drift", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  try {
    openFile(filePath).close();
    const database = new DatabaseSync(filePath);
    try {
      database.exec("DROP INDEX idx_runtime_events_source_stream");
      database.exec(
        "CREATE INDEX idx_runtime_events_source_stream ON runtime_events (workspace_id, row_id)",
      );
    } finally {
      database.close();
    }
    assertOpenCorruption(filePath, /schema manifest has drifted/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("schema manifest rejects STRICT, source-slot UNIQUE, and CHECK drift", () => {
  const migrationSql = DEFAULT_OBSERVATION_LEDGER_MIGRATIONS[0].sql;
  const variants = [
    {
      name: "strict",
      sql: migrationSql.replace(/\) STRICT;/u, ");"),
    },
    {
      name: "source-slot unique",
      sql: migrationSql.replace(
        /,\n  UNIQUE \(\n    workspace_id,[\s\S]*?\n  \)\n\) STRICT;/u,
        "\n) STRICT;",
      ),
    },
    {
      name: "check",
      sql: migrationSql.replace(
        "CHECK (protocol_version = 1)",
        "CHECK (protocol_version > 0)",
      ),
    },
  ];

  for (const variant of variants) {
    const root = tempRoot();
    const filePath = join(root, `${variant.name}.sqlite`);
    try {
      openFile(filePath).close();
      const database = new DatabaseSync(filePath);
      try {
        database.exec("DROP TABLE runtime_events");
        database.exec(variant.sql);
      } finally {
        database.close();
      }
      assertOpenCorruption(filePath, /schema manifest has drifted/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("projection drift is rejected before a damaged stream can accept another append", () => {
  const mutations: ReadonlyArray<{
    readonly column: string;
    readonly value: unknown;
    readonly ignoreChecks?: boolean;
  }> = [
    { column: "source_sequence", value: 1 },
    { column: "runtime_implementation", value: "tampered-runtime" },
    { column: "runtime_version", value: "tampered-version" },
    { column: "source_adapter", value: "tampered-adapter" },
    { column: "runtime_instance_id", value: "tampered-instance" },
    { column: "source_surface", value: "host" },
    { column: "sequence_domain", value: "tampered-domain" },
  ];

  for (const mutation of mutations) {
    const root = tempRoot();
    const filePath = join(root, `${mutation.column}.sqlite`);
    try {
      const ledger = openFile(filePath);
      ledger.append(makeEvent({ sequence: 3 }));
      ledger.close();
      mutateRuntimeRow(filePath, (database) => {
        if (mutation.ignoreChecks) database.exec("PRAGMA ignore_check_constraints=ON");
        database
          .prepare(`UPDATE runtime_events SET ${mutation.column} = ? WHERE row_id = 1`)
          .run(mutation.value as any);
      });

      assert.throws(
        () => openFile(filePath),
        (error: unknown) =>
          error instanceof ObservationLedgerCorruptionError &&
          error.rowId === 1 &&
          error.message.includes(`projection ${mutation.column}`),
      );
      assert.equal(rawCount(filePath), 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("post-open projection drift is detected inside the write transaction before insert", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  const ledger = openFile(filePath);
  try {
    ledger.append(makeEvent({ sequence: 3 }));
    mutateRuntimeRow(filePath, (database) => {
      database.exec("UPDATE runtime_events SET source_sequence = 1 WHERE row_id = 1");
    });

    assert.throws(
      () => ledger.append(makeEvent({ sequence: 2 })),
      (error: unknown) =>
        error instanceof ObservationLedgerCorruptionError &&
        /projection source_sequence/.test(error.message),
    );
    assert.equal(rawCount(filePath), 1);
  } finally {
    ledger.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("semantic JSON with non-canonical bytes is rejected at open", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  const event = makeEvent();
  try {
    const ledger = openFile(filePath);
    ledger.append(event);
    ledger.close();
    mutateRuntimeRow(filePath, (database) => {
      const semantic = JSON.parse(canonicalNormalizedRuntimeEventV1(event));
      database
        .prepare("UPDATE runtime_events SET event_json = ? WHERE row_id = 1")
        .run(JSON.stringify(semantic, null, 2));
    });
    assert.throws(
      () => openFile(filePath),
      (error: unknown) =>
        error instanceof ObservationLedgerCorruptionError &&
        error.rowId === 1 &&
        /not canonical zhiwei-json-v1/.test(error.message),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fingerprint-only drift is rejected independently", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  try {
    const ledger = openFile(filePath);
    ledger.append(makeEvent());
    ledger.close();
    mutateRuntimeRow(filePath, (database) => {
      database.exec(`UPDATE runtime_events SET event_fingerprint = '${"0".repeat(64)}' WHERE row_id = 1`);
    });
    assert.throws(
      () => openFile(filePath),
      (error: unknown) =>
        error instanceof ObservationLedgerCorruptionError &&
        error.rowId === 1 &&
        /projection event_fingerprint/.test(error.message),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("protocol and JSON projections are independently checked", () => {
  const mutations: ReadonlyArray<{
    readonly column: string;
    readonly value: unknown;
    readonly ignoreChecks?: boolean;
  }> = [
    { column: "protocol_version", value: 2, ignoreChecks: true },
    { column: "correlation_json", value: "{}" },
    { column: "links_json", value: "{}" },
    { column: "data_kind", value: "tampered.kind" },
    { column: "data_json", value: '{"kind":"command.response"}' },
  ];

  for (const mutation of mutations) {
    const root = tempRoot();
    const filePath = join(root, `${mutation.column}.sqlite`);
    try {
      const ledger = openFile(filePath);
      ledger.append(makeEvent());
      ledger.close();
      mutateRuntimeRow(filePath, (database) => {
        if (mutation.ignoreChecks) database.exec("PRAGMA ignore_check_constraints=ON");
        database
          .prepare(`UPDATE runtime_events SET ${mutation.column} = ? WHERE row_id = 1`)
          .run(mutation.value as any);
      });
      assert.throws(
        () => openFile(filePath),
        (error: unknown) =>
          error instanceof ObservationLedgerCorruptionError &&
          (mutation.column === "protocol_version"
            ? /integrity_check failed: CHECK constraint failed/.test(error.message)
            : error.rowId === 1 &&
              error.message.includes(`projection ${mutation.column}`)),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("file and memory databases enforce exact PRAGMA readback", () => {
  const mismatchCases = [
    { sql: "PRAGMA foreign_keys", row: { foreign_keys: 0 }, label: "foreignKeys" },
    { sql: "PRAGMA busy_timeout", row: { timeout: 4999 }, label: "busyTimeoutMs" },
    { sql: "PRAGMA synchronous", row: { synchronous: 2 }, label: "synchronous" },
    { sql: "PRAGMA trusted_schema", row: { trusted_schema: 1 }, label: "trustedSchema" },
    { sql: "PRAGMA temp_store", row: { temp_store: 0 }, label: "tempStore" },
  ];

  for (const mismatch of mismatchCases) {
    assert.throws(
      () =>
        withPrepareOverride(
          (sql) => sql === mismatch.sql,
          () => ({ get: () => mismatch.row }),
          () => openMemory(),
        ),
      (error: unknown) =>
        error instanceof ObservationLedgerCorruptionError &&
        error.message.includes(mismatch.label),
    );
  }

  const root = tempRoot();
  const filePath = join(root, "not-wal.sqlite");
  try {
    assert.throws(
      () =>
        withPrepareOverride(
          (sql) => sql === "PRAGMA journal_mode",
          () => ({ get: () => ({ journal_mode: "delete" }) }),
          () => openFile(filePath),
        ),
      (error: unknown) =>
        error instanceof ObservationLedgerCorruptionError &&
        /journalMode/.test(error.message),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("integrity check cannot be disabled and accepts only one exact ok row", () => {
  const invalidResults = [
    [],
    [{ integrity_check: "not ok" }],
    [{ integrity_check: "ok" }, { integrity_check: "ok" }],
  ];
  for (const result of invalidResults) {
    assert.throws(
      () =>
        withPrepareOverride(
          (sql) => sql === "PRAGMA integrity_check",
          () => ({ all: () => result }),
          () =>
            openSqliteObservationLedgerV1({
              filePath: ":memory:",
              clock: FIXED_CLOCK,
              verifyIntegrityOnOpen: false,
            } as any),
        ),
      (error: unknown) =>
        error instanceof ObservationLedgerCorruptionError &&
        /integrity_check failed/.test(error.message),
    );
  }
});

test("BEGIN IMMEDIATE lock failures are classified as sqlite errors", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  const ledger = openFile(filePath, 0);
  const blocker = new DatabaseSync(filePath);
  try {
    blocker.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE");
    assert.throws(
      () => ledger.append(makeEvent()),
      (error: unknown) =>
        error instanceof ObservationLedgerError &&
        error.code === "sqlite" &&
        !(error instanceof ObservationLedgerConflictError),
    );
    assert.equal(ledger.countEvents(), 0);
  } finally {
    try {
      blocker.exec("ROLLBACK");
    } catch {
      // The lock may already have been released by SQLite.
    }
    blocker.close();
    ledger.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("query execution failures are classified as sqlite errors", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  const ledger = openFile(filePath);
  try {
    const database = new DatabaseSync(filePath);
    database.exec("DROP TABLE runtime_events");
    database.close();
    assert.throws(
      () => ledger.countEvents(),
      (error: unknown) =>
        error instanceof ObservationLedgerError && error.code === "sqlite",
    );
  } finally {
    ledger.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("SQLite unique failures retain event-id and idempotency conflict classification", () => {
  const cases = [
    {
      message: "UNIQUE constraint failed: runtime_events.event_id",
      kind: "source-slot",
    },
    {
      message: "UNIQUE constraint failed: runtime_events.idempotency_key",
      kind: "idempotency-key",
    },
  ] as const;

  for (const item of cases) {
    const ledger = openMemory();
    try {
      assert.throws(
        () =>
          withPrepareOverride(
            (sql) => sql.startsWith("INSERT INTO runtime_events"),
            () => ({ run: () => { throw new Error(item.message); } }),
            () => ledger.append(makeEvent()),
          ),
        (error: unknown) =>
          error instanceof ObservationLedgerConflictError &&
          error.conflictKind === item.kind,
      );
      assert.equal(ledger.countEvents(), 0);
    } finally {
      ledger.close();
    }
  }
});

test("migration history gaps and user_version drift fail closed", () => {
  const root = tempRoot();
  const migrationPath = join(root, "migration.sqlite");
  const database = new DatabaseSync(migrationPath);
  const migrations: readonly ObservationLedgerMigration[] = [
    { version: 1, name: "one", sql: "CREATE TABLE one (id INTEGER PRIMARY KEY) STRICT;" },
    { version: 2, name: "two", sql: "CREATE TABLE two (id INTEGER PRIMARY KEY) STRICT;" },
  ];
  try {
    applyObservationLedgerMigrations(database, { migrations, clock: FIXED_CLOCK });
    database.exec("DROP TRIGGER schema_migrations_reject_delete");
    database.exec("DELETE FROM schema_migrations WHERE version = 1");
    database.exec(MIGRATION_DELETE_TRIGGER_SQL);
    assert.throws(
      () => applyObservationLedgerMigrations(database, { migrations, clock: FIXED_CLOCK }),
      (error: unknown) =>
        error instanceof ObservationLedgerMigrationError &&
        /not a contiguous prefix/.test(error.message),
    );
  } finally {
    database.close();
  }

  const ledgerPath = join(root, "user-version.sqlite");
  try {
    openFile(ledgerPath).close();
    const tamper = new DatabaseSync(ledgerPath);
    tamper.exec("PRAGMA user_version=0");
    tamper.close();
    assert.throws(
      () => openFile(ledgerPath),
      (error: unknown) =>
        error instanceof ObservationLedgerMigrationError &&
        /user_version=0/.test(error.message),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("batch-internal source-slot conflicts and reverse sequence roll back every new row", () => {
  const ledger = openMemory();
  try {
    const first = makeEvent({ sequence: 1, command: "get_state" });
    const conflicting = makeEvent({ sequence: 1, command: "get_messages" });
    assert.throws(
      () => ledger.appendBatch([first, conflicting]),
      ObservationLedgerConflictError,
    );
    assert.equal(ledger.countEvents(), 0);

    assert.throws(
      () => ledger.appendBatch([makeEvent({ sequence: 2 }), makeEvent({ sequence: 1 })]),
      ObservationLedgerSequenceError,
    );
    assert.equal(ledger.countEvents(), 0);
  } finally {
    ledger.close();
  }
});

test("replay options reject oversized limits, unsafe cursors, and unknown surfaces", () => {
  const ledger = openMemory();
  try {
    assert.throws(
      () => ledger.readWorkspace("workspace-a", { limit: 1_001 }),
      ObservationLedgerQueryError,
    );
    assert.throws(
      () =>
        ledger.readWorkspace("workspace-a", {
          afterRowId: Number.MAX_SAFE_INTEGER + 1,
        }),
      ObservationLedgerQueryError,
    );
    assert.throws(
      () =>
        ledger.readWorkspace("workspace-a", {
          sourceSurface: "invalid" as any,
        }),
      ObservationLedgerQueryError,
    );
  } finally {
    ledger.close();
  }
});

test("Project State binds Issue 56 to PR 69 and the numbered primary branch", () => {
  const projectState = readFileSync(
    new URL("../../../docs/harness/project-state.md", import.meta.url),
    "utf8",
  );
  assert.match(projectState, /zhiwei-active-primary/);
  assert.match(projectState, /work-item: #56/);
  assert.match(projectState, /primary-pr: #69/);
  assert.match(projectState, /branch: feat\/56-sqlite-observation-ledger-v1/);
  assert.match(projectState, /status: review-required/);
  assert.match(projectState, /PR #69/);
  assert.doesNotMatch(
    projectState,
    /唯一 active primary branch：[\s\S]{0,120}feat\/m0-sqlite-observation-ledger-v1/,
  );
  assert.match(projectState, /当前等待独立 R2 cold review/);
});

test("schema manifest rejects same-name no-op DELETE guards", () => {
  const cases = [
    {
      trigger: "runtime_events_reject_delete",
      table: "runtime_events",
      expectedError: ObservationLedgerCorruptionError,
    },
    {
      trigger: "schema_migrations_reject_delete",
      table: "schema_migrations",
      expectedError: ObservationLedgerMigrationError,
    },
  ] as const;

  for (const item of cases) {
    const root = tempRoot();
    const filePath = join(root, `${item.trigger}.sqlite`);
    try {
      openFile(filePath).close();
      const database = new DatabaseSync(filePath);
      try {
        database.exec(`DROP TRIGGER ${item.trigger}`);
        database.exec(`
          CREATE TRIGGER ${item.trigger}
          BEFORE DELETE ON ${item.table}
          BEGIN
            SELECT 1;
          END;
        `);
      } finally {
        database.close();
      }
      assert.throws(() => openFile(filePath), item.expectedError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("COMMIT failures are classified as sqlite and a successful rollback leaves no row", () => {
  const ledger = openMemory();
  const originalExec = DatabaseSync.prototype.exec;
  (DatabaseSync.prototype as any).exec = function exec(sql: string) {
    if (sql.trim().toUpperCase() === "COMMIT") {
      throw new Error("simulated commit failure");
    }
    return originalExec.call(this, sql);
  };
  try {
    assert.throws(
      () => ledger.append(makeEvent()),
      (error: unknown) =>
        error instanceof ObservationLedgerError &&
        error.code === "sqlite" &&
        /commit/.test(error.message),
    );
  } finally {
    (DatabaseSync.prototype as any).exec = originalExec;
  }
  try {
    assert.equal(ledger.countEvents(), 0);
  } finally {
    ledger.close();
  }
});

test("rollback failure never replaces the primary commit error", () => {
  const root = tempRoot();
  const filePath = join(root, "ledger.sqlite");
  const ledger = openFile(filePath);
  const originalExec = DatabaseSync.prototype.exec;
  (DatabaseSync.prototype as any).exec = function exec(sql: string) {
    const normalized = sql.trim().toUpperCase();
    if (normalized === "COMMIT") throw new Error("simulated commit failure");
    if (normalized === "ROLLBACK") throw new Error("simulated rollback failure");
    return originalExec.call(this, sql);
  };
  try {
    assert.throws(
      () => ledger.append(makeEvent()),
      (error: unknown) =>
        error instanceof ObservationLedgerError &&
        error.code === "sqlite" &&
        /commit/.test(error.message),
    );
  } finally {
    (DatabaseSync.prototype as any).exec = originalExec;
    ledger.close();
  }
  try {
    const reopened = openFile(filePath);
    try {
      assert.equal(reopened.countEvents(), 0);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
