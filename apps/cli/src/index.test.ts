import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createServer, type Server, type ServerResponse } from "node:http";
import { createServer as createRawServer } from "node:net";
import { spawnSync } from "node:child_process";
import { runCli } from "./index.ts";
import { checkDaemonHealth } from "./doctor.ts";

const token = "a".repeat(64);
const health = { status: "ok", service: "zhiwei-daemon", version: "0.0.0", milestone: "M0-bootstrap" };

test("version command is deterministic without credentials", async () => {
  const lines: string[] = [];
  const exitCode = await runCli(["version"], line => lines.push(line));
  assert.equal(exitCode, 0);
  assert.deepEqual(lines, ["zhiwei-next 0.0.0"]);
});

async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}

test("doctor rejects malformed configuration before reaching a local HTTP endpoint", async () => {
  let hits = 0;
  const server = createServer((_request, response) => { hits++; response.end("unexpected"); });
  const baseUrl = await listen(server);
  const port = baseUrl.split(":").at(-1);
  const marker = "SYNTHETIC_CREDENTIAL_MUST_NOT_LOG";
  const invalidUrls: unknown[] = [
    null, false, {}, "", `http://localhost:${port}`, `http://127.1:${port}`, `http://2130706433:${port}`,
    `http://0x7f000001:${port}`, `http://127.0.0.1.:${port}`, `http://[::1]:${port}`,
    `https://127.0.0.1:${port}`, `http://127.0.0.2:${port}`, `http://example.com:${port}`,
    `http://${marker}@127.0.0.1:${port}`, `${baseUrl}/health`, `${baseUrl}?${marker}`,
    `${baseUrl}#${marker}`, `${baseUrl}\\${marker}`, `${baseUrl}\n`, ` ${baseUrl}`,
    "http://127.0.0.1:0", "http://127.0.0.1:65536", "http://127.0.0.1:04265", "http://127.0.0.1:4265extra",
  ];
  try {
    for (const value of invalidUrls) {
      const lines: string[] = [];
      assert.equal(await runCli(["doctor"], line => lines.push(line), { baseUrl: value, token }), 1);
      assert.match(lines.join("\n"), /invalid_configuration/);
      assert.doesNotMatch(lines.join("\n"), new RegExp(`${marker}|${token}`));
    }
    for (const badToken of [undefined, null, "", "a".repeat(63), "a".repeat(65), "g".repeat(64), "é".repeat(64), `${token}\n`]) {
      assert.deepEqual(await checkDaemonHealth({ baseUrl, token: badToken }), { ok: false, code: "invalid_configuration" });
    }
    for (const timeoutMs of [null, 0, -1, 5001, Infinity, NaN, "10", 1.5]) {
      assert.deepEqual(await checkDaemonHealth({ baseUrl, token, timeoutMs }), { ok: false, code: "invalid_configuration" });
    }
    assert.equal(hits, 0);
  } finally { await close(server); }
});

test("doctor classifies real HTTP status, schema, body and encoding failures without reflection", async t => {
  const marker = "SYNTHETIC_CREDENTIAL_MUST_NOT_LOG";
  let respond: (response: ServerResponse) => void = () => {};
  const server = createServer((_request, response) => respond(response));
  const baseUrl = await listen(server);
  const cases: readonly [string, string, (response: ServerResponse) => void][] = [
    ["authentication", "unauthorized", response => { response.writeHead(401); response.end(marker); }],
    ["source", "forbidden", response => { response.writeHead(403); response.end(marker); }],
    ["unknown status", "unexpected_status", response => { response.writeHead(500, marker); response.end(marker); }],
    ["empty success", "invalid_response", response => { response.writeHead(200, { "content-type": "application/json" }); response.end(); }],
    ["non JSON", "invalid_response", response => { response.writeHead(200, { "content-type": "application/json" }); response.end(marker); }],
    ["unknown field", "invalid_response", response => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ ...health, secret: marker })); }],
    ["wrong status field", "invalid_response", response => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ ...health, status: marker })); }],
    ["missing field", "invalid_response", response => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ status: "ok" })); }],
    ["array", "invalid_response", response => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify([health])); }],
    ["invalid UTF8", "invalid_response", response => { response.writeHead(200, { "content-type": "application/json" }); response.end(Buffer.from([0xc0, 0xaf])); }],
    ["wrong content type", "invalid_response", response => { response.writeHead(200, { "content-type": `text/${marker}` }); response.end(JSON.stringify(health)); }],
    ["missing content type", "invalid_response", response => { response.end(JSON.stringify(health)); }],
    ["encoded body", "invalid_response", response => { response.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" }); response.end(JSON.stringify(health)); }],
    ["large body", "response_too_large", response => { response.writeHead(200, { "content-type": "application/json" }); response.end(marker.repeat(200)); }],
    ["large headers", "response_too_large", response => { response.writeHead(200, { "content-type": "application/json", "x-secret": marker.repeat(400) }); response.end(JSON.stringify(health)); }],
    ["truncated body", "invalid_response", response => { response.writeHead(200, { "content-type": "application/json", "content-length": 2000 }); response.flushHeaders(); response.end(JSON.stringify(health)); }],
  ];
  try {
    for (const [label, code, handler] of cases) await t.test(label, async () => {
      respond = handler;
      const lines: string[] = [];
      assert.equal(await runCli(["doctor"], line => lines.push(line), { baseUrl, token }), 1);
      assert.match(lines.join("\n"), new RegExp(`Daemon error: ${code}\\.`));
      assert.doesNotMatch(lines.join("\n"), new RegExp(`${marker}|${token}|${baseUrl}`));
    });
  } finally { await close(server); }
});

test("doctor deadline and body limit destroy sockets including endless/chunked bodies", async t => {
  for (const mode of ["headers timeout", "body timeout", "body size"] as const) await t.test(mode, async () => {
    let observedClose: Promise<unknown> | undefined;
    const server = createServer((_request, response) => {
      observedClose = once(response, "close");
      if (mode !== "headers timeout") {
        response.writeHead(200, { "content-type": "application/json" });
        response.write(mode === "body size" ? "x".repeat(4097) : "{");
      }
    });
    const baseUrl = await listen(server);
    try {
      assert.deepEqual(await checkDaemonHealth({ baseUrl, token, timeoutMs: 100 }), {
        ok: false, code: mode === "body size" ? "response_too_large" : "timeout",
      });
      assert(observedClose, "request reached the actual local server");
      await observedClose;
    } finally { await close(server); }
  });
});

test("doctor separates unavailable network and malformed HTTP protocol", async () => {
  const server = createServer();
  const baseUrl = await listen(server); await close(server);
  assert.deepEqual(await checkDaemonHealth({ baseUrl, token }), { ok: false, code: "daemon_unavailable" });
  const raw = createRawServer(socket => {
    socket.once("data", () => socket.end("NOT_HTTP SYNTHETIC_CREDENTIAL_MUST_NOT_LOG\r\n\r\n"));
  });
  raw.listen(0, "127.0.0.1"); await once(raw, "listening");
  const address = raw.address(); assert(address && typeof address !== "string");
  try {
    assert.deepEqual(await checkDaemonHealth({ baseUrl: `http://127.0.0.1:${address.port}`, token }), { ok: false, code: "invalid_response" });
  } finally { await new Promise<void>(resolve => raw.close(() => resolve())); }
});

test("complete response headers are bounded before doctor accepts status, type or body", async t => {
  const body = JSON.stringify(health);
  async function diagnose(headers: string): Promise<Awaited<ReturnType<typeof checkDaemonHealth>>> {
    const server = createRawServer(socket => {
      socket.once("data", () => socket.end(`HTTP/1.1 200 OK\r\n${headers}\r\n${body}`));
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); assert(address && typeof address !== "string");
    try { return await checkDaemonHealth({ baseUrl: `http://127.0.0.1:${address.port}`, token }); }
    finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  }
  const prefix = `Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n`;
  await t.test("exactly 64 fields succeeds; 65 fields is rejected", async () => {
    assert.deepEqual(await diagnose(prefix + "x:\r\n".repeat(62)), { ok: true, health });
    assert.deepEqual(await diagnose(prefix + "x:\r\n".repeat(63)), { ok: false, code: "invalid_response" });
  });
  for (const header of ["Content-Type: text/plain", "Content-Encoding: gzip"]) await t.test(header, async () => {
    for (const fillers of [61, 998, 999, 1100]) {
      const headers = prefix + "x:\r\n".repeat(fillers) + header + "\r\n";
      assert(Buffer.byteLength(headers) < 8192);
      assert.deepEqual(await diagnose(headers), { ok: false, code: "invalid_response" });
    }
  });
  await t.test("byte cap still rejects one oversized field", async () => {
    assert.deepEqual(await diagnose(prefix + `x: ${"a".repeat(8192)}\r\n`), { ok: false, code: "response_too_large" });
  });
});

test("CLI process errors never echo secret arguments, environment or invalid URLs", () => {
  const marker = "SYNTHETIC_CREDENTIAL_MUST_NOT_LOG";
  for (const [args, env, code] of [
    [[marker], {}, 2], [["doctor", marker], {}, 2],
    [["doctor"], { ZHIWEI_DAEMON_URL: `http://${marker}@127.0.0.1:4265`, ZHIWEI_DIAGNOSTIC_TOKEN: token }, 1],
    [["doctor"], { ZHIWEI_DIAGNOSTIC_TOKEN: marker }, 1],
    [["help"], { ZHIWEI_DIAGNOSTIC_TOKEN: marker }, 0],
  ] as const) {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "apps/cli/src/index.ts", ...args], { env, encoding: "utf8", timeout: 3000 });
    assert.equal(result.status, code);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(`${marker}|${token}`));
  }
});

test("doctor preserves the explicit authority at port 80 without requiring a privileged listener", () => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
    import http from 'node:http';
    import { syncBuiltinESMExports } from 'node:module';
    const original = http.request;
    const baseline = original({ hostname: '127.0.0.1', port: 80, agent: false });
    const defaultHost = baseline.getHeader('host');
    baseline.on('error', () => {}); baseline.destroy();
    const observed = [];
    http.request = (...args) => {
      const outgoing = original(...args);
      observed.push({ port: args[0].port, host: outgoing.getHeader('host') });
      // Inspect the actual Node-generated request header, then stop before connection.
      outgoing.destroy();
      return outgoing;
    };
    syncBuiltinESMExports();
    const { checkDaemonHealth } = await import(process.argv[1]);
    for (const port of [80, 4265]) {
      await checkDaemonHealth({ baseUrl: 'http://127.0.0.1:' + port, token: 'a'.repeat(64), timeoutMs: 1 });
    }
    console.log(JSON.stringify({ defaultHost, observed }));
  `, new URL("./doctor.ts", import.meta.url).href], { env: {}, encoding: "utf8", timeout: 3000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    defaultHost: "127.0.0.1",
    observed: [{ port: 80, host: "127.0.0.1:80" }, { port: 4265, host: "127.0.0.1:4265" }],
  });
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
