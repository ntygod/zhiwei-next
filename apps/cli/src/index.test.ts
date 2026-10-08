import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createServer } from "node:http";
import { runCli } from "./index.ts";

const token = "a".repeat(64);
const health = { status: "ok", service: "zhiwei-daemon", version: "0.0.0", milestone: "M0-bootstrap" };

test("version command is deterministic without credentials", async () => {
  const lines: string[] = [];
  const exitCode = await runCli(["version"], line => lines.push(line));
  assert.equal(exitCode, 0);
  assert.deepEqual(lines, ["zhiwei-next 0.0.0"]);
});

test("doctor authenticates actual HTTP and prints only a validated health DTO", async () => {
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    assert.equal(request.url, "/health");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(health));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert(address && typeof address !== "string");
  try {
    const lines: string[] = [];
    assert.equal(await runCli(["doctor"], line => lines.push(line), { baseUrl: `http://127.0.0.1:${address.port}`, token }), 0);
    assert.deepEqual(lines, [`Daemon OK: ${JSON.stringify(health)}`]);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("doctor refuses redirects and never prints synthetic response secrets", async () => {
  let targetHits = 0;
  const target = createServer((_request, response) => {
    targetHits++;
    response.end(JSON.stringify({ secret: "SYNTHETIC_CREDENTIAL_MUST_NOT_LOG" }));
  });
  target.listen(0, "127.0.0.1"); await once(target, "listening");
  const targetAddress = target.address(); assert(targetAddress && typeof targetAddress !== "string");
  const server = createServer((_request, response) => {
    response.writeHead(302, { location: `http://127.0.0.1:${targetAddress.port}/SYNTHETIC_CREDENTIAL_MUST_NOT_LOG` });
    response.end("SYNTHETIC_CREDENTIAL_MUST_NOT_LOG");
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert(address && typeof address !== "string");
  try {
    const lines: string[] = [];
    assert.equal(await runCli(["doctor"], line => lines.push(line), { baseUrl: `http://127.0.0.1:${address.port}`, token }), 1);
    assert.match(lines.join("\n"), /redirect_refused/);
    assert.doesNotMatch(lines.join("\n"), /SYNTHETIC_CREDENTIAL_MUST_NOT_LOG/);
    assert.equal(targetHits, 0);
  } finally {
    for (const entry of [server, target]) { entry.closeAllConnections(); await new Promise<void>(resolve => entry.close(() => resolve())); }
  }
});
