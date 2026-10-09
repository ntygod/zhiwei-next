import assert from "node:assert/strict";
import { once } from "node:events";
import {
  existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync,
  symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openSqliteObservationLedgerV1 } from "../../../packages/memory-store/src/index.ts";
import { canonicalJsonV1 } from "../../../packages/protocol/src/index.ts";
import {
  assembleSyntheticInput, createSyntheticContentStore, createSyntheticRevisionStore,
  syntheticRevision,
} from "../session-reconstruction/experiment.mjs";
import {
  createSyntheticComposition, FIXTURE, projectSyntheticFailure, readSyntheticFile,
  safeSyntheticBoundary, syntheticMetadataEvent,
} from "./experiment.mjs";

function fixture(t, options) {
  const value = createSyntheticComposition(options);
  t.after(() => value.dispose());
  return value;
}
function directory(t) {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-g2-reader-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "nested"));
  writeFileSync(join(root, "nested/public.txt"), FIXTURE.publicBody);
  return root;
}
function rejected(result, code) {
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result).sort(), ["code", "ok"]);
  if (code) assert.equal(result.code, code);
}
function noLeaks(value, root = "") {
  const serialized = JSON.stringify(value);
  for (const forbidden of [FIXTURE.credentialMarker, FIXTURE.publicBody.trim(),
    FIXTURE.privateBody.trim(), FIXTURE.toolBody, ...(root ? [root] : [])]) {
    assert.equal(serialized.includes(forbidden), false, "Safe projection must contain no source data");
  }
}
async function receiver(t) {
  const seen = { connections: 0, requests: 0, bytes: 0, bodies: [], transportCalls: 0 };
  const server = createServer((request, response) => {
    seen.requests += 1;
    const chunks = [];
    request.on("data", (chunk) => { seen.bytes += chunk.length; chunks.push(chunk); });
    request.on("end", () => {
      seen.bodies.push(Buffer.concat(chunks));
      response.writeHead(204, { connection: "close" });
      response.end();
    });
  });
  server.on("connection", () => { seen.connections += 1; });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  t.after(() => new Promise((done) => { server.closeAllConnections(); server.close(done); }));
  const transport = (bytes) => new Promise((fulfill, reject) => {
    seen.transportCalls += 1;
    const request = httpRequest({ host: "127.0.0.1", port, method: "POST", path: "/synthetic",
      agent: false, headers: { "content-length": bytes.length, connection: "close" } }, (response) => {
      response.resume();
      response.on("end", fulfill);
    });
    request.on("error", reject);
    request.setTimeout(1000, () => request.destroy(new Error("SYNTHETIC_TRANSPORT_TIMEOUT")));
    request.end(bytes);
  });
  return { seen, transport };
}
function zeroSink(seen) {
  assert.deepEqual({ connections: seen.connections, requests: seen.requests, bytes: seen.bytes,
    calls: seen.transportCalls }, { connections: 0, requests: 0, bytes: 0, calls: 0 });
}

test("owned ordinary relative file produces actual bounded bytes", (t) => {
  const root = directory(t);
  const result = readSyntheticFile(root, "nested/public.txt");
  assert.equal(result.ok, true);
  assert.equal(result.bytes.equals(Buffer.from(FIXTURE.publicBody)), true);
});
const badPaths = [
  ["empty", ""], ["absolute", "/tmp/synthetic-public.txt"], ["parent", "../public.txt"],
  ["nested parent", "nested/../public.txt"], ["dot", "./nested/public.txt"],
  ["empty segment", "nested//public.txt"], ["trailing slash", "nested/public.txt/"],
  ["Windows drive", "C:/nested/public.txt"], ["Windows separator", "nested\\public.txt"],
  ["UNC", "\\\\server\\share\\public.txt"], ["percent encoded parent", "%2e%2e/public.txt"],
  ["double encoded parent", "%252e%252e/public.txt"], ["encoded slash", "nested%2fpublic.txt"],
  ["NUL", "nested/public.txt\0"], ["Unicode slash", "nested／public.txt"],
  ["Unicode dot", "．．/public.txt"], ["URL", "file:///tmp/public.txt"],
  ["array", ["nested/public.txt"]], ["numeric", 1], ["overlong", "a".repeat(161)],
];
for (const [name, input] of badPaths) {
  test(`file grammar rejects ${name} before returning content`, (t) => {
    rejected(readSyntheticFile(directory(t), input), "PATH_DENIED");
  });
}
test("same-prefix sibling is not a child root", (t) => {
  const root = directory(t);
  const sibling = `${root}-other`;
  mkdirSync(sibling);
  t.after(() => rmSync(sibling, { recursive: true, force: true }));
  writeFileSync(join(sibling, "private.txt"), FIXTURE.privateBody);
  rejected(readSyntheticFile(root, `../${sibling.split("/").at(-1)}/private.txt`), "PATH_DENIED");
  rejected(readSyntheticFile(root, join(sibling, "private.txt")), "PATH_DENIED");
});
for (const position of ["root", "ancestor", "directory", "leaf"]) {
  test(`rejects ${position} symbolic link`, (t) => {
    const root = directory(t);
    if (position === "root") {
      symlinkSync(root, `${root}-link`);
      t.after(() => unlinkSync(`${root}-link`));
      rejected(readSyntheticFile(`${root}-link`, "nested/public.txt"), "PATH_DENIED");
    } else if (position === "ancestor") {
      symlinkSync(root, `${root}-link`);
      t.after(() => unlinkSync(`${root}-link`));
      rejected(readSyntheticFile(`${root}-link/nested`, "public.txt"), "PATH_DENIED");
    } else if (position === "directory") {
      symlinkSync(join(root, "nested"), join(root, "alias"));
      rejected(readSyntheticFile(root, "alias/public.txt"), "PATH_DENIED");
    } else {
      symlinkSync(join(root, "nested/public.txt"), join(root, "alias.txt"));
      rejected(readSyntheticFile(root, "alias.txt"), "PATH_DENIED");
    }
  });
}
test("hardlinked files are rejected through either name", (t) => {
  const root = directory(t);
  linkSync(join(root, "nested/public.txt"), join(root, "alias.txt"));
  rejected(readSyntheticFile(root, "alias.txt"), "PATH_DENIED");
  rejected(readSyntheticFile(root, "nested/public.txt"), "PATH_DENIED");
});
test("directory leaves, missing files and oversized bytes return no body", (t) => {
  const root = directory(t);
  rejected(readSyntheticFile(root, "nested"), "PATH_DENIED");
  rejected(readSyntheticFile(root, "missing.txt"));
  writeFileSync(join(root, "large.txt"), Buffer.alloc(4097, 65));
  rejected(readSyntheticFile(root, "large.txt"), "CONTENT_TOO_LARGE");
  writeFileSync(join(root, "limit.txt"), Buffer.alloc(4096, 65));
  assert.equal(readSyntheticFile(root, "limit.txt").bytes.length, 4096);
});
for (const phase of ["beforeOpen", "afterOpen", "afterRead"]) {
  test(`leaf replacement injected ${phase} never returns either body`, (t) => {
    const root = directory(t);
    const result = readSyntheticFile(root, "nested/public.txt", { [phase]: () => {
      renameSync(join(root, "nested/public.txt"), join(root, "old.txt"));
      writeFileSync(join(root, "nested/public.txt"), FIXTURE.privateBody);
    } });
    rejected(result, "FILE_CHANGED");
    noLeaks(result, root);
  });
}
test("directory replacement after open is detected through directory handles", (t) => {
  const root = directory(t);
  rejected(readSyntheticFile(root, "nested/public.txt", { afterOpen: () => {
    renameSync(join(root, "nested"), join(root, "old"));
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "nested/public.txt"), FIXTURE.privateBody);
  } }), "FILE_CHANGED");
});
test("in-place mutation after bounded read is rejected by handle metadata", (t) => {
  const root = directory(t);
  rejected(readSyntheticFile(root, "nested/public.txt", { afterRead: () => {
    writeFileSync(join(root, "nested/public.txt"), FIXTURE.privateBody);
  } }), "FILE_CHANGED");
});
test("root replacement after open is detected before bytes are exposed", (t) => {
  const root = directory(t);
  t.after(() => rmSync(`${root}-old`, { recursive: true, force: true }));
  rejected(readSyntheticFile(root, "nested/public.txt", { afterOpen: () => {
    renameSync(root, `${root}-old`);
    mkdirSync(root);
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "nested/public.txt"), FIXTURE.privateBody);
  } }), "FILE_CHANGED");
});

test("authorized fixed Public content reaches an actual loopback receiver", async (t) => {
  const sink = await receiver(t);
  const f = fixture(t, sink);
  const result = await f.send(f.request(["public"], FIXTURE.destination), f.authorities.sendPublic);
  assert.equal(result.ok, true);
  assert.deepEqual({ connections: sink.seen.connections, requests: sink.seen.requests,
    calls: sink.seen.transportCalls }, { connections: 1, requests: 1, calls: 1 });
  assert.equal(sink.seen.bytes, Buffer.byteLength(FIXTURE.publicBody));
  assert.equal(sink.seen.bodies[0].equals(Buffer.from(FIXTURE.publicBody)), true);
  noLeaks(f.audit(), f.root);
});
for (const [name, names, authority, code] of [
  ["Private", ["private"], "sendPrivate", "EGRESS_DENIED"],
  ["mixed Public and Private", ["public", "private"], "sendMixed", "EGRESS_DENIED"],
  ["unclassified", ["unclassified"], "sendUnclassified", "EGRESS_DENIED"],
  ["mixed with unclassified", ["public", "unclassified"], "sendMixedUnclassified", "EGRESS_DENIED"],
  ["tool output", ["tool"], "sendTool", "EGRESS_DENIED"],
  ["cross Workspace resource", ["foreign"], "sendForeign", "AUTHORITY_DENIED"],
  ["unknown resource", ["unknown"], "sendPublic", "AUTHORITY_DENIED"],
]) {
  test(`egress ${name} produces zero connections, requests, bytes and transport calls`, async (t) => {
    const sink = await receiver(t);
    const f = fixture(t, sink);
    rejected(await f.send(f.request(names, FIXTURE.destination), f.authorities[authority]), code);
    zeroSink(sink.seen);
    noLeaks(f.audit(), f.root);
  });
}
const requestMutations = [
  ["unknown schema", (r) => { r.schema = "synthetic-g2-request-v2"; }, "INVALID_REQUEST"],
  ["missing Workspace", (r) => { delete r.workspace; }, "INVALID_REQUEST"],
  ["wrong Workspace", (r) => { r.workspace = "synthetic-workspace-b"; }, "AUTHORITY_DENIED"],
  ["unknown destination", (r) => { r.destination = "synthetic-remote-b"; }, "AUTHORITY_DENIED"],
  ["extra authority field", (r) => { r.authority = { allow: true }; }, "INVALID_REQUEST"],
  ["extra body field", (r) => { r.body = FIXTURE.privateBody; }, "INVALID_REQUEST"],
  ["extra classification field", (r) => { r.classification = "Public"; }, "INVALID_REQUEST"],
  ["extra credential field", (r) => { r.token = FIXTURE.credentialMarker; }, "INVALID_REQUEST"],
  ["empty selection", (r) => { r.resources = []; }, "INVALID_REQUEST"],
  ["duplicate selection", (r) => { r.resources = ["public", "public"]; }, "INVALID_REQUEST"],
  ["non-string resource", (r) => { r.resources = [{}]; }, "INVALID_REQUEST"],
];
for (const [name, mutate, code] of requestMutations) {
  test(`request ${name} is denied before any sink connection`, async (t) => {
    const sink = await receiver(t);
    const f = fixture(t, sink);
    const request = f.request(["public"], FIXTURE.destination);
    mutate(request);
    rejected(await f.send(request, f.authorities.sendPublic), code);
    zeroSink(sink.seen);
    noLeaks(f.audit(), f.root);
  });
}
test("missing, copied and self-declared authority cannot mint a grant", async (t) => {
  const sink = await receiver(t);
  const f = fixture(t, sink);
  for (const authority of [undefined, null, {}, structuredClone(f.authorities.sendPublic),
    { role: "system", allow: true }, FIXTURE.credentialMarker, f.authorities.readPublic]) {
    rejected(await f.send(f.request(["public"], FIXTURE.destination), authority), "AUTHORITY_DENIED");
  }
  zeroSink(sink.seen);
});
test("locally read malicious tool text stays data and cannot authorize another action", async (t) => {
  const sink = await receiver(t);
  const f = fixture(t, sink);
  const read = await f.read(f.request(["tool"]), f.authorities.readTool);
  assert.equal(read.ok, true);
  assert.equal(read.value === FIXTURE.toolBody, true);
  const parsed = JSON.parse(read.value);
  rejected(await f.send(f.request(["private"], FIXTURE.destination), parsed.authority), "AUTHORITY_DENIED");
  rejected(await f.read(f.request(["private"]), parsed.authority), "AUTHORITY_DENIED");
  rejected(await f.send(f.request(["tool"], FIXTURE.destination), f.authorities.sendTool), "EGRESS_DENIED");
  zeroSink(sink.seen);
  noLeaks(f.audit(), f.root);
});
test("credential-bearing stale derived cache cannot replace the authorized body", async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.root, "cache/public.txt"), FIXTURE.toolBody);
  rejected(await f.read(f.request(), f.authorities.readPublic, { cache: true }), "CONTENT_INVALID");
  noLeaks(f.audit(), f.root);
});
test("replaced Public file cannot launder credential-bearing text to the sink", async (t) => {
  const sink = await receiver(t);
  const f = fixture(t, sink);
  writeFileSync(join(f.root, "body/public.txt"), FIXTURE.toolBody);
  rejected(await f.send(f.request(["public"], FIXTURE.destination), f.authorities.sendPublic), "CONTENT_INVALID");
  zeroSink(sink.seen);
  noLeaks(f.audit(), f.root);
});
test("local Private read authority grants neither cross-resource read nor model egress", async (t) => {
  const sink = await receiver(t);
  const f = fixture(t, sink);
  const local = await f.read(f.request(["private"]), f.authorities.readPrivate);
  assert.equal(local.ok, true);
  assert.equal(local.value === FIXTURE.privateBody, true);
  rejected(await f.read(f.request(["tool"]), f.authorities.readPrivate), "AUTHORITY_DENIED");
  rejected(await f.send(f.request(["private"], FIXTURE.destination), f.authorities.readPrivate), "AUTHORITY_DENIED");
  rejected(await f.send(f.request(["private"], FIXTURE.destination), f.authorities.sendPrivate), "EGRESS_DENIED");
  zeroSink(sink.seen);
});

test("public protocol plus actual Ledger stores metadata only in the separated fixture", (t) => {
  const f = fixture(t);
  const ledger = openSqliteObservationLedgerV1({ filePath: join(f.root, "metadata.sqlite") });
  try {
    const rows = ledger.readSession(FIXTURE.workspace, "synthetic-session");
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].event.data, { kind: "message.lifecycle", phase: "ended", role: "user" });
    noLeaks(rows, f.root);
    assert.equal(ledger.append(syntheticMetadataEvent()).inserted, false);
    assert.equal(ledger.countEvents(), 1);
  } finally { ledger.close(); }
});
test("actual inline v1 closed backup retains body and still rejects DELETE", (t) => {
  const f = fixture(t);
  const filePath = join(f.root, "backup/inline-snapshot.sqlite");
  const ledger = openSqliteObservationLedgerV1({ filePath });
  try {
    assert.equal(ledger.readSession(FIXTURE.workspace, "synthetic-session")[0].event.data.body.text === FIXTURE.publicBody, true);
    assert.equal(typeof ledger.purge, "undefined");
  } finally { ledger.close(); }
  const db = new DatabaseSync(filePath);
  try {
    assert.throws(() => db.exec("DELETE FROM runtime_events"));
    const rows = db.prepare("SELECT event_json, data_json FROM runtime_events").all();
    assert.equal(rows[0].event_json.includes(FIXTURE.publicBody.trim()), true);
    assert.equal(rows[0].data_json.includes(FIXTURE.publicBody.trim()), true);
  } finally { db.close(); }
});
test("actual live and old SQLite snapshot both reconstruct through exported D-01 before forget", async (t) => {
  const f = fixture(t);
  for (const [operation, authority] of [["reconstruct", "reconstructPublic"], ["restore", "restorePublic"]]) {
    const result = await f[operation](f.request(), f.authorities[authority]);
    assert.equal(result.ok, true);
    assert.equal(result.value.request.messages[1].content === FIXTURE.publicBody, true);
    assert.equal(result.value.completeWithinDeclaredFixture, true);
    assert.equal(result.value.realModelInputProven, false);
  }
});
function alternateRecord(messages, requestId = "synthetic-g2-request") {
  const revisions = createSyntheticRevisionStore(syntheticRevision());
  return assembleSyntheticInput({ revisions, pin: revisions.beginRequest(requestId),
    contentStore: createSyntheticContentStore(), messages,
    downstream: { runtime: "absent-in-fixture", provider: "absent-in-fixture" },
  }).record;
}
function replaceRecord(f, operation, record) {
  const path = join(f.root, operation === "reconstruct" ? "record.json" : "backup/snapshot.json");
  const saved = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, canonicalJsonV1(operation === "reconstruct" ? record : { ...saved, record }));
}
for (const [operation, authority] of [["reconstruct", "reconstructPublic"], ["restore", "restorePublic"]]) {
  for (const [name, messages, requestId] of [
    ["inline Private content", [{ role: "user", text: FIXTURE.privateBody, storage: "inline" }]],
    ["additional inline content", [
      { role: "user", text: FIXTURE.publicBody, storage: "reference" },
      { role: "assistant", text: FIXTURE.privateBody, storage: "inline" },
    ]],
    ["another request identity", [{ role: "user", text: FIXTURE.publicBody, storage: "reference" }],
      "synthetic-other-request"],
  ]) {
    test(`${operation} rejects a self-consistent record with ${name}`, async (t) => {
      const f = fixture(t);
      // The normal D-01 assembler supplies a valid shape and matching content/request hashes.
      // Those hashes do not grant access to a different composition record.
      replaceRecord(f, operation, alternateRecord(messages, requestId));
      const result = await f[operation](f.request(), f.authorities[authority]);
      rejected(result, "CONTENT_INVALID");
      assert.deepEqual(f.reconstructionCounts(), { calls: 0, referenceResolutions: 0 });
      assert.deepEqual(f.audit(), [{ operation, code: "CONTENT_INVALID" }]);
      noLeaks([result, f.audit()], f.root);
    });
  }
  test(`${operation} rejects a changed record before accessing its body source`, async (t) => {
    const f = fixture(t);
    replaceRecord(f, operation, alternateRecord([
      { role: "user", text: FIXTURE.publicBody, storage: "reference" },
    ], "synthetic-other-request"));
    const sourcePath = join(f.root, operation === "reconstruct" ? "body/public.txt" : "backup/inline-snapshot.sqlite");
    unlinkSync(sourcePath);
    const result = await f[operation](f.request(), f.authorities[authority]);
    rejected(result, "CONTENT_INVALID");
    assert.deepEqual(f.reconstructionCounts(), { calls: 0, referenceResolutions: 0 });
    assert.equal(existsSync(sourcePath), false, "Rejected restore must not create a replacement database");
    noLeaks([result, f.audit()], f.root);
  });
  test(`${operation} accepts the same record with different JSON key order and whitespace`, async (t) => {
    const f = fixture(t);
    const path = join(f.root, operation === "reconstruct" ? "record.json" : "backup/snapshot.json");
    const saved = JSON.parse(readFileSync(path, "utf8"));
    const record = operation === "reconstruct" ? saved : saved.record;
    const reordered = Object.fromEntries(Object.entries(record).reverse());
    writeFileSync(path, JSON.stringify(operation === "reconstruct" ? reordered : { ...saved, record: reordered }, null, 2));
    const result = await f[operation](f.request(), f.authorities[authority]);
    assert.equal(result.ok, true);
    assert.equal(result.value.request.messages[1].content, FIXTURE.publicBody);
    assert.deepEqual(f.reconstructionCounts(), { calls: 1, referenceResolutions: 1 });
    noLeaks(f.audit(), f.root);
  });
}
test("persisted logical forget blocks materialization, stale cache, egress and both reconstructions", async (t) => {
  const sink = await receiver(t);
  const f = fixture(t, sink);
  const request = f.request();
  assert.equal((await f.restore(request, f.authorities.restorePublic)).ok, true);
  assert.equal((await f.read(request, f.authorities.readPublic, { cache: true })).ok, true);
  assert.equal((await f.forget(request, f.authorities.forgetPublic)).ok, true);
  for (const [operation, authority] of [["read", "readPublic"], ["reconstruct", "reconstructPublic"], ["restore", "restorePublic"]]) {
    rejected(await f[operation](request, f.authorities[authority]), "FORGOTTEN");
  }
  rejected(await f.read(request, f.authorities.readPublic, { cache: true }), "FORGOTTEN");
  rejected(await f.send(f.request(["public"], FIXTURE.destination), f.authorities.sendPublic), "FORGOTTEN");
  zeroSink(sink.seen);
  assert.equal(existsSync(join(f.root, "body/public.txt")), true);
  assert.equal(existsSync(join(f.root, "cache/public.txt")), true);
  const journal = JSON.parse(readFileSync(join(f.root, "control/revocations.json"), "utf8"));
  assert.deepEqual(journal, { schema: "synthetic-g2-revocations-v1", watermark: 1, revoked: ["public"] });
  noLeaks(journal, f.root);
  noLeaks(f.audit(), f.root);
});
test("separate authorization unlinks owned body and cache, leaves backups honestly partial", async (t) => {
  const f = fixture(t);
  const request = f.request();
  const readMetadata = () => {
    const ledger = openSqliteObservationLedgerV1({ filePath: join(f.root, "metadata.sqlite") });
    try { return canonicalJsonV1(ledger.readSession(FIXTURE.workspace, "synthetic-session")); }
    finally { ledger.close(); }
  };
  const before = readMetadata();
  rejected(await f.purge(request, f.authorities.purgePublic), "AUTHORITY_DENIED");
  assert.equal((await f.forget(request, f.authorities.forgetPublic)).ok, true);
  assert.equal(readMetadata() === before, true, "Logical forget must preserve metadata records");
  rejected(await f.purge(request, f.authorities.forgetPublic), "AUTHORITY_DENIED");
  const result = await f.purge(request, f.authorities.purgePublic);
  assert.deepEqual(result, { ok: true, value: { state: "partial", liveFiles: "unlinked",
    backup: "retained-revoked", secureErasureProven: false } });
  assert.equal(existsSync(join(f.root, "body/public.txt")), false);
  assert.equal(existsSync(join(f.root, "cache/public.txt")), false);
  assert.equal(existsSync(join(f.root, "backup/inline-snapshot.sqlite")), true);
  assert.equal(readMetadata() === before, true, "Metadata records must survive byte-identically");
  rejected(await f.restore(request, f.authorities.restorePublic), "FORGOTTEN");
  const backup = openSqliteObservationLedgerV1({ filePath: join(f.root, "backup/inline-snapshot.sqlite") });
  try {
    // Direct trusted API is deliberately outside the gate; this proves no production purge.
    assert.equal(backup.readSession(FIXTURE.workspace, "synthetic-session")[0].event.data.body.text === FIXTURE.publicBody, true);
  } finally { backup.close(); }
  assert.equal((await f.purge(request, f.authorities.purgePublic)).ok, true);
});
test("partial cleanup retains denial and reports pending rather than success", async (t) => {
  const f = fixture(t, { cleanupHook: (name) => {
    if (name === "cache/public.txt") throw new Error(FIXTURE.credentialMarker);
  } });
  await f.forget(f.request(), f.authorities.forgetPublic);
  const result = await f.purge(f.request(), f.authorities.purgePublic);
  rejected(result, "CLEANUP_PENDING");
  assert.equal(existsSync(join(f.root, "body/public.txt")), false);
  assert.equal(existsSync(join(f.root, "cache/public.txt")), true);
  rejected(await f.read(f.request(), f.authorities.readPublic, { cache: true }), "FORGOTTEN");
  rejected(await f.restore(f.request(), f.authorities.restorePublic), "FORGOTTEN");
  noLeaks([result, f.audit()], f.root);
});
test("late duplicate bytes and cache cannot resurrect a forgotten resource", async (t) => {
  const sink = await receiver(t);
  const f = fixture(t, sink);
  await f.forget(f.request(), f.authorities.forgetPublic);
  await f.purge(f.request(), f.authorities.purgePublic);
  writeFileSync(join(f.root, "body/public.txt"), FIXTURE.publicBody);
  writeFileSync(join(f.root, "cache/public.txt"), FIXTURE.publicBody);
  const metadata = openSqliteObservationLedgerV1({ filePath: join(f.root, "metadata.sqlite") });
  try {
    assert.equal(metadata.append(syntheticMetadataEvent()).inserted, false);
    assert.equal(metadata.append(syntheticMetadataEvent(2)).inserted, true);
  } finally { metadata.close(); }
  rejected(await f.read(f.request(), f.authorities.readPublic), "FORGOTTEN");
  rejected(await f.read(f.request(), f.authorities.readPublic, { cache: true }), "FORGOTTEN");
  rejected(await f.reconstruct(f.request(), f.authorities.reconstructPublic), "FORGOTTEN");
  rejected(await f.send(f.request(["public"], FIXTURE.destination), f.authorities.sendPublic), "FORGOTTEN");
  zeroSink(sink.seen);
});
test("missing reference body fails, never falls back to cache or available old backup", async (t) => {
  const f = fixture(t);
  unlinkSync(join(f.root, "body/public.txt"));
  rejected(await f.reconstruct(f.request(), f.authorities.reconstructPublic), "CONTENT_UNAVAILABLE");
  assert.deepEqual(f.reconstructionCounts(), { calls: 1, referenceResolutions: 1 });
  assert.equal(existsSync(join(f.root, "cache/public.txt")), true);
  assert.equal(existsSync(join(f.root, "backup/inline-snapshot.sqlite")), true);
});
for (const damage of ["missing", "stale", "same-watermark-tampered", "malformed", "missing-independent-anchor"]) {
  test(`revocation ${damage} prevents old snapshot and stale cache use`, async (t) => {
    const sink = await receiver(t);
    const f = fixture(t, sink);
    const path = join(f.root, "control/revocations.json");
    const old = readFileSync(path);
    await f.forget(f.request(), f.authorities.forgetPublic);
    if (damage === "missing") unlinkSync(path);
    else if (damage === "stale") writeFileSync(path, old);
    else if (damage === "same-watermark-tampered") writeFileSync(path,
      canonicalJsonV1({ schema: "synthetic-g2-revocations-v1", watermark: 1, revoked: [] }));
    else if (damage === "malformed") writeFileSync(path, FIXTURE.toolBody);
    else f.loseTrustedRevocationHead();
    rejected(await f.restore(f.request(), f.authorities.restorePublic), "REVOCATION_UNAVAILABLE");
    rejected(await f.reconstruct(f.request(), f.authorities.reconstructPublic), "REVOCATION_UNAVAILABLE");
    rejected(await f.read(f.request(), f.authorities.readPublic, { cache: true }), "REVOCATION_UNAVAILABLE");
    rejected(await f.send(f.request(["public"], FIXTURE.destination), f.authorities.sendPublic), "REVOCATION_UNAVAILABLE");
    zeroSink(sink.seen);
  });
}
for (const [name, mutate] of [
  ["unknown status", (value) => { value.status = "probably-complete"; }],
  ["missing status", (value) => { delete value.status; }],
  ["unknown schema", (value) => { value.schema = "unknown"; }],
  ["future watermark", (value) => { value.watermark = 2; }],
  ["missing watermark", (value) => { delete value.watermark; }],
  ["extra body", (value) => { value.body = FIXTURE.privateBody; }],
]) {
  test(`backup ${name} fails closed before materialization`, async (t) => {
    const f = fixture(t);
    const path = join(f.root, "backup/snapshot.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    mutate(value);
    writeFileSync(path, canonicalJsonV1(value));
    rejected(await f.restore(f.request(), f.authorities.restorePublic), "CONTENT_UNAVAILABLE");
  });
}

test("native Ledger error contains path and cause but boundary exposes only fixed code", async (t) => {
  const root = directory(t);
  const path = join(root, `${FIXTURE.credentialMarker}.txt`);
  writeFileSync(path, FIXTURE.privateBody);
  const filePath = join(path, "ledger.sqlite");
  let native;
  try { openSqliteObservationLedgerV1({ filePath }); }
  catch (error) { native = error; }
  assert.equal(native instanceof Error, true);
  assert.equal(native.message.includes(filePath), true);
  assert.equal(native.cause instanceof Error, true);
  const audit = [];
  const result = await safeSyntheticBoundary("ledger", () => openSqliteObservationLedgerV1({ filePath }), audit);
  rejected(result, "DEPENDENCY_FAILED");
  noLeaks([result, audit], root);
  assert.deepEqual(audit, [{ operation: "ledger", code: "DEPENDENCY_FAILED" }]);
});
test("projection never reads hostile native error fields or caller supplied audit IDs", async () => {
  let reads = 0;
  const error = {};
  for (const key of ["name", "message", "cause", "stack", "code"]) {
    Object.defineProperty(error, key, { get() { reads += 1; throw new Error(FIXTURE.credentialMarker); } });
  }
  rejected(projectSyntheticFailure(error), "DEPENDENCY_FAILED");
  const audit = [];
  rejected(await safeSyntheticBoundary(FIXTURE.credentialMarker, () => { throw error; }, audit), "DEPENDENCY_FAILED");
  assert.equal(reads, 0);
  assert.deepEqual(audit, [{ operation: "read", code: "DEPENDENCY_FAILED" }]);
  noLeaks(audit);
});
test("fixed CLI prints only safe summary and rejects caller arguments without reflecting them", () => {
  const cli = fileURLToPath(new URL("./experiment.mjs", import.meta.url));
  const success = spawnSync(process.execPath, ["--experimental-strip-types", cli], { encoding: "utf8" });
  assert.equal(success.status, 0);
  const summary = JSON.parse(success.stdout);
  assert.equal(summary.productionRetentionImplemented, false);
  assert.equal(summary.staleRestoreAfterForget, "denied");
  noLeaks(summary);
  const denied = spawnSync(process.execPath, ["--experimental-strip-types", cli, FIXTURE.credentialMarker], { encoding: "utf8" });
  assert.equal(denied.status, 2);
  rejected(JSON.parse(denied.stdout), "INVALID_REQUEST");
  noLeaks({ stdout: denied.stdout, stderr: denied.stderr });
});
