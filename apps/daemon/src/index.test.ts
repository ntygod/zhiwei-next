import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createServer, connect } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { createDaemonServer, DaemonDiagnosticError } from "./index.ts";

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
    { token, host: null }, { token, port: null }, { token, port: NaN }, { token, port: Infinity },
    { token, port: -1 }, { token, port: 1.5 }, { token, port: "1e3" }, { token, port: " 4265" },
    { token, host: "127.1" }, { token, host: "127.0.0.1\n" }, { token: `${token}\n` },
  ]) assert.throws(() => createDaemonServer(input), error => error instanceof DaemonDiagnosticError && error.code === "invalid_configuration");
});

function rawRequest(port: number, request: string, localAddress = "127.0.0.1"): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port, localAddress }, () => socket.write(request));
    let result = "";
    socket.setEncoding("utf8");
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error("fixture timeout")); });
    socket.on("data", data => { result += data; });
    socket.on("error", reject);
    socket.on("end", () => resolve(result));
  });
}

test("raw HTTP rejects unauthorized headers, browser origins and route/method expansion", async () => {
  const port = await availablePort();
  const server = createDaemonServer({ port, token });
  await server.listen();
  const host = `Host: 127.0.0.1:${port}`;
  const auth = `Authorization: Bearer ${token}`;
  const marker = "SYNTHETIC_CREDENTIAL_MUST_NOT_LOG";
  const cases: readonly [string, string, string[], number][] = [
    ["missing auth", "GET /health", [host], 401],
    ["wrong auth", "GET /v1/meta", [host, `Authorization: Bearer ${"b".repeat(64)}`], 401],
    ["malformed auth", "GET /health", [host, `Authorization: Bearer ${marker}`], 401],
    ["duplicate auth", "GET /health", [host, auth, auth], 401],
    ["wrong host", "GET /health", [`Host: ${marker}.example`, auth], 403],
    ["wrong port", "GET /health", ["Host: 127.0.0.1:1", auth], 403],
    ["duplicate host", "GET /health", [host, host, auth], 403],
    ["host alias", "GET /health", [`Host: localhost:${port}`, auth], 403],
    ["origin", "GET /health", [host, auth, `Origin: https://${marker}.example`], 403],
    ["null origin", "GET /v1/meta", [host, auth, "Origin: null"], 403],
    ["empty origin", "GET /health", [host, auth, "Origin:"], 403],
    ["duplicate origin", "GET /health", [host, auth, "Origin: null", "Origin: null"], 403],
    ["absolute target", `GET http://127.0.0.1:${port}/health`, [host, auth], 404],
    ["query target", `GET /health?token=${marker}`, [host, auth], 404],
    ["encoded target", "GET /%68ealth", [host, auth], 404],
    ["traversal target", "GET /v1/../health", [host, auth], 404],
    ["unknown target", `GET /${marker}`, [host, auth], 404],
    ["POST", "POST /health", [host, auth], 405],
    ["OPTIONS", "OPTIONS /health", [host, auth], 405],
    ["body", "GET /health", [host, auth, "Content-Length: 0"], 400],
    ["transfer body", "GET /health", [host, auth, "Transfer-Encoding: chunked"], 400],
    ["continue expectation", "GET /health", [host, auth, "Expect: 100-continue"], 400],
    ["unknown expectation", "GET /health", [host, auth, `Expect: ${marker}`], 400],
    ["unauthenticated expectation", "GET /health", [host, `Expect: ${marker}`], 401],
    ["parser error", "GET /health", [host, auth, `Bad Header: ${marker}`], 400],
    ["header size", "GET /health", [host, auth, `X-Filler: ${marker.repeat(400)}`], 400],
    ["upgrade", "GET /health", [host, auth, "Connection: Upgrade", "Upgrade: websocket"], 403],
    ["CONNECT", "CONNECT 127.0.0.1:80", [host, auth], 403],
  ];
  try {
    for (const [label, line, headers, expected] of cases) {
      const response = await rawRequest(port, `${line} HTTP/1.1\r\n${headers.join("\r\n")}\r\n\r\n`);
      assert.match(response, new RegExp(`^HTTP/1.1 ${expected} `), label);
      assert.match(response, /cache-control: no-store/i, label);
      assert.doesNotMatch(response, new RegExp(`${marker}|${token}`), label);
      assert.doesNotMatch(response, /access-control-allow-origin/i, label);
    }
    const missingHost = await rawRequest(port, `GET /health HTTP/1.0\r\n${auth}\r\n\r\n`);
    assert.match(missingHost, /^HTTP\/1.1 403 /);
    const otherPeer = await rawRequest(port, `GET /health HTTP/1.1\r\n${host}\r\n${auth}\r\n\r\n`, "127.0.0.2");
    assert.match(otherPeer, /^HTTP\/1.1 403 /);
    const pipelined = await rawRequest(port, `GET /health HTTP/1.1\r\n${host}\r\n${auth}\r\n\r\nGET /${marker} HTTP/1.1\r\n${host}\r\n\r\n`);
    assert.doesNotMatch(pipelined, /503|SYNTHETIC_CREDENTIAL_MUST_NOT_LOG/);
    assert((pipelined.match(/HTTP\/1.1/g) ?? []).length <= 1);
  } finally { await server.close(); }
});

test("real CLI process authenticates the actual daemon and safe lifecycle errors stay typed", async () => {
  const port = await availablePort();
  const server = createDaemonServer({ port, token });
  await server.listen();
  try {
    await assert.rejects(server.listen(), error => error instanceof DaemonDiagnosticError && error.code === "invalid_request");
    const occupied = createDaemonServer({ port, token });
    await assert.rejects(occupied.listen(), error => error instanceof DaemonDiagnosticError && error.code === "daemon_unavailable");
    await occupied.close();
    const child = spawn(process.execPath, ["--experimental-strip-types", "apps/cli/src/index.ts", "doctor"], {
      env: { ZHIWEI_DAEMON_URL: `http://127.0.0.1:${port}`, ZHIWEI_DIAGNOSTIC_TOKEN: token },
    });
    let output = "";
    child.stdout.on("data", chunk => { output += String(chunk); });
    child.stderr.on("data", chunk => { output += String(chunk); });
    const [code] = await once(child, "close");
    assert.equal(code, 0);
    assert.match(output, /Daemon OK/);
    assert.doesNotMatch(output, new RegExp(token));
  } finally { await server.close(); await server.close(); }
  const replacement = createDaemonServer({ port, token });
  await replacement.listen(); await replacement.close();
});

test("daemon executable refuses invalid configuration without leaking environment values", () => {
  const marker = "SYNTHETIC_CREDENTIAL_MUST_NOT_LOG";
  for (const env of [
    {}, { ZHIWEI_DIAGNOSTIC_TOKEN: marker },
    { ZHIWEI_DIAGNOSTIC_TOKEN: token, ZHIWEI_HOST: marker },
    { ZHIWEI_DIAGNOSTIC_TOKEN: token, ZHIWEI_HOST: "0.0.0.0" },
    { ZHIWEI_DIAGNOSTIC_TOKEN: token, ZHIWEI_PORT: `4265${marker}` },
  ]) {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "apps/daemon/src/index.ts"], { env, encoding: "utf8", timeout: 3000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid_configuration/);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(`${marker}|${token}|listening`));
  }
});

test("rejected upgrades, tunnels and parser errors cannot hold daemon shutdown half open", async () => {
  for (const request of [
    "GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
    "CONNECT 127.0.0.1:80 HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
    "GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nBad Header: synthetic\r\n\r\n",
  ]) {
    const port = await availablePort();
    const server = createDaemonServer({ port, token }); await server.listen();
    const socket = connect({ host: "127.0.0.1", port, allowHalfOpen: true }, () => socket.write(request));
    socket.resume();
    try {
      await once(socket, "end");
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("rejected peer held shutdown open")), 1000);
        void server.close().then(() => { clearTimeout(timer); resolve(); }, error => { clearTimeout(timer); reject(error); });
      });
    } finally { socket.destroy(); await server.close(); }
  }
});

test("daemon executable closes on SIGTERM and makes its port reusable", async () => {
  const port = await availablePort();
  const child = spawn(process.execPath, ["--experimental-strip-types", "apps/daemon/src/index.ts"], {
    env: { ZHIWEI_PORT: String(port), ZHIWEI_DIAGNOSTIC_TOKEN: token },
  });
  let output = "";
  child.stdout.on("data", chunk => { output += String(chunk); });
  child.stderr.on("data", chunk => { output += String(chunk); });
  const closed = once(child, "close");
  try {
    await once(child.stdout, "data");
    const response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200); await response.arrayBuffer();
    child.kill("SIGTERM");
    const [code, signal] = await closed;
    assert.equal(code, 0); assert.equal(signal, null);
    assert.doesNotMatch(output, new RegExp(token));
  } finally { if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await closed; } }
  const replacement = createDaemonServer({ port, token });
  await replacement.listen(); await replacement.close();
});
