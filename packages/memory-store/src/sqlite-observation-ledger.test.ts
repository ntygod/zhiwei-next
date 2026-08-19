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

  const reopened = openSqliteObservationLedgerV1({
    filePath,
    clock: { now: () => "2026-08-18T00:00:00.000Z" },
  });
  try {
    assert.throws(
      () => reopened.getByEventId(event.eventId),
      ObservationLedgerCorruptionError,
    );
  } finally {
    reopened.close();
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

  const reopened = openSqliteObservationLedgerV1({
    filePath,
    clock: { now: () => "2026-08-18T00:00:00.000Z" },
  });
  try {
    assert.throws(
      () => reopened.getByEventId(event.eventId),
      ObservationLedgerCorruptionError,
    );
  } finally {
    reopened.close();
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
