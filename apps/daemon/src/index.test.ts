import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createServer } from "node:net";
import { createDaemonServer } from "./index.ts";

const token = "a".repeat(64); // Synthetic fixture, never a usable deployment credential.

async function availablePort(): Promise<number> {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  assert(address && typeof address !== "string");
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  return address.port;
}

test("health and metadata require explicit diagnostic authorization", async () => {
  const port = await availablePort();
  const server = createDaemonServer({ port, token });
  await server.listen();
  try {
    for (const path of ["/health", "/v1/meta"]) {
      const rejected = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(rejected.status, 401);
      assert.deepEqual(await rejected.json(), { protocolVersion: 1, error: { code: "unauthorized" } });
    }
    const response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { status: "ok", service: "zhiwei-daemon", version: "0.0.0", milestone: "M0-bootstrap" });
    const meta = await fetch(`http://127.0.0.1:${port}/v1/meta`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(meta.status, 200);
    assert.deepEqual(await meta.json(), { product: "ZhiWei Next", protocolVersion: 1, capabilities: ["health", "normalized-runtime-events"] });
  } finally { await server.close(); }
});

test("invalid daemon configuration fails before a server can listen", () => {
  for (const input of [
    {}, { token: "SYNTHETIC_CREDENTIAL_MUST_NOT_LOG" }, { token, host: "0.0.0.0" },
    { token, host: "localhost" }, { token, host: "::1" }, { token, port: "4265suffix" },
    { token, port: "0" }, { token, port: "65536" }, { token, port: "04265" },
  ]) assert.throws(() => createDaemonServer(input), /^Error: invalid_configuration$/);
});
