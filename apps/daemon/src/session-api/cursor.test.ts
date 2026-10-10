import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionCursorCodec } from "./cursor.ts";
import { SessionApiError } from "./service.ts";
const binding = { principalId: "synthetic-principal-a", workspaceId: "synthetic-workspace-a", purpose: "events" as const };
const options = () => ({ installationId: "synthetic-installation", recoveryEpoch: () => "recovery-1", projectionGeneration: () => 1, now: () => 1000 });
const expired = (action: () => unknown) => assert.throws(action, (error: unknown) => error instanceof SessionApiError && error.status === 410 && error.reason === "cursor_expired");
test("External cursors hide positions and authenticate principal, scope, purpose and every encoded byte", () => {
  const codec = new SessionCursorCodec(options()); const token = codec.encode(binding, { commitCursor: 123456789, after: "synthetic-task-secret" });
  assert.match(token, /^[A-Za-z0-9_-]+$/); assert.ok(!token.includes("123456789"));
  assert.ok(!Buffer.from(token, "base64url").toString().includes("synthetic-task-secret"));
  assert.deepEqual(codec.decode(binding, token), { commitCursor: 123456789, after: "synthetic-task-secret" });
  for (const change of [{ principalId: "synthetic-principal-b" }, { workspaceId: "synthetic-workspace-b" }, { purpose: "tasks" as const }, { filter: "READY" }]) expired(() => codec.decode({ ...binding, ...change }, token));
  const segments = Buffer.from(token, "base64url").toString().split(".");
  const ciphertext = Buffer.from(segments[3]!, "base64url"); ciphertext[0] = ciphertext[0]! ^ 1; segments[3] = ciphertext.toString("base64url");
  expired(() => codec.decode(binding, Buffer.from(segments.join(".")).toString("base64url")));
  expired(() => codec.decode(binding, token + "="));
  const highBit = Buffer.from(token, "base64url"); highBit[0] = highBit[0]! | 128;
  expired(() => codec.decode(binding, highBit.toString("base64url"))); codec.close();
});
test("Cursor expiry, key rotation, generation, recovery and restart each require a new snapshot", () => {
  let now = 1000; let epoch = "recovery-1"; let generation = 1;
  const settings = { ...options(), now: () => now, recoveryEpoch: () => epoch, projectionGeneration: () => generation, ttlMs: 20, maxTokensPerKey: 2 };
  const codec = new SessionCursorCodec(settings); const token = codec.encode(binding, { commitCursor: 1 });
  now = 1020; expired(() => codec.decode(binding, token)); now = 1000;
  epoch = "recovery-2"; expired(() => codec.decode(binding, token)); epoch = "recovery-1";
  generation = 2; expired(() => codec.decode(binding, token)); generation = 1;
  const second = codec.encode(binding, { commitCursor: 2 }); codec.encode(binding, { commitCursor: 3 }); expired(() => codec.decode(binding, token)); expired(() => codec.decode(binding, second));
  const latest = codec.encode(binding, { commitCursor: 4 }); const restarted = new SessionCursorCodec(settings); expired(() => restarted.decode(binding, latest));
  codec.close(); expired(() => codec.decode(binding, latest)); assert.throws(() => codec.encode(binding, { commitCursor: 5 })); restarted.close();
});
test("Bounded cursor registry evicts old namespaces and refuses nonce reuse or oversized budgets", () => {
  const codec = new SessionCursorCodec({ ...options(), maxNamespaces: 1 }); const token = codec.encode(binding, { commitCursor: 1 });
  codec.encode({ ...binding, purpose: "tasks" }, { commitCursor: 2 }); expired(() => codec.decode(binding, token)); codec.close();
  const collisions = new SessionCursorCodec({ ...options(), random: size => Buffer.alloc(size, 1) });
  collisions.encode(binding, { commitCursor: 1 }); assert.throws(() => collisions.encode(binding, { commitCursor: 2 }), (error: unknown) => error instanceof SessionApiError && error.reason === "dependency_down"); collisions.close();
  assert.throws(() => new SessionCursorCodec({ ...options(), maxTokensPerKey: 100001 })); assert.throws(() => new SessionCursorCodec({ ...options(), maxNamespaces: 65 }));
});
